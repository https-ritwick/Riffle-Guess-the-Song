import { dailyGame, dailyNumber, msUntilNextDaily, type DailyBoard } from '../shared/daily'
import { DEFAULT_SETTINGS, GameKindSchema, ROOM_CODE_RE } from '../shared/protocol'
import { aiHealth } from './ai'
import { handleAdmin } from './admin'
import { geoOf, handleTrack, logRoom, purgeOldData, siteConfig } from './analytics'
import { getSessionUser, handleAuth, isAdmin } from './auth'
import { handleGroups, isGroupMember } from './groups'
import { json } from './http'
import { getPlaylist, PlaylistError, PlaylistQuerySchema } from './playlist'
import { allocateRoom, roomStub } from './rooms'
import { handleQuizzes, quizSource } from './quizzes'
import { handleSpotify } from './spotify'

export { GameRoom } from './room'

/** Headers the Worker sets for the room after checking the session; never trusted from clients. */
export const IDENTITY_HEADERS = ['x-encore-user', 'x-encore-member', 'x-encore-geo', 'x-encore-off'] as const

function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? 'local'
}

/** Browsers send Origin on WebSocket upgrades and state-changing fetches; reject cross-site callers. */
function sameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    return new URL(origin).host === url.host
  } catch {
    return false
  }
}

async function handleRooms(request: Request, env: Env, url: URL): Promise<Response | null> {
  const { pathname } = url

  if (pathname === '/api/rooms') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const { success } = await env.CREATE_LIMITER.limit({ key: clientKey(request) })
    if (!success) return json({ error: 'Too many rooms created. Try again in a minute.' }, 429)
    const user = await getSessionUser(request, env)
    const config = await siteConfig(env)
    // Maintenance pauses new rooms for everyone but admins.
    if (config.maintenance.enabled && !isAdmin(env, url, user)) return json({ error: config.maintenance.message || 'New games are paused for maintenance.' }, 503)
    const body = (await request.json().catch(() => null)) as { solo?: unknown; daily?: unknown; game?: unknown; quiz?: unknown } | null
    if (body?.daily === true && !config.features.daily) return json({ error: 'The daily challenge is taking a break today.' }, 503)
    // A player-made quiz, a preset game (from a "beat my score" link) or today's daily challenge.
    const quiz = typeof body?.quiz === 'string' ? await quizSource(env, body.quiz) : null
    if (body?.quiz !== undefined && !quiz) return json({ error: 'That quiz doesn’t exist or was taken down.' }, 404)
    const game = GameKindSchema.safeParse(body?.game)
    const code = await allocateRoom(env, {
      solo: body?.solo === true,
      ...(body?.daily === true ? { daily: dailyNumber() } : {}),
      ...(game.success ? { settings: { ...DEFAULT_SETTINGS, game: game.data } } : {}),
      ...(quiz ? { settings: { ...DEFAULT_SETTINGS, source: quiz } } : {}),
    })
    if (code) await logRoom(env, code, body?.daily === true ? 'daily' : body?.solo === true ? 'solo' : 'party', request, user)
    return code ? json({ code }, 201) : json({ error: 'Could not allocate a room code. Please try again.' }, 503)
  }

  const match = pathname.match(/^\/api\/rooms\/([A-Za-z]{4})(\/ws)?$/)
  if (!match) return null
  const code = match[1]!.toUpperCase()
  if (!ROOM_CODE_RE.test(code)) return json({ error: 'Invalid room code' }, 400)
  const stub = roomStub(env, code)

  if (!match[2]) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    return json(await stub.info())
  }

  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'Expected a WebSocket upgrade' }, 426)
  if (!sameOrigin(request, url)) return json({ error: 'Forbidden origin' }, 403)
  const { success } = await env.CONNECT_LIMITER.limit({ key: clientKey(request) })
  if (!success) return json({ error: 'Too many connections' }, 429)

  // Tell the room who this is (if signed in) and whether they belong to the room's group.
  const headers = new Headers(request.headers)
  for (const h of IDENTITY_HEADERS) headers.delete(h)
  // Rough location and device for analytics, and any features the admin has switched off.
  const geo = geoOf(request)
  headers.set('x-encore-geo', JSON.stringify({ country: geo.country, region: geo.region, city: geo.city, device: geo.device }))
  const { features } = await siteConfig(env)
  headers.set('x-encore-off', (['chat', 'voice', 'ai'] as const).filter((f) => !features[f]).join(','))
  const user = await getSessionUser(request, env)
  if (user) {
    headers.set('x-encore-user', JSON.stringify({ id: user.id, name: user.name, picture: user.picture }))
    const info = await stub.info()
    if (info.group && (await isGroupMember(env, info.group.id, user.id))) headers.set('x-encore-member', '1')
  }
  return stub.fetch(new Request(request, { headers }))
}

/** Today's daily challenge leaderboard (and, with ?score=, where that score would rank). */
async function dailyBoard(env: Env, url: URL): Promise<DailyBoard> {
  const day = dailyNumber()
  const score = Number(url.searchParams.get('score'))
  const board: DailyBoard = { day, game: dailyGame(day), players: 0, top: [], rank: null, nextInMs: msUntilNextDaily() }
  try {
    const [count, top, better] = await env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = ?').bind(day),
      env.DB.prepare('SELECT name, score, correct, total FROM daily_scores WHERE day = ? ORDER BY score DESC, played_at ASC LIMIT 10').bind(day),
      env.DB.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = ? AND score > ?').bind(day, Number.isFinite(score) ? score : 0),
    ])
    board.players = (count!.results[0] as { n: number }).n
    board.top = top!.results as DailyBoard['top']
    if (url.searchParams.has('score') && Number.isFinite(score)) board.rank = (better!.results[0] as { n: number }).n + 1
  } catch (err) {
    console.error('daily board failed (is migration 0004 applied?)', err)
  }
  return board
}

/**
 * ICE servers for the voice channel. STUN is enough for most networks; with a
 * Cloudflare TURN key (TURN_KEY_ID + TURN_KEY_API_TOKEN) players behind strict
 * NATs or firewalls are relayed too.
 */
async function iceServers(env: Env): Promise<{ iceServers: unknown[] }> {
  const stun = { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }
  const turn = env as unknown as { TURN_KEY_ID?: string; TURN_KEY_API_TOKEN?: string }
  if (!turn.TURN_KEY_ID?.trim() || !turn.TURN_KEY_API_TOKEN?.trim()) return { iceServers: [stun] }
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${turn.TURN_KEY_ID.trim()}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${turn.TURN_KEY_API_TOKEN.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 6 * 60 * 60 }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`TURN credentials: HTTP ${res.status}`)
    const body = (await res.json()) as { iceServers?: unknown }
    const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : []
    return { iceServers: servers.length ? servers : [stun] }
  } catch (err) {
    console.error('TURN credentials failed', err)
    return { iceServers: [stun] }
  }
}

/** Features the admin switched off answer as if they weren't set up. */
async function featureSwitches(request: Request, env: Env, pathname: string): Promise<Response | null> {
  const watched = pathname === '/api/spotify/config' || pathname === '/api/spotify/start' || (pathname === '/api/groups' && request.method === 'POST')
  if (!watched) return null
  const { features } = await siteConfig(env)
  if (!features.spotify && pathname === '/api/spotify/config') return json({ enabled: false })
  if (!features.spotify && pathname === '/api/spotify/start') return json({ error: 'Spotify connect is turned off right now.' }, 503)
  if (!features.groups && pathname === '/api/groups') return json({ error: 'Creating new groups is paused right now.' }, 503)
  return null
}

async function handlePlaylist(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response | null> {
  if (url.pathname !== '/api/playlist') return null
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  const { success } = await env.CONNECT_LIMITER.limit({ key: `pl:${clientKey(request)}` })
  if (!success) return json({ error: 'Too many requests. Try again in a minute.' }, 429)
  const q = PlaylistQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!q.success) return json({ error: 'Invalid playlist link.' }, 400)
  try {
    return json(await getPlaylist(q.data, ctx))
  } catch (err) {
    if (err instanceof PlaylistError) return json({ error: err.message }, err.status)
    console.error('playlist fetch failed', err)
    return json({ error: 'Could not load that playlist right now.' }, 502)
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (pathname === '/api/health') return json({ ok: true })
    if (pathname === '/api/daily' && request.method === 'GET') return json(await dailyBoard(env, url))
    if (pathname === '/api/rtc/ice' && request.method === 'GET') {
      const { success } = await env.CONNECT_LIMITER.limit({ key: `ice:${clientKey(request)}` })
      if (!success) return json({ error: 'Too many requests. Try again in a minute.' }, 429)
      return json(await iceServers(env))
    }
    // Is the optional AI (Gemini) set up and answering? Makes one tiny request, so it's rate-limited.
    if (pathname === '/api/ai/health') {
      const { success } = await env.CONNECT_LIMITER.limit({ key: `ai:${clientKey(request)}` })
      if (!success) return json({ error: 'Too many requests. Try again in a minute.' }, 429)
      return json(await aiHealth(env, url.searchParams.get('model')))
    }

    // Cookie-authenticated writes must come from our own pages.
    if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request, url)) {
      return json({ error: 'Forbidden origin' }, 403)
    }

    try {
      if (pathname === '/api/config' && request.method === 'GET') return json(await siteConfig(env))
      if (pathname === '/api/track' && request.method === 'POST') {
        const { success } = await env.CONNECT_LIMITER.limit({ key: `track:${clientKey(request)}` })
        if (!success) return json({ ok: true, counted: false })
        return await handleTrack(request, env, url, await getSessionUser(request, env))
      }
      const switched = await featureSwitches(request, env, pathname)
      if (switched) return switched
      const response =
        (await handleRooms(request, env, url)) ??
        (await handlePlaylist(request, env, url, ctx)) ??
        (await handleSpotify(request, env, url, clientKey(request))) ??
        (await handleAuth(request, env, url)) ??
        (await handleAdmin(request, env, url, await getSessionUser(request, env))) ??
        (await handleQuizzes(request, env, url, await getSessionUser(request, env))) ??
        (await handleGroups(request, env, url, await getSessionUser(request, env)))
      return response ?? json({ error: 'Not found' }, 404)
    } catch (err) {
      console.error('request failed', pathname, err)
      return json({ error: 'Something went wrong. Please try again.' }, 500)
    }
  },

  // Daily clean-up: old analytics rows, expired sessions and Spotify links.
  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(purgeOldData(env).catch((err) => console.error('scheduled clean-up failed', err)))
  },
} satisfies ExportedHandler<Env>
