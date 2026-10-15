// "Connect Spotify" for Blend games.
//
// The listener signs in with Spotify (authorization code + PKCE). On the callback we
// read their profile and top tracks once, store that list in D1 under a random cookie
// token (only its hash is stored), and throw the Spotify tokens away: nothing can
// read their account later. Reconnecting refreshes the list.
//
// The Web API no longer returns preview clips, so previews come from each track's
// public embed page, the same source the playlist reader uses.
import { ARTWORK_URL_RE, PREVIEW_URL_RE } from '../shared/protocol'
import { PREVIEW_BATCH, SPOTIFY_TRACK_ID_RE, type SpotifyConfig, type SpotifyMe, type SpotifyTopTrack } from '../shared/spotify'
import { cookie, randomToken, readCookie, redirect, safeReturnTo, sha256 } from './auth'
import { json, SECURITY_HEADERS } from './http'

const LINK_COOKIE = 'encore_spotify'
const OAUTH_COOKIE = 'encore_spotify_oauth'
const LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000
const AUTHORIZE = 'https://accounts.spotify.com/authorize'
const TOKEN = 'https://accounts.spotify.com/api/token'
const API = 'https://api.spotify.com/v1'
const SCOPES = 'user-top-read user-library-read'
/** Songs saved per Spotify connection (the Blend picks from these). */
const MAX_SAVED_TRACKS = 300
const EMBED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
}

function configured(env: Env): boolean {
  return !!(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET)
}

interface ApiTrack {
  id?: string
  name?: string
  artists?: { name?: string }[]
  album?: { name?: string; images?: { url?: string; width?: number }[]; release_date?: string }
}

function toTrack(t: ApiTrack | undefined): SpotifyTopTrack | null {
  if (!t?.id || !SPOTIFY_TRACK_ID_RE.test(t.id) || !t.name) return null
  const artist = (t.artists ?? []).map((a) => a.name).filter(Boolean).join(', ')
  if (!artist) return null
  // Images are sorted largest first; ~300px is plenty for tiles.
  const images = (t.album?.images ?? []).filter((i) => i.url && ARTWORK_URL_RE.test(i.url))
  const art = images.find((i) => (i.width ?? 0) <= 320)?.url ?? images[0]?.url ?? ''
  const year = Number(t.album?.release_date?.slice(0, 4))
  return {
    id: t.id,
    title: t.name.slice(0, 200),
    artist: artist.slice(0, 300),
    album: (t.album?.name ?? '').slice(0, 200),
    artwork: art,
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
  }
}

class SpotifyApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
  ) {
    super(`Spotify API ${path} returned ${status}`)
  }
}

async function apiGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new SpotifyApiError(path, res.status)
  return res.json() as Promise<T>
}

/**
 * A big slice of the listener's taste for Blend games: top tracks over the last
 * month, six months and all time, topped up with their liked songs.
 */
async function readListening(accessToken: string): Promise<SpotifyTopTrack[]> {
  const seen = new Set<string>()
  const out: SpotifyTopTrack[] = []
  const add = (items: (ApiTrack | undefined)[]) => {
    for (const item of items) {
      const t = toTrack(item)
      if (t && !seen.has(t.id)) {
        seen.add(t.id)
        out.push(t)
      }
    }
  }
  // The first list must work (it tells us whether we have access at all); the rest are best effort.
  const top = await apiGet<{ items?: ApiTrack[] }>('/me/top/tracks?limit=50&time_range=medium_term', accessToken)
  add(top.items ?? [])
  const more = await Promise.all(
    [
      '/me/top/tracks?limit=50&offset=49&time_range=medium_term',
      '/me/top/tracks?limit=50&time_range=short_term',
      '/me/top/tracks?limit=50&time_range=long_term',
      '/me/top/tracks?limit=50&offset=49&time_range=long_term',
    ].map((path) => apiGet<{ items?: ApiTrack[] }>(path, accessToken).catch(() => ({ items: [] as ApiTrack[] }))),
  )
  for (const list of more) add(list.items ?? [])
  for (const offset of [0, 50, 100]) {
    if (out.length >= MAX_SAVED_TRACKS) break
    const liked = await apiGet<{ items?: { track?: ApiTrack }[] }>(`/me/tracks?limit=50&offset=${offset}`, accessToken).catch(() => ({ items: [] }))
    if (!liked.items?.length) break
    add(liked.items.map((i) => i.track))
  }
  return out.slice(0, MAX_SAVED_TRACKS)
}

async function linkFor(request: Request, env: Env): Promise<{ hash: string; row: { name: string; image: string | null; tracks_json: string; created_at: number } } | null> {
  const token = readCookie(request, LINK_COOKIE)
  if (!token || token.length > 100) return null
  const hash = await sha256(token)
  const row = await env.DB.prepare('SELECT name, image, tracks_json, created_at FROM spotify_links WHERE token_hash = ? AND expires_at > ?')
    .bind(hash, Date.now())
    .first<{ name: string; image: string | null; tracks_json: string; created_at: number }>()
  return row ? { hash, row } : null
}

/** Pull the 30-second preview URL out of a track's public embed page. */
async function embedPreview(id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${id}`, { headers: EMBED_HEADERS, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const html = await res.text()
    const url = html.match(/"audioPreview":\{"url":"([^"]+)"/)?.[1]
    return url && PREVIEW_URL_RE.test(url) ? url : null
  } catch {
    return null
  }
}

function withParam(path: string, key: string, value: string): string {
  const u = new URL(path, 'https://x.invalid')
  u.searchParams.set(key, value)
  return u.pathname + u.search
}

// ---------------------------------------------------------------------------
// Routes: /api/spotify/*

export async function handleSpotify(request: Request, env: Env, url: URL, clientKey: string): Promise<Response | null> {
  const path = url.pathname
  if (!path.startsWith('/api/spotify/')) return null

  if (path === '/api/spotify/config' && request.method === 'GET') {
    return json({ enabled: configured(env) } satisfies SpotifyConfig)
  }

  if (path === '/api/spotify/start' && request.method === 'GET') {
    if (!configured(env)) return json({ error: 'Spotify is not set up on this server yet.' }, 503)
    const state = randomToken(16)
    const verifier = randomToken(48)
    const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
    const params = new URLSearchParams({
      client_id: env.SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: `${url.origin}/api/spotify/callback`,
      scope: SCOPES,
      state,
      code_challenge_method: 'S256',
      code_challenge: await sha256(verifier),
    })
    return redirect(`${AUTHORIZE}?${params}`, [cookie(OAUTH_COOKIE, `${state}|${verifier}|${returnTo}`, url, 600)])
  }

  if (path === '/api/spotify/callback' && request.method === 'GET') {
    const saved = readCookie(request, OAUTH_COOKIE)?.split('|')
    const back = safeReturnTo(saved?.[2] ?? '/')
    const fail = (reason: string) => redirect(withParam(back, 'spotify_error', reason), [cookie(OAUTH_COOKIE, '', url, 0)])
    if (!configured(env)) return fail('not_configured')
    if (url.searchParams.get('error')) return fail('cancelled')
    const code = url.searchParams.get('code')
    if (!saved || saved.length !== 3 || !code || url.searchParams.get('state') !== saved[0]) return fail('state')

    const tokenRes = await fetch(TOKEN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${url.origin}/api/spotify/callback`,
        code_verifier: saved[1]!,
      }),
    })
    if (!tokenRes.ok) {
      console.error('spotify token exchange failed', tokenRes.status)
      return fail('token')
    }
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    if (!access_token) return fail('token')

    let profile: { display_name?: string; id?: string; images?: { url?: string }[] }
    let tracks: SpotifyTopTrack[]
    try {
      ;[profile, tracks] = await Promise.all([apiGet<typeof profile>('/me', access_token), readListening(access_token)])
    } catch (err) {
      // 403: the app is in Spotify's development mode and this listener isn't on its user list.
      console.error('spotify read failed', err)
      if (err instanceof SpotifyApiError && (err.status === 403 || err.status === 401)) return fail('access')
      if (err instanceof SpotifyApiError && err.status === 429) return fail('busy')
      return fail('read')
    }
    if (tracks.length === 0) return fail('empty')

    const image = profile.images?.map((i) => i.url).find((u): u is string => !!u && ARTWORK_URL_RE.test(u)) ?? null
    const name = (profile.display_name || profile.id || 'Spotify listener').slice(0, 60)
    const token = randomToken()
    const now = Date.now()
    const previous = readCookie(request, LINK_COOKIE)
    await env.DB.batch([
      ...(previous && previous.length <= 100 ? [env.DB.prepare('DELETE FROM spotify_links WHERE token_hash = ?').bind(await sha256(previous))] : []),
      env.DB.prepare('DELETE FROM spotify_links WHERE expires_at < ?').bind(now),
      env.DB.prepare('INSERT INTO spotify_links (token_hash, name, image, tracks_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
        await sha256(token),
        name,
        image,
        JSON.stringify(tracks),
        now,
        now + LINK_TTL_MS,
      ),
    ])
    return redirect(withParam(back, 'spotify', 'connected'), [cookie(LINK_COOKIE, token, url, LINK_TTL_MS / 1000), cookie(OAUTH_COOKIE, '', url, 0)])
  }

  if (path === '/api/spotify/me' && request.method === 'GET') {
    const link = await linkFor(request, env)
    if (!link) return json({ connected: false } satisfies SpotifyMe)
    let tracks: SpotifyTopTrack[] = []
    try {
      tracks = JSON.parse(link.row.tracks_json) as SpotifyTopTrack[]
    } catch {
      tracks = []
    }
    return json({ connected: true, name: link.row.name, image: link.row.image, tracks, fetchedAt: link.row.created_at } satisfies SpotifyMe)
  }

  if (path === '/api/spotify/disconnect' && request.method === 'POST') {
    const link = await linkFor(request, env)
    if (link) await env.DB.prepare('DELETE FROM spotify_links WHERE token_hash = ?').bind(link.hash).run()
    const res = json({ ok: true })
    res.headers.append('Set-Cookie', cookie(LINK_COOKIE, '', url, 0))
    return res
  }

  if (path === '/api/spotify/previews' && request.method === 'GET') {
    const { success } = await env.CONNECT_LIMITER.limit({ key: `spv:${clientKey}` })
    if (!success) return json({ error: 'Too many requests. Try again in a minute.' }, 429)
    const ids = [...new Set((url.searchParams.get('ids') ?? '').split(',').filter((id) => SPOTIFY_TRACK_ID_RE.test(id)))].slice(0, PREVIEW_BATCH)
    if (ids.length === 0) return json({ error: 'No valid track ids.' }, 400)
    const previews: Record<string, string | null> = {}
    // A handful at a time keeps us polite to the embed pages.
    for (let i = 0; i < ids.length; i += 5) {
      const batch = ids.slice(i, i + 5)
      const found = await Promise.all(batch.map(embedPreview))
      batch.forEach((id, j) => (previews[id] = found[j] ?? null))
    }
    return new Response(JSON.stringify({ previews }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, 'Cache-Control': 'private, max-age=3600' },
    })
  }

  return json({ error: 'Not found' }, 404)
}
