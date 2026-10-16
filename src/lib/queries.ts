import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { toast } from './toast'
import type { Category, Direction, IncomeGoal, Project, ProjectPhase, ProjectTotal, RawMessage, Rule, Tx } from './types'
import type { TxLite } from './classify'
import { startOf } from './period'
import { parseMpesa } from '../../supabase/functions/ingest/parser'

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normTx = (r: any): Tx => ({
  ...r,
  amount: Number(r.amount),
  fee: Number(r.fee ?? 0),
  balance_after: r.balance_after == null ? null : Number(r.balance_after),
  balance_gap: r.balance_gap == null ? null : Number(r.balance_gap),
})

/* ---------------------------------- reads --------------------------------- */

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('name')
      fail(error)
      return (data ?? []) as Category[]
    },
  })
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('*').order('created_at')
      fail(error)
      return ((data ?? []) as Project[]).map((p) => ({ ...p, target_amount: Number(p.target_amount) }))
    },
  })
}

export function useRules() {
  return useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('rules').select('*').order('created_at', { ascending: false })
      fail(error)
      return (data ?? []) as Rule[]
    },
  })
}

const DAY_MS = 86_400_000
/** Labels only asks about the last month; older leftovers wait quietly (see useOlderUnlabeled). */
export const labelCutoff = () => startOf('day', Date.now() - 30 * DAY_MS)

export function useUnlabeled(includeOlder = false) {
  return useQuery({
    queryKey: ['unlabeled', includeOlder ? 'all' : 'recent'],
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = supabase.from('transactions').select('*').eq('status', 'unlabeled')
      if (!includeOlder) q = q.gte('occurred_at', new Date(labelCutoff()).toISOString())
      const { data, error } = await q.order('occurred_at', { ascending: false }).limit(1000)
      fail(error)
      return (data ?? []).map(normTx)
    },
  })
}

export function useOlderUnlabeled() {
  return useQuery({
    queryKey: ['unlabeledOlder'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'unlabeled')
        .lt('occurred_at', new Date(labelCutoff()).toISOString())
      fail(error)
      return count ?? 0
    },
  })
}

export function useTxRange(fromMs: number, toMs: number) {
  const from = new Date(fromMs).toISOString()
  const to = new Date(toMs).toISOString()
  return useQuery({
    queryKey: ['tx', from, to],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions_checked')
        .select('*')
        .gte('occurred_at', from)
        .lt('occurred_at', to)
        .order('occurred_at', { ascending: true })
        .limit(5000)
      fail(error)
      return (data ?? []).map(normTx)
    },
  })
}

export function useProjectTotals() {
  return useQuery({
    queryKey: ['projectTotals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_totals').select('*')
      fail(error)
      const map: Record<string, ProjectTotal> = {}
      for (const r of data ?? []) {
        map[r.project_id as string] = {
          project_id: r.project_id as string,
          spent: Number(r.spent),
          tx_count: Number(r.tx_count),
          last_at: r.last_at as string,
          saved: Number(r.saved ?? 0),
          save_count: Number(r.save_count ?? 0),
        }
      }
      return map
    },
  })
}

export interface HistoryRow {
  direction: Direction
  counterparty: string | null
  particulars: string
  category_id: string | null
  project_id: string | null
  project_phase: ProjectPhase | null
}

/** Recently labeled transactions: feeds the "what" suggestions and prefills repeat counterparties. */
export function useHistory() {
  return useQuery({
    queryKey: ['history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('direction,counterparty,particulars,category_id,project_id,project_phase')
        .eq('status', 'labeled')
        .not('particulars', 'is', null)
        .order('labeled_at', { ascending: false })
        .limit(600)
      fail(error)
      return (data ?? []) as HistoryRow[]
    },
  })
}

export function useUnreadable() {
  return useQuery({
    queryKey: ['unreadable'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_messages')
        .select('id,body,received_at,parse_status,parse_error')
        .eq('parse_status', 'unparsed')
        .order('received_at', { ascending: false })
        .limit(50)
      fail(error)
      return (data ?? []) as RawMessage[]
    },
  })
}

/* -------------------------------- mutations ------------------------------- */

function useRefresh() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

export interface LabelInput {
  tx: Tx
  particulars: string
  category_id: string | null
  project_id: string | null
  project_phase?: ProjectPhase | null
  remember: boolean
}

const phaseOf = (project_id: string | null, phase?: ProjectPhase | null): ProjectPhase | null =>
  project_id ? phase ?? 'save' : null

export function useLabel() {
  const qc = useQueryClient()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: LabelInput) => {
      const particulars = v.particulars.trim()
      const { error } = await supabase
        .from('transactions')
        .update({
          particulars,
          category_id: v.category_id,
          project_id: v.project_id,
          project_phase: v.tx.direction === 'out' ? phaseOf(v.project_id, v.project_phase) : null,
          status: 'labeled',
          label_source: 'manual',
          rule_id: null,
          labeled_at: new Date().toISOString(),
        })
        .eq('id', v.tx.id)
      fail(error)

      let alsoLabeled = 0
      if (v.remember && v.tx.counterparty) {
        const { error: ruleErr } = await supabase.from('rules').upsert(
          {
            direction: v.tx.direction,
            match_field: 'name',
            match_type: 'equals',
            pattern: v.tx.counterparty,
            // same payee, same account: a paybill "Tithes" account is not a paybill "Rent" account
            account_pattern: (v.tx.account_ref ?? '').trim(),
            particulars,
            category_id: v.category_id,
            project_id: v.project_id,
            project_phase: phaseOf(v.project_id, v.project_phase),
            active: true,
          },
          { onConflict: 'direction,match_field,match_type,pattern,account_pattern' },
        )
        fail(ruleErr)
        const { data, error: applyErr } = await supabase.rpc('apply_rules')
        fail(applyErr)
        alsoLabeled = Number(data ?? 0)
      }
      return alsoLabeled
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['unlabeled'] })
      const prev = qc.getQueriesData<Tx[]>({ queryKey: ['unlabeled'] })
      qc.setQueriesData<Tx[]>({ queryKey: ['unlabeled'] }, (old) => (old ?? []).filter((t) => t.id !== v.tx.id))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      ctx?.prev.forEach(([k, d]) => qc.setQueryData(k, d))
      toast(`Couldn't save: ${e.message}`)
    },
    onSuccess: (n) => {
      if (n > 0) toast(`Also labeled ${n} matching transaction${n > 1 ? 's' : ''}`)
    },
    onSettled: () => {
      void refresh()
    },
  })
}

export interface BulkLabelInput {
  txs: Tx[]
  particulars: string
  category_id: string | null
  project_id: string | null
  project_phase?: ProjectPhase | null
  remember: boolean
}

/** Label many transactions at once (same direction), e.g. six grocery payments. */
export function useBulkLabel() {
  const qc = useQueryClient()
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: BulkLabelInput) => {
      const particulars = v.particulars.trim()
      const ids = v.txs.map((t) => t.id)
      const isOut = v.txs[0]?.direction === 'out'
      const { error } = await supabase
        .from('transactions')
        .update({
          particulars,
          category_id: v.category_id,
          project_id: v.project_id,
          project_phase: isOut ? phaseOf(v.project_id, v.project_phase) : null,
          status: 'labeled',
          label_source: 'manual',
          rule_id: null,
          labeled_at: new Date().toISOString(),
        })
        .in('id', ids)
      fail(error)

      let also = 0
      if (v.remember) {
        // one preset per distinct payee + account in the batch
        const seen = new Map<string, Record<string, unknown>>()
        for (const t of v.txs) {
          if (!t.counterparty) continue
          const account_pattern = (t.account_ref ?? '').trim()
          const key = `${t.direction}|${t.counterparty}|${account_pattern}`
          seen.set(key, {
            direction: t.direction,
            match_field: 'name',
            match_type: 'equals',
            pattern: t.counterparty,
            account_pattern,
            particulars,
            category_id: v.category_id,
            project_id: v.project_id,
            project_phase: phaseOf(v.project_id, v.project_phase),
            active: true,
          })
        }
        if (seen.size) {
          const { error: ruleErr } = await supabase
            .from('rules')
            .upsert([...seen.values()], { onConflict: 'direction,match_field,match_type,pattern,account_pattern' })
          fail(ruleErr)
          const { data, error: applyErr } = await supabase.rpc('apply_rules')
          fail(applyErr)
          also = Number(data ?? 0)
        }
      }
      return { n: ids.length, also }
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['unlabeled'] })
      const prev = qc.getQueriesData<Tx[]>({ queryKey: ['unlabeled'] })
      const gone = new Set(v.txs.map((t) => t.id))
      qc.setQueriesData<Tx[]>({ queryKey: ['unlabeled'] }, (old) => (old ?? []).filter((t) => !gone.has(t.id)))
      return { prev }
    },
    onError: (e, _v, ctx) => {
      ctx?.prev.forEach(([k, d]) => qc.setQueryData(k, d))
      toast(`Couldn't save: ${e.message}`)
    },
    onSuccess: ({ n, also }) => toast(`Labeled ${n} transactions${also > 0 ? `, plus ${also} matching` : ''}`),
    onSettled: () => {
      void refresh()
    },
  })
}

const LITE_COLS = 'id,direction,amount,fee,tx_type,category_id,project_id,project_phase,occurred_at,counterparty'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normLite = (r: any): TxLite => ({ ...r, amount: Number(r.amount), fee: Number(r.fee ?? 0) })

/** Pages through PostgREST's 1000-row cap so long ranges (months, a year) are never cut short. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, norm: (r: unknown) => T): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await build(from, from + 999)
    fail(error)
    const rows = data ?? []
    out.push(...rows.map(norm))
    if (rows.length < 1000) break
  }
  return out
}

/** Slim transactions over a long range: feeds the trend graph and the goals. */
export function useTxLong(fromMs: number, toMs: number) {
  const from = new Date(fromMs).toISOString()
  const to = new Date(toMs).toISOString()
  return useQuery({
    queryKey: ['txLong', from, to],
    refetchInterval: 120_000,
    queryFn: () =>
      fetchAll<TxLite>(
        (a, b) =>
          supabase
            .from('transactions')
            .select(LITE_COLS)
            .gte('occurred_at', from)
            .lt('occurred_at', to)
            .order('occurred_at', { ascending: true })
            .range(a, b),
        normLite as (r: unknown) => TxLite,
      ),
  })
}

/** Every M-Shwari move, ever: in and out tell the balance held there. */
export function useMshwari() {
  return useQuery({
    queryKey: ['mshwari'],
    refetchInterval: 120_000,
    queryFn: () =>
      fetchAll<Tx>(
        (a, b) =>
          supabase
            .from('transactions')
            .select('*')
            .or('tx_type.eq.mshwari,counterparty.ilike.*shwari*')
            .order('occurred_at', { ascending: true })
            .range(a, b),
        normTx as (r: unknown) => Tx,
      ),
  })
}

/** Everything (labeled or not), newest first: lets Labels search any transaction. */
export function useAllTx(enabled: boolean) {
  return useQuery({
    queryKey: ['allTx'],
    enabled,
    queryFn: () =>
      fetchAll<Tx>(
        (a, b) => supabase.from('transactions').select('*').order('occurred_at', { ascending: false }).range(a, b),
        normTx as (r: unknown) => Tx,
      ),
  })
}

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('income_goals').select('*').order('starts_on')
      fail(error)
      return (data ?? []).map((g) => ({ ...g, amount: Number(g.amount) })) as IncomeGoal[]
    },
  })
}

export function useSaveGoals() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { startsOn: string; goals: { kind: IncomeGoal['kind']; amount: number }[] }) => {
      const rows = v.goals.filter((g) => g.amount > 0).map((g) => ({ kind: g.kind, amount: g.amount, starts_on: v.startsOn }))
      if (!rows.length) return
      const { error } = await supabase.from('income_goals').upsert(rows, { onConflict: 'kind,starts_on' })
      fail(error)
    },
    onSuccess: () => toast('Goals saved'),
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUnlabel() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'unlabeled',
          particulars: null,
          category_id: null,
          project_id: null,
          project_phase: null,
          label_source: null,
          rule_id: null,
          labeled_at: null,
        })
        .eq('id', id)
      fail(error)
    },
    onSuccess: () => toast('Moved back to Labels'),
    onError: (e) => toast(`Couldn't update: ${e.message}`),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useCreateCategory() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { name: string; kind: Category['kind']; color: string }) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: v.name.trim(), kind: v.kind, color: v.color, sort_order: 200 })
        .select('*')
        .single()
      fail(error)
      return data as Category
    },
    onError: (e) => toast(e.message.includes('duplicate') ? 'That category already exists' : e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUpdateCategory() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Pick<Category, 'name' | 'color' | 'archived'>> }) => {
      const { error } = await supabase.from('categories').update(v.patch).eq('id', v.id)
      fail(error)
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useCreateProject() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { name: string; goal: string; target_amount: number; deadline: string; color: string }) => {
      const { error } = await supabase.from('projects').insert({
        name: v.name.trim(),
        goal: v.goal.trim() || null,
        target_amount: v.target_amount,
        deadline: v.deadline || null,
        color: v.color,
      })
      fail(error)
    },
    onSuccess: () => toast('Project created'),
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUpdateProject() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Omit<Project, 'id' | 'created_at'>> }) => {
      const { error } = await supabase.from('projects').update(v.patch).eq('id', v.id)
      fail(error)
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useCreateRule() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: Omit<Rule, 'id' | 'created_at' | 'active'>) => {
      const { error } = await supabase.from('rules').upsert(
        { ...v, pattern: v.pattern.trim(), particulars: v.particulars.trim(), active: true },
        { onConflict: 'direction,match_field,match_type,pattern,account_pattern' },
      )
      fail(error)
      const { data, error: applyErr } = await supabase.rpc('apply_rules')
      fail(applyErr)
      return Number(data ?? 0)
    },
    onSuccess: (n) => toast(n > 0 ? `Preset saved. Labeled ${n} waiting transaction${n > 1 ? 's' : ''}` : 'Preset saved'),
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useUpdateRule() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { id: string; patch: Partial<Pick<Rule, 'active'>> }) => {
      const { error } = await supabase.from('rules').update(v.patch).eq('id', v.id)
      fail(error)
      if (v.patch.active) {
        const { error: applyErr } = await supabase.rpc('apply_rules')
        fail(applyErr)
      }
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useDeleteRule() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rules').delete().eq('id', id)
      fail(error)
    },
    onSuccess: () => toast('Preset removed'),
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

export function useDismissRaw() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('raw_messages').update({ parse_status: 'ignored' }).eq('id', id)
      fail(error)
    },
    onSettled: () => {
      void refresh()
    },
  })
}

/* ------------------------- projects: payments & phases ------------------------ */

/** Every payment tagged to one project, newest first. */
export function useProjectTxs(projectId: string) {
  return useQuery({
    queryKey: ['projectTx', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('project_id', projectId)
        .order('occurred_at', { ascending: false })
        .limit(1000)
      fail(error)
      return (data ?? []).map(normTx)
    },
  })
}

/** Move a project payment between 'save' (set aside) and 'spend' (spent). */
export function useSetPhase() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { id: string; phase: ProjectPhase }) => {
      const { error } = await supabase.from('transactions').update({ project_phase: v.phase }).eq('id', v.id)
      fail(error)
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

/* ---------------------------------- settings ---------------------------------- */

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*')
      fail(error)
      return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value as string])) as Record<string, string>
    },
  })
}

export function useSetSetting() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (v: { key: string; value: string }) => {
      const { error } = await supabase.from('app_settings').upsert(v, { onConflict: 'key' })
      fail(error)
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}

/* ------------------------------- webhook health ------------------------------- */

/** When the webhook last heard an SMS. A long silence means the phone side stopped forwarding. */
export function useLastMessage() {
  return useQuery({
    queryKey: ['lastMessage'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('raw_messages')
        .select('received_at')
        .order('received_at', { ascending: false })
        .limit(1)
      fail(error)
      return (data?.[0]?.received_at as string | undefined) ?? null
    },
  })
}

/** Paste M-Pesa messages the webhook missed. They are parsed here and go in like live ones. */
export function useAddMessages() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: async (text: string) => {
      const chunks = text
        .split(/(?=\b[A-Z0-9]{10}\s*Confirmed)/i)
        .map((c) => c.trim())
        .filter(Boolean)
      let added = 0
      let duplicate = 0
      let unreadable = 0
      for (const body of chunks) {
        const parsed = parseMpesa(body)
        if (!parsed) {
          unreadable++
          continue
        }
        const { data: raw, error: rawErr } = await supabase
          .from('raw_messages')
          .insert({ body, payload: { source: 'pasted' }, parse_status: 'parsed' })
          .select('id')
          .single()
        fail(rawErr)
        const { data: row, error } = await supabase
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
              raw_message_id: raw?.id,
            },
            { onConflict: 'mpesa_code', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle()
        fail(error)
        if (row) added++
        else duplicate++
      }
      if (added > 0) {
        const { error } = await supabase.rpc('apply_rules')
        fail(error)
      }
      return { added, duplicate, unreadable }
    },
    onError: (e) => toast(e.message),
    onSettled: () => {
      void refresh()
    },
  })
}
