// Day / week / month windows in East Africa Time (UTC+3, no daylight saving).
export type Grain = 'day' | 'week' | 'month'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const EAT = 3 * HOUR
const TZ = 'Africa/Nairobi'

/** start (UTC ms) of the day / Monday-week / month that contains ts, in EAT */
export function startOf(grain: Grain, ts: number): number {
  const local = ts + EAT
  const dayStart = Math.floor(local / DAY) * DAY
  if (grain === 'day') return dayStart - EAT
  if (grain === 'week') {
    const dow = (new Date(local).getUTCDay() + 6) % 7 // Monday = 0
    return dayStart - dow * DAY - EAT
  }
  const d = new Date(local)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - EAT
}

export function shift(grain: Grain, start: number, n: number): number {
  if (grain === 'day') return start + n * DAY
  if (grain === 'week') return start + n * 7 * DAY
  const d = new Date(start + EAT)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) - EAT
}

export function periodLabel(grain: Grain, start: number): string {
  const fmt = (ts: number, o: Intl.DateTimeFormatOptions) =>
    new Date(ts).toLocaleDateString('en-GB', { timeZone: TZ, ...o })
  const now = Date.now()
  if (grain === 'day') {
    if (start === startOf('day', now)) return 'Today'
    if (start === startOf('day', now - DAY)) return 'Yesterday'
    return fmt(start, { weekday: 'short', day: 'numeric', month: 'short' })
  }
  if (grain === 'week') {
    if (start === startOf('week', now)) return 'This week'
    const end = start + 6 * DAY
    return `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short' })}`
  }
  if (start === startOf('month', now)) return 'This month'
  return fmt(start, { month: 'long', year: 'numeric' })
}

export function sublabel(grain: Grain, start: number): string {
  const fmt = (ts: number, o: Intl.DateTimeFormatOptions) =>
    new Date(ts).toLocaleDateString('en-GB', { timeZone: TZ, ...o })
  if (grain === 'day') return fmt(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (grain === 'week') return `Week of ${fmt(start, { day: 'numeric', month: 'long' })}`
  return fmt(start, { month: 'long', year: 'numeric' })
}

export interface Bucket {
  label: string
  start: number
}

/** Chart buckets: hourly (3h steps) for a day, daily for a week or month */
export function buckets(grain: Grain, start: number, end: number): Bucket[] {
  const out: Bucket[] = []
  if (grain === 'day') {
    for (let h = 0; h < 24; h += 1) out.push({ start: start + h * HOUR, label: `${h}:00` })
    return out
  }
  for (let t = start; t < end; t += DAY) {
    const label =
      grain === 'week'
        ? new Date(t).toLocaleDateString('en-GB', { weekday: 'short', timeZone: TZ })
        : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', timeZone: TZ })
    out.push({ start: t, label })
  }
  return out
}

export function bucketSize(grain: Grain): number {
  return grain === 'day' ? HOUR : DAY
}
