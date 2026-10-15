import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Plus, ScanLine, Trash2 } from 'lucide-react'
import { CategoryPicker, Dot, ErrorNote, Segmented } from '../components/ui'
import { dateTime } from '../lib/format'
import {
  useCategories,
  useCreateRule,
  useDeleteRule,
  useDismissRaw,
  useProjects,
  useRules,
  useUnreadable,
  useUpdateRule,
} from '../lib/queries'
import type { Direction, Rule } from '../lib/types'

const FIELD_LABEL: Record<Rule['match_field'], string> = { name: 'Name', phone: 'Phone', account: 'Account' }

export function PresetsPanel() {
  const rules = useRules()
  const cats = useCategories()
  const projects = useProjects()
  const update = useUpdateRule()
  const remove = useDeleteRule()
  const unreadable = useUnreadable()
  const dismiss = useDismissRaw()

  const [dir, setDir] = useState<Direction>('out')
  const [adding, setAdding] = useState(false)

  const catById = new Map((cats.data ?? []).map((c) => [c.id, c]))
  const projById = new Map((projects.data ?? []).map((p) => [p.id, p]))
  const list = (rules.data ?? []).filter((r) => r.direction === dir)

  return (
    <div className="space-y-5">
      <ErrorNote error={rules.error} />

      {(unreadable.data?.length ?? 0) > 0 && (
        <div className="card border-warn/40 p-4">
          <div className="mb-3 flex items-center gap-2 font-extrabold text-warn">
            <ScanLine size={18} /> {unreadable.data!.length} message{unreadable.data!.length === 1 ? '' : 's'} could not be read
          </div>
          <p className="mb-3 text-[12px] text-mute">
            These looked like M-Pesa confirmations but didn't match a known format. Paste one to me and I'll teach the
            parser, then they can be dismissed here.
          </p>
          <div className="space-y-2">
            {unreadable.data!.map((m) => (
              <div key={m.id} className="rounded-2xl border border-line bg-black/25 p-3">
                <div className="text-[11px] font-bold text-mute">{dateTime(m.received_at)}</div>
                <div className="mt-1 break-words text-[13px]">{m.body}</div>
                <button type="button" className="mt-2 text-[12px] font-bold text-mint" onClick={() => dismiss.mutate(m.id)}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Segmented
          value={dir}
          onChange={(d) => {
            setDir(d)
            setAdding(false)
          }}
          options={[
            { value: 'out', label: 'Money out' },
            { value: 'in', label: 'Money in' },
          ]}
        />
        {!adding && (
          <button type="button" className="btn-primary !px-4 !py-2.5" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={3} /> Preset
          </button>
        )}
      </div>

      {adding && <RuleForm direction={dir} onDone={() => setAdding(false)} />}

      {list.length === 0 && !adding ? (
        <div className="card px-5 py-10 text-center text-sm text-mute">
          No presets for money {dir === 'out' ? 'out' : 'in'} yet. Label something with “Auto-label next time” on, or add
          one here.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((r) => {
            const c = r.category_id ? catById.get(r.category_id) : undefined
            const p = r.project_id ? projById.get(r.project_id) : undefined
            return (
              <div key={r.id} className={`card flex items-center gap-3 p-4 ${r.active ? '' : 'opacity-50'}`}>
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
                    r.direction === 'out' ? 'bg-outflow/15 text-outflow' : 'bg-inflow/15 text-inflow'
                  }`}
                >
                  {r.direction === 'out' ? <ArrowUpRight size={19} /> : <ArrowDownLeft size={19} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-extrabold">
                    <span className="text-white/60">
                      {FIELD_LABEL[r.match_field]} {r.match_type === 'equals' ? 'is' : 'contains'}
                    </span>{' '}
                    {r.pattern}
                    {r.account_pattern === '' && <span className="ml-1.5 text-[11px] font-bold text-mute">· no account</span>}
                    {r.account_pattern !== '' && r.account_pattern !== '*' && (
                      <span className="ml-1.5 text-[11px] font-bold text-mute">· acc {r.account_pattern}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 truncate text-[12px] text-mute">
                    <span className="font-bold text-white/85">{r.particulars}</span>
                    <span>·</span>
                    <Dot color={p?.color ?? c?.color ?? '#5f8576'} size={8} />
                    <span className="truncate">{p ? `Project: ${p.name}${r.project_phase === 'save' ? ' (saving)' : ''}` : c?.name}</span>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.active}
                  aria-label="Active"
                  onClick={() => update.mutate({ id: r.id, patch: { active: !r.active } })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${r.active ? 'bg-mint' : 'bg-white/15'}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.active ? 'left-[22px]' : 'left-0.5'}`}
                  />
                </button>
                <button
                  type="button"
                  aria-label="Delete preset"
                  className="text-mute transition hover:text-warn"
                  onClick={() => remove.mutate(r.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RuleForm({ direction, onDone }: { direction: Direction; onDone: () => void }) {
  const create = useCreateRule()
  const projects = useProjects()
  const [field, setField] = useState<Rule['match_field']>('name')
  const [type, setType] = useState<Rule['match_type']>('equals')
  const [pattern, setPattern] = useState('')
  const [account, setAccount] = useState<'any' | 'none' | 'only'>('any')
  const [accountText, setAccountText] = useState('')
  const [what, setWhat] = useState('')
  const [mode, setMode] = useState<'category' | 'project'>('category')
  const [cat, setCat] = useState<string | null>(null)
  const [proj, setProj] = useState<string | null>(null)
  const [phase, setPhase] = useState<'save' | 'spend'>('spend')

  const isOut = direction === 'out'
  const active = (projects.data ?? []).filter((p) => p.status === 'active' && !p.archived)
  const accountPattern = account === 'any' ? '*' : account === 'none' ? '' : accountText.trim()
  const valid =
    pattern.trim() && what.trim() && (mode === 'category' ? cat : proj) && (account !== 'only' || accountText.trim())

  return (
    <form
      className="card pop-in space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        create.mutate(
          {
            direction,
            match_field: field,
            match_type: type,
            // names are stored upper-case by the parser; matching is case-insensitive anyway
            pattern: pattern.trim(),
            account_pattern: accountPattern,
            particulars: what.trim(),
            category_id: mode === 'category' ? cat : null,
            project_id: mode === 'project' ? proj : null,
            project_phase: mode === 'project' && isOut ? phase : null,
          },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="text-[15px] font-extrabold">New preset for money {isOut ? 'out' : 'in'}</div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Match on</label>
          <select className="field" value={field} onChange={(e) => setField(e.target.value as Rule['match_field'])}>
            <option value="name">{isOut ? 'Paid to / sent to name' : 'Received from name'}</option>
            <option value="phone">Phone number</option>
            <option value="account">Account / reference</option>
          </select>
        </div>
        <div>
          <label className="label">Rule</label>
          <select className="field" value={type} onChange={(e) => setType(e.target.value as Rule['match_type'])}>
            <option value="equals">Is exactly</option>
            <option value="contains">Contains</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Text to match</label>
        <input className="field" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. TINGG" autoFocus />
      </div>

      {isOut && (
        <div>
          <label className="label">Paybill account / reference</label>
          <select className="field" value={account} onChange={(e) => setAccount(e.target.value as 'any' | 'none' | 'only')}>
            <option value="any">Any (or none)</option>
            <option value="none">Only when there is no account (person or till)</option>
            <option value="only">Only this account…</option>
          </select>
          {account === 'only' && (
            <input
              className="field mt-2"
              value={accountText}
              onChange={(e) => setAccountText(e.target.value)}
              placeholder="e.g. 331351#Tithes"
            />
          )}
        </div>
      )}

      <div>
        <label className="label">Label it as (what)</label>
        <input className="field" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. Airtime" />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label !mb-0">{mode === 'project' ? 'Project' : 'Category'}</span>
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
        ) : active.length === 0 ? (
          <div className="text-sm text-mute">Create a project first.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.map((p) => (
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
        {mode === 'project' && isOut && (
          <div className="mt-3">
            <Segmented
              small
              value={phase}
              onChange={setPhase}
              options={[
                { value: 'save', label: 'Saving for it' },
                { value: 'spend', label: 'Spent on it' },
              ]}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={!valid || create.isPending}>
          Save preset
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
