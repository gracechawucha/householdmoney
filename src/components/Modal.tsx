import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Bottom sheet on phones, centered dialog on desktop. */
export function Modal({
  title,
  subtitle,
  onClose,
  left,
  children,
  footer,
}: {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  /** top-left slot (the pen icon) */
  left?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  // the close handler changes every render; keep it in a ref so the scroll lock is set once and always released
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="pop-in relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-[#0a2218] shadow-2xl md:max-h-[80vh] md:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-line px-3 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center">{left}</div>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[15px] font-extrabold">{title}</div>
            {subtitle && <div className="truncate text-[11px] font-semibold text-mute">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mute transition hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && (
          <div className="border-t border-line px-4 py-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
