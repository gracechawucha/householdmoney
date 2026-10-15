import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCheck,
  CheckSquare,
  PartyPopper,
  Sparkles,
  Search,
  SearchX,
  Square,
  X,
} from 'lucide-react'
import { Empty, ErrorNote, Money, SectionTitle } from '../components/ui'
import { LabelForm } from '../components/LabelForm'
import { Modal } from '../components/Modal'
import { QuickSort, quickSortCount } from '../components/QuickSort'
import { dateTime, ksh, shortDate } from '../lib/format'
import {
  labelCutoff,
  useAllTx,
  useBulkLabel,
  useCategories,
  useHistory,
  useLabel,
  useOlderUnlabeled,
  useUnlabeled,
  type HistoryRow,
} from '../lib/queries'
import type { Direction, Tx } from '../lib/types'

type DirFilter = 'all' | Direction
const PAGE = 30

function haystack(t: Tx): string {
  return [t.counterparty, t.counterparty_phone, t.account_ref, t.mpesa_code, t.particulars, t.tx_type, String(t.amount)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function Labels() {
  const [includeOlder, setIncludeOlder] = useState(false)
  const unlabeled = useUnlabeled(includeOlder)
  const older = useOlderUnlabeled()
  const [quick, setQuick] = useState(false)
  const [showLabeled, setShowLabeled] = useState(false)
  const all = useAllTx(showLabeled)
  const history = useHistory()
  const cats = useCategories()

  const [q, setQ] = useState('')
  const [dir, setDir] = useState<DirFilter>('all')
  const [limit, setLimit] = useState(PAGE)
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const bulk = useBulkLabel()

  const unl = unlabeled.data ?? []
  const nQuick = useMemo(() => quickSortCount(unl, cats.data), [unl, cats.data])
  const base = showLabeled ? all.data ?? [] : unl

  const owedOut = unl.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount + t.fee, 0)
  const owedIn = unl.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
  const nOut = unl.filter((t) => t.direction === 'out').length
  const nIn = unl.length - nOut

  // latest first, filtered by direction and search
  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    return [...base]
      .filter((t) => dir === 'all' || t.direction === dir)
      .filter((t) => {
        if (!terms.length) return true
        const h = haystack(t)
        return terms.every((w) => h.includes(w))
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  }, [base, dir, q])

  // reset paging when the question changes
  useEffect(() => setLimit(PAGE), [q, dir, showLabeled])
  // drop picks that are no longer on the list (just labeled, or filtered away)
  useEffect(() => {
    setPicked((prev) => {
      const ids = new Set(base.map((t) => t.id))
      const next = new Set([...prev].filter((id) => ids.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [base])

  const byId = useMemo(() => new Map(base.map((t) => [t.id, t])), [base])
  const pickedTxs = [...picked].map((id) => byId.get(id)).filter((t): t is Tx => !!t)
  const pickedDir: Direction | null = pickedTxs[0]?.direction ?? null
  const pickedSum = pickedTxs.reduce((s, t) => s + t.amount, 0)

  const toggle = (t: Tx) => {
    if (pickedDir && t.direction !== pickedDir) return
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(t.id)) next.delete(t.id)
      else next.add(t.id)
      return next
    })
  }
  const selectAllShown = () => {
    const d = dir === 'all' ? shown[0]?.direction : dir
    if (!d) return
    setPicked(new Set(shown.filter((t) => t.direction === d).map((t) => t.id)))
  }
  const exitSelect = () => {
    setSelecting(false)
    setPicked(new Set())
  }

  const catName = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name])), [cats.data])
  const loading = showLabeled ? all.isLoading : unlabeled.isLoading
  const visible = shown.slice(0, limit)

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="px-1 text-[26px] font-extrabold leading-tight tracking-tight md:text-[28px]">To label</h1>
          <p className="px-1 text-[13px] text-mute">Name it, pick where it belongs, tick it off.</p>
        </div>
        {base.length > 1 && (
          <button
            type="button"
            onClick={() => (selecting ? exitSelect() : setSelecting(true))}
            aria-label={selecting ? 'Done selecting' : 'Select several'}
            className={`btn-ghost shrink-0 !px-3 !py-2.5 !text-[13px] sm:!px-3.5 ${selecting ? '!border-mint/50 !text-mint' : ''}`}
          >
            {selecting ? <X size={16} /> : <CheckSquare size={16} />}
            <span className="hidden sm:inline">{selecting ? 'Done' : 'Select'}</span>
          </button>
        )}
      </div>

      <ErrorNote error={unlabeled.error} />

      {/* the two totals double as filters */}
      {unl.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setDir(dir === 'out' ? 'all' : 'out')}
            aria-pressed={dir === 'out'}
            className={`card min-w-0 p-3.5 text-left transition active:scale-[0.98] ${dir === 'out' ? '!border-outflow/60' : ''}`}
          >
            <div className="label !mb-1 truncate">Out, unlabeled</div>
            <Money value={owedOut} tone="out" size="lg" decimals={false} />
            <div className="mt-0.5 text-[11px] font-semibold text-mute">{nOut} waiting</div>
          </button>
          <button
            type="button"
            onClick={() => setDir(dir === 'in' ? 'all' : 'in')}
            aria-pressed={dir === 'in'}
            className={`card min-w-0 p-3.5 text-left transition active:scale-[0.98] ${dir === 'in' ? '!border-inflow/60' : ''}`}
          >
            <div className="label !mb-1 truncate">In, unlabeled</div>
            <Money value={owedIn} tone="in" size="lg" decimals={false} />
            <div className="mt-0.5 text-[11px] font-semibold text-mute">{nIn} waiting</div>
          </button>
        </div>
      )}

      {nQuick > 0 && !showLabeled && (
        <button
          type="button"
          onClick={() => setQuick(true)}
          className="card flex w-full min-w-0 items-center gap-3 border-mint/30 p-3.5 text-left transition active:scale-[0.99]"
        >
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-mint/15 text-mint">
            <Sparkles size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-extrabold">Quick sort · {nQuick} look like groceries or transport</div>
            <div className="truncate text-[12px] text-mute">Review and label them in a few taps</div>
          </div>
        </button>
      )}

      {/* search + filters */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
          <input
            className="field !pl-11 !pr-10"
            type="search"
            inputMode="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, amount, code…"
            autoComplete="off"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-mute"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ['all', 'All'],
              ['out', 'Out'],
              ['in', 'In'],
            ] as [DirFilter, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" className="chip !px-3.5 !py-1.5" data-on={dir === v} style={dir === v ? { background: v === 'out' ? '#ff8a5b' : v === 'in' ? '#a3e635' : '#2de2c0' } : undefined} onClick={() => setDir(v)}>
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowLabeled((v) => !v)}
            aria-pressed={showLabeled}
            className={`chip !px-3.5 !py-1.5 ${showLabeled ? '!border-mint/50 !text-mint' : ''}`}
          >
            {showLabeled ? <Check size={13} /> : null} Include labeled
          </button>
        </div>
      </div>

      {(older.data ?? 0) > 0 && !showLabeled && (
        <button
          type="button"
          onClick={() => setIncludeOlder((v) => !v)}
          className="w-full px-1 text-left text-[12px] font-semibold text-mute"
        >
          Showing since {shortDate(new Date(labelCutoff()).toISOString())}.{' '}
          <span className="font-bold text-mint">
            {includeOlder ? 'Hide' : `Show ${older.data} older`}
          </span>
        </button>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-mute">Loading…</div>
      ) : base.length === 0 ? (
        <Empty
          icon={<PartyPopper size={26} />}
          title="Every shilling is accounted for"
          hint="New M-Pesa messages show up here the moment they arrive, unless a preset already knows them."
        />
      ) : shown.length === 0 ? (
        <Empty icon={<SearchX size={26} />} title="Nothing matches" hint="Try fewer words, or switch the Out / In filter." />
      ) : (
        <>
          <SectionTitle
            aside={
              selecting && (
                <button type="button" onClick={selectAllShown} className="flex items-center gap-1.5 text-[13px] font-bold text-mint">
                  <CheckCheck size={15} /> Select all {dir === 'all' ? (shown[0]?.direction === 'out' ? 'out' : 'in') : dir}
                </button>
              )
            }
          >
            {shown.length} {showLabeled ? 'transactions' : 'waiting'}
          </SectionTitle>

          {selecting ? (
            <div className="card divide-y divide-line overflow-hidden">
              {visible.map((t) => {
                const on = picked.has(t.id)
                const blocked = !!pickedDir && t.direction !== pickedDir
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t)}
                    disabled={blocked}
                    className={`flex w-full min-w-0 items-center gap-3 px-3.5 py-3 text-left transition disabled:opacity-30 ${on ? 'bg-mint/10' : ''}`}
                  >
                    <span className={on ? 'text-mint' : 'text-mute'}>{on ? <CheckSquare size={21} /> : <Square size={21} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{t.counterparty ?? 'Unknown'}</span>
                      <span className="block truncate text-[11px] text-mute">
                        {shortDate(t.occurred_at)}
                        {t.account_ref ? ` · acc ${t.account_ref}` : ''}
                        {t.status === 'labeled' && t.particulars ? ` · ${t.particulars}` : ''}
                      </span>
                    </span>
                    <Money value={t.direction === 'out' ? -t.amount : t.amount} tone={t.direction === 'out' ? 'out' : 'in'} size="sm" sign decimals={false} />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[repeat(2,minmax(0,1fr))]">
              {visible.map((tx) => (
                <TxCard key={tx.id} tx={tx} history={history.data ?? []} catName={catName} />
              ))}
            </div>
          )}

          {shown.length > limit && (
            <button type="button" className="btn-ghost mx-auto flex" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, shown.length - limit)} more
            </button>
          )}
        </>
      )}

      {/* batch bar */}
      {selecting && (
        <div
          className="fixed inset-x-0 z-30 flex justify-center px-3"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
        >
          <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-3xl border border-mint/30 bg-[#0a2b21]/95 p-2.5 pl-4 shadow-glow backdrop-blur-xl">
            <div className="min-w-0 text-[13px] font-bold">
              {pickedTxs.length === 0 ? (
                <span className="text-mute">Tap transactions to pick them</span>
              ) : (
                <>
                  {pickedTxs.length} picked
                  <span className="ml-1.5 text-mute">Ksh {ksh(pickedSum, { decimals: false })}</span>
                </>
              )}
            </div>
            <button type="button" className="btn-primary shrink-0 !py-2.5" disabled={pickedTxs.length === 0} onClick={() => setBulkOpen(true)}>
              Label {pickedTxs.length || ''}
            </button>
          </div>
        </div>
      )}

      {quick && <QuickSort txs={unl} onClose={() => setQuick(false)} />}

      {bulkOpen && pickedDir && (
        <Modal
          title={`Label ${pickedTxs.length} transactions`}
          subtitle={`${pickedDir === 'out' ? 'Out' : 'In'} · Ksh ${ksh(pickedSum, { decimals: false })} in total`}
          onClose={() => setBulkOpen(false)}
        >
          <div className="max-h-36 divide-y divide-line overflow-y-auto border-b border-line">
            {pickedTxs.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-1.5 text-[12px]">
                <span className="min-w-0 truncate font-semibold">{t.counterparty ?? 'Unknown'}</span>
                <span className="shrink-0 text-mute">{ksh(t.amount, { decimals: false })}</span>
              </div>
            ))}
          </div>
          <div className="p-4">
            <LabelForm
              uid="bulk"
              direction={pickedDir}
              defaultRemember={false}
              submitText={`Label ${pickedTxs.length}`}
              busy={bulk.isPending}
              compact
              onSubmit={(v) =>
                bulk.mutate(
                  { txs: pickedTxs, ...v },
                  {
                    onSuccess: () => {
                      setBulkOpen(false)
                      exitSelect()
                    },
                  },
                )
              }
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

function TxCard({
  tx,
  history,
  catName,
}: {
  tx: Tx
  history: HistoryRow[]
  catName: Map<string, string>
}) {
  const label = useLabel()
  const isOut = tx.direction === 'out'
  const labeled = tx.status === 'labeled'

  const prior = useMemo(
    () => history.find((h) => h.direction === tx.direction && h.counterparty && h.counterparty === tx.counterparty),
    [history, tx.direction, tx.counterparty],
  )
  const src = labeled
    ? { what: tx.particulars ?? '', category_id: tx.category_id, project_id: tx.project_id, project_phase: tx.project_phase }
    : {
        what: prior?.particulars ?? '',
        category_id: prior?.category_id ?? null,
        project_id: prior?.project_id ?? null,
        project_phase: prior?.project_phase ?? null,
      }

  return (
    <div className="card pop-in min-w-0 p-3.5 md:p-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
            isOut ? 'bg-outflow/15 text-outflow' : 'bg-inflow/15 text-inflow'
          }`}
        >
          {isOut ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-extrabold">{tx.counterparty ?? 'Unknown'}</div>
          <div className="truncate text-[11px] text-mute">{dateTime(tx.occurred_at)}</div>
        </div>
        <div className="shrink-0 text-right">
          <Money value={isOut ? -tx.amount : tx.amount} tone={isOut ? 'out' : 'in'} size="md" sign decimals={false} />
          {tx.fee > 0 && <div className="text-[10px] font-bold text-fee">+ {ksh(tx.fee, { decimals: false })} fee</div>}
        </div>
      </div>
      {(tx.counterparty_phone || tx.account_ref || labeled) && (
        <div className="mt-1 break-words text-[11px] text-mute">
          {tx.counterparty_phone}
          {tx.counterparty_phone && tx.account_ref ? ' · ' : ''}
          {tx.account_ref ? `acc ${tx.account_ref}` : ''}
          {labeled && (
            <span className="font-bold text-mint">
              {tx.counterparty_phone || tx.account_ref ? ' · ' : ''}Labeled
              {tx.category_id && catName.get(tx.category_id) ? `: ${catName.get(tx.category_id)}` : ''}
            </span>
          )}
        </div>
      )}

      <LabelForm
        uid={tx.id}
        direction={tx.direction}
        initial={src}
        defaultRemember={!labeled}
        busy={label.isPending}
        onSubmit={(v) => label.mutate({ tx, ...v })}
      />
    </div>
  )
}
