import { useEffect, useState } from 'react'

/** Re-renders every `intervalMs` and returns `clock()` (e.g. the server-synced time). */
export function useNow(clock: () => number, intervalMs = 100, active = true): number {
  const [now, setNow] = useState(clock)
  useEffect(() => {
    if (!active) return
    setNow(clock())
    const id = window.setInterval(() => setNow(clock()), intervalMs)
    return () => clearInterval(id)
  }, [clock, intervalMs, active])
  return now
}
