import { useState } from 'react'
import { Archive, ArchiveRestore, Plus } from 'lucide-react'
import { ErrorNote } from '../components/ui'
import { SWATCHES, nextSwatch } from '../lib/format'
import { useCategories, useCreateCategory, useUpdateCategory } from '../lib/queries'
import type { Category } from '../lib/types'

export function CategoriesPanel() {
  const cats = useCategories()
  const list = cats.data ?? []
  return (
    <div className="space-y-5">
      <ErrorNote error={cats.error} />
      <p className="px-1 text-[13px] text-mute">
        There is deliberately no “Other”. If something doesn't fit, make the category it deserves.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Group title="Expense categories" kind="expense" cats={list.filter((c) => c.kind === 'expense')} all={list} />
        <Group title="Income categories" kind="income" cats={list.filter((c) => c.kind === 'income')} all={list} />
      </div>
    </div>
  )
}

function Group({
  title,
  kind,
  cats,
  all,
}: {
  title: string
  kind: 'income' | 'expense'
  cats: Category[]
  all: Category[]
}) {
  const create = useCreateCategory()
  const [name, setName] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const active = cats.filter((c) => !c.archived)
  const archived = cats.filter((c) => c.archived)

  const add = () => {
    const n = name.trim()
    if (!n) return
    create.mutate(
      { name: n, kind, color: nextSwatch(all.map((c) => c.color)) },
      { onSuccess: () => setName('') },
    )
  }

  return (
    <section className="card p-5">
      <div className="mb-3 text-[17px] font-extrabold">{title}</div>
      <div className="divide-y divide-line">
        {active.map((c) => (
          <Row key={c.id} cat={c} />
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a category"
        />
        <button type="button" className="btn-primary !px-4" onClick={add} disabled={!name.trim() || create.isPending} aria-label="Add">
          <Plus size={18} strokeWidth={3} />
        </button>
      </div>

      {archived.length > 0 && (
        <div className="mt-4">
          <button type="button" className="text-[12px] font-bold text-mute" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-2 divide-y divide-line opacity-70">
              {archived.map((c) => (
                <Row key={c.id} cat={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function Row({ cat }: { cat: Category }) {
  const update = useUpdateCategory()
  const [name, setName] = useState(cat.name)

  const cycleColor = () => {
    const i = SWATCHES.indexOf(cat.color)
    update.mutate({ id: cat.id, patch: { color: SWATCHES[(i + 1) % SWATCHES.length] } })
  }

  return (
    <div className="flex items-center gap-3 py-2.5">
      <button
        type="button"
        onClick={cycleColor}
        aria-label="Change colour"
        title="Tap to change colour"
        className="h-6 w-6 shrink-0 rounded-full ring-2 ring-white/10 transition active:scale-90"
        style={{ background: cat.color }}
      />
      <input
        className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none focus:text-mint"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const n = name.trim()
          if (n && n !== cat.name) update.mutate({ id: cat.id, patch: { name: n } })
          else setName(cat.name)
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button
        type="button"
        aria-label={cat.archived ? 'Restore' : 'Archive'}
        title={cat.archived ? 'Restore' : 'Archive (keeps history)'}
        className="text-mute transition hover:text-white"
        onClick={() => update.mutate({ id: cat.id, patch: { archived: !cat.archived } })}
      >
        {cat.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
      </button>
    </div>
  )
}
