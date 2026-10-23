// Google sign-in (OAuth 2.0 authorization-code flow with PKCE) and cookie sessions.
import { ageFromBirthYear, DevLoginSchema, MIN_AGE, ProfileSchema, type AuthConfig, type Gender, type Me } from '../shared/account'
import { BRAND } from '../shared/brand'
import { json } from './http'

const SESSION_COOKIE = 'encore_session'
const OAUTH_COOKIE = 'encore_oauth'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'
const PICTURE_RE = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//

export interface SessionUser {
  id: string
  name: string
  email: string
  picture: string | null
  google_sub: string
  birth_year: number | null
  gender: Gender | null
}

// ---------------------------------------------------------------------------
// Small crypto / cookie helpers

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const b of arr) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export async function sha256(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

export function cookie(name: string, value: string, url: URL, maxAgeSeconds: number): string {
  const secure = url.protocol === 'https:' ? '; Secure' : ''
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
}

export function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/'
  return raw.slice(0, 300)
}

function googleConfigured(env: Env): boolean {
  return !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}

/** The developer login exists only for local testing: opt-in flag AND a localhost hostname. */
function devLoginAllowed(env: Env, url: URL): boolean {
  return env.DEV_LOGIN === 'true' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
}

/** Google accounts allowed into the admin console: ADMIN_EMAILS (comma-separated), or the site owner's. */
export function adminEmails(env: Env): string[] {
  const raw = (env as unknown as { ADMIN_EMAILS?: string }).ADMIN_EMAILS?.trim()
  return (raw || BRAND.email)
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Admins are recognised by their Google-verified email. Developer sign-ins (which
 * anyone can type) only count on localhost, for testing the console.
 */
export function isAdmin(env: Env, url: URL, user: SessionUser | null): boolean {
  if (!user) return false
  if (user.google_sub.startsWith('dev:') && !devLoginAllowed(env, url)) return false
  return adminEmails(env).includes(user.email.toLowerCase())
}

// ---------------------------------------------------------------------------
// Sessions

export async function getSessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE)
  if (!token || token.length > 100) return null
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.picture, u.google_sub, u.birth_year, u.gender FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned_at IS NULL AND u.deleted_at IS NULL`,
  )
    .bind(await sha256(token), Date.now())
    .first<SessionUser>()
  return row ?? null
}

async function createSession(env: Env, userId: string, url: URL): Promise<string> {
  const token = randomToken()
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(userId, now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sha256(token),
      userId,
      now,
      now + SESSION_TTL_MS,
    ),
  ])
  return cookie(SESSION_COOKIE, token, url, SESSION_TTL_MS / 1000)
}

/** Creates or refreshes the account. Banned and deleted accounts come back as `blocked`. */
async function upsertUser(env: Env, sub: string, email: string, name: string, picture: string | null): Promise<{ id: string; blocked: boolean }> {
  const now = Date.now()
  const row = await env.DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login, login_count) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, last_login = excluded.last_login,
       login_count = login_count + 1
     RETURNING id, banned_at, deleted_at`,
  )
    .bind(crypto.randomUUID(), sub, email.toLowerCase(), name.slice(0, 60), picture, now, now)
    .first<{ id: string; banned_at: number | null; deleted_at: number | null }>()
  return { id: row!.id, blocked: row!.banned_at !== null || row!.deleted_at !== null }
}

export function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const c of cookies) headers.append('Set-Cookie', c)
  return new Response(null, { status: 302, headers })
}

// ---------------------------------------------------------------------------
// Routes: /api/auth/*, /api/me

export async function handleAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname

  if (path === '/api/auth/config' && request.method === 'GET') {
    return json({ google: googleConfigured(env), dev: devLoginAllowed(env, url) } satisfies AuthConfig)
  }

  if (path === '/api/me' && request.method === 'GET') {
    const user = await getSessionUser(request, env)
    const me: Me | null = user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          picture: user.picture,
          age: ageFromBirthYear(user.birth_year),
          gender: user.gender,
          ...(isAdmin(env, url, user) ? { admin: true } : {}),
        }
      : null
    return json({ user: me })
  }

  // Age and gender, asked once after the first sign-in (and editable from the account menu).
  if (path === '/api/me/profile' && request.method === 'POST') {
    const user = await getSessionUser(request, env)
    if (!user) return json({ error: 'Please sign in first.' }, 401)
    const body = ProfileSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return json({ error: body.error.issues[0]?.message ?? 'Invalid profile' }, 400)
    if (body.data.age < MIN_AGE) return json({ error: `Riffle is for players aged ${MIN_AGE} and up.` }, 400)
    await env.DB.prepare('UPDATE users SET birth_year = ?, gender = ?, profile_at = ? WHERE id = ?')
      .bind(new Date().getUTCFullYear() - body.data.age, body.data.gender, Date.now(), user.id)
      .run()
    return json({ ok: true })
  }

  if (path === '/api/auth/google/start' && request.method === 'GET') {
    if (!googleConfigured(env)) return json({ error: 'Google sign-in is not configured on this server yet.' }, 503)
    const state = randomToken(16)
    const verifier = randomToken(48)
    const challenge = await sha256(verifier)
    const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })
    return redirect(`${GOOGLE_AUTH}?${params}`, [cookie(OAUTH_COOKIE, `${state}|${verifier}|${returnTo}`, url, 600)])
  }

  if (path === '/api/auth/google/callback' && request.method === 'GET') {
    const fail = (reason: string) => redirect(`/?login_error=${encodeURIComponent(reason)}`, [cookie(OAUTH_COOKIE, '', url, 0)])
    if (!googleConfigured(env)) return fail('not_configured')
    const saved = readCookie(request, OAUTH_COOKIE)?.split('|')
    const code = url.searchParams.get('code')
    if (url.searchParams.get('error')) return fail('cancelled')
    if (!saved || saved.length !== 3 || !code || url.searchParams.get('state') !== saved[0]) return fail('state')

    const tokenRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${url.origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: saved[1]!,
      }),
    })
    if (!tokenRes.ok) {
      console.error('google token exchange failed', tokenRes.status)
      return fail('token')
    }
    const { access_token } = (await tokenRes.json()) as { access_token?: string }
    const infoRes = await fetch(GOOGLE_USERINFO, { headers: { Authorization: `Bearer ${access_token}` } })
    if (!infoRes.ok) return fail('profile')
    const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string }
    if (!info.sub || !info.email || info.email_verified === false) return fail('email')

    const picture = info.picture && PICTURE_RE.test(info.picture) ? info.picture : null
    const account = await upsertUser(env, info.sub, info.email, info.name || info.email.split('@')[0]!, picture)
    if (account.blocked) return fail('blocked')
    return redirect(safeReturnTo(saved[2]!), [await createSession(env, account.id, url), cookie(OAUTH_COOKIE, '', url, 0)])
  }

  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = readCookie(request, SESSION_COOKIE)
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run()
    const res = json({ ok: true })
    res.headers.append('Set-Cookie', cookie(SESSION_COOKIE, '', url, 0))
    return res
  }

  if (path === '/api/auth/dev-login' && request.method === 'POST') {
    if (!devLoginAllowed(env, url)) return json({ error: 'Not found' }, 404)
    const body = DevLoginSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return json({ error: 'Invalid body' }, 400)
    const account = await upsertUser(env, `dev:${body.data.email}`, body.data.email, body.data.name, null)
    if (account.blocked) return json({ error: 'This account has been suspended.' }, 403)
    const res = json({ ok: true })
    res.headers.append('Set-Cookie', await createSession(env, account.id, url))
    return res
  }

  return null
}
