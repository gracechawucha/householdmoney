import { useMemo, useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import { Modal } from './Modal'
import { Money } from './ui'
import { ksh, shortDateTime } from '../lib/format'
import { suggest, type SuggestGroup } from '../lib/suggest'
import { useBulkLabel, useCategories } from '../lib/queries'
import type { Tx } from '../lib/types'

export function quickSortCount(txs: Tx[], cats: { kind: string }[] | undefined): number {
  if (!cats) return 0
  return suggest(txs, cats as never).reduce((n, g) => n + g.items.length, 0)
}

export function QuickSort({ txs, onClose }: { txs: Tx[]; onClose: () => void }) {
  const cats = useCategories()
  const groups = useMemo(() => suggest(txs, cats.data ?? []), [txs, cats.data])

  return (
    <Modal title="Quick sort" subtitle="Review, untick what's wrong, label in one tap" onClose={onClose}>
      {groups.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-mute">Nothing left to suggest. Nice.</div>
      ) : (
        <div className="divide-y divide-line">
          {groups.map((g) => (
            <Group key={g.id} group={g} />
          ))}
        </div>
      )}
    </Modal>
  )
}

function Group({ group }: { group: SuggestGroup }) {
  const bulk = useBulkLabel()
  // ticks live in a set of un-ticked ids so new strong rows start ticked, weak ones not
  const [flipped, setFlipped] = useState<Set<string>>(new Set())
  const [remember, setRemember] = useState(false)

  const on = (id: string, strong: boolean) => (flipped.has(id) ? !strong : strong)
  const picked = group.items.filter((i) => on(i.tx.id, i.strong))
  const sum = picked.reduce((s, i) => s + i.tx.amount, 0)
  const flip = (id: string) =>
    setFlipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <section className="py-3">
      <div className="px-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-[16px] font-extrabold">{group.title}</h3>
          <span className="text-[12px] font-bold text-mute">{group.items.length} found</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-mute">{group.blurb}</p>
      </div>

      <ul className="mt-2 divide-y divide-line">
        {group.items.map(({ tx, why }) => {
          const checked = on(tx.id, group.items.find((i) => i.tx.id === tx.id)!.strong)
          return (
            <li key={tx.id}>
              <button type="button" onClick={() => flip(tx.id)} className="flex w-full min-w-0 items-center gap-3 px-4 py-2.5 text-left">
                <span className={checked ? 'text-mint' : 'text-mute'}>{checked ? <CheckSquare size={20} /> : <Square size={20} />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">{tx.counterparty ?? 'Unknown'}</span>
                  <span className="flex min-w-0 text-[11px] text-mute">
                    <span className="min-w-0 truncate">{why}</span>
                    <span className="shrink-0 whitespace-nowrap pl-1">· {shortDateTime(tx.occurred_at)}</span>
                  </span>
                </span>
                <Money value={-tx.amount} tone="out" size="sm" sign decimals={false} />
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-3 flex items-center justify-between gap-3 px-4">
        <button
          type="button"
          onClick={() => setRemember((r) => !r)}
          aria-pressed={remember}
          className={`rounded-full border px-3 py-2 text-[12px] font-bold ${remember ? 'border-mint/50 bg-mint/10 text-mint' : 'border-line text-mute'}`}
        >
          {remember ? 'Auto-label next time' : 'Just these'}
        </button>
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={picked.length === 0 || bulk.isPending}
          onClick={() =>
            bulk.mutate({
              txs: picked.map((i) => i.tx),
              particulars: group.title,
              category_id: group.category.id,
              project_id: null,
              remember,
            })
          }
        >
          Label {picked.length} · Ksh {ksh(sum, { decimals: false })}
        </button>
      </div>
    </section>
  )
}
