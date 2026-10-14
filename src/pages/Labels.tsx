import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, PartyPopper, Repeat } from 'lucide-react'
import { CategoryPicker, Empty, ErrorNote, Money, Segmented, SectionTitle } from '../components/ui'
import { dateTime, ksh } from '../lib/format'
import { useHistory, useLabel, useProjects, useRules, useUnlabeled, type HistoryRow } from '../lib/queries'
import type { Project, Tx } from '../lib/types'

export function Labels() {
  const unlabeled = useUnlabeled()
  const projects = useProjects()
  const history = useHistory()
  const rules = useRules()

  const list = unlabeled.data ?? []
  const activeProjects = (projects.data ?? []).filter((p) => p.status === 'active' && !p.archived)

  const owedOut = list.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount + t.fee, 0)
  const owedIn = list.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)

  // suggestions for the "what" field
  const suggestions = useMemo(() => {
    const out = new Set<string>()
    const inn = new Set<string>()
    for (const h of history.data ?? []) (h.direction === 'out' ? out : inn).add(h.particulars)
    for (const r of rules.data ?? []) (r.direction === 'out' ? out : inn).add(r.particulars)
    return { out: [...out].sort(), in: [...inn].sort() }
  }, [history.data, rules.data])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="px-1 text-[28px] font-extrabold tracking-tight">To label</h1>
        <p className="px-1 text-sm text-mute">Name it, pick where it belongs, tick it off.</p>
      </div>

      <ErrorNote error={unlabeled.error} />

      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="label !mb-1">Out, unlabeled</div>
            <Money value={owedOut} tone="out" size="lg" decimals={false} />
          </div>
          <div className="card p-4">
            <div className="label !mb-1">In, unlabeled</div>
            <Money value={owedIn} tone="in" size="lg" decimals={false} />
          </div>
        </div>
      )}

      <datalist id="what-out">
        {suggestions.out.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="what-in">
        {suggestions.in.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {unlabeled.isSuccess && list.length === 0 ? (
        <Empty
          icon={<PartyPopper size={26} />}
          title="Every shilling is accounted for"
          hint="New M-Pesa messages show up here the moment they arrive, unless a preset already knows them."
        />
      ) : (
        <>
          <SectionTitle>{list.length} waiting</SectionTitle>
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((tx) => (
              <TxCard key={tx.id} tx={tx} projects={activeProjects} history={history.data ?? []} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TxCard({ tx, projects, history }: { tx: Tx; projects: Project[]; history: HistoryRow[] }) {
  const label = useLabel()
  const isOut = tx.direction === 'out'

  const prior = useMemo(
    () => history.find((h) => h.direction === tx.direction && h.counterparty && h.counterparty === tx.counterparty),
    [history, tx.direction, tx.counterparty],
  )

  const [what, setWhat] = useState(prior?.particulars ?? '')
  const [mode, setMode] = useState<'category' | 'project'>(prior?.project_id ? 'project' : 'category')
  const [cat, setCat] = useState<string | null>(prior?.category_id ?? null)
  const [proj, setProj] = useState<string | null>(prior?.project_id ?? null)
  const [remember, setRemember] = useState(true)

  const valid = what.trim().length > 0 && (mode === 'category' ? !!cat : !!proj)

  const submit = () => {
    if (!valid || label.isPending) return
    label.mutate({
      tx,
      particulars: what,
      category_id: mode === 'category' ? cat : null,
      project_id: mode === 'project' ? proj : null,
      remember,
    })
  }

  return (
    <div className="card pop-in p-4 md:p-5">
      {/* who / how much */}
      <div className="flex items-center gap-3">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
            isOut ? 'bg-outflow/15 text-outflow' : 'bg-inflow/15 text-inflow'
          }`}
        >
          {isOut ? <ArrowUpRight size={22} /> : <ArrowDownLeft size={22} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-extrabold">{tx.counterparty ?? 'Unknown'}</div>
          <div className="truncate text-[12px] text-mute">
            {dateTime(tx.occurred_at)}
            {tx.counterparty_phone ? ` · ${tx.counterparty_phone}` : ''}
            {tx.account_ref ? ` · acc ${tx.account_ref}` : ''}
          </div>
        </div>
        <div className="text-right">
          <Money value={isOut ? -tx.amount : tx.amount} tone={isOut ? 'out' : 'in'} size="md" sign />
          {tx.fee > 0 && <div className="text-[11px] font-bold text-fee">+ {ksh(tx.fee)} fee</div>}
        </div>
      </div>

      {/* what */}
      <div className="mt-4">
        <label className="label" htmlFor={`what-${tx.id}`}>
          What was it?
        </label>
        <input
          id={`what-${tx.id}`}
          className="field"
          list={isOut ? 'what-out' : 'what-in'}
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={isOut ? 'e.g. Airtime, Lunch, Rent' : 'e.g. Salary, Refund, Gift'}
          autoComplete="off"
        />
      </div>

      {/* where it belongs */}
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label !mb-0">{mode === 'project' ? 'Which project?' : 'Category'}</span>
          {isOut && (
            <Segmented
              small
              value={mode}
              onChange={setMode}
              options={[
                { value: 'category', label: 'Expense' },
                { value: 'project', label: 'Project' },
              ]}
            />
          )}
        </div>

        {mode === 'category' ? (
          <CategoryPicker kind={isOut ? 'expense' : 'income'} value={cat} onChange={setCat} />
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-mute">
            No active projects yet. Create one under the Projects tab.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                data-on={proj === p.id}
                style={proj === p.id ? { background: p.color } : undefined}
                onClick={() => setProj(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* footer */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setRemember((r) => !r)}
          className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-[12px] font-bold transition ${
            remember ? 'border-mint/50 bg-mint/10 text-mint' : 'border-line text-mute'
          }`}
          aria-pressed={remember}
        >
          <Repeat size={14} /> {remember ? 'Auto-label next time' : 'Just this once'}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || label.isPending}
          aria-label="Save label"
          className="grid h-[54px] w-[54px] place-items-center rounded-full bg-gradient-to-b from-mint to-[#19c4a4] text-ink shadow-glow transition active:scale-90 disabled:opacity-30 disabled:shadow-none"
        >
          <Check size={26} strokeWidth={3.2} />
        </button>
      </div>
    </div>
  )
}
