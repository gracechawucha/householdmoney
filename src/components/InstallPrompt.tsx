import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISS_KEY = 'hm-install-dismissed'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** Offers an "Install app" button (Android/desktop) or Add to Home Screen steps (iPhone) until installed. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [hidden, setHidden] = useState(() => isStandalone() || sessionStorage.getItem(DISMISS_KEY) === '1')

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || (!event && !isIOS)) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setHidden(true)
  }

  const install = async () => {
    if (!event) return
    await event.prompt()
    const { outcome } = await event.userChoice
    setEvent(null)
    if (outcome === 'accepted') setHidden(true)
  }

  return (
    <div
      className="pop-in fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
    >
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-mint/30 bg-[#0a2b21]/95 p-3 shadow-glow backdrop-blur">
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 text-[13px] leading-snug">
          <div className="font-extrabold">Install Household Money</div>
          {event ? (
            <div className="text-mute">Add it to your home screen for quick access.</div>
          ) : (
            <div className="text-mute">
              Tap <Share size={13} className="inline -mt-0.5 text-mint" /> Share, then <b className="text-white">Add to Home Screen</b>.
            </div>
          )}
        </div>
        {event && (
          <button
            onClick={install}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-mint px-3.5 py-2 text-[13px] font-extrabold text-ink"
          >
            <Download size={15} /> Install
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1 text-mute">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
