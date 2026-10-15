import { useEffect, useMemo, useState } from 'react'
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
import {
  AlertTriangle,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Pencil,
  PiggyBank,
  RotateCcw,
  ScanLine,
  Tag,
  Target,
  Wallet,
} from 'lucide-react'
import { Dot, Empty, ErrorNote, Money, Segmented, SectionTitle, type Tone } from '../components/ui'
import { ProjectCard } from '../components/ProjectCard'
import { Tip, type TipProps } from '../components/ChartTip'
import { TrendChart } from '../components/TrendChart'
import { TxListModal, type Rename } from '../components/TxListModal'
import { ProjectModal } from '../components/ProjectModal'
import { Modal } from '../components/Modal'
import type { Tab } from '../components/Nav'
import { compact, dateTime, ksh, pct, shortDate } from '../lib/format'
import { eatDate, flowOf } from '../lib/classify'
import { goalAt } from '../lib/goals'
import { bucketSize, buckets, periodLabel, shift, startOf, sublabel, type Grain } from '../lib/period'
import {
  useAddMessages,
  useCategories,
  useGoals,
  useLastMessage,
  useMshwari,
  useProjectTotals,
  useProjects,
  useSetSetting,
  useSettings,
  useTxRange,
  useUnlabeled,
  useUnlabel,
  useUnreadable,
} from '../lib/queries'
import type { Tx } from '../lib/types'

const UNLABELED = '#5f8576'
const FEES = '#fbbf24'
const SAVED = '#2de2c0'
const AXIS = { fontSize: 11, fill: '#7fa396' }
const DAY = 86_400_000

interface Slice {
  key: string
  name: string
  color: string
  value: number
}

/** What the open modal is showing. It holds a filter, not rows, so edits show up live. */
interface ModalSpec {
  title: string
  subtitle?: string
  note?: string
  source: 'main' | 'cf' | 'mshwari'
  pred: (t: Tx) => boolean
  rename?: Rename | null
  startEditing?: boolean
  openId?: string | null
  ascending?: boolean
}

// recharts hands click handlers a state object; all we need is which point was hit
function hitIndex(state: unknown): number | null {
  const v = (state as { activeTooltipIndex?: unknown } | null)?.activeTooltipIndex
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export function Snapshot({ goto }: { goto: (t: Tab) => void }) {
  const [grain, setGrain] = useState<Grain>('month')
  const [start, setStart] = useState(() => startOf('month', Date.now()))
  const [showAll, setShowAll] = useState(false)
  const [modal, setModal] = useState<ModalSpec | null>(null)
  const [projModal, setProjModal] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [realMsh, setRealMsh] = useState('')
  // cash flow can be flipped on its own; any move of the top controls puts it back in sync
  const [cfOverride, setCfOverride] = useState<{ grain: Grain; start: number } | null>(null)

  const end = shift(grain, start, 1)
  const isCurrent = start === startOf(grain, Date.now())

  const tx = useTxRange(start, end)
  const cats = useCategories()
  const projects = useProjects()
  const totals = useProjectTotals()
  const unlabeled = useUnlabeled()
  const unreadable = useUnreadable()
  const unlabel = useUnlabel()
  const goals = useGoals()
  const mshwari = useMshwari()
  const settings = useSettings()
  const setSetting = useSetSetting()
  const lastMsg = useLastMessage()

  const cfGrain = cfOverride?.grain ?? grain
  const cfStart = cfOverride?.start ?? start
  const cfEnd = shift(cfGrain, cfStart, 1)
  const cfCurrent = cfStart === startOf(cfGrain, Date.now())
  const cfTx = useTxRange(cfStart, cfEnd)

  const changeGrain = (g: Grain) => {
    setGrain(g)
    setStart(startOf(g, isCurrent ? Date.now() : start))
    setShowAll(false)
    setCfOverride(null)
  }
  const move = (n: number) => {
    setStart(shift(grain, start, n))
    setShowAll(false)
    setCfOverride(null)
  }
  const cfPick = (g: Grain) => {
    if (g === grain && !cfOverride) return
    const now = Date.now()
    const ts = cfStart <= now && now < cfEnd ? now : cfStart
    const s = startOf(g, ts)
    setCfOverride(g === grain && s === start ? null : { grain: g, start: s })
  }
  const cfMove = (n: number) => setCfOverride({ grain: cfGrain, start: shift(cfGrain, cfStart, n) })

  const catById = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c])), [cats.data])
  const projById = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p])), [projects.data])

  const rows = tx.data ?? []
  const cfRows = cfTx.data ?? []
  const mshRows = mshwari.data ?? []

  const s = useMemo(() => {
    let income = 0
    let spent = 0
    let fees = 0
    let saved = 0
    const inMap = new Map<string, Slice>()
    const outMap = new Map<string, Slice>()
    const saveMap = new Map<string, Slice>()
    const add = (m: Map<string, Slice>, key: string, name: string, color: string, v: number) => {
      const cur = m.get(key)
      if (cur) cur.value += v
      else m.set(key, { key, name, color, value: v })
    }

    for (const r of rows) {
      const f = flowOf(r, catById)
      const c = r.category_id ? catById.get(r.category_id) : undefined
      const p = r.project_id ? projById.get(r.project_id) : undefined
      if (f === 'income') {
        income += r.amount
        if (c) add(inMap, c.id, c.name, c.color, r.amount)
        else add(inMap, 'unlabeled', 'Unlabeled', UNLABELED, r.amount)
        continue
      }
      // a fee is a real cost even when the money itself only moved or was set aside
      fees += r.fee
      spent += r.fee
      if (f === 'transfer') continue // M-Shwari: its own card, never income or spending
      if (f === 'save') {
        saved += r.amount
        if (p) add(saveMap, `p:${p.id}`, p.name, p.color, r.amount)
        else if (c) add(saveMap, `c:${c.id}`, c.name, c.color, r.amount)
        else add(saveMap, 'saving', 'Savings', SAVED, r.amount)
        continue
      }
      spent += r.amount
      if (p) add(outMap, `p:${p.id}`, `Project: ${p.name}`, p.color, r.amount)
      else if (c) add(outMap, c.id, c.name, c.color, r.amount)
      else add(outMap, 'unlabeled', 'Unlabeled', UNLABELED, r.amount)
    }
    if (fees > 0) add(outMap, 'fees', 'Transaction costs', FEES, fees)

    const sort = (m: Map<string, Slice>) => [...m.values()].sort((a, b) => b.value - a.value)
    return {
      income,
      spent,
      fees,
      saved,
      inSlices: sort(inMap),
      outSlices: sort(outMap),
      saveSlices: sort(saveMap),
    }
  }, [rows, catById, projById])

  // M-Shwari: money in vs money out of it tells the balance held there
  const msh = useMemo(() => {
    let put = 0 // M-Pesa → M-Shwari
    let took = 0 // M-Shwari → M-Pesa
    let periodPut = 0
    let periodTook = 0
    for (const r of mshRows) {
      const inPeriod = new Date(r.occurred_at).getTime() >= start && new Date(r.occurred_at).getTime() < end
      if (r.direction === 'out') {
        put += r.amount
        if (inPeriod) periodPut += r.amount
      } else {
        took += r.amount
        if (inPeriod) periodTook += r.amount
      }
    }
    return { put, took, net: put - took, periodPut, periodTook }
  }, [mshRows, start, end])
  // money that was already in M-Shwari before tracking began (set by "Fix balance")
  const mshOpening = Number(settings.data?.mshwari_opening ?? 0) || 0
  const mshBalance = mshOpening + msh.net

  const monthGoal = useMemo(
    () => (grain === 'month' ? goalAt(goals.data, 'month', eatDate(start)) : null),
    [goals.data, grain, start],
  )

  const flow = useMemo(() => {
    const size = bucketSize(cfGrain)
    const bs = buckets(cfGrain, cfStart, cfEnd).map((b) => ({ label: b.label, start: b.start, in: 0, out: 0, saved: 0 }))
    for (const r of cfRows) {
      const i = Math.floor((new Date(r.occurred_at).getTime() - cfStart) / size)
      if (i < 0 || i >= bs.length) continue
      const f = flowOf(r, catById)
      if (f === 'income') bs[i].in += r.amount
      else {
        bs[i].out += r.fee
        if (f === 'spend') bs[i].out += r.amount
        else if (f === 'save') bs[i].saved += r.amount
      }
    }
    return bs
  }, [cfRows, cfGrain, cfStart, cfEnd, catById])

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

  /* ------------------------------ modal openers ----------------------------- */

  const openSlice = (side: 'out' | 'in' | 'save', x: Slice) => {
    let pred: (t: Tx) => boolean
    let rename: Rename | null = null
    if (side === 'in') {
      pred = (t) => flowOf(t, catById) === 'income' && (x.key === 'unlabeled' ? !t.category_id : t.category_id === x.key)
      if (catById.has(x.key)) rename = { kind: 'category', id: x.key, name: x.name }
    } else if (side === 'save') {
      const id = x.key.slice(2)
      if (x.key.startsWith('c:')) {
        pred = (t) => flowOf(t, catById) === 'save' && !t.project_id && t.category_id === id
        if (catById.has(id)) rename = { kind: 'category', id, name: x.name }
      } else if (x.key.startsWith('p:')) {
        pred = (t) => flowOf(t, catById) === 'save' && t.project_id === id
        if (projById.has(id)) rename = { kind: 'project', id, name: x.name }
      } else pred = (t) => flowOf(t, catById) === 'save' && !t.project_id && !t.category_id
    } else if (x.key === 'fees') {
      pred = (t) => t.fee > 0 && flowOf(t, catById) !== 'income'
    } else if (x.key === 'unlabeled') {
      pred = (t) => flowOf(t, catById) === 'spend' && !t.project_id && !t.category_id
    } else if (x.key.startsWith('p:')) {
      const id = x.key.slice(2)
      pred = (t) => flowOf(t, catById) === 'spend' && t.project_id === id
      if (projById.has(id)) rename = { kind: 'project', id, name: projById.get(id)!.name }
    } else {
      pred = (t) => flowOf(t, catById) === 'spend' && !t.project_id && t.category_id === x.key
      if (catById.has(x.key)) rename = { kind: 'category', id: x.key, name: x.name }
    }
    setModal({
      title: x.name,
      subtitle: `${periodLabel(grain, start)} · Ksh ${ksh(x.value, { decimals: false })}`,
      source: 'main',
      pred,
      rename,
    })
  }

  const openStat = (kind: 'income' | 'spent' | 'saved' | 'fees') => {
    const preds: Record<typeof kind, (t: Tx) => boolean> = {
      income: (t) => flowOf(t, catById) === 'income',
      spent: (t) => {
        const f = flowOf(t, catById)
        return f === 'spend' || (f !== 'income' && t.fee > 0)
      },
      saved: (t) => flowOf(t, catById) === 'save',
      fees: (t) => t.fee > 0 && flowOf(t, catById) !== 'income',
    }
    const names = { income: 'Income', spent: 'Spent', saved: 'Savings', fees: 'Transaction costs' }
    setModal({ title: names[kind], subtitle: periodLabel(grain, start), source: 'main', pred: preds[kind] })
  }

  const openBucket = (i: number) => {
    const b = flow[i]
    if (!b) return
    const size = bucketSize(cfGrain)
    setModal({
      title: cfGrain === 'day' ? `${b.label}:00` : new Date(b.start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }),
      subtitle: 'Cash flow',
      source: 'cf',
      pred: (t) => {
        const ts = new Date(t.occurred_at).getTime()
        return ts >= b.start && ts < b.start + size && flowOf(t, catById) !== 'transfer'
      },
    })
  }

  const openDay = (i: number) => {
    const pt = balancePoints[i]
    if (!pt) return
    const day = startOf('day', pt.t)
    setModal({
      title: new Date(day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }),
      subtitle: 'Everything that day',
      source: 'main',
      pred: (t) => {
        const ts = new Date(t.occurred_at).getTime()
        return ts >= day && ts < day + DAY
      },
      ascending: true,
    })
  }

  const openGap = (g: Tx) => {
    const idx = rows.findIndex((r) => r.id === g.id)
    const prev = idx > 0 ? rows[idx - 1] : null
    const ids = new Set([g.id, ...(prev ? [prev.id] : [])])
    setModal({
      title: 'Balance gap',
      subtitle: `${dateTime(g.occurred_at)} · ${ksh(g.balance_gap ?? 0, { sign: true })} unexplained`,
      note:
        `The balance after this message is Ksh ${ksh(Math.abs(g.balance_gap ?? 0))} ${(g.balance_gap ?? 0) > 0 ? 'higher' : 'lower'} than the previous message plus this amount. ` +
        `A transaction was probably missed between these two${prev ? '' : ' (or just before this period)'}. Label this one below.`,
      source: 'main',
      pred: (t) => ids.has(t.id),
      startEditing: true,
      openId: g.id,
      ascending: true,
    })
  }

  const openMshwari = () =>
    setModal({
      title: 'M-Shwari moves',
      subtitle: `${periodLabel(grain, start)} · balance held Ksh ${ksh(mshBalance, { decimals: false })}`,
      source: 'mshwari',
      pred: (t) => {
        const ts = new Date(t.occurred_at).getTime()
        return ts >= start && ts < end
      },
    })

  const modalTxs = useMemo(() => {
    if (!modal) return []
    const src = modal.source === 'main' ? rows : modal.source === 'cf' ? cfRows : mshRows
    return src.filter(modal.pred)
  }, [modal, rows, cfRows, mshRows])

  // a modal that has emptied itself (everything relabeled away) closes
  useEffect(() => {
    if (modal && modalTxs.length === 0 && !modal.startEditing) {
      const t = setTimeout(() => setModal(null), 0)
      return () => clearTimeout(t)
    }
  }, [modal, modalTxs.length])

  const heardStale = !!lastMsg.data && Date.now() - new Date(lastMsg.data).getTime() > 18 * 3_600_000

  return (
    <div className="min-w-0 space-y-4 md:space-y-5">
      {/* period controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center justify-between gap-2 md:justify-start">
          <button type="button" onClick={() => move(-1)} aria-label="Previous" className="btn-ghost !p-2.5">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 text-center md:flex-none md:px-3 md:text-left">
            <div className="truncate text-[20px] font-extrabold leading-tight tracking-tight md:text-[22px]">{periodLabel(grain, start)}</div>
            <div className="truncate text-[12px] text-mute">{sublabel(grain, start)}</div>
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {nUnlabeled > 0 && (
            <button
              type="button"
              onClick={() => goto('labels')}
              className="card flex min-w-0 items-center gap-3 border-fee/40 p-3.5 text-left transition active:scale-[0.99]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-fee/15 text-fee">
                <Tag size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold">
                  {nUnlabeled} transaction{nUnlabeled === 1 ? '' : 's'} need a label
                </div>
                <div className="truncate text-[12px] text-mute">
                  {unlabeledOut > 0 ? `Ksh ${ksh(unlabeledOut, { decimals: false })} out is unexplained` : 'Money in waiting'}
                </div>
              </div>
              <ChevronRight className="shrink-0 text-fee" size={18} />
            </button>
          )}
          {nUnreadable > 0 && (
            <button
              type="button"
              onClick={() => goto('projects')}
              className="card flex min-w-0 items-center gap-3 border-warn/40 p-3.5 text-left transition active:scale-[0.99]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-warn/15 text-warn">
                <ScanLine size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-extrabold">
                  {nUnreadable} message{nUnreadable === 1 ? '' : 's'} could not be read
                </div>
                <div className="truncate text-[12px] text-mute">Money may be missing from the totals below</div>
              </div>
              <ChevronRight className="shrink-0 text-warn" size={18} />
            </button>
          )}
        </div>
      )}

      {/* hero */}
      <section className="card relative min-w-0 overflow-hidden p-4 md:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-mint/10 blur-3xl" />
        <div className="relative min-w-0">
          <button type="button" onClick={() => openStat('income')} className="block max-w-full text-left">
            <div className="label !mb-2">Income · {periodLabel(grain, start).toLowerCase()}</div>
            <Money value={s.income} tone="in" size="hero" prefix="Ksh" />
          </button>

          {grain === 'month' &&
            (monthGoal ? (
              <GoalBar income={s.income} goal={monthGoal.amount} onClick={() => goto('goals')} />
            ) : (
              <button
                type="button"
                onClick={() => goto('goals')}
                className="mt-4 flex items-center gap-2 text-[13px] font-bold text-mint"
              >
                <Target size={15} /> Set a monthly income goal
              </button>
            ))}

          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-4 md:gap-3 md:pt-5">
            <Stat label="Spent" hint="incl. fees" value={s.spent} tone="out" onClick={() => openStat('spent')} />
            <Stat label="Savings" value={s.saved} tone="net" onClick={() => openStat('saved')} />
            <Stat label="Txn costs" value={s.fees} tone="fee" onClick={() => openStat('fees')} />
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
          <Breakdown title="Where it went" total={s.spent} tone="out" slices={s.outSlices} onOpen={(x) => openSlice('out', x)} />
          <Breakdown title="Where it came from" total={s.income} tone="in" slices={s.inSlices} onOpen={(x) => openSlice('in', x)} />
        </div>
      )}

      {/* savings + M-Shwari */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
        <section className="card min-w-0 p-4 md:p-5">
          <SectionTitle aside={<Money value={s.saved} tone="net" size="md" decimals={false} prefix="Ksh" />}>Savings</SectionTitle>
          {s.saveSlices.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-5 text-[13px] text-mute">
              <PiggyBank size={20} className="shrink-0" />
              <span>Nothing set aside this period. When you label money “Saving for it” on a project, it shows here.</span>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {s.saveSlices.map((x) => {
                const share = s.saved > 0 ? (x.value / s.saved) * 100 : 0
                return (
                  <li key={x.key}>
                    <button type="button" onClick={() => openSlice('save', x)} className="block w-full text-left">
                      <div className="flex items-center justify-between gap-3 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2 font-bold">
                          <Dot color={x.color} size={9} />
                          <span className="truncate">{x.name}</span>
                        </span>
                        <span className="shrink-0 font-bold">{ksh(x.value, { decimals: false })}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, background: x.color }} />
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="mt-3 text-[11px] leading-snug text-mute">
            Savings are set aside, not spent. When you spend on a project, it draws its savings down.
          </div>
        </section>

        <section className="card min-w-0 p-4 md:p-5">
          <SectionTitle
            aside={
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
                <ArrowLeftRight size={13} /> Transfer
              </span>
            }
          >
            M-Shwari
          </SectionTitle>
          <button type="button" onClick={openMshwari} className="block w-full text-left">
            <div className="label !mb-1">Held there</div>
            <Money value={mshBalance} tone={mshBalance < 0 ? 'out' : 'neutral'} size="xl" decimals={false} prefix="Ksh" />
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-mute">Put in</div>
                <Money value={msh.periodPut} tone="neutral" size="md" decimals={false} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-mute">Taken out</div>
                <Money value={msh.periodTook} tone="neutral" size="md" decimals={false} />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-mute">Net</div>
                <Money value={msh.periodPut - msh.periodTook} tone="net" size="md" decimals={false} sign />
              </div>
            </div>
            <div className="mt-1 text-[11px] text-mute">{periodLabel(grain, start)}</div>
          </button>

          {fixing ? (
            <div className="mt-3 flex items-center gap-2">
              <input
                className="field !py-2.5"
                inputMode="decimal"
                autoFocus
                value={realMsh}
                onChange={(e) => setRealMsh(e.target.value.replace(/[^\d.-]/g, ''))}
                placeholder="What it really holds now"
                aria-label="Real M-Shwari balance"
              />
              <button
                type="button"
                className="btn-primary shrink-0 !px-4"
                disabled={realMsh === '' || Number.isNaN(Number(realMsh))}
                onClick={() => {
                  // opening = what it really holds − everything that went in and out since tracking began
                  setSetting.mutate({ key: 'mshwari_opening', value: String(Number(realMsh) - msh.net) })
                  setFixing(false)
                  setRealMsh('')
                }}
              >
                Set
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setFixing(true)} className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-mint">
              <Pencil size={13} /> Fix balance
            </button>
          )}
          <div className="mt-2 text-[11px] leading-snug text-mute">
            Held = {mshOpening !== 0 ? `${ksh(mshOpening, { decimals: false })} you had before tracking + ` : ''}Ksh{' '}
            {ksh(msh.put, { decimals: false })} put in − Ksh {ksh(msh.took, { decimals: false })} taken out. Not income, not spending.
            {mshOpening === 0 && mshBalance < 0 && ' Negative means some was already there before tracking began: tap Fix balance and enter the real figure.'}
          </div>
        </section>
      </div>

      {/* cash flow + balance */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
        <section className="card min-w-0 p-4 md:p-5">
          <SectionTitle
            aside={
              <div className="flex gap-2.5 text-[11px] font-bold text-mute">
                <span className="flex items-center gap-1">
                  <Dot color="#a3e635" size={8} /> In
                </span>
                <span className="flex items-center gap-1">
                  <Dot color="#ff8a5b" size={8} /> Out
                </span>
                <span className="flex items-center gap-1">
                  <Dot color={SAVED} size={8} /> Saved
                </span>
              </div>
            }
          >
            Cash flow
          </SectionTitle>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => cfMove(-1)} aria-label="Earlier" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-white/70">
              <ChevronLeft size={16} />
            </button>
            <div className="flex min-w-0 flex-col items-center gap-1.5">
              <Segmented
                small
                value={cfGrain}
                onChange={cfPick}
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
              />
              <div className="max-w-full truncate text-[11px] font-bold text-mute">
                {periodLabel(cfGrain, cfStart)} · {sublabel(cfGrain, cfStart)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => cfMove(1)}
              disabled={cfCurrent}
              aria-label="Later"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-white/70 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="h-52 md:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={flow}
                barGap={2}
                margin={{ top: 6, right: 4, left: -18, bottom: 0 }}
                onClick={(st) => {
                  const i = hitIndex(st)
                  if (i != null) openBucket(i)
                }}
              >
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="label"
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  interval={cfGrain === 'day' ? 3 : cfGrain === 'month' ? 4 : 0}
                />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={(p) => <Tip {...(p as unknown as TipProps)} />} />
                <Bar dataKey="in" name="In" fill="#a3e635" radius={[5, 5, 0, 0]} maxBarSize={12} cursor="pointer" />
                <Bar dataKey="out" name="Out" fill="#ff8a5b" radius={[5, 5, 0, 0]} maxBarSize={12} cursor="pointer" />
                <Bar dataKey="saved" name="Saved" fill={SAVED} radius={[5, 5, 0, 0]} maxBarSize={12} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-center text-[11px] text-mute">Tap a bar to see what is in it</div>
        </section>

        <section className="card min-w-0 p-4 md:p-5">
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
            MPesa Balance over time
          </SectionTitle>
          {balancePoints.length < 2 ? (
            <div className="grid h-52 place-items-center text-sm text-mute md:h-56">Needs at least two transactions</div>
          ) : (
            <div className="h-52 md:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={balancePoints}
                  margin={{ top: 6, right: 4, left: -18, bottom: 0 }}
                  onClick={(st) => {
                    const i = hitIndex(st)
                    if (i != null) openDay(i)
                  }}
                >
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
                      <Tip {...(p as unknown as TipProps)} title={(l) => dateTime(new Date(Number(l)).toISOString())} />
                    )}
                  />
                  <Area type="monotone" dataKey="balance" name="Balance" stroke="#2de2c0" strokeWidth={2.5} fill="url(#bal)" cursor="pointer" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {gaps.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-warn/40 bg-warn/10 p-3 text-[12px] text-warn">
              <div className="flex items-center gap-2 font-extrabold">
                <AlertTriangle size={14} /> {gaps.length} gap{gaps.length === 1 ? '' : 's'} in the balance chain
              </div>
              <div className="mt-1 text-warn/80">A message was probably missed. Tap one to see the exact transaction and label it.</div>
              <ul className="mt-2 space-y-1.5">
                {gaps.slice(0, 6).map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => openGap(g)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-warn/30 bg-black/20 px-3 py-2 text-left font-bold transition active:scale-[0.99]"
                    >
                      <span className="min-w-0 truncate">
                        {shortDate(g.occurred_at)} · {g.particulars ?? g.counterparty ?? 'Unknown'}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {ksh(g.balance_gap ?? 0, { sign: true })}
                        <ChevronRight size={14} />
                      </span>
                    </button>
                  </li>
                ))}
                {gaps.length > 6 && <li className="px-1 text-warn/70">+ {gaps.length - 6} more in this period</li>}
              </ul>
            </div>
          ) : (
            balancePoints.length >= 2 && (
              <div className="mt-3 text-[12px] font-semibold text-inflow/80">Balance chain checks out. Every message adds up.</div>
            )
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3 text-[11px] font-semibold">
            <span className={heardStale ? 'font-bold text-warn' : 'text-mute'}>
              {lastMsg.data
                ? `Last M-Pesa message heard ${ago(lastMsg.data)}${heardStale ? ': the phone may have stopped forwarding' : ''}`
                : 'No M-Pesa message heard yet'}
            </span>
            <button type="button" onClick={() => setPasting(true)} className="flex items-center gap-1.5 font-bold text-mint">
              <ClipboardPaste size={13} /> Add a missed message
            </button>
          </div>
        </section>
      </div>

      {/* income / spending / savings over months */}
      <TrendChart />

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
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
            {activeProjects.map((p) => (
              <ProjectCard key={p.id} project={p} total={totals.data?.[p.id]} onClick={() => setProjModal(p.id)} />
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
                <div key={r.id} className="flex min-w-0 items-center gap-3 px-3.5 py-3">
                  <Dot color={color} size={12} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">{r.particulars ?? r.counterparty ?? 'Unknown'}</div>
                    <div className="truncate text-[12px] text-mute">
                      {r.status === 'unlabeled' ? (
                        <span className="font-bold text-fee">Unlabeled</span>
                      ) : (
                        <>{p ? `Project: ${p.name}${r.project_phase === 'save' ? ' · saving' : ''}` : c?.name}</>
                      )}
                      {' · '}
                      {dateTime(r.occurred_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money value={r.direction === 'out' ? -r.amount : r.amount} tone={tone} size="sm" sign />
                    {r.fee > 0 && <div className="text-[10px] font-bold text-fee">+{ksh(r.fee)} fee</div>}
                  </div>
                  {r.status === 'labeled' && (
                    <button
                      type="button"
                      onClick={() => unlabel.mutate(r.id)}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-mute transition hover:bg-white/5 hover:text-white"
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

      {projModal && projects.data?.find((x) => x.id === projModal) && (
        <ProjectModal
          project={projects.data.find((x) => x.id === projModal)!}
          total={totals.data?.[projModal]}
          onClose={() => setProjModal(null)}
        />
      )}

      {pasting && <PasteModal onClose={() => setPasting(false)} />}

      {modal && (
        <TxListModal
          key={`${modal.title}|${modal.subtitle}`}
          title={modal.title}
          subtitle={modal.subtitle}
          note={modal.note}
          txs={modalTxs}
          catById={catById}
          projById={projById}
          rename={modal.rename}
          startEditing={modal.startEditing}
          openId={modal.openId}
          ascending={modal.ascending}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

function GoalBar({ income, goal, onClick }: { income: number; goal: number; onClick: () => void }) {
  const ratio = goal > 0 ? income / goal : 0
  const hit = income >= goal
  return (
    <button type="button" onClick={onClick} className="mt-4 block w-full text-left" aria-label="Open goals">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[12px] font-bold">
        <span className="flex min-w-0 items-center gap-1.5 text-white/80">
          <Target size={14} className="shrink-0 text-mint" />
          <span className="truncate">Towards goal · Ksh {ksh(goal, { decimals: false })}</span>
        </span>
        <span className={hit ? 'text-inflow' : 'text-white/80'}>{pct(ratio * 100)}</span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full"
        style={{
          background:
            'repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 6px), rgba(255,255,255,0.05)',
        }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.min(100, ratio * 100)}%`,
            background: hit ? 'linear-gradient(90deg,#a3e635,#2de2c0)' : 'linear-gradient(90deg,#facc15,#a3e635)',
          }}
        />
      </div>
      <div className="mt-1.5 text-[11px] font-semibold text-mute">
        {hit ? `Goal reached, Ksh ${ksh(income - goal, { decimals: false })} over` : `Ksh ${ksh(goal - income, { decimals: false })} to go`}
      </div>
    </button>
  )
}

function Stat({
  label,
  value,
  tone,
  hint,
  onClick,
}: {
  label: string
  value: number
  tone: Tone
  hint?: string
  onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} className="flex min-w-0 flex-col justify-between text-left transition active:scale-[0.97]">
      <div className="text-[10px] font-bold uppercase leading-tight tracking-[0.08em] text-mute md:text-[11px] md:tracking-[0.12em]">
        {label}
        {hint && <span className="ml-1 hidden normal-case tracking-normal opacity-60 sm:inline">{hint}</span>}
      </div>
      <div className="mt-1">
        <Money value={value} tone={tone} size="lg" decimals={false} />
      </div>
    </button>
  )
}

function Breakdown({
  title,
  total,
  tone,
  slices,
  onOpen,
}: {
  title: string
  total: number
  tone: Tone
  slices: Slice[]
  onOpen: (x: Slice) => void
}) {
  const [all, setAll] = useState(false)
  const sum = slices.reduce((a, x) => a + x.value, 0)
  const visible = all ? slices : slices.slice(0, 7)

  return (
    <section className="card min-w-0 p-4 md:p-5">
      <SectionTitle aside={<Money value={total} tone={tone} size="md" decimals={false} prefix="Ksh" />}>{title}</SectionTitle>
      {slices.length === 0 ? (
        <div className="py-10 text-center text-sm text-mute">Nothing yet</div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="relative mx-auto h-40 w-40 shrink-0 sm:h-44 sm:w-44">
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
                  cursor="pointer"
                  onClick={(_d, i) => {
                    const x = slices[i]
                    if (x) onOpen(x)
                  }}
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
              return (
                <li key={x.key}>
                  <button type="button" onClick={() => onOpen(x)} className="block w-full text-left transition active:opacity-70" title="See the transactions">
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
                  </button>
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

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (m < 2) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 36) return `${h}h ago`
  return `${Math.round(h / 24)} days ago`
}

/** Paste the original M-Pesa SMS (one or several) that never reached the webhook. */
function PasteModal({ onClose }: { onClose: () => void }) {
  const add = useAddMessages()
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ added: number; duplicate: number; unreadable: number } | null>(null)

  return (
    <Modal title="Add a missed message" subtitle="Paste the M-Pesa SMS exactly as it came" onClose={onClose}>
      <div className="space-y-3 p-4">
        <textarea
          className="field min-h-[9rem] resize-y"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null)
          }}
          placeholder="UJ12ABC345 Confirmed. Ksh100.00 sent to …"
        />
        {result && (
          <div className="rounded-2xl border border-line px-3.5 py-2.5 text-[13px] font-semibold">
            Added <b className="text-inflow">{result.added}</b>
            {result.duplicate > 0 && <> · {result.duplicate} already there</>}
            {result.unreadable > 0 && <span className="text-warn"> · {result.unreadable} could not be read</span>}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-mute">Several messages at once is fine. Each M-Pesa code is only ever added once.</span>
          <button
            type="button"
            className="btn-primary shrink-0"
            disabled={!text.trim() || add.isPending}
            onClick={() =>
              add.mutate(text, {
                onSuccess: (r) => {
                  setResult(r)
                  if (r.added > 0 && r.unreadable === 0) setText('')
                },
              })
            }
          >
            Add
          </button>
        </div>
      </div>
    </Modal>
  )
}
