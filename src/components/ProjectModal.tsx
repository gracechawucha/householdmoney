import { useState } from 'react'
import { Check } from 'lucide-react'
import { Modal } from './Modal'
import { Money, Segmented } from './ui'
import { ksh, shortDateTime } from '../lib/format'
import { useProjectTxs, useSetPhase, useUpdateProject } from '../lib/queries'
import type { Project, ProjectPhase, ProjectTotal } from '../lib/types'

/** Edit a project's amount and decide, payment by payment, what was saved and what was spent. */
export function ProjectModal({ project, total, onClose }: { project: Project; total?: ProjectTotal; onClose: () => void }) {
  const txs = useProjectTxs(project.id)
  const setPhase = useSetPhase()
  const update = useUpdateProject()
  const [target, setTarget] = useState(project.target_amount ? String(project.target_amount) : '')

  const rows = txs.data ?? []
  const saved = total?.saved ?? 0
  const spent = total?.spent ?? 0
  const changed = Number(target || 0) !== project.target_amount

  return (
    <Modal title={project.name} subtitle={project.goal ?? 'Saved vs spent'} onClose={onClose}>
      <div className="border-b border-line px-4 py-3">
        <label className="label" htmlFor={`target-${project.id}`}>
          Amount needed (Ksh)
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`target-${project.id}`}
            className="field !py-2.5"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0"
          />
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-mint text-ink disabled:opacity-30"
            disabled={!changed || update.isPending}
            aria-label="Save amount"
            onClick={() => update.mutate({ id: project.id, patch: { target_amount: Number(target) || 0 } })}
          >
            <Check size={20} strokeWidth={3} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini label="Saved" value={saved} tone="net" />
          <Mini label="Spent" value={spent} tone="neutral" />
          <Mini label={saved - spent < 0 ? 'Beyond savings' : 'Savings left'} value={Math.abs(saved - spent)} tone={saved - spent < 0 ? 'out' : 'in'} />
        </div>
      </div>

      <div className="px-4 pb-1 pt-3 text-[11px] leading-snug text-mute">
        Pick what each payment really was. “Saved” is set aside (Savings). “Spent” is an expense and uses up the savings.
      </div>

      {txs.isLoading && <div className="px-4 py-8 text-center text-sm text-mute">Loading…</div>}
      {txs.isSuccess && rows.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-mute">No payments tagged to this project yet.</div>
      )}

      <ul className="divide-y divide-line">
        {rows.map((t) => {
          const phase: ProjectPhase = t.project_phase === 'spend' ? 'spend' : 'save'
          return (
            <li key={t.id} className="px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{t.particulars ?? t.counterparty ?? 'Unknown'}</span>
                  <span className="block whitespace-nowrap text-[11px] text-mute">{shortDateTime(t.occurred_at)}</span>
                </span>
                <Money value={t.direction === 'out' ? -t.amount : t.amount} tone={t.direction === 'out' ? 'out' : 'in'} size="sm" sign decimals={false} />
              </div>
              {t.direction === 'out' && (
                <div className="mt-2">
                  <Segmented
                    small
                    value={phase}
                    onChange={(v) => v !== phase && setPhase.mutate({ id: t.id, phase: v })}
                    options={[
                      { value: 'save', label: 'Saved' },
                      { value: 'spend', label: 'Spent' },
                    ]}
                  />
                  {t.fee > 0 && <span className="ml-3 text-[11px] font-bold text-fee">+{ksh(t.fee, { decimals: false })} fee</span>}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

function Mini({ label, value, tone }: { label: string; value: number; tone: 'net' | 'neutral' | 'out' | 'in' }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-mute">{label}</div>
      <Money value={value} tone={tone} size="md" decimals={false} />
    </div>
  )
}
