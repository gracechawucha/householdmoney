import { useState, type ReactNode } from 'react'
import { Plus, Check, ArrowLeftRight } from 'lucide-react'
import { ksh, nextSwatch } from '../lib/format'
import { useCategories, useCreateCategory } from '../lib/queries'

export type Tone = 'in' | 'out' | 'fee' | 'neutral' | 'net'

const TONE: Record<Tone, string> = {
  in: 'text-inflow',
  out: 'text-outflow',
  fee: 'text-fee',
  neutral: 'text-white',
  net: 'text-mint',
}

const SIZE: Record<string, string> = {
  hero: 'text-[44px] md:text-[56px] leading-none font-extrabold tracking-tight',
  xl: 'text-3xl font-extrabold tracking-tight',
  lg: 'text-2xl font-bold tracking-tight',
  md: 'text-[17px] font-bold',
  sm: 'text-sm font-semibold',
}

/** Big number with dimmed decimals, like the reference "$32,680.20" */
export function Money({
  value,
  tone = 'neutral',
  size = 'md',
  sign = false,
  decimals = true,
  prefix,
}: {
  value: number
  tone?: Tone
  size?: keyof typeof SIZE
  sign?: boolean
  decimals?: boolean
  prefix?: string
}) {
  const toneClass = tone === 'net' && value < 0 ? 'text-warn' : TONE[tone]
  const full = ksh(value, { decimals, sign })
  const dot = full.lastIndexOf('.')
  const whole = decimals && dot >= 0 ? full.slice(0, dot) : full
  const dec = decimals && dot >= 0 ? full.slice(dot) : ''
  return (
    <span className={`${SIZE[size]} ${toneClass} whitespace-nowrap`}>
      {prefix && <span className="mr-1.5 text-[0.4em] font-semibold tracking-wider text-white/45">{prefix}</span>}
      {whole}
      {dec && <span className="opacity-50">{dec}</span>}
    </span>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  small?: boolean
}) {
  return (
    <div className="inline-flex rounded-2xl border border-line bg-black/25 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-xl font-bold transition ${small ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2 text-[13px]'} ${
            value === o.value ? 'bg-mint text-ink shadow-glow' : 'text-white/65 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <h2 className="text-[17px] font-extrabold tracking-tight">{children}</h2>
      {aside}
    </div>
  )
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ background: color, width: size, height: size }} />
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-mint/10 text-mint">{icon}</div>
      <div className="text-lg font-extrabold">{title}</div>
      {hint && <div className="max-w-xs text-sm text-mute">{hint}</div>}
    </div>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="card border-warn/40 p-4 text-sm text-warn">
      Couldn't load data: {msg}
      <div className="mt-1 text-xs text-warn/70">Check your .env keys and that the migration has been run.</div>
    </div>
  )
}

/** Category chips filtered to a kind, with an inline "+ New" that creates and selects. */
export function CategoryPicker({
  kind,
  value,
  onChange,
}: {
  kind: 'income' | 'expense'
  value: string | null
  onChange: (id: string) => void
}) {
  const cats = useCategories()
  const create = useCreateCategory()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')

  // transfer categories (M-Shwari, own accounts) apply to money in and money out
  const list = (cats.data ?? []).filter((c) => (c.kind === kind || c.kind === 'transfer') && !c.archived)

  const submit = async () => {
    const n = name.trim()
    if (!n || create.isPending) return
    const existing = list.find((c) => c.name.toLowerCase() === n.toLowerCase())
    if (existing) {
      onChange(existing.id)
    } else {
      const used = (cats.data ?? []).map((c) => c.color)
      const made = await create.mutateAsync({ name: n, kind, color: nextSwatch(used) })
      onChange(made.id)
    }
    setName('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          className="chip"
          data-on={value === c.id}
          style={value === c.id ? { background: c.color } : undefined}
          onClick={() => onChange(c.id)}
        >
          {c.kind === 'transfer' ? <ArrowLeftRight size={13} /> : value !== c.id && <Dot color={c.color} size={8} />}
          {c.name}
        </button>
      ))}
      {adding ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="New category"
            className="field !w-40 !rounded-full !py-2 !text-[13px]"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!name.trim()}
            className="grid h-9 w-9 place-items-center rounded-full bg-mint text-ink disabled:opacity-40"
            aria-label="Add category"
          >
            <Check size={16} strokeWidth={3} />
          </button>
        </div>
      ) : (
        <button type="button" className="chip border-dashed text-mint" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={3} /> New
        </button>
      )}
    </div>
  )
}
