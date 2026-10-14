import { CalendarClock } from 'lucide-react'
import { Money } from './ui'
import { ksh, pct } from '../lib/format'
import type { Project, ProjectTotal } from '../lib/types'

function daysLeft(deadline: string | null): string | null {
  if (!deadline) return null
  const ms = new Date(`${deadline}T23:59:59+03:00`).getTime() - Date.now()
  const d = Math.ceil(ms / 86_400_000)
  if (d < 0) return `${Math.abs(d)}d overdue`
  if (d === 0) return 'due today'
  return `${d}d left`
}

export function ProjectCard({
  project,
  total,
  onClick,
}: {
  project: Project
  total?: ProjectTotal
  onClick?: () => void
}) {
  const spent = total?.spent ?? 0
  const target = project.target_amount
  const ratio = target > 0 ? spent / target : 0
  const over = target > 0 && spent > target
  const left = daysLeft(project.deadline)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="card pop-in block w-full p-5 text-left transition enabled:active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[17px] font-extrabold">{project.name}</div>
          {project.goal && <div className="mt-0.5 line-clamp-2 text-[13px] text-mute">{project.goal}</div>}
        </div>
        {left && (
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold ${
              left.includes('overdue') ? 'text-warn' : 'text-white/70'
            }`}
          >
            <CalendarClock size={12} /> {left}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Spent so far</div>
          <Money value={spent} tone={over ? 'out' : 'neutral'} size="lg" decimals={false} prefix="Ksh" />
        </div>
        {target > 0 && (
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">Target</div>
            <div className="text-[15px] font-bold text-white/80">{ksh(target, { decimals: false })}</div>
          </div>
        )}
      </div>

      {target > 0 && (
        <>
          {/* filled part: yellow → lime like the reference; remainder is hatched */}
          <div
            className="mt-4 h-3.5 overflow-hidden rounded-full"
            style={{
              background:
                'repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 6px), rgba(255,255,255,0.05)',
            }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, ratio * 100)}%`,
                background: over
                  ? 'linear-gradient(90deg,#fb923c,#ff8a5b)'
                  : 'linear-gradient(90deg,#facc15,#a3e635)',
              }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[12px] font-semibold">
            <span className={over ? 'text-outflow' : 'text-inflow'}>{pct(ratio * 100)}</span>
            <span className="text-mute">
              {over
                ? `Over by Ksh ${ksh(spent - target, { decimals: false })}`
                : `Ksh ${ksh(target - spent, { decimals: false })} to go`}
              {total ? ` · ${total.tx_count} payment${total.tx_count === 1 ? '' : 's'}` : ''}
            </span>
          </div>
        </>
      )}
    </button>
  )
}
