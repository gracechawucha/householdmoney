import { useMemo, useState } from 'react'
import { Check, Target, X } from 'lucide-react'
import { ErrorNote, Money, SectionTitle } from '../components/ui'
import { flowOf, eatDate } from '../lib/classify'
import { ksh, pct } from '../lib/format'
import { goalAt } from '../lib/goals'
import { shift, startOf } from '../lib/period'
import { useCategories, useGoals, useSaveGoals, useTxLong } from '../lib/queries'
import type { IncomeGoal } from '../lib/types'

const TZ = 'Africa/Nairobi'
const MONTHS_BACK = 11 // this month + 11 before it

const monthName = (ts: number, long = false) =>
  new Date(ts).toLocaleDateString('en-GB', { timeZone: TZ, month: long ? 'long' : 'short', ...(long ? { year: 'numeric' } : {}) })

export function Goals() {
  const goals = useGoals()
  const cats = useCategories()
  const save = useSaveGoals()
  const catById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data])

  const thisMonth = startOf('month', Date.now())
  const months = useMemo(
    () => Array.from({ length: MONTHS_BACK + 1 }, (_, i) => shift('month', thisMonth, i - MONTHS_BACK)),
    [thisMonth],
  )
  const q = useTxLong(months[0], shift('month', thisMonth, 1))

  // income per month (M-Shwari moves are not income)
  const income = useMemo(() => {
    const m = months.map(() => 0)
    for (const r of q.data ?? []) {
      if (flowOf(r, catById) !== 'income') continue
      const ts = new Date(r.occurred_at).getTime()
      for (let k = months.length - 1; k >= 0; k--) {
        if (months[k] <= ts) {
          m[k] += r.amount
          break
        }
      }
    }
    return m
  }, [q.data, months, catById])

  const rows = months.map((ts, i) => {
    const g = goalAt(goals.data, 'month', eatDate(ts))
    return { ts, income: income[i], goal: g?.amount ?? null, hit: g ? income[i] >= g.amount : null }
  })
  const judged = rows.filter((r) => r.goal != null && r.ts < thisMonth) // finished months that had a goal
  const hits = judged.filter((r) => r.hit).length
  const cur = rows[rows.length - 1]

  // rolling windows ending this month
  const window = (n: number, kind: '3m' | '6m') => {
    const slice = income.slice(-n)
    const total = slice.reduce((a, b) => a + b, 0)
    const g = goalAt(goals.data, kind, eatDate(thisMonth))
    return { total, goal: g?.amount ?? null }
  }
  const w3 = window(3, '3m')
  const w6 = window(6, '6m')

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1 className="px-1 text-[26px] font-extrabold leading-tight tracking-tight md:text-[28px]">Goals</h1>
        <p className="px-1 text-[13px] text-mute">Set an income goal, then watch the months add up.</p>
      </div>

      <ErrorNote error={goals.error} />

      {/* now */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Progress title="This month" sub={monthName(thisMonth, true)} income={cur.income} goal={cur.goal} />
        <Progress title="Last 3 months" sub="Rolling, incl. this month" income={w3.total} goal={w3.goal} />
        <Progress title="Last 6 months" sub="Rolling, incl. this month" income={w6.total} goal={w6.goal} />
      </div>

      <GoalForm goals={goals.data ?? []} busy={save.isPending} onSave={(startsOn, list) => save.mutate({ startsOn, goals: list })} />

      {/* month by month */}
      <section>
        <SectionTitle
          aside={
            judged.length > 0 && (
              <span className="text-[12px] font-bold text-mute">
                Hit <b className="text-inflow">{hits}</b> of {judged.length} month{judged.length === 1 ? '' : 's'}
              </span>
            )
          }
        >
          Month by month
        </SectionTitle>
        <div className="card divide-y divide-line overflow-hidden">
          {[...rows].reverse().map((r) => {
            const isNow = r.ts === thisMonth
            const ratio = r.goal ? r.income / r.goal : 0
            return (
              <div key={r.ts} className="min-w-0 px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                      r.goal == null
                        ? 'bg-white/5 text-mute'
                        : r.hit
                          ? 'bg-inflow/15 text-inflow'
                          : isNow
                            ? 'bg-fee/15 text-fee'
                            : 'bg-warn/15 text-warn'
                    }`}
                    title={r.goal == null ? 'No goal set' : r.hit ? 'Goal hit' : isNow ? 'In progress' : 'Missed'}
                  >
                    {r.goal == null ? <Target size={16} /> : r.hit ? <Check size={18} strokeWidth={3} /> : isNow ? <Target size={16} /> : <X size={17} strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">{monthName(r.ts, true)}</div>
                    <div className="truncate text-[11px] text-mute">
                      {r.goal == null
                        ? 'No goal set'
                        : r.hit
                          ? 'Goal hit'
                          : isNow
                            ? `${pct(ratio * 100)} so far`
                            : `Missed by Ksh ${ksh(r.goal - r.income, { decimals: false })}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money value={r.income} tone={r.hit ? 'in' : 'neutral'} size="sm" decimals={false} />
                    {r.goal != null && <div className="text-[10px] font-bold text-mute">of {ksh(r.goal, { decimals: false })}</div>}
                  </div>
                </div>
                {r.goal != null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, ratio * 100)}%`, background: r.hit ? '#a3e635' : isNow ? '#facc15' : '#f43f5e' }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-snug text-mute">
          Income counts everything that came in except M-Shwari moves. A new goal applies from the month you choose, so past
          months keep the goal they had.
        </p>
      </section>
    </div>
  )
}

function Progress({ title, sub, income, goal }: { title: string; sub: string; income: number; goal: number | null }) {
  const ratio = goal ? income / goal : 0
  const hit = goal != null && income >= goal
  return (
    <div className="card min-w-0 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[14px] font-extrabold">{title}</div>
        {goal != null && <div className={`text-[13px] font-extrabold ${hit ? 'text-inflow' : 'text-white/80'}`}>{pct(ratio * 100)}</div>}
      </div>
      <div className="truncate text-[11px] text-mute">{sub}</div>
      <div className="mt-2">
        <Money value={income} tone="in" size="lg" decimals={false} prefix="Ksh" />
      </div>
      {goal != null ? (
        <>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, ratio * 100)}%`,
                background: hit ? 'linear-gradient(90deg,#a3e635,#2de2c0)' : 'linear-gradient(90deg,#facc15,#a3e635)',
              }}
            />
          </div>
          <div className="mt-1.5 text-[11px] font-semibold text-mute">
            Goal Ksh {ksh(goal, { decimals: false })} ·{' '}
            {hit ? `Ksh ${ksh(income - goal, { decimals: false })} over` : `Ksh ${ksh(goal - income, { decimals: false })} to go`}
          </div>
        </>
      ) : (
        <div className="mt-3 text-[12px] text-mute">No goal set yet</div>
      )}
    </div>
  )
}

function GoalForm({
  goals,
  busy,
  onSave,
}: {
  goals: IncomeGoal[]
  busy: boolean
  onSave: (startsOn: string, list: { kind: IncomeGoal['kind']; amount: number }[]) => void
}) {
  const thisMonthDate = eatDate(startOf('month', Date.now()))
  const cur = (k: IncomeGoal['kind']) => goalAt(goals, k, thisMonthDate)?.amount
  const [m, setM] = useState('')
  const [q3, setQ3] = useState('')
  const [h6, setH6] = useState('')
  const [from, setFrom] = useState(thisMonthDate.slice(0, 7)) // YYYY-MM

  const clean = (v: string) => v.replace(/[^\d]/g, '')
  const any = !!(m || q3 || h6)
  const field = (label: string, value: string, set: (v: string) => void, current?: number) => (
    <div className="min-w-0">
      <label className="label">{label}</label>
      <input
        className="field"
        inputMode="numeric"
        value={value}
        onChange={(e) => set(clean(e.target.value))}
        placeholder={current ? ksh(current, { decimals: false }) : 'Ksh'}
      />
    </div>
  )

  return (
    <section className="card min-w-0 space-y-4 p-4 md:p-5">
      <div className="flex items-center gap-2 text-[15px] font-extrabold">
        <Target size={17} className="text-mint" /> Set your income goals
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
        {field('Per month', m, setM, cur('month'))}
        {field('Over 3 months', q3, setQ3, cur('3m'))}
        {field('Over 6 months', h6, setH6, cur('6m'))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <label className="label">Applies from</label>
          <input className="field !w-auto" type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={!any || !from || busy}
          onClick={() => {
            onSave(`${from}-01`, [
              { kind: 'month', amount: Number(m) },
              { kind: '3m', amount: Number(q3) },
              { kind: '6m', amount: Number(h6) },
            ])
            setM('')
            setQ3('')
            setH6('')
          }}
        >
          Save goals
        </button>
      </div>
      <div className="text-[11px] leading-snug text-mute">
        Leave a box empty to keep its current goal. The faint number shows the goal in force now.
      </div>
    </section>
  )
}
