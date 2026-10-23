// Player-made quizzes: create, edit, browse and play songs lists made by players.
import { MAX_QUIZZES_PER_USER, QuizInputSchema, type AdminQuizRow, type QuizDetail, type QuizSummary } from '../shared/quiz'
import { QUIZ_ID_RE, TrackSchema, type Source, type Track } from '../shared/protocol'
import { randomToken, type SessionUser } from './auth'
import { json } from './http'

const PAGE_SIZE = 24

interface QuizRow {
  id: string
  owner_id: string
  title: string
  description: string
  emoji: string
  cover: string | null
  tracks_json: string
  track_count: number
  visibility: 'public' | 'unlisted'
  plays: number
  created_at: number
  updated_at: number
  removed_at: number | null
  removed_reason: string | null
  owner_name?: string
  owner_picture?: string | null
  owner_email?: string
}

const SELECT = `SELECT q.*, u.name AS owner_name, u.picture AS owner_picture, u.email AS owner_email FROM quizzes q JOIN users u ON u.id = q.owner_id`

function summary(r: QuizRow, user: SessionUser | null): QuizSummary {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    emoji: r.emoji,
    cover: r.cover,
    trackCount: r.track_count,
    plays: r.plays,
    visibility: r.visibility,
    owner: { name: r.owner_name ?? 'Someone', picture: r.owner_picture ?? null },
    createdAt: r.created_at,
    mine: !!user && user.id === r.owner_id,
  }
}

function tracksOf(r: QuizRow): Track[] {
  try {
    const raw = JSON.parse(r.tracks_json) as unknown[]
    return raw.flatMap((t) => {
      const parsed = TrackSchema.safeParse(t)
      return parsed.success ? [parsed.data] : []
    })
  } catch {
    return []
  }
}

export function adminQuizRow(r: QuizRow): AdminQuizRow {
  return { ...summary(r, null), ownerId: r.owner_id, ownerEmail: r.owner_email ?? '', removedAt: r.removed_at, removedReason: r.removed_reason }
}

/** A live (not taken down) quiz as a room's music source, or null. */
export async function quizSource(env: Env, id: string): Promise<Extract<Source, { kind: 'quiz' }> | null> {
  if (!QUIZ_ID_RE.test(id)) return null
  const r = await env.DB.prepare('SELECT id, title, track_count, cover FROM quizzes WHERE id = ? AND removed_at IS NULL')
    .bind(id)
    .first<{ id: string; title: string; track_count: number; cover: string | null }>()
  if (!r) return null
  return { kind: 'quiz', id: r.id, name: r.title, count: r.track_count, ...(r.cover ? { image: r.cover } : {}) }
}

export async function handleQuizzes(request: Request, env: Env, url: URL, user: SessionUser | null): Promise<Response | null> {
  const path = url.pathname
  const method = request.method
  if (!path.startsWith('/api/quizzes')) return null

  if (path === '/api/quizzes' && method === 'GET') {
    const sort = url.searchParams.get('sort') === 'new' ? 'q.created_at DESC' : 'q.plays DESC, q.created_at DESC'
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 60)
    const page = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get('page')) || 1)))
    const filter = q ? 'AND (LOWER(q.title) LIKE ?1 OR LOWER(q.description) LIKE ?1)' : 'AND ?1 IS NULL'
    const { results } = await env.DB.prepare(`${SELECT} WHERE q.visibility = 'public' AND q.removed_at IS NULL ${filter} ORDER BY ${sort} LIMIT ?2 OFFSET ?3`)
      .bind(q ? `%${q}%` : null, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE)
      .all<QuizRow>()
    return json({ quizzes: results.slice(0, PAGE_SIZE).map((r) => summary(r, user)), more: results.length > PAGE_SIZE, page })
  }

  if (path === '/api/quizzes/mine' && method === 'GET') {
    if (!user) return json({ error: 'Please sign in first.' }, 401)
    const { results } = await env.DB.prepare(`${SELECT} WHERE q.owner_id = ? AND q.removed_at IS NULL ORDER BY q.updated_at DESC`).bind(user.id).all<QuizRow>()
    return json({ quizzes: results.map((r) => summary(r, user)) })
  }

  if (path === '/api/quizzes' && method === 'POST') {
    if (!user) return json({ error: 'Sign in with Google to make a quiz.' }, 401)
    const body = QuizInputSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return json({ error: body.error.issues[0]?.message ?? 'Invalid quiz' }, 400)
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM quizzes WHERE owner_id = ?').bind(user.id).first<{ n: number }>()
    if ((count?.n ?? 0) >= MAX_QUIZZES_PER_USER) return json({ error: `You can keep up to ${MAX_QUIZZES_PER_USER} quizzes — delete an old one first.` }, 400)
    const id = randomToken(9).replace(/[-_]/g, 'q').slice(0, 10)
    const now = Date.now()
    const d = body.data
    await env.DB.prepare(
      `INSERT INTO quizzes (id, owner_id, title, description, emoji, cover, tracks_json, track_count, visibility, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, user.id, d.title, d.description, d.emoji, d.tracks.find((t) => t.artwork)?.artwork || null, JSON.stringify(d.tracks), d.tracks.length, d.visibility, now, now)
      .run()
    return json({ id }, 201)
  }

  const m = path.match(/^\/api\/quizzes\/([A-Za-z0-9]{8,16})$/)
  if (!m) return json({ error: 'Not found' }, 404)
  const row = await env.DB.prepare(`${SELECT} WHERE q.id = ?`).bind(m[1]).first<QuizRow>()
  if (!row || row.removed_at) return json({ error: 'This quiz doesn’t exist or was taken down.' }, 404)
  const mine = !!user && user.id === row.owner_id

  if (method === 'GET') {
    const detail: QuizDetail = { ...summary(row, user), tracks: tracksOf(row) }
    return json(detail)
  }
  if (!mine) return json({ error: 'Only the quiz’s maker can change it.' }, 403)

  if (method === 'PUT') {
    const body = QuizInputSchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return json({ error: body.error.issues[0]?.message ?? 'Invalid quiz' }, 400)
    const d = body.data
    await env.DB.prepare(
      'UPDATE quizzes SET title = ?, description = ?, emoji = ?, cover = ?, tracks_json = ?, track_count = ?, visibility = ?, updated_at = ? WHERE id = ?',
    )
      .bind(d.title, d.description, d.emoji, d.tracks.find((t) => t.artwork)?.artwork || null, JSON.stringify(d.tracks), d.tracks.length, d.visibility, Date.now(), row.id)
      .run()
    return json({ ok: true })
  }
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM quizzes WHERE id = ?').bind(row.id).run()
    return json({ ok: true })
  }
  return json({ error: 'Method not allowed' }, 405)
}

export { SELECT as QUIZ_SELECT, type QuizRow }
