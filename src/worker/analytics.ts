// First-party analytics: approximate location from Cloudflare (never the IP itself),
// device from the User-Agent, a hashed per-browser id, and site settings.
import { DEFAULT_SITE_CONFIG, istDay, TrackSchema, type SiteConfig } from '../shared/admin'
import { sha256, type SessionUser } from './auth'
import { json } from './http'

export interface Geo {
  country: string | null
  region: string | null
  city: string | null
  device: 'mobile' | 'tablet' | 'desktop' | 'bot'
  os: string
  browser: string
}

const clip = (v: unknown, max = 80): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Where (roughly) and on what a request comes from. */
export function geoOf(request: Request): Geo {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {}
  const ua = request.headers.get('User-Agent') ?? ''
  const country = clip(cf.country, 2)
  return {
    // "T1" is Tor and "XX" unknown; neither is a place.
    country: country && country !== 'T1' && country !== 'XX' ? country.toUpperCase() : null,
    region: clip(cf.region),
    city: clip(cf.city),
    ...parseUserAgent(ua),
  }
}

export function parseUserAgent(ua: string): Pick<Geo, 'device' | 'os' | 'browser'> {
  const device: Geo['device'] = /bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)
    ? 'bot'
    : /iPad|Tablet|Nexus (7|9|10)|SM-T|Kindle|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))
      ? 'tablet'
      : /Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)
        ? 'mobile'
        : 'desktop'
  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/i.test(ua)
          ? 'macOS'
          : /CrOS/i.test(ua)
            ? 'ChromeOS'
            : /Linux/i.test(ua)
              ? 'Linux'
              : 'Other'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Instagram/.test(ua)
          ? 'Instagram in-app'
          : /FBAN|FBAV/.test(ua)
            ? 'Facebook in-app'
            : /Firefox\/|FxiOS/.test(ua)
              ? 'Firefox'
              : /Chrome\/|CriOS/.test(ua)
                ? 'Chrome'
                : /Safari\//.test(ua)
                  ? 'Safari'
                  : 'Other'
  return { device, os, browser }
}

/** People who asked browsers not to track them (Global Privacy Control / Do Not Track) are not counted. */
export function optedOut(request: Request): boolean {
  return request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1'
}

function referrerHost(raw: string | undefined, self: URL): string | null {
  if (!raw) return null
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '')
    return host && host !== self.hostname ? host.slice(0, 80) : null
  } catch {
    return null
  }
}

/** Collapse ids out of paths so pages group together (/r/ABCD → /r/:code). */
export function normalizePath(raw: string | undefined): string {
  const path = (raw ?? '/').split(/[?#]/)[0]!.slice(0, 120) || '/'
  return path
    .replace(/^\/r\/[A-Za-z]{4}$/, '/r/:code')
    .replace(/^\/groups\/[^/]+$/, '/groups/:id')
    .replace(/^\/g\/[^/]+$/, '/g/:code')
    .replace(/^\/admin\/.*$/, '/admin')
}

// ---------------------------------------------------------------------------
// Site settings, cached briefly per isolate

let configCache: { at: number; value: SiteConfig } | null = null
const CONFIG_TTL_MS = 20_000

export async function siteConfig(env: Env): Promise<SiteConfig> {
  if (configCache && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.value
  const value: SiteConfig = structuredClone(DEFAULT_SITE_CONFIG)
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config WHERE key IN ('banner', 'maintenance', 'features')").all<{ key: keyof SiteConfig; value: string }>()
    for (const row of results) {
      try {
        Object.assign(value[row.key], JSON.parse(row.value))
      } catch {
        // keep the default for a damaged value
      }
    }
  } catch (err) {
    console.error('reading site config failed (is migration 0005 applied?)', err)
  }
  configCache = { at: Date.now(), value }
  return value
}

export function clearConfigCache(): void {
  configCache = null
}

// ---------------------------------------------------------------------------
// Beacon: POST /api/track

export async function handleTrack(request: Request, env: Env, url: URL, user: SessionUser | null): Promise<Response> {
  if (optedOut(request)) return json({ ok: true, counted: false })
  const parsed = TrackSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Invalid body' }, 400)
  const geo = geoOf(request)
  if (geo.device === 'bot') return json({ ok: true, counted: false })
  const { vid, path, referrer, event } = parsed.data
  const now = Date.now()
  const day = istDay(now)
  const visitor = await sha256(`riffle-visitor:${vid}`)
  const ref = referrerHost(referrer, url)
  const statements: D1PreparedStatement[] = []

  if (event) {
    statements.push(
      env.DB.prepare('INSERT INTO feature_usage (day, name, country, count) VALUES (?, ?, ?, 1) ON CONFLICT (day, name, country) DO UPDATE SET count = count + 1').bind(
        day,
        event,
        geo.country ?? '',
      ),
    )
  } else {
    const page = normalizePath(path)
    statements.push(
      env.DB.prepare(
        `INSERT INTO visitors (id, first_day, last_day, days, user_id, country, region, city, device, os, browser, referrer, first_path)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           days = days + (CASE WHEN last_day < excluded.last_day THEN 1 ELSE 0 END),
           last_day = excluded.last_day,
           user_id = COALESCE(excluded.user_id, user_id),
           country = COALESCE(excluded.country, country), region = COALESCE(excluded.region, region), city = COALESCE(excluded.city, city),
           device = excluded.device, os = excluded.os, browser = excluded.browser`,
      ).bind(visitor, day, day, user?.id ?? null, geo.country, geo.region, geo.city, geo.device, geo.os, geo.browser, ref, page),
      env.DB.prepare(
        `INSERT INTO visits (day, visitor, user_id, country, region, city, device, os, browser, referrer, views, first_at, last_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (day, visitor) DO UPDATE SET views = views + 1, last_at = excluded.last_at, user_id = COALESCE(excluded.user_id, user_id),
           referrer = COALESCE(referrer, excluded.referrer)`,
      ).bind(day, visitor, user?.id ?? null, geo.country, geo.region, geo.city, geo.device, geo.os, geo.browser, ref, now, now),
      env.DB.prepare('INSERT INTO page_views (day, path, views) VALUES (?, ?, 1) ON CONFLICT (day, path) DO UPDATE SET views = views + 1').bind(day, page),
    )
    if (user) {
      statements.push(
        env.DB.prepare('UPDATE users SET last_seen = ?, country = COALESCE(?, country), region = COALESCE(?, region), city = COALESCE(?, city) WHERE id = ?').bind(
          now,
          geo.country,
          geo.region,
          geo.city,
          user.id,
        ),
      )
    }
  }
  try {
    await env.DB.batch(statements)
  } catch (err) {
    console.error('tracking failed (is migration 0005 applied?)', err)
  }
  return json({ ok: true, counted: true })
}

/** Note a new room (who made it, from where) so the admin console can find live rooms. */
export async function logRoom(env: Env, code: string, kind: string, request: Request, user: SessionUser | null): Promise<void> {
  try {
    await env.DB.prepare('INSERT OR IGNORE INTO rooms_log (code, created_at, kind, user_id, country) VALUES (?, ?, ?, ?, ?)')
      .bind(code, Date.now(), kind, user?.id ?? null, geoOf(request).country)
      .run()
  } catch (err) {
    console.error('logging room failed (is migration 0005 applied?)', err)
  }
}

/** Old analytics rows are deleted after about 13 months; expired sessions and Spotify links right away. */
export async function purgeOldData(env: Env): Promise<void> {
  const now = Date.now()
  const cutoffDay = istDay(now) - 400
  await env.DB.batch([
    env.DB.prepare('DELETE FROM visits WHERE day < ?').bind(cutoffDay),
    env.DB.prepare('DELETE FROM page_views WHERE day < ?').bind(cutoffDay),
    env.DB.prepare('DELETE FROM feature_usage WHERE day < ?').bind(cutoffDay),
    env.DB.prepare('DELETE FROM visitors WHERE last_day < ?').bind(cutoffDay),
    env.DB.prepare('DELETE FROM rooms_log WHERE created_at < ?').bind(now - 400 * 86400000),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM spotify_links WHERE expires_at < ?').bind(now),
  ])
}
