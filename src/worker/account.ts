// Players deleting their own account (Google Play's account-deletion requirement; see /delete-account).
import { DeleteAccountSchema } from '../shared/account'
import { purgeUser } from './admin'
import { clearSessionCookie, getSessionUser } from './auth'
import { json } from './http'
import { forgetSpotifyLink } from './spotify'

/**
 * Stricter than the Worker-wide origin check (which lets requests without an Origin through):
 * deleting an account needs a browser fetch from one of our own pages.
 */
function fromOwnPage(request: Request, url: URL): boolean {
  const origin = request.headers.get('Origin')
  if (!origin) return false
  try {
    return new URL(origin).host === url.host
  } catch {
    return false
  }
}

export async function handleAccount(request: Request, env: Env, url: URL): Promise<Response | null> {
  if (url.pathname !== '/api/me/delete') return null
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  // Read the body before any early answer: an unread request body breaks the local dev proxy's next request.
  const body = DeleteAccountSchema.safeParse(await request.json().catch(() => null))
  if (!fromOwnPage(request, url)) return json({ error: 'Forbidden origin' }, 403)
  const user = await getSessionUser(request, env)
  if (!user) return json({ error: 'Please sign in first.' }, 401)
  if (!body.success) return json({ error: body.error.issues[0]?.message ?? 'Invalid request' }, 400)

  // Removes the account, every session (all devices), groups/quizzes/invites, and scrubs game history.
  await purgeUser(env, user.id)
  const res = json({ ok: true })
  res.headers.append('Set-Cookie', clearSessionCookie(url))
  // Spotify tokens are never stored; the profile and top tracks saved for this browser go now.
  res.headers.append('Set-Cookie', await forgetSpotifyLink(request, env, url))
  res.headers.set('Cache-Control', 'no-store')
  return res
}
