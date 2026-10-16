// Receives M-Pesa SMS bodies (from the Household SMS Android app, or any forwarder), stores them raw, parses them into transactions
// and runs the preset rules.
//
// Auth: send the secret as  ?key=<INGEST_SECRET>  or header  x-ingest-secret.
// Body: plain text (the SMS), or JSON / form data containing the SMS in a field like "message".
import { createClient } from 'npm:@supabase/supabase-js@2'
import { isBalanceEnquiry, parseMpesa } from './parser.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const MESSAGE_KEYS = ['message', 'body', 'text', 'sms', 'sms_message', 'content', 'msg']

function pick(o: unknown): string {
  if (typeof o === 'string') return o
  if (Array.isArray(o)) return o.length ? pick(o[0]) : ''
  if (o && typeof o === 'object') {
    const rec = o as Record<string, unknown>
    for (const k of MESSAGE_KEYS) {
      if (typeof rec[k] === 'string' && (rec[k] as string).trim()) return rec[k] as string
    }
    // fall back to the longest string value
    let best = ''
    for (const v of Object.values(rec)) {
      if (typeof v === 'string' && v.length > best.length) best = v
    }
    return best
  }
  return ''
}

function extract(raw: string, contentType: string): { message: string; payload: unknown } {
  const trimmed = raw.trim()
  if (contentType.includes('application/x-www-form-urlencoded')) {
    // A real form has a named field (message=...). A raw SMS sent with a form content-type
    // (a common MacroDroid default) is not a form: keep the whole text so nothing is dropped.
    const obj = Object.fromEntries(new URLSearchParams(raw))
    const key = MESSAGE_KEYS.find((k) => typeof obj[k] === 'string' && obj[k].trim())
    if (key) return { message: obj[key], payload: obj }
    return { message: trimmed, payload: null }
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      return { message: pick(parsed), payload: parsed }
    } catch {
      /* not JSON after all, treat as text */
    }
  }
  return { message: trimmed, payload: null }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const secret = Deno.env.get('INGEST_SECRET')
  const url = new URL(req.url)
  const provided = req.headers.get('x-ingest-secret') ?? url.searchParams.get('key')
  if (!secret || provided !== secret) return json({ error: 'unauthorized' }, 401)

  const raw = await req.text()
  const contentType = req.headers.get('content-type') ?? ''

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  // Sweep check from the Android app: {"codes": [...]} -> which of these M-Pesa codes do we NOT have?
  if (contentType.includes('json')) {
    try {
      const o = JSON.parse(raw)
      if (o && typeof o === 'object' && Array.isArray(o.codes)) {
        const codes = (o.codes as unknown[]).filter((c): c is string => typeof c === 'string').slice(0, 500)
        if (!codes.length) return json({ missing: [] })
        const { data, error } = await db.from('transactions').select('mpesa_code, balance_after').in('mpesa_code', codes)
        if (error) return json({ error: error.message }, 500)
        // A row with no M-PESA balance came from a business-account message: its personal M-Pesa
        // twin (same code) may still be on the phone, so ask for it too.
        const have = new Set((data ?? []).filter((r) => r.balance_after !== null).map((r) => r.mpesa_code as string))
        return json({ missing: codes.filter((c) => !have.has(c)) })
      }
    } catch {
      /* not a sweep check: fall through to a normal message */
    }
  }

  const { message, payload } = extract(raw, contentType)
  if (!message) return json({ status: 'empty' }, 400)

  // The same text twice (a retry, or the sweep re-sending) is never stored again.
  // A text we could not read before is tried again, so a parser fix rescues it.
  const { data: prior } = await db
    .from('raw_messages')
    .select('id, parse_status')
    .eq('body', message)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (prior && ['parsed', 'duplicate', 'ignored'].includes(prior.parse_status as string)) {
    return json({ status: 'duplicate' })
  }

  // 1. keep the raw message no matter what happens next
  let rawRow: { id: string } | null = prior ? { id: prior.id as string } : null
  if (!rawRow) {
    const ins = await db.from('raw_messages').insert({ body: message, payload }).select('id').single()
    if (ins.error || !ins.data) return json({ error: ins.error?.message ?? 'could not store message' }, 500)
    rawRow = ins.data as { id: string }
  }
  const rawId: string = rawRow.id

  const mark = (parse_status: string, parse_error: string | null = null) =>
    db.from('raw_messages').update({ parse_status, parse_error }).eq('id', rawId)

  // 2. parse
  const parsed = parseMpesa(message)
  if (!parsed) {
    // M-Pesa confirmations we can't read are surfaced in the app; everything else (promos) is ignored
    const status = /confirmed/i.test(message) && !isBalanceEnquiry(message) ? 'unparsed' : 'ignored'
    await mark(status, status === 'unparsed' ? 'no matching message pattern' : null)
    return json({ status })
  }

  // 3. insert (duplicate M-Pesa codes are skipped)
  const { data: txRow, error: txErr } = await db
    .from('transactions')
    .upsert(
      {
        mpesa_code: parsed.code,
        direction: parsed.direction,
        tx_type: parsed.txType,
        amount: parsed.amount,
        fee: parsed.fee,
        counterparty: parsed.counterparty,
        counterparty_phone: parsed.counterpartyPhone,
        account_ref: parsed.accountRef,
        occurred_at: parsed.occurredAt,
        balance_after: parsed.balanceAfter,
        raw_message_id: rawId,
      },
      { onConflict: 'mpesa_code', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()

  if (txErr) {
    await mark('unparsed', txErr.message)
    return json({ status: 'error', error: txErr.message })
  }
  if (!txRow) {
    // Same code twice is normal for money moved out of a till: the business message and the personal
    // M-PESA message share a code. If the first one in had no M-PESA balance and is still unlabeled,
    // the personal message is the truth: it carries the right direction and the balance chain.
    if (parsed.balanceAfter !== null) {
      const { data: existing } = await db
        .from('transactions')
        .select('id, balance_after, status')
        .eq('mpesa_code', parsed.code)
        .maybeSingle()
      if (existing && existing.balance_after === null && existing.status === 'unlabeled') {
        await db
          .from('transactions')
          .update({
            direction: parsed.direction,
            tx_type: parsed.txType,
            amount: parsed.amount,
            fee: parsed.fee,
            counterparty: parsed.counterparty,
            counterparty_phone: parsed.counterpartyPhone,
            account_ref: parsed.accountRef,
            occurred_at: parsed.occurredAt,
            balance_after: parsed.balanceAfter,
            raw_message_id: rawId,
          })
          .eq('id', existing.id)
        await mark('parsed')
        const { data: labeled } = await db.rpc('apply_rules', { p_txn: existing.id })
        return json({ status: 'upgraded', code: parsed.code, auto_labeled: Number(labeled ?? 0) > 0 })
      }
    }
    await mark('duplicate')
    return json({ status: 'duplicate', code: parsed.code })
  }

  await mark('parsed')

  // 4. presets
  const { data: labeled } = await db.rpc('apply_rules', { p_txn: txRow.id })
  return json({ status: 'parsed', code: parsed.code, auto_labeled: Number(labeled ?? 0) > 0 })
})
