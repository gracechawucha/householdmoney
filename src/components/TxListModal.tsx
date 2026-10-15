import { useMemo, useState } from 'react'
import { Check, Pencil, PencilOff } from 'lucide-react'
import { Modal } from './Modal'
import { LabelForm } from './LabelForm'
import { Dot, Money } from './ui'
import { ksh, shortDateTime } from '../lib/format'
import { useLabel, useUpdateCategory, useUpdateProject } from '../lib/queries'
import type { Category, Project, Tx } from '../lib/types'

export interface Rename {
  kind: 'category' | 'project'
  id: string
  name: string
}

/**
 * Details behind any number on the Snapshot: particulars, amounts, dates.
 * The pen (top-left) switches on editing: relabel any row, rename the category.
 */
export function TxListModal({
  title,
  subtitle,
  note,
  txs,
  catById,
  projById,
  rename,
  startEditing,
  openId,
  ascending,
  onClose,
}: {
  title: string
  subtitle?: string
  /** a line of explanation under the header (e.g. what a balance gap means) */
  note?: string
  txs: Tx[]
  catById: Map<string, Category>
  projById: Map<string, Project>
  rename?: Rename | null
  startEditing?: boolean
  openId?: string | null
  ascending?: boolean
  onClose: () => void
}) {
  const [editing, setEditing] = useState(!!startEditing)
  const [open, setOpen] = useState<string | null>(openId ?? null)
  const [name, setName] = useState(rename?.name ?? '')
  const label = useLabel()
  const updCat = useUpdateCategory()
  const updProj = useUpdateProject()

  const rows = useMemo(
    () => [...txs].sort((a, b) => (ascending ? 1 : -1) * a.occurred_at.localeCompare(b.occurred_at)),
    [txs, ascending],
  )
  const totIn = rows.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
  const totOut = rows.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0)

  const saveName = () => {
    const n = name.trim()
    if (!rename || !n || n === rename.name) return
    if (rename.kind === 'category') updCat.mutate({ id: rename.id, patch: { name: n } })
    else updProj.mutate({ id: rename.id, patch: { name: n } })
  }

  return (
    <Modal
      title={rename && editing ? 'Editing' : title}
      subtitle={subtitle}
      onClose={onClose}
      left={
        <button
          type="button"
          onClick={() => {
            setEditing((e) => !e)
            setOpen(null)
          }}
          aria-label={editing ? 'Stop editing' : 'Edit labels'}
          aria-pressed={editing}
          className={`grid h-9 w-9 place-items-center rounded-full transition ${
            editing ? 'bg-mint text-ink' : 'text-mint hover:bg-white/5'
          }`}
        >
          {editing ? <PencilOff size={16} /> : <Pencil size={16} />}
        </button>
      }
    >
      {note && <div className="border-b border-line bg-warn/10 px-4 py-2.5 text-[12px] leading-snug text-warn">{note}</div>}

      {editing && rename && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <input
            className="field !py-2 !text-[16px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            aria-label="Rename"
          />
          <button
            type="button"
            onClick={saveName}
            disabled={!name.trim() || name.trim() === rename.name}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint text-ink disabled:opacity-30"
            aria-label="Save name"
          >
            <Check size={18} strokeWidth={3} />
          </button>
        </div>
      )}

      {rows.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-[12px] font-bold text-mute">
          <span>{rows.length} transactions</span>
          {totIn > 0 && <span className="text-inflow">In {ksh(totIn, { decimals: false })}</span>}
          {totOut > 0 && <span className="text-outflow">Out {ksh(totOut, { decimals: false })}</span>}
        </div>
      )}

      {rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-mute">Nothing here.</div>}

      <ul className="divide-y divide-line">
        {rows.map((t) => {
          const c = t.category_id ? catById.get(t.category_id) : undefined
          const p = t.project_id ? projById.get(t.project_id) : undefined
          const color = p?.color ?? c?.color ?? '#5f8576'
          const isOpen = editing && open === t.id
          return (
            <li key={t.id} className={isOpen ? 'bg-white/[0.03]' : ''}>
              <button
                type="button"
                disabled={!editing}
                onClick={() => setOpen(isOpen ? null : t.id)}
                className="flex w-full min-w-0 items-center gap-2.5 px-4 py-2.5 text-left enabled:active:bg-white/5"
              >
                <Dot color={color} size={9} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{t.particulars ?? t.counterparty ?? 'Unknown'}</span>
                  {/* the date is fixed and always visible; only the label text gives way */}
                  <span className="flex min-w-0 items-center text-[11px] text-mute">
                    <span className="min-w-0 truncate">
                      {t.status === 'unlabeled' ? (
                        <span className="font-bold text-fee">Unlabeled</span>
                      ) : p ? (
                        `${p.name}${t.project_phase === 'save' ? ' · saving' : ''}`
                      ) : (
                        c?.name
                      )}
                      {t.counterparty && t.particulars && t.counterparty !== t.particulars ? ` · ${t.counterparty}` : ''}
                    </span>
                    <span className="shrink-0 whitespace-nowrap pl-1">· {shortDateTime(t.occurred_at)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Money value={t.direction === 'out' ? -t.amount : t.amount} tone={t.direction === 'out' ? 'out' : 'in'} size="sm" sign />
                  {t.fee > 0 && <span className="block text-[10px] font-bold text-fee">+{ksh(t.fee)} fee</span>}
                </span>
                {editing && <Pencil size={13} className="shrink-0 text-mute" />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4">
                  <LabelForm
                    uid={`m-${t.id}`}
                    direction={t.direction}
                    initial={{
                      what: t.particulars ?? '',
                      category_id: t.category_id,
                      project_id: t.project_id,
                      project_phase: t.project_phase,
                    }}
                    defaultRemember={false}
                    submitText="Save label"
                    busy={label.isPending}
                    compact
                    onSubmit={(v) => label.mutate({ tx: t, ...v }, { onSuccess: () => setOpen(null) })}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
