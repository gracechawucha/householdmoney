const TZ = 'Africa/Nairobi'

export function ksh(n: number, opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const { decimals = true, sign = false } = opts
  const abs = Math.abs(n)
  const body = abs.toLocaleString('en-KE', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })
  const s = n < 0 ? '−' : sign && n > 0 ? '+' : ''
  return `${s}${body}`
}

/** 1.2k / 3.4M style for chart axes */
export function compact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

export function pct(n: number): string {
  return `${Math.round(n)}%`
}

export function shortDate(iso: string | number): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })
}

export function dateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })
  const time = d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ })
  return `${date} · ${time}`
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .trim()
}

export const SWATCHES = [
  '#2de2c0',
  '#a3e635',
  '#facc15',
  '#fb923c',
  '#fb7185',
  '#e879f9',
  '#a78bfa',
  '#818cf8',
  '#38bdf8',
  '#22d3ee',
  '#4ade80',
  '#f97316',
]

export function nextSwatch(used: string[]): string {
  return SWATCHES.find((c) => !used.includes(c)) ?? SWATCHES[used.length % SWATCHES.length]
}
