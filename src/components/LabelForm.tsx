import { useMemo, useState } from 'react'
import { Check, Repeat } from 'lucide-react'
import { CategoryPicker, Segmented } from './ui'
import { useCategories, useHistory, useProjects, useRules } from '../lib/queries'
import type { Direction, Project, ProjectPhase } from '../lib/types'

export interface LabelValue {
  particulars: string
  category_id: string | null
  project_id: string | null
  project_phase: ProjectPhase | null
  remember: boolean
}

export interface LabelInitial {
  what?: string
  category_id?: string | null
  project_id?: string | null
  project_phase?: ProjectPhase | null
}

/** One shared <datalist> of "what" suggestions. Render once, near the app root. */
export function Suggestions() {
  const history = useHistory()
  const rules = useRules()
  const { out, inn } = useMemo(() => {
    const o = new Set<string>()
    const i = new Set<string>()
    for (const h of history.data ?? []) (h.direction === 'out' ? o : i).add(h.particulars)
    for (const r of rules.data ?? []) (r.direction === 'out' ? o : i).add(r.particulars)
    return { out: [...o].sort(), inn: [...i].sort() }
  }, [history.data, rules.data])
  return (
    <>
      <datalist id="what-out">
        {out.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id="what-in">
        {inn.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  )
}

export function activeProjectList(all: Project[] | undefined, keep?: string | null): Project[] {
  return (all ?? []).filter((p) => (p.status === 'active' && !p.archived) || p.id === keep)
}

/**
 * The labeling form: what / category-or-project / (save|spend) / auto-label.
 * Used for one transaction, a whole batch, and re-labeling from the Snapshot.
 */
export function LabelForm({
  uid,
  direction,
  initial,
  defaultRemember = true,
  submitText,
  busy,
  onSubmit,
  compact,
}: {
  uid: string
  direction: Direction
  initial?: LabelInitial
  defaultRemember?: boolean
  submitText?: string
  busy?: boolean
  onSubmit: (v: LabelValue) => void
  compact?: boolean
}) {
  const projectsQ = useProjects()
  const catsQ = useCategories()
  const isOut = direction === 'out'
  const projects = activeProjectList(projectsQ.data, initial?.project_id)

  const [what, setWhat] = useState(initial?.what ?? '')
  const startKind = initial?.category_id ? catsQ.data?.find((c) => c.id === initial.category_id)?.kind : undefined
  const [mode, setMode] = useState<'category' | 'savings' | 'project'>(
    initial?.project_id ? 'project' : startKind === 'savings' ? 'savings' : 'category',
  )
  const [cat, setCat] = useState<string | null>(startKind === 'savings' ? null : initial?.category_id ?? null)
  const [sav, setSav] = useState<string | null>(startKind === 'savings' ? initial?.category_id ?? null : null)
  const [proj, setProj] = useState<string | null>(initial?.project_id ?? null)
  const [phase, setPhase] = useState<ProjectPhase>(initial?.project_phase ?? 'spend')
  const [remember, setRemember] = useState(defaultRemember)

  const valid = what.trim().length > 0 && (mode === 'category' ? !!cat : mode === 'savings' ? !!sav : !!proj)

  const submit = () => {
    if (!valid || busy) return
    onSubmit({
      particulars: what,
      category_id: mode === 'category' ? cat : mode === 'savings' ? sav : null,
      project_id: mode === 'project' ? proj : null,
      project_phase: mode === 'project' && isOut ? phase : null,
      remember,
    })
  }

  return (
    <div className="min-w-0">
      <div className={compact ? '' : 'mt-3'}>
        <label className="label" htmlFor={`what-${uid}`}>
          What was it?
        </label>
        <input
          id={`what-${uid}`}
          className="field"
          list={isOut ? 'what-out' : 'what-in'}
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={isOut ? 'e.g. Airtime, Groceries, Rent' : 'e.g. Salary, Refund, Gift'}
          autoComplete="off"
        />
      </div>

      <div className="mt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="label !mb-0">{mode === 'project' ? 'Which project?' : mode === 'savings' ? 'Saving where?' : 'Category'}</span>
          {isOut && (
            <Segmented
              small
              value={mode}
              onChange={setMode}
              options={[
                { value: 'category', label: 'Expense' },
                { value: 'savings', label: 'Savings' },
                { value: 'project', label: 'Project' },
              ]}
            />
          )}
        </div>

        {mode === 'category' ? (
          <CategoryPicker kind={isOut ? 'expense' : 'income'} value={cat} onChange={setCat} />
        ) : mode === 'savings' ? (
          <>
            <CategoryPicker kind="savings" value={sav} onChange={setSav} />
            <div className="mt-1.5 text-[11px] leading-snug text-mute">
              Money set aside, like an emergency fund. Counts as Savings, not an expense.
            </div>
          </>
        ) : projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-mute">
            No active projects yet. Create one under the Projects tab.
          </div>
        ) : (
          <>
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
              <div className="mt-1.5 text-[11px] leading-snug text-mute">
                {phase === 'save'
                  ? 'Counts as Savings, not an expense. It is set aside for this project.'
                  : 'Counts as an expense and uses up what you saved for this project.'}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setRemember((r) => !r)}
          className={`flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-bold transition ${
            remember ? 'border-mint/50 bg-mint/10 text-mint' : 'border-line text-mute'
          }`}
          aria-pressed={remember}
        >
          <Repeat size={14} className="shrink-0" />
          <span className="truncate">{remember ? 'Auto-label next time' : 'Just this once'}</span>
        </button>
        {submitText ? (
          <button type="button" onClick={submit} disabled={!valid || busy} className="btn-primary shrink-0">
            {submitText}
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!valid || busy}
            aria-label="Save label"
            className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full bg-gradient-to-b from-mint to-[#19c4a4] text-ink shadow-glow transition active:scale-90 disabled:opacity-30 disabled:shadow-none"
          >
            <Check size={24} strokeWidth={3.2} />
          </button>
        )}
      </div>
    </div>
  )
}
