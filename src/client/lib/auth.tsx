import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AuthConfig, Me } from '../../shared/account'
import { api } from './api'

interface AuthValue {
  me: Me | null
  config: AuthConfig
  loading: boolean
  refresh: () => Promise<void>
  /** Full-page redirect to Google; comes back to `returnTo`. */
  signIn: (returnTo?: string) => void
  devSignIn: (name: string, email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [config, setConfig] = useState<AuthConfig>({ google: false, dev: false })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [{ user }, cfg] = await Promise.all([api<{ user: Me | null }>('/api/me'), api<AuthConfig>('/api/auth/config')])
      setMe(user)
      setConfig(cfg)
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthValue>(
    () => ({
      me,
      config,
      loading,
      refresh,
      signIn: (returnTo) => {
        const target = returnTo ?? location.pathname + location.search
        location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(target)}`
      },
      devSignIn: async (name, email) => {
        await api('/api/auth/dev-login', { body: { name, email } })
        await refresh()
      },
      signOut: async () => {
        await api('/api/auth/logout', { method: 'POST', body: {} })
        setMe(null)
      },
    }),
    [me, config, loading, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
