import { useEffect, useState } from 'react'
import { BottomNav, TopTabs, type Tab } from './components/Nav'
import { Labels } from './pages/Labels'
import { Snapshot } from './pages/Snapshot'
import { Setup } from './pages/Setup'
import { useUnlabeled } from './lib/queries'
import { onToast } from './lib/toast'

const TABS: Tab[] = ['labels', 'snapshot', 'projects']

function initialTab(): Tab {
  const h = window.location.hash.replace('#', '') as Tab
  return TABS.includes(h) ? h : 'snapshot'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [message, setMessage] = useState<string | null>(null)
  const unlabeled = useUnlabeled()
  const badge = unlabeled.data?.length ?? 0

  const go = (t: Tab) => {
    setTab(t)
    window.location.hash = t
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const off = onToast((m) => {
      setMessage(m)
      clearTimeout(timer)
      timer = setTimeout(() => setMessage(null), 3200)
    })
    return () => {
      off()
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-20 border-b border-line bg-ink/70 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl" />
            <div className="leading-tight">
              <div className="text-[16px] font-extrabold tracking-tight">Household Money</div>
              <div className="hidden text-[11px] font-semibold text-mute sm:block">Every shilling, accounted for</div>
            </div>
          </div>
          <TopTabs tab={tab} onChange={go} badge={badge} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-5 md:px-8 md:pb-16 md:pt-8">
        {tab === 'labels' && <Labels />}
        {tab === 'snapshot' && <Snapshot goto={go} />}
        {tab === 'projects' && <Setup />}
      </main>

      <BottomNav tab={tab} onChange={go} badge={badge} />

      {message && (
        <div
          className="pop-in fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
        >
          <div className="max-w-sm rounded-full border border-mint/30 bg-[#0a2b21]/95 px-5 py-3 text-[13px] font-bold shadow-glow backdrop-blur">
            {message}
          </div>
        </div>
      )}
    </div>
  )
}
