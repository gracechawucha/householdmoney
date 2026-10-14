import { useEffect, useState, type ReactNode } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { getAppKey, isConfigured, saveAppKey, supabase } from '../lib/supabase'

type State = 'checking' | 'ok' | 'noconfig' | 'needkey' | 'wrong'

/** Confirms Supabase is configured and the shared household key is accepted before showing the app. */
export function Gate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('checking')
  const [typed, setTyped] = useState('')
  const fromEnv = Boolean(import.meta.env.VITE_APP_KEY)

  useEffect(() => {
    if (!isConfigured) return setState('noconfig')
    if (!getAppKey()) return setState('needkey')
    supabase.rpc('app_key_ok').then(({ data, error }) => {
      // network trouble: let the app open (it shows its own load errors)
      if (error) return setState('ok')
      setState(data === true ? 'ok' : 'wrong')
    })
  }, [])

  if (state === 'ok') return <>{children}</>

  if (state === 'checking') {
    return (
      <div className="grid min-h-screen place-items-center text-mint">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (state === 'noconfig') {
    return (
      <Shell title="Almost there">
        <p className="text-sm text-white/70">
          Add <code className="text-mint">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-mint">VITE_SUPABASE_ANON_KEY</code> to a <code className="text-mint">.env</code> file
          (copy <code className="text-mint">.env.example</code>), then restart the app.
        </p>
      </Shell>
    )
  }

  return (
    <Shell title={state === 'wrong' ? 'That key was not accepted' : 'Household key'}>
      <p className="text-sm text-white/70">
        {state === 'wrong' && fromEnv
          ? 'VITE_APP_KEY does not match the key stored in Supabase. Run the insert from the README (private.app_config) with the same value.'
          : 'Enter the shared household key once. It stays on this phone.'}
      </p>
      {!(state === 'wrong' && fromEnv) && (
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!typed.trim()) return
            saveAppKey(typed.trim())
            window.location.reload()
          }}
        >
          <input
            className="field"
            type="password"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Household key"
          />
          <button className="btn-primary w-full" disabled={!typed.trim()}>
            Unlock
          </button>
        </form>
      )}
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="card w-full max-w-sm p-7">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-mint/10 text-mint">
          <KeyRound />
        </div>
        <h1 className="mb-2 text-xl font-extrabold">{title}</h1>
        {children}
      </div>
    </div>
  )
}
