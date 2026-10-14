import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const KEY_STORAGE = 'hm_app_key'

/** Shared household key: from .env, or (if not set there) typed once on the phone and kept locally. */
export function getAppKey(): string {
  const fromEnv = import.meta.env.VITE_APP_KEY
  if (fromEnv) return fromEnv
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

export function saveAppKey(key: string) {
  try {
    localStorage.setItem(KEY_STORAGE, key)
  } catch {
    /* private mode etc. */
  }
}

export const isConfigured = Boolean(url && anon)

export const supabase = createClient(url || 'http://localhost:54321', anon || 'missing', {
  global: { headers: { 'x-app-key': getAppKey() } },
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})
