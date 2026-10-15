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
  const saved = total?.saved ?? 0
  const target = project.target_amount
  const savedRatio = target > 0 ? saved / target : 0
  const spentRatio = target > 0 ? spent / target : 0
  const over = target > 0 && spent > target
  const available = saved - spent // savings not yet used
  const left = daysLeft(project.deadline)

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="card pop-in block w-full min-w-0 p-4 text-left md:p-5 transition enabled:active:scale-[0.99]"
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

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-mute">Saved</div>
          <Money value={saved} tone="net" size="md" decimals={false} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-mute">Spent</div>
          <Money value={spent} tone={over ? 'out' : 'neutral'} size="md" decimals={false} />
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-mute">
            {available < 0 ? 'Beyond savings' : 'Savings left'}
          </div>
          <Money value={Math.abs(available)} tone={available < 0 ? 'out' : 'in'} size="md" decimals={false} />
        </div>
      </div>

      {target > 0 && (
        <div className="mt-4 space-y-3">
          <Bar label="Saved" ratio={savedRatio} color="linear-gradient(90deg,#2de2c0,#a3e635)" />
          <Bar
            label="Spent"
            ratio={spentRatio}
            color={over ? 'linear-gradient(90deg,#fb923c,#ff8a5b)' : 'linear-gradient(90deg,#facc15,#fb923c)'}
          />
          <div className="flex justify-between gap-3 text-[12px] font-semibold text-mute">
            <span>Goal Ksh {ksh(target, { decimals: false })}</span>
            <span className="text-right">
              {saved >= target
                ? 'Fully saved'
                : `Ksh ${ksh(target - saved, { decimals: false })} still to save`}
              {total ? ` · ${total.save_count} saved · ${total.tx_count} spent` : ''}
            </span>
          </div>
        </div>
      )}
    </button>
  )
}

function Bar({ label, ratio, color }: { label: string; ratio: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-bold">
        <span className="text-mute">{label}</span>
        <span className="text-white/80">{pct(ratio * 100)}</span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full"
        style={{
          background:
            'repeating-linear-gradient(135deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 6px), rgba(255,255,255,0.05)',
        }}
      >
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
      </div>
    </div>
  )
}
