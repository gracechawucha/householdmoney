import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw, ScanLine, Tag, Wallet } from 'lucide-react'
import { Dot, Empty, ErrorNote, Money, Segmented, SectionTitle, type Tone } from '../components/ui'
import { ProjectCard } from '../components/ProjectCard'
import type { Tab } from '../components/Nav'
import { compact, dateTime, ksh, pct, shortDate } from '../lib/format'
import { bucketSize, buckets, periodLabel, shift, startOf, sublabel, type Grain } from '../lib/period'
import {
  useCategories,
  useProjectTotals,
  useProjects,
  useTxRange,
  useUnlabeled,
  useUnlabel,
  useUnreadable,
} from '../lib/queries'

const UNLABELED = '#5f8576'
const FEES = '#fbbf24'
const AXIS = { fontSize: 11, fill: '#7fa396' }

interface Slice {
  key: string
  name: string
  color: string
  value: number
}

export function Snapshot({ goto }: { goto: (t: Tab) => void }) {
  const [grain, setGrain] = useState<Grain>('month')
  const [start, setStart] = useState(() => startOf('month', Date.now()))
  const [showAll, setShowAll] = useState(false)

  const end = shift(grain, start, 1)
  const isCurrent = start === startOf(grain, Date.now())

  const tx = useTxRange(start, end)
  const cats = useCategories()
  const projects = useProjects()
  const totals = useProjectTotals()
  const unlabeled = useUnlabeled()
  const unreadable = useUnreadable()
  const unlabel = useUnlabel()

  const changeGrain = (g: Grain) => {
    setGrain(g)
    setStart(startOf(g, isCurrent ? Date.now() : start))
    setShowAll(false)
  }
  const move = (n: number) => {
    setStart(shift(grain, start, n))
    setShowAll(false)
  }

  const catById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data])
  const projById = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data])

  const rows = tx.data ?? []

  const s = useMemo(() => {
    let income = 0
    let spent = 0
    let fees = 0
    const inMap = new Map<string, Slice>()
    const outMap = new Map<string, Slice>()
    const add = (m: Map<string, Slice>, key: string, name: string, color: string, v: number) => {
      const cur = m.get(key)
      if (cur) cur.value += v
      else m.set(key, { key, name, color, value: v })
    }

    for (const r of rows) {
      if (r.direction === 'in') {
        income += r.amount
        const c = r.category_id ? catById.get(r.category_id) : undefined
        if (c) add(inMap, c.id, c.name, c.color, r.amount)
        else add(inMap, 'unlabeled', 'Unlabeled', UNLABELED, r.amount)
      } else {
        spent += r.amount + r.fee
        fees += r.fee
        const p = r.project_id ? projById.get(r.project_id) : undefined
        const c = r.category_id ? catById.get(r.category_id) : undefined
        if (p) add(outMap, `p:${p.id}`, `Project: ${p.name}`, p.color, r.amount)
        else if (c) add(outMap, c.id, c.name, c.color, r.amount)
        else add(outMap, 'unlabeled', 'Unlabeled', UNLABELED, r.amount)
      }
    }
    if (fees > 0) add(outMap, 'fees', 'Transaction costs', FEES, fees)

    const sort = (m: Map<string, Slice>) => [...m.values()].sort((a, b) => b.value - a.value)
    return { income, spent, fees, net: income - spent, inSlices: sort(inMap), outSlices: sort(outMap) }
  }, [rows, catById, projById])

  const flow = useMemo(() => {
    const size = bucketSize(grain)
    const bs = buckets(grain, start, end).map((b) => ({ label: b.label, in: 0, out: 0 }))
    for (const r of rows) {
      const i = Math.floor((new Date(r.occurred_at).getTime() - start) / size)
      if (i < 0 || i >= bs.length) continue
      if (r.direction === 'in') bs[i].in += r.amount
      else bs[i].out += r.amount + r.fee
    }
    return bs
  }, [rows, grain, start, end])

  const balancePoints = useMemo(
    () =>
      rows
        .filter((r) => r.balance_after != null)
        .map((r) => ({ t: new Date(r.occurred_at).getTime(), balance: r.balance_after as number })),
    [rows],
  )
  const gaps = rows.filter((r) => r.balance_gap != null && Math.abs(r.balance_gap) >= 0.01)
  const latestBalance = balancePoints.length ? balancePoints[balancePoints.length - 1].balance : null

  const activeProjects = (projects.data ?? []).filter((p) => p.status === 'active' && !p.archived)
  const nUnlabeled = unlabeled.data?.length ?? 0
  const unlabeledOut = (unlabeled.data ?? [])
    .filter((t) => t.direction === 'out')
    .reduce((a, t) => a + t.amount + t.fee, 0)
  const nUnreadable = unreadable.data?.length ?? 0

  const feed = [...rows].reverse()
  const shown = showAll ? feed : feed.slice(0, 12)

  return (
    <div className="space-y-5">
      {/* period controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-2 md:justify-start">
          <button type="button" onClick={() => move(-1)} aria-label="Previous" className="btn-ghost !p-2.5">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-[170px] text-center md:text-left md:px-3">
            <div className="text-[22px] font-extrabold leading-tight tracking-tight">{periodLabel(grain, start)}</div>
            <div className="text-[12px] text-mute">{sublabel(grain, start)}</div>
          </div>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={isCurrent}
            aria-label="Next"
            className="btn-ghost !p-2.5"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="self-center md:self-auto">
          <Segmented
            value={grain}
            onChange={changeGrain}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
        </div>
      </div>

      <ErrorNote error={tx.error} />

      {/* nudges */}
      {(nUnlabeled > 0 || nUnreadable > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          {nUnlabeled > 0 && (
            <button
              type="button"
              onClick={() => goto('labels')}
              className="card flex items-center gap-3 border-fee/40 p-4 text-left transition active:scale-[0.99]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-fee/15 text-fee">
                <Tag size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold">
                  {nUnlabeled} transaction{nUnlabeled === 1 ? '' : 's'} need a label
                </div>
                <div className="text-[12px] text-mute">
                  {unlabeledOut > 0 ? `Ksh ${ksh(unlabeledOut, { decimals: false })} out is unexplained` : 'Money in waiting'}
                </div>
              </div>
              <ChevronRight className="text-fee" size={18} />
            </button>
          )}
          {nUnreadable > 0 && (
            <button
              type="button"
              onClick={() => goto('projects')}
              className="card flex items-center gap-3 border-warn/40 p-4 text-left transition active:scale-[0.99]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn">
                <ScanLine size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-extrabold">
                  {nUnreadable} message{nUnreadable === 1 ? '' : 's'} could not be read
                </div>
                <div className="text-[12px] text-mute">Money may be missing from the totals below</div>
              </div>
              <ChevronRight className="text-warn" size={18} />
            </button>
          )}
        </div>
      )}

      {/* hero */}
      <section className="card relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-mint/10 blur-3xl" />
        <div className="relative">
          <div className="label !mb-2">Income · {periodLabel(grain, start).toLowerCase()}</div>
          <Money value={s.income} tone="in" size="hero" prefix="Ksh" />
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-line pt-5">
            <Stat label="Spent" hint="incl. fees" value={s.spent} tone="out" />
            <Stat label={s.net >= 0 ? 'Left over' : 'Overspent'} value={s.net} tone="net" />
            <Stat label="Transaction costs" value={s.fees} tone="fee" />
          </div>
        </div>
      </section>

      {tx.isSuccess && rows.length === 0 ? (
        <Empty
          icon={<Wallet size={26} />}
          title="Nothing in this period"
          hint="Transactions land here as M-Pesa messages arrive. Use the arrows to look at another period."
        />
      ) : (
        <>
          {/* breakdowns */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Breakdown title="Where it went" total={s.spent} tone="out" slices={s.outSlices} onUnlabeled={() => goto('labels')} />
            <Breakdown title="Where it came from" total={s.income} tone="in" slices={s.inSlices} onUnlabeled={() => goto('labels')} />
          </div>

          {/* trends */}
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-5">
              <SectionTitle
                aside={
                  <div className="flex gap-3 text-[11px] font-bold text-mute">
                    <span className="flex items-center gap-1.5">
                      <Dot color="#a3e635" size={8} /> In
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Dot color="#ff8a5b" size={8} /> Out
                    </span>
                  </div>
                }
              >
                Cash flow
              </SectionTitle>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flow} barGap={2} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="label"
                      tick={AXIS}
                      tickLine={false}
                      axisLine={false}
                      interval={grain === 'day' ? 3 : grain === 'month' ? 4 : 0}
                    />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={(p) => <Tip {...(p as unknown as TipProps)} />} />
                    <Bar dataKey="in" name="In" fill="#a3e635" radius={[5, 5, 0, 0]} maxBarSize={14} />
                    <Bar dataKey="out" name="Out" fill="#ff8a5b" radius={[5, 5, 0, 0]} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="card p-5">
              <SectionTitle
                aside={
                  latestBalance != null ? (
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-mute">M-Pesa balance</div>
                      <Money value={latestBalance} tone="net" size="md" />
                    </div>
                  ) : undefined
                }
              >
                Balance over time
              </SectionTitle>
              {balancePoints.length < 2 ? (
                <div className="grid h-56 place-items-center text-sm text-mute">Needs at least two transactions</div>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={balancePoints} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="bal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2de2c0" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#2de2c0" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="t"
                        type="number"
                        scale="time"
                        domain={['dataMin', 'dataMax']}
                        tick={AXIS}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(t: number) =>
                          grain === 'day'
                            ? new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })
                            : shortDate(t)
                        }
                        minTickGap={36}
                      />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
                      <Tooltip
                        content={(p) => (
                          <Tip
                            {...(p as unknown as TipProps)}
                            title={(l) => dateTime(new Date(Number(l)).toISOString())}
                          />
                        )}
                      />
                      <Area
                        type="monotone"
                        dataKey="balance"
                        name="Balance"
                        stroke="#2de2c0"
                        strokeWidth={2.5}
                        fill="url(#bal)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {gaps.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-[12px] text-warn">
                  <div className="flex items-center gap-2 font-extrabold">
                    <AlertTriangle size={14} /> {gaps.length} gap{gaps.length === 1 ? '' : 's'} in the balance chain
                  </div>
                  <div className="mt-1 text-warn/80">
                    A message was probably missed.{' '}
                    {gaps
                      .slice(0, 2)
                      .map((g) => `${shortDate(g.occurred_at)}: ${ksh(g.balance_gap ?? 0, { sign: true })} unexplained`)
                      .join(' · ')}
                  </div>
                </div>
              ) : (
                balancePoints.length >= 2 && (
                  <div className="mt-3 text-[12px] font-semibold text-inflow/80">
                    Balance chain checks out. Every message adds up.
                  </div>
                )
              )}
            </section>
          </div>
        </>
      )}

      {/* projects */}
      <section>
        <SectionTitle
          aside={
            <button type="button" onClick={() => goto('projects')} className="text-[13px] font-bold text-mint">
              Manage
            </button>
          }
        >
          Projects
        </SectionTitle>
        {activeProjects.length === 0 ? (
          <div className="card px-5 py-8 text-center text-sm text-mute">
            No projects yet. Create one under the Projects tab and tag payments to it.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeProjects.map((p) => (
              <ProjectCard key={p.id} project={p} total={totals.data?.[p.id]} />
            ))}
          </div>
        )}
      </section>

      {/* activity */}
      {feed.length > 0 && (
        <section>
          <SectionTitle>Activity</SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">
            {shown.map((r) => {
              const c = r.category_id ? catById.get(r.category_id) : undefined
              const p = r.project_id ? projById.get(r.project_id) : undefined
              const color = p?.color ?? c?.color ?? UNLABELED
              const tone: Tone = r.direction === 'in' ? 'in' : 'out'
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <Dot color={color} size={12} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">{r.particulars ?? r.counterparty ?? 'Unknown'}</div>
                    <div className="truncate text-[12px] text-mute">
                      {r.status === 'unlabeled' ? (
                        <span className="font-bold text-fee">Unlabeled</span>
                      ) : (
                        <>{p ? `Project: ${p.name}` : c?.name}</>
                      )}
                      {' · '}
                      {dateTime(r.occurred_at)}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money value={r.direction === 'out' ? -r.amount : r.amount} tone={tone} size="sm" sign />
                    {r.fee > 0 && <div className="text-[10px] font-bold text-fee">+{ksh(r.fee)} fee</div>}
                  </div>
                  {r.status === 'labeled' && (
                    <button
                      type="button"
                      onClick={() => unlabel.mutate(r.id)}
                      className="grid h-8 w-8 place-items-center rounded-full text-mute transition hover:bg-white/5 hover:text-white"
                      aria-label="Relabel"
                      title="Send back to Labels"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {feed.length > 12 && (
            <button type="button" className="btn-ghost mx-auto mt-3 flex" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : `Show all ${feed.length}`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone: Tone; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold uppercase leading-tight tracking-[0.12em] text-mute">
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal opacity-60">{hint}</span>}
      </div>
      <div className="mt-1">
        <Money value={value} tone={tone} size="lg" decimals={false} />
      </div>
    </div>
  )
}

function Breakdown({
  title,
  total,
  tone,
  slices,
  onUnlabeled,
}: {
  title: string
  total: number
  tone: Tone
  slices: Slice[]
  onUnlabeled: () => void
}) {
  const [all, setAll] = useState(false)
  const sum = slices.reduce((a, x) => a + x.value, 0)
  const visible = all ? slices : slices.slice(0, 7)

  return (
    <section className="card p-5">
      <SectionTitle aside={<Money value={total} tone={tone} size="md" decimals={false} prefix="Ksh" />}>{title}</SectionTitle>
      {slices.length === 0 ? (
        <div className="py-10 text-center text-sm text-mute">Nothing yet</div>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative mx-auto h-44 w-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="66%"
                  outerRadius="100%"
                  paddingAngle={slices.length > 1 ? 2 : 0}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {slices.map((x) => (
                    <Cell key={x.key} fill={x.color} />
                  ))}
                </Pie>
                <Tooltip content={(p) => <Tip {...(p as unknown as TipProps)} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-mute">{slices.length} groups</div>
                <div className="text-[15px] font-extrabold">{compact(sum)}</div>
              </div>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-2.5">
            {visible.map((x) => {
              const share = sum > 0 ? (x.value / sum) * 100 : 0
              const inner = (
                <>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2 font-bold">
                      <Dot color={x.color} size={9} />
                      <span className="truncate">{x.name}</span>
                    </span>
                    <span className="shrink-0 font-bold">
                      {ksh(x.value, { decimals: false })}
                      <span className="ml-1.5 text-[11px] font-semibold text-mute">{pct(share)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: x.color }} />
                  </div>
                </>
              )
              return (
                <li key={x.key}>
                  {x.key === 'unlabeled' ? (
                    <button type="button" onClick={onUnlabeled} className="block w-full text-left" title="Go label these">
                      {inner}
                    </button>
                  ) : (
                    inner
                  )}
                </li>
              )
            })}
            {slices.length > 7 && (
              <li>
                <button type="button" className="text-[12px] font-bold text-mint" onClick={() => setAll((v) => !v)}>
                  {all ? 'Show less' : `Show ${slices.length - 7} more`}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  )
}

interface TipProps {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; fill?: string; payload?: { label?: string } }[]
  label?: string | number
  title?: (label: string | number) => string
}

function Tip({ active, payload, label, title }: TipProps) {
  if (!active || !payload?.length) return null
  const heading = title && label != null ? title(label) : label
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a2b21]/95 px-3.5 py-2.5 text-[12px] shadow-xl backdrop-blur">
      {heading != null && heading !== '' && <div className="mb-1 font-bold text-mute">{heading}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-5 font-bold">
          <span className="flex items-center gap-1.5">
            <Dot color={p.color ?? p.fill ?? '#fff'} size={8} />
            {p.name}
          </span>
          <span>Ksh {ksh(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}
