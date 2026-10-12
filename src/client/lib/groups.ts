import { useCallback, useEffect, useRef, useState } from 'react'
import type { GroupDetail, GroupSummary, PendingInvite } from '../../shared/account'
import { api } from './api'

/** Fetch a resource and keep it fresh while the tab is visible (live "game started" badges). */
function usePolling<T>(load: (signal: AbortSignal) => Promise<T>, intervalMs: number, enabled: boolean) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enabled)
  const loadRef = useRef(load)
  loadRef.current = load

  const reload = useCallback(async () => {
    const ctrl = new AbortController()
    try {
      setData(await loadRef.current(ctrl.signal))
      setError(null)
    } catch (err) {
      if (!(err instanceof DOMException)) setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void reload()
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload()
    }, intervalMs)
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, intervalMs, reload])

  return { data, error, loading, reload }
}

export function useMyGroups(enabled: boolean) {
  return usePolling((signal) => api<{ groups: GroupSummary[]; invites: PendingInvite[] }>('/api/groups', { signal }), 8000, enabled)
}

export function useGroup(id: string, enabled: boolean) {
  return usePolling((signal) => api<GroupDetail>(`/api/groups/${id}`, { signal }), 5000, enabled)
}
