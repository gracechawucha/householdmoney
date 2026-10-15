import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Dot, Money, Segmented, SectionTitle } from './ui'
import { Tip, type TipProps } from './ChartTip'
import { compact, ksh } from '../lib/format'
import { eatDate, flowOf } from '../lib/classify'
import { goalAt } from '../lib/goals'
import { shift, startOf } from '../lib/period'
import { useCategories, useGoals, useTxLong } from '../lib/queries'

type Range = 'month' | '3M' | '6M' | '1Y'
const TZ = 'Africa/Nairobi'
const DAY = 86_400_000
const AXIS = { fontSize: 11, fill: '#7fa396' }

const C_IN = '#a3e635'
const C_OUT = '#ff8a5b'
const C_SAVE = '#2de2c0'
const C_GOAL = '#facc15'

interface Plan {
  starts: number[]
  end: number
  /** month view runs as a running total through the month; the others are one point per month */
  cumulative: boolean
  tick: (t: number) => string
  full: (t: number) => string
  note: string
}

function plan(range: Range): Plan {
  const now = Date.now()
  const fmt = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t).toLocaleDateString('en-GB', { timeZone: TZ, ...o })
  const month = startOf('month', now)
  if (range === 'month') {
    const next = shift('month', month, 1)
    const n = Math.round((next - month) / DAY)
    return {
      starts: Array.from({ length: n }, (_, i) => month + i * DAY),
      end: next,
      cumulative: true,
      tick: (t) => fmt(t, { day: 'numeric' }),
      full: (t) => fmt(t, { weekday: 'short', day: 'numeric', month: 'short' }),
      note: 'This month, running total',
    }
  }
  const n = range === '3M' ? 3 : range === '6M' ? 6 : 12
  return {
    starts: Array.from({ length: n }, (_, i) => shift('month', month, i - (n - 1))),
    end: shift('month', month, 1),
    cumulative: false,
    tick: (t) => fmt(t, { month: 'short' }),
    full: (t) => fmt(t, { month: 'long', year: 'numeric' }),
    note: `Last ${n} months, one point per month`,
  }
}

interface Pt {
  t: number
  income: number | null
  spend: number | null
  saved: number | null
  goal: number | null
}

/** Income, spending and savings as lines, with the income goal as a dotted line across. */
export function TrendChart() {
  const [range, setRange] = useState<Range>('month')
  const p = useMemo(() => plan(range), [range])
  const cats = useCategories()
  const goals = useGoals()
  const catById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data])
  const q = useTxLong(p.starts[0], p.end)

  const { data, totals, goalNow, hit } = useMemo(() => {
    const raw = p.starts.map((t) => ({ t, income: 0, spend: 0, saved: 0 }))
    for (const r of q.data ?? []) {
      const ts = new Date(r.occurred_at).getTime()
      let i = -1
      for (let k = raw.length - 1; k >= 0; k--) {
        if (raw[k].t <= ts) {
          i = k
          break
        }
      }
      if (i < 0) continue
      const f = flowOf(r, catById)
      if (f === 'income') raw[i].income += r.amount
      else {
        // fees are a real cost whatever the money itself was
        raw[i].spend += r.fee
        if (f === 'spend') raw[i].spend += r.amount
        else if (f === 'save') raw[i].saved += r.amount
      }
    }
    const now = Date.now()
    let ci = 0
    let cs = 0
    let cv = 0
    const pts: Pt[] = raw.map((x) => {
      const goal = goalAt(goals.data, 'month', eatDate(p.cumulative ? p.starts[0] : x.t))?.amount ?? null
      if (p.cumulative) {
        if (x.t > now) return { t: x.t, income: null, spend: null, saved: null, goal } // the future stays empty
        ci += x.income
        cs += x.spend
        cv += x.saved
        return { t: x.t, income: ci, spend: cs, saved: cv, goal }
      }
      return { t: x.t, income: x.income, spend: x.spend, saved: x.saved, goal }
    })
    const sum = (k: 'income' | 'spend' | 'saved') => raw.reduce((a, x) => a + x[k], 0)

    let hitText = ''
    if (p.cumulative) {
      const g = pts[0]?.goal
      const inc = sum('income')
      if (g) hitText = inc >= g ? `Goal reached: Ksh ${ksh(inc - g, { decimals: false })} over` : `Ksh ${ksh(g - inc, { decimals: false })} to reach this month's goal`
    } else {
      const done = pts.slice(0, -1).filter((x) => x.goal != null) // finished months that had a goal
      if (done.length) hitText = `Goal hit in ${done.filter((x) => (x.income ?? 0) >= (x.goal ?? 0)).length} of ${done.length} finished months`
    }
    return {
      data: pts,
      totals: { income: sum('income'), spend: sum('spend'), saved: sum('saved') },
      goalNow: pts.find((x) => x.goal != null)?.goal ?? null,
      hit: hitText,
    }
  }, [q.data, p, catById, goals.data])

  const net = totals.income - totals.spend
  const dots = !p.cumulative

  return (
    <section className="card min-w-0 p-4 md:p-5">
      <SectionTitle
        aside={
          <Segmented
            small
            value={range}
            onChange={setRange}
            options={[
              { value: 'month', label: '1M' },
              { value: '3M', label: '3M' },
              { value: '6M', label: '6M' },
              { value: '1Y', label: '1Y' },
            ]}
          />
        }
      >
        Income, spending &amp; savings
      </SectionTitle>
      <div className="-mt-1 mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] font-bold text-mute">
        <span>{p.note}</span>
        <span className="flex items-center gap-1.5">
          <Dot color={C_IN} size={8} /> Income
        </span>
        <span className="flex items-center gap-1.5">
          <Dot color={C_OUT} size={8} /> Spending
        </span>
        <span className="flex items-center gap-1.5">
          <Dot color={C_SAVE} size={8} /> Savings
        </span>
        {goalNow != null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-4 border-t-2 border-dotted" style={{ borderColor: C_GOAL }} /> Goal
          </span>
        )}
      </div>

      {q.isLoading ? (
        <div className="grid h-56 place-items-center text-sm text-mute">Loading…</div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="t" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(t: number) => p.tick(t)} minTickGap={22} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
              <Tooltip content={(tp) => <Tip {...(tp as unknown as TipProps)} title={(l) => p.full(Number(l))} />} />
              <Line type="stepAfter" dataKey="goal" name="Income goal" stroke={C_GOAL} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" dot={false} activeDot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="income" name="Income" stroke={C_IN} strokeWidth={2.5} dot={dots} />
              <Line type="monotone" dataKey="spend" name="Spending" stroke={C_OUT} strokeWidth={2.5} dot={dots} />
              <Line type="monotone" dataKey="saved" name="Savings" stroke={C_SAVE} strokeWidth={2.5} dot={dots} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hit && <div className="mt-2 px-1 text-[12px] font-bold text-white/80">{hit}</div>}

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <Mini label="Income" value={totals.income} tone="in" />
        <Mini label="Spent" value={totals.spend} tone="out" />
        <Mini label="Saved" value={totals.saved} tone="net" />
      </div>
      <div className="mt-2 px-1 text-[12px] font-semibold text-mute">
        {net >= 0 ? 'Income beat spending by ' : 'Spending beat income by '}
        <b className={net >= 0 ? 'text-inflow' : 'text-outflow'}>Ksh {Math.abs(Math.round(net)).toLocaleString('en-KE')}</b> over this
        stretch.
      </div>
    </section>
  )
}

function Mini({ label, value, tone }: { label: string; value: number; tone: 'in' | 'out' | 'net' }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-mute">{label}</div>
      <Money value={value} tone={tone} size="md" decimals={false} />
    </div>
  )
}
