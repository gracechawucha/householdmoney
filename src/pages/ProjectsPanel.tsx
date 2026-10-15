import { useState } from 'react'
import { Archive, CheckCircle2, Coins, Plus, RotateCcw, X } from 'lucide-react'
import { ProjectCard } from '../components/ProjectCard'
import { ProjectModal } from '../components/ProjectModal'
import { Dot, ErrorNote } from '../components/ui'
import { SWATCHES } from '../lib/format'
import {
  useCreateProject,
  useProjectTotals,
  useProjects,
  useUpdateProject,
} from '../lib/queries'
import type { Project } from '../lib/types'

interface FormValue {
  name: string
  goal: string
  target: string
  deadline: string
  color: string
}

function ProjectForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
  extra,
}: {
  initial: FormValue
  submitLabel: string
  onSubmit: (v: FormValue) => void
  onCancel: () => void
  busy?: boolean
  extra?: React.ReactNode
}) {
  const [v, setV] = useState(initial)
  const set = <K extends keyof FormValue>(k: K, val: FormValue[K]) => setV((p) => ({ ...p, [k]: val }))
  const valid = v.name.trim().length > 0 && Number(v.target) >= 0

  return (
    <form
      className="card pop-in space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit(v)
      }}
    >
      <div>
        <label className="label">Name</label>
        <input className="field" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. School fees Term 1" autoFocus />
      </div>
      <div>
        <label className="label">Goal</label>
        <input className="field" value={v.goal} onChange={(e) => set('goal', e.target.value)} placeholder="What is this for? (optional)" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount needed (Ksh)</label>
          <input
            className="field"
            inputMode="decimal"
            value={v.target}
            onChange={(e) => set('target', e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0"
          />
        </div>
        <div>
          <label className="label">Deadline</label>
          <input className="field" type="date" value={v.deadline} onChange={(e) => set('deadline', e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Colour</label>
        <div className="flex flex-wrap gap-2.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => set('color', c)}
              aria-label={`Colour ${c}`}
              className={`h-8 w-8 rounded-full transition ${v.color === c ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-ink' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button className="btn-primary" disabled={!valid || busy}>
          {submitLabel}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        {extra}
      </div>
    </form>
  )
}

export function ProjectsPanel() {
  const projects = useProjects()
  const totals = useProjectTotals()
  const create = useCreateProject()
  const update = useUpdateProject()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [alloc, setAlloc] = useState<string | null>(null)

  const all = (projects.data ?? []).filter((p) => !p.archived)
  const active = all.filter((p) => p.status === 'active')
  const done = all.filter((p) => p.status === 'done')

  const toForm = (p: Project): FormValue => ({
    name: p.name,
    goal: p.goal ?? '',
    target: p.target_amount ? String(p.target_amount) : '',
    deadline: p.deadline ?? '',
    color: p.color,
  })

  return (
    <div className="space-y-4">
      <ErrorNote error={projects.error} />

      {adding ? (
        <ProjectForm
          initial={{ name: '', goal: '', target: '', deadline: '', color: SWATCHES[8] }}
          submitLabel="Create project"
          busy={create.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={(v) => {
            create.mutate(
              { name: v.name, goal: v.goal, target_amount: Number(v.target) || 0, deadline: v.deadline, color: v.color },
              { onSuccess: () => setAdding(false) },
            )
          }}
        />
      ) : (
        <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
          <Plus size={18} strokeWidth={3} /> New project
        </button>
      )}

      {active.length === 0 && !adding && (
        <div className="card px-5 py-10 text-center text-sm text-mute">
          A project is money that goes toward something with a goal, such as school fees, a trip or a purchase. Tag
          payments to it from the Labels screen and watch the bar fill.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {active.map((p) =>
          editing === p.id ? (
            <ProjectForm
              key={p.id}
              initial={toForm(p)}
              submitLabel="Save"
              busy={update.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={(v) => {
                update.mutate(
                  {
                    id: p.id,
                    patch: {
                      name: v.name.trim(),
                      goal: v.goal.trim() || null,
                      target_amount: Number(v.target) || 0,
                      deadline: v.deadline || null,
                      color: v.color,
                    },
                  },
                  { onSuccess: () => setEditing(null) },
                )
              }}
              extra={
                <>
                  <button type="button" className="btn-ghost text-mint" onClick={() => setAlloc(p.id)}>
                    <Coins size={16} /> Saved / spent
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-inflow"
                    onClick={() => update.mutate({ id: p.id, patch: { status: 'done' } }, { onSuccess: () => setEditing(null) })}
                  >
                    <CheckCircle2 size={16} /> Mark done
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-mute"
                    onClick={() => update.mutate({ id: p.id, patch: { archived: true } }, { onSuccess: () => setEditing(null) })}
                  >
                    <Archive size={16} /> Archive
                  </button>
                </>
              }
            />
          ) : (
            <ProjectCard key={p.id} project={p} total={totals.data?.[p.id]} onClick={() => setEditing(p.id)} />
          ),
        )}
      </div>

      {done.length > 0 && (
        <div>
          <div className="label px-1">Finished</div>
          <div className="card divide-y divide-line overflow-hidden">
            {done.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Dot color={p.color} size={12} />
                <div className="min-w-0 flex-1 truncate font-bold">{p.name}</div>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-[12px] font-bold text-mint"
                  onClick={() => update.mutate({ id: p.id, patch: { status: 'active' } })}
                >
                  <RotateCcw size={13} /> Reopen
                </button>
                <button
                  type="button"
                  aria-label="Archive"
                  className="text-mute"
                  onClick={() => update.mutate({ id: p.id, patch: { archived: true } })}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {alloc && projects.data?.find((x) => x.id === alloc) && (
        <ProjectModal
          project={projects.data.find((x) => x.id === alloc)!}
          total={totals.data?.[alloc]}
          onClose={() => setAlloc(null)}
        />
      )}
    </div>
  )
}
