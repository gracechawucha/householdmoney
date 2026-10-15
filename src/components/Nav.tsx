import { LayoutDashboard, ListChecks, FolderKanban, Target } from 'lucide-react'

export type Tab = 'labels' | 'snapshot' | 'projects' | 'goals'

const TABS: { id: Tab; label: string; Icon: typeof ListChecks }[] = [
  { id: 'labels', label: 'Labels', Icon: ListChecks },
  { id: 'snapshot', label: 'Snapshot', Icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', Icon: FolderKanban },
  { id: 'goals', label: 'Goals', Icon: Target },
]

/** Mobile: floating pill of buttons fixed at the bottom */
export function BottomNav({ tab, onChange, badge }: { tab: Tab; onChange: (t: Tab) => void; badge: number }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 md:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
    >
      <div className="flex w-full max-w-sm items-center justify-between rounded-full border border-white/10 bg-[#0a2b21]/90 p-1.5 shadow-[0_10px_40px_-8px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        {TABS.map(({ id, label, Icon }) => {
          const on = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-label={label}
              aria-current={on ? 'page' : undefined}
              className={`relative flex flex-1 items-center justify-center rounded-full py-3 text-[12px] font-extrabold transition-all ${
                on ? 'bg-mint text-ink shadow-glow' : 'text-white/60'
              }`}
            >
              <span className="relative">
                <Icon size={20} strokeWidth={on ? 2.6 : 2} />
                {id === 'labels' && badge > 0 && (
                  <span
                    className={`absolute -right-2.5 -top-2 grid min-w-[17px] place-items-center rounded-full px-1 text-[10px] font-extrabold leading-[17px] ${
                      on ? 'bg-ink text-mint' : 'bg-outflow text-ink'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/** Desktop: tabs in the header */
export function TopTabs({ tab, onChange, badge }: { tab: Tab; onChange: (t: Tab) => void; badge: number }) {
  return (
    <div className="hidden items-center gap-1 rounded-full border border-line bg-black/25 p-1 md:flex">
      {TABS.map(({ id, label, Icon }) => {
        const on = tab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-bold transition ${
              on ? 'bg-mint text-ink shadow-glow' : 'text-white/65 hover:text-white'
            }`}
          >
            <Icon size={17} strokeWidth={on ? 2.6 : 2} />
            {label}
            {id === 'labels' && badge > 0 && (
              <span
                className={`rounded-full px-1.5 text-[11px] font-extrabold leading-5 ${
                  on ? 'bg-ink text-mint' : 'bg-outflow text-ink'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
