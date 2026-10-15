import { Dot } from './ui'
import { ksh } from '../lib/format'

export interface TipProps {
  active?: boolean
  payload?: { name?: string; value?: number; color?: string; fill?: string; stroke?: string }[]
  label?: string | number
  title?: (label: string | number) => string
}

export function Tip({ active, payload, label, title }: TipProps) {
  if (!active || !payload?.length) return null
  const heading = title && label != null ? title(label) : label
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a2b21]/95 px-3.5 py-2.5 text-[12px] shadow-xl backdrop-blur">
      {heading != null && heading !== '' && <div className="mb-1 font-bold text-mute">{heading}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-5 font-bold">
          <span className="flex items-center gap-1.5">
            <Dot color={p.color ?? p.stroke ?? p.fill ?? '#fff'} size={8} />
            {p.name}
          </span>
          <span>Ksh {ksh(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}
