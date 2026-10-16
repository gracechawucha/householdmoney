// M-Pesa SMS parser. Pure TypeScript, no imports, so it runs in Deno (edge function) and Node (tests).

export type Direction = 'in' | 'out'
export type TxType = 'paid' | 'sent' | 'received' | 'withdraw' | 'airtime' | 'mshwari'

export interface ParsedTx {
  code: string
  direction: Direction
  txType: TxType
  amount: number
  fee: number
  counterparty: string | null
  counterpartyPhone: string | null
  accountRef: string | null
  occurredAt: string // ISO, UTC
  balanceAfter: number | null
}

const AMT = '([\\d,]+(?:\\.\\d+)?)'
const ON = ' on (?=\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})'

const PATTERNS: { type: TxType; dir: Direction; re: RegExp }[] = [
  // M-Shwari moves first: "withdrawn from M-Shwari" must not be read as a cash withdrawal,
  // and "received … from M-Shwari" is a transfer, not income.
  { type: 'mshwari', dir: 'out', re: new RegExp(`Ksh ?${AMT} (?:transferred|sent|deposited|moved|paid) to (M-? ?SHWARI.*?)\\.?${ON}`, 'i') },
  { type: 'mshwari', dir: 'in', re: new RegExp(`Ksh ?${AMT} (?:transferred|withdrawn|received|sent) from (M-? ?SHWARI.*?)\\.?${ON}`, 'i') },
  { type: 'mshwari', dir: 'in', re: new RegExp(`received Ksh ?${AMT} from (M-? ?SHWARI.*?)\\.?${ON}`, 'i') },
  // "transferred to Equity Paybill Account for account 331351#Tithes": a payment from a business account
  { type: 'paid', dir: 'out', re: new RegExp(`Ksh ?${AMT} transferred to (.+?)\\.?${ON}`, 'i') },
  { type: 'paid', dir: 'out', re: new RegExp(`Ksh ?${AMT} paid to (.+?)\\.?${ON}`, 'i') },
  { type: 'sent', dir: 'out', re: new RegExp(`Ksh ?${AMT} sent to (.+?)${ON}`, 'i') },
  { type: 'received', dir: 'in', re: new RegExp(`received Ksh ?${AMT} from (.+?)${ON}`, 'i') },
  { type: 'withdraw', dir: 'out', re: new RegExp(`Ksh ?${AMT} withdrawn from (.+?)${ON}`, 'i') },
  { type: 'airtime', dir: 'out', re: new RegExp(`bought Ksh ?${AMT} of airtime(?: for (.+?))?${ON}`, 'i') },
]

const num = (s: string) => Number(s.replace(/,/g, ''))

function splitParty(raw: string | undefined) {
  let s = (raw ?? '').trim().replace(/\.$/, '').trim()
  let account: string | null = null
  let phone: string | null = null

  const acc = s.match(/^(.*?)\s+for account\s+(.+)$/i)
  if (acc) {
    s = acc[1].trim()
    account = acc[2].trim()
  }
  const ph = s.match(/^(.*?)\s*(\+?\d[\d*]{6,})$/)
  if (ph && ph[1].trim()) {
    s = ph[1].trim()
    phone = ph[2]
  }
  return { name: s ? s.toUpperCase() : null, phone, account }
}

function parseDate(t: string): string | null {
  const m = t.match(/ on (\d{1,2})\/(\d{1,2})\/(\d{2,4}) at (\d{1,2}):(\d{2}) ?(AM|PM)/i)
  if (!m) return null
  let year = Number(m[3])
  if (year < 100) year += 2000
  let hour = Number(m[4]) % 12
  if (m[6].toUpperCase() === 'PM') hour += 12
  // M-Pesa times are East Africa Time (UTC+3)
  const utc = Date.UTC(year, Number(m[2]) - 1, Number(m[1]), hour - 3, Number(m[5]))
  return new Date(utc).toISOString()
}

export function parseMpesa(input: string): ParsedTx | null {
  const t = input.replace(/\s+/g, ' ').trim()

  const code = t.match(/^([A-Z0-9]{10})\s*Confirmed/i)
  if (!code) return null

  const occurredAt = parseDate(t)
  if (!occurredAt) return null

  for (const p of PATTERNS) {
    const m = t.match(p.re)
    if (!m) continue

    const amount = num(m[1])
    if (!(amount > 0)) return null

    let name: string | null
    let phone: string | null = null
    let account: string | null = null

    if (p.type === 'mshwari') {
      name = 'M-SHWARI' // same payee the presets and the statement backfill use
    } else if (p.type === 'airtime') {
      name = 'M-PESA AIRTIME'
      phone = m[2]?.trim() || null
    } else {
      const party = splitParty(m[2])
      name = party.name
      phone = party.phone
      account = party.account
    }

    // M-Shwari messages also quote the M-Shwari balance: we want the M-PESA one, or the chain breaks
    // A business (till) message quotes the MERCHANT balance, not the M-PESA one: never let it into the chain.
    const bal =
      t.match(/M-?PESA balance is Ksh ?(-?[\d,]+(?:\.\d+)?)/i) ??
      (/merchant account balance/i.test(t) ? null : t.match(/balance is Ksh ?(-?[\d,]+(?:\.\d+)?)/i))
    const fee = t.match(/Transaction cost,? ?Ksh ?([\d,]+(?:\.\d+)?)/i)

    return {
      code: code[1].toUpperCase(),
      direction: p.dir,
      txType: p.type,
      amount,
      fee: fee ? num(fee[1]) : 0,
      counterparty: name,
      counterpartyPhone: phone,
      accountRef: account,
      occurredAt,
      balanceAfter: bal ? num(bal[1]) : null,
    }
  }
  return null
}

/** "Your account balance was…", "Your M-Shwari Deposit Account balance is…": a balance check, no money moved. */
export function isBalanceEnquiry(input: string): boolean {
  const t = input.replace(/\s+/g, ' ')
  return /your (?:m-?pesa )?account balance was|your m-?shwari[^.]*balance is/i.test(t)
}
