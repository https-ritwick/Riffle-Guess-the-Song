import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { DEFAULT_SITE_CONFIG, type SiteConfig } from '../../shared/admin'
import { api } from './api'
import { load, save } from './storage'
import { trackPage } from './track'

function cached(): SiteConfig {
  try {
    const c = JSON.parse(load('site-config') ?? 'null') as Partial<SiteConfig> | null
    if (c?.banner && c.maintenance && c.features) return { ...DEFAULT_SITE_CONFIG, ...c, features: { ...DEFAULT_SITE_CONFIG.features, ...c.features } }
  } catch {
    // fall through
  }
  return DEFAULT_SITE_CONFIG
}

const SiteContext = createContext<SiteConfig>(DEFAULT_SITE_CONFIG)

/** Site-wide settings from the admin console (banner, maintenance, feature switches), plus page-view tracking. */
export function SiteProvider({ children }: { children: ReactNode }) {
  // Last known settings first, so a changed banner doesn't flash the default one.
  const [config, setConfig] = useState<SiteConfig>(cached)
  const { pathname } = useLocation()

  useEffect(() => {
    let alive = true
    api<SiteConfig>('/api/config')
      .then((c) => {
        save('site-config', JSON.stringify(c))
        if (alive) setConfig(c)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    trackPage(pathname)
  }, [pathname])

  return <SiteContext.Provider value={config}>{children}</SiteContext.Provider>
}

export function useSite(): SiteConfig {
  return useContext(SiteContext)
}
