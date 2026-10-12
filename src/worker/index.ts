import { ROOM_CODE_RE } from '../shared/protocol'
import { getSessionUser, handleAuth } from './auth'
import { handleGroups, isGroupMember } from './groups'
import { json } from './http'
import { getPlaylist, PlaylistError, PlaylistQuerySchema } from './playlist'
import { allocateRoom, roomStub } from './rooms'
import { handleSpotify } from './spotify'

export { GameRoom } from './room'

/** Headers the Worker sets for the room after checking the session; never trusted from clients. */
export const IDENTITY_HEADERS = ['x-encore-user', 'x-encore-member'] as const

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
    const body = (await request.json().catch(() => null)) as { solo?: unknown } | null
    const code = await allocateRoom(env, { solo: body?.solo === true })
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
  const user = await getSessionUser(request, env)
  if (user) {
    headers.set('x-encore-user', JSON.stringify({ id: user.id, name: user.name, picture: user.picture }))
    const info = await stub.info()
    if (info.group && (await isGroupMember(env, info.group.id, user.id))) headers.set('x-encore-member', '1')
  }
  return stub.fetch(new Request(request, { headers }))
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

    // Cookie-authenticated writes must come from our own pages.
    if (request.method !== 'GET' && request.method !== 'HEAD' && !sameOrigin(request, url)) {
      return json({ error: 'Forbidden origin' }, 403)
    }

    try {
      const response =
        (await handleRooms(request, env, url)) ??
        (await handlePlaylist(request, env, url, ctx)) ??
        (await handleSpotify(request, env, url, clientKey(request))) ??
        (await handleAuth(request, env, url)) ??
        (await handleGroups(request, env, url, await getSessionUser(request, env)))
      return response ?? json({ error: 'Not found' }, 404)
    } catch (err) {
      console.error('request failed', pathname, err)
      return json({ error: 'Something went wrong. Please try again.' }, 500)
    }
  },
} satisfies ExportedHandler<Env>
