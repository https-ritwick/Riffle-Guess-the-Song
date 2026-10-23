// First-party, cookie-free analytics. A random id in local storage tells visits
// apart; the server only keeps its hash. Browsers sending Global Privacy Control
// or Do Not Track are never counted, and anyone can opt out on the Privacy page.
import type { FeatureEvent } from '../../shared/admin'
import { load, remove, save } from './storage'

const OPT_OUT_KEY = 'analytics-off'
const ID_KEY = 'vid'

function browserOptedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1'
}

export function analyticsEnabled(): boolean {
  return load(OPT_OUT_KEY) !== '1' && !browserOptedOut()
}

/** True when the browser itself asks not to be tracked (the opt-out switch can't turn it back on). */
export function browserBlocksAnalytics(): boolean {
  return browserOptedOut()
}

export function setAnalyticsEnabled(on: boolean): void {
  if (on) {
    remove(OPT_OUT_KEY)
  } else {
    save(OPT_OUT_KEY, '1')
    remove(ID_KEY)
  }
}

function visitorId(): string {
  let id = load(ID_KEY)
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    id = crypto.randomUUID().replace(/-/g, '')
    save(ID_KEY, id)
  }
  return id
}

function send(body: Record<string, unknown>): void {
  if (!analyticsEnabled()) return
  try {
    const payload = JSON.stringify({ vid: visitorId(), ...body })
    void fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true, credentials: 'same-origin' }).catch(() => {})
  } catch {
    // analytics must never break the app
  }
}

let lastPath: string | null = null
let firstView = true

export function trackPage(path: string): void {
  if (path === lastPath) return
  lastPath = path
  // Only the first page of a visit carries where people came from.
  send({ path, ...(firstView && document.referrer ? { referrer: document.referrer.slice(0, 500) } : {}) })
  firstView = false
}

export function trackEvent(event: FeatureEvent): void {
  send({ event })
}
