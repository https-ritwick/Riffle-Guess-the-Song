// Admin console API (/api/admin/*). Only Google accounts listed in ADMIN_EMAILS get
// in; everyone else gets a plain 404, so the console doesn't advertise itself.
import {
  BannerSchema,
  DailyRemoveSchema,
  FeaturesSchema,
  GroupActionSchema,
  MaintenanceSchema,
  QuizActionSchema,
  RANGES,
  RoomActionSchema,
  SiteConfigPatchSchema,
  TeamsConfigSchema,
  UserActionSchema,
  type AdminGroupDetail,
  type AdminGroupRow,
  type AdminRoom,
  type AdminUserDetail,
  type DailyAdmin,
  type Page,
} from '../shared/admin'
import { findPreset } from '../shared/catalog'
import { dailyGame, dailyNumber } from '../shared/daily'
import * as reports from './admin-analytics'
import { clearConfigCache, siteConfig } from './analytics'
import { adminEmails, isAdmin, type SessionUser } from './auth'
import { removeMember, type GroupRow } from './groups'
import { json } from './http'
import { adminQuizRow, QUIZ_SELECT, type QuizRow } from './quizzes'
import { roomStub } from './rooms'

const PAGE_SIZE = 25
const DAY_MS = 86_400_000

type Row = Record<string, unknown>
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

async function body<T>(request: Request, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return { error: json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400) }
  return { data: parsed.data }
}

async function audit(env: Env, admin: SessionUser, action: string, targetType: string | null, targetId: string | null, detail: unknown = null): Promise<void> {
  await env.DB.prepare('INSERT INTO admin_actions (admin_email, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(admin.email, action, targetType, targetId, detail === null ? null : (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1000), Date.now())
    .run()
}

function days(url: URL): number {
  const d = Number(url.searchParams.get('days'))
  return (RANGES as readonly number[]).includes(d) ? d : 30
}

function page(url: URL): number {
  return Math.max(1, Math.min(10_000, Math.floor(Number(url.searchParams.get('page')) || 1)))
}

// ---------------------------------------------------------------------------
// Live rooms: Durable Objects can't be listed, so ask every room created recently.

async function liveRooms(env: Env): Promise<AdminRoom[]> {
  const { results } = await env.DB.prepare('SELECT DISTINCT code FROM rooms_log WHERE created_at > ? ORDER BY created_at DESC LIMIT 120')
    .bind(Date.now() - 7 * 60 * 60 * 1000)
    .all<{ code: string }>()
  const infos = await Promise.allSettled(results.map((r) => roomStub(env, r.code).adminInfo()))
  const rooms: AdminRoom[] = []
  for (const r of infos) if (r.status === 'fulfilled' && r.value) rooms.push(r.value)
  // Rooms with someone connected first, then the most recently active.
  const online = (room: AdminRoom) => room.players.filter((p) => p.connected).length
  return rooms.sort((a, b) => online(b) - online(a) || b.lastActive - a.lastActive)
}

// ---------------------------------------------------------------------------
// Users

const USER_COLUMNS = `u.id, u.name, u.email, u.picture, u.created_at, u.last_login, u.last_seen, u.country, u.city, u.banned_at, u.deleted_at, u.birth_year, u.gender,
  (SELECT COUNT(*) FROM game_participants p WHERE p.user_id = u.id) AS games,
  (SELECT COUNT(*) FROM group_members m WHERE m.user_id = u.id) AS groups`

async function listUsers(env: Env, url: URL): Promise<Page<ReturnType<typeof reports.userRow>>> {
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 80)
  const filter = url.searchParams.get('filter') ?? 'all'
  const sort = url.searchParams.get('sort') ?? 'recent'
  const admins = adminEmails(env)
  const where: string[] = []
  const params: unknown[] = []
  if (q) {
    where.push('(LOWER(u.name) LIKE ? OR u.email LIKE ? OR u.id = ?)')
    params.push(`%${q}%`, `%${q}%`, q)
  }
  if (filter === 'banned') where.push('u.banned_at IS NOT NULL')
  else if (filter === 'deleted') where.push('u.deleted_at IS NOT NULL')
  else if (filter === 'active') where.push('u.last_seen > ? AND u.banned_at IS NULL AND u.deleted_at IS NULL'), params.push(Date.now() - 7 * DAY_MS)
  else if (filter === 'admins') where.push(`u.email IN (${admins.map(() => '?').join(',') || "''"})`), params.push(...admins)
  else where.push('u.deleted_at IS NULL')
  const order =
    sort === 'seen' ? 'COALESCE(u.last_seen, u.last_login) DESC' : sort === 'games' ? 'games DESC' : sort === 'name' ? 'u.name COLLATE NOCASE' : 'u.created_at DESC'
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const p = page(url)
  const [list, count] = await env.DB.batch([
    env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users u ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...params, PAGE_SIZE, (p - 1) * PAGE_SIZE),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM users u ${clause}`).bind(...params),
  ])
  return { rows: (list!.results as Row[]).map((x) => reports.userRow(x, admins)), total: num((count!.results[0] as Row).n), page: p, pageSize: PAGE_SIZE }
}

async function userDetail(env: Env, id: string): Promise<AdminUserDetail | null> {
  const db = env.DB
  const since = reports.rangeOf(90).from
  const [user, stats, daily, modes, sources, devices, activity, groups, recent, sessions] = await db.batch([
    db.prepare(`SELECT ${USER_COLUMNS}, u.google_sub, u.ban_reason, u.admin_note, u.login_count, u.region FROM users u WHERE u.id = ?`).bind(id),
    db.prepare(
      `SELECT COUNT(*) AS games, COALESCE(SUM(p.rank = 1 AND g.players > 1), 0) AS wins, COALESCE(SUM(p.score), 0) AS points, COALESCE(SUM(p.correct), 0) AS correct,
              COALESCE(SUM(p.answered), 0) AS answered, COALESCE(MAX(p.best_streak), 0) AS best, AVG(p.avg_ms) AS ms
       FROM game_participants p JOIN game_events g ON g.id = p.game_id WHERE p.user_id = ?`,
    ).bind(id),
    db.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE user_id = ?').bind(id),
    db.prepare('SELECT g.kind AS label, COUNT(*) AS value FROM game_participants p JOIN game_events g ON g.id = p.game_id WHERE p.user_id = ? GROUP BY g.kind ORDER BY value DESC').bind(id),
    db.prepare(
      `SELECT g.source_label AS label, g.source_kind AS kind, COUNT(*) AS value FROM game_participants p JOIN game_events g ON g.id = p.game_id
       WHERE p.user_id = ? GROUP BY g.source_kind, g.source_label ORDER BY value DESC LIMIT 8`,
    ).bind(id),
    db.prepare("SELECT device || ' · ' || browser AS label, COUNT(*) AS value FROM visits WHERE user_id = ? GROUP BY label ORDER BY value DESC LIMIT 5").bind(id),
    db.prepare(
      `SELECT day, SUM(n) AS value FROM (
         SELECT day, 1 AS n FROM visits WHERE user_id = ?1 AND day >= ?2
         UNION ALL SELECT g.day, 1 FROM game_participants p JOIN game_events g ON g.id = p.game_id WHERE p.user_id = ?1 AND g.day >= ?2
       ) GROUP BY day`,
    ).bind(id, since),
    db.prepare('SELECT g.id, g.name, m.role FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? ORDER BY m.joined_at').bind(id),
    db.prepare(
      `SELECT g.id, g.started_at, g.mode, g.kind, g.source_label, g.source_kind, g.players, g.rounds_played, p.rank, p.score, p.correct
       FROM game_participants p JOIN game_events g ON g.id = p.game_id WHERE p.user_id = ? ORDER BY g.started_at DESC LIMIT 20`,
    ).bind(id),
    db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires_at > ?').bind(id, Date.now()),
  ])
  const u = user!.results[0] as Row | undefined
  if (!u) return null
  const s = stats!.results[0] as Row
  const label = (x: Row) => (x.kind === 'preset' ? (findPreset(String(x.label))?.name ?? String(x.label)) : String(x.label))
  return {
    ...reports.userRow(u, adminEmails(env)),
    googleSub: String(u.google_sub),
    banReason: (u.ban_reason as string | null) ?? null,
    adminNote: (u.admin_note as string | null) ?? null,
    loginCount: num(u.login_count),
    region: (u.region as string | null) ?? null,
    sessions: num((sessions!.results[0] as Row).n),
    stats: {
      games: num(s.games),
      wins: num(s.wins),
      points: num(s.points),
      correct: num(s.correct),
      answered: num(s.answered),
      bestStreak: num(s.best),
      avgMs: s.ms == null ? null : Math.round(num(s.ms)),
      dailyPlays: num((daily!.results[0] as Row).n),
    },
    modes: (modes!.results as Row[]).map((x) => ({ label: String(x.label), value: num(x.value) })),
    sources: (sources!.results as Row[]).map((x) => ({ label: label(x), value: num(x.value) })),
    devices: (devices!.results as Row[]).map((x) => ({ label: String(x.label), value: num(x.value) })),
    activity: (activity!.results as Row[]).map((x) => ({ day: num(x.day), value: num(x.value) })),
    groupsList: (groups!.results as Row[]).map((x) => ({ id: String(x.id), name: String(x.name), role: String(x.role) })),
    recentGames: (recent!.results as Row[]).map((x) => ({
      id: String(x.id),
      at: num(x.started_at),
      mode: String(x.mode),
      kind: String(x.kind),
      source: label({ label: x.source_label, kind: x.source_kind }),
      rank: num(x.rank),
      players: num(x.players),
      score: num(x.score),
      correct: num(x.correct),
      rounds: num(x.rounds_played),
    })),
  }
}

/** Erase an account for good: their groups are handed on (or removed when empty) and their name is scrubbed from game history. */
async function purgeUser(env: Env, id: string): Promise<void> {
  const { results: groups } = await env.DB.prepare('SELECT g.* FROM groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ?').bind(id).all<GroupRow>()
  for (const g of groups) await removeMember(env, g, id)
  // Groups they own but aren't a member of (shouldn't happen, but owner_id must not dangle).
  await env.DB.prepare('DELETE FROM groups WHERE owner_id = ?').bind(id).run()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_invites WHERE invited_by = ?').bind(id),
    env.DB.prepare("UPDATE game_players SET name = 'Deleted player' WHERE user_id = ?").bind(id),
    env.DB.prepare("UPDATE game_participants SET name = 'Deleted player' WHERE user_id = ?").bind(id),
    env.DB.prepare("UPDATE daily_scores SET name = 'Deleted player' WHERE user_id = ?").bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])
}

async function userAction(request: Request, env: Env, admin: SessionUser, id: string): Promise<Response> {
  const b = await body(request, UserActionSchema)
  if (b.error) return b.error
  const target = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(id).first<{ id: string; email: string; name: string }>()
  if (!target) return json({ error: 'User not found' }, 404)
  const a = b.data
  if (target.id === admin.id && a.action !== 'note' && a.action !== 'signout') return json({ error: 'You can’t do that to your own account.' }, 400)
  const now = Date.now()
  switch (a.action) {
    case 'ban':
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET banned_at = ?, ban_reason = ? WHERE id = ?').bind(now, a.reason || null, id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      ])
      break
    case 'unban':
      await env.DB.prepare('UPDATE users SET banned_at = NULL, ban_reason = NULL WHERE id = ?').bind(id).run()
      break
    case 'signout':
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
      break
    case 'delete':
      await env.DB.batch([env.DB.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').bind(now, id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)])
      break
    case 'restore':
      await env.DB.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').bind(id).run()
      break
    case 'purge':
      if (a.confirm.trim().toLowerCase() !== target.email.toLowerCase()) return json({ error: 'Type the account’s email to confirm.' }, 400)
      await purgeUser(env, id)
      break
    case 'note':
      await env.DB.prepare('UPDATE users SET admin_note = ? WHERE id = ?').bind(a.note || null, id).run()
      break
  }
  await audit(env, admin, `user.${a.action}`, 'user', id, a.action === 'purge' ? target.email : { email: target.email, ...('reason' in a ? { reason: a.reason } : {}) })
  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// Groups

function groupRow(x: Row): AdminGroupRow {
  return {
    id: String(x.id),
    name: String(x.name),
    ownerName: String(x.owner_name ?? '—'),
    ownerEmail: String(x.owner_email ?? ''),
    members: num(x.members),
    games: num(x.games),
    createdAt: num(x.created_at),
    inviteEnabled: !!x.invite_enabled,
    lastPlayed: x.last_played == null ? null : num(x.last_played),
  }
}

const GROUP_COLUMNS = `g.*, u.name AS owner_name, u.email AS owner_email,
  (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members,
  (SELECT COUNT(*) FROM games x WHERE x.group_id = g.id) AS games,
  (SELECT MAX(played_at) FROM games x WHERE x.group_id = g.id) AS last_played`

async function listGroups(env: Env, url: URL): Promise<Page<AdminGroupRow>> {
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 80)
  const sort = url.searchParams.get('sort') ?? 'recent'
  const order = sort === 'members' ? 'members DESC' : sort === 'games' ? 'games DESC' : sort === 'played' ? 'last_played DESC' : 'g.created_at DESC'
  const clause = q ? 'WHERE LOWER(g.name) LIKE ?1 OR LOWER(u.email) LIKE ?1' : 'WHERE ?1 IS NULL'
  const param = q ? `%${q}%` : null
  const p = page(url)
  const [list, count] = await env.DB.batch([
    env.DB.prepare(`SELECT ${GROUP_COLUMNS} FROM groups g LEFT JOIN users u ON u.id = g.owner_id ${clause} ORDER BY ${order} LIMIT ?2 OFFSET ?3`).bind(param, PAGE_SIZE, (p - 1) * PAGE_SIZE),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM groups g LEFT JOIN users u ON u.id = g.owner_id ${clause}`).bind(param),
  ])
  return { rows: (list!.results as Row[]).map(groupRow), total: num((count!.results[0] as Row).n), page: p, pageSize: PAGE_SIZE }
}

async function groupDetail(env: Env, id: string): Promise<AdminGroupDetail | null> {
  const [g, members, recent] = await env.DB.batch([
    env.DB.prepare(`SELECT ${GROUP_COLUMNS} FROM groups g LEFT JOIN users u ON u.id = g.owner_id WHERE g.id = ?`).bind(id),
    env.DB.prepare('SELECT u.id, u.name, u.email, u.picture, m.role, m.joined_at FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY m.joined_at').bind(id),
    env.DB.prepare(
      'SELECT x.id, x.played_at, x.source_title, x.rounds, (SELECT COUNT(*) FROM game_players p WHERE p.game_id = x.id) AS players FROM games x WHERE x.group_id = ? ORDER BY x.played_at DESC LIMIT 15',
    ).bind(id),
  ])
  const row = g!.results[0] as Row | undefined
  if (!row) return null
  return {
    ...groupRow(row),
    inviteCode: String(row.invite_code),
    allowGuests: !!row.allow_guests,
    memberList: (members!.results as Row[]).map((m) => ({
      userId: String(m.id),
      name: String(m.name),
      email: String(m.email),
      picture: (m.picture as string | null) ?? null,
      role: String(m.role),
      joinedAt: num(m.joined_at),
    })),
    recent: (recent!.results as Row[]).map((x) => ({ id: String(x.id), at: num(x.played_at), source: String(x.source_title), rounds: num(x.rounds), players: num(x.players) })),
  }
}

async function groupAction(request: Request, env: Env, admin: SessionUser, id: string): Promise<Response> {
  const b = await body(request, GroupActionSchema)
  if (b.error) return b.error
  const group = await env.DB.prepare('SELECT * FROM groups WHERE id = ?').bind(id).first<GroupRow>()
  if (!group) return json({ error: 'Group not found' }, 404)
  const a = b.data
  switch (a.action) {
    case 'rename':
      await env.DB.prepare('UPDATE groups SET name = ? WHERE id = ?').bind(a.name, id).run()
      break
    case 'invite':
      await env.DB.prepare('UPDATE groups SET invite_enabled = ? WHERE id = ?').bind(a.enabled ? 1 : 0, id).run()
      break
    case 'guests':
      await env.DB.prepare('UPDATE groups SET allow_guests = ? WHERE id = ?').bind(a.enabled ? 1 : 0, id).run()
      break
    case 'remove':
      await removeMember(env, group, a.userId)
      break
    case 'delete':
      await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(id).run()
      break
  }
  await audit(env, admin, `group.${a.action}`, 'group', id, { name: group.name, ...a })
  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// Daily challenge, settings, audit log, exports

async function dailyAdmin(env: Env, url: URL): Promise<DailyAdmin> {
  const today = dailyNumber()
  const day = Math.max(1, Math.min(today, Math.floor(Number(url.searchParams.get('day')) || today)))
  const [list, count] = await env.DB.batch([
    env.DB.prepare('SELECT room_code, name, user_id, score, correct, total, played_at FROM daily_scores WHERE day = ? ORDER BY score DESC, played_at ASC LIMIT 100').bind(day),
    env.DB.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE day = ?').bind(day),
  ])
  return {
    day,
    game: dailyGame(day),
    players: num((count!.results[0] as Row).n),
    rows: (list!.results as Row[]).map((x) => ({
      roomCode: String(x.room_code),
      name: String(x.name),
      userId: (x.user_id as string | null) ?? null,
      score: num(x.score),
      correct: num(x.correct),
      total: num(x.total),
      playedAt: num(x.played_at),
    })),
  }
}

async function saveConfig(request: Request, env: Env, admin: SessionUser): Promise<Response> {
  const b = await body(request, SiteConfigPatchSchema)
  if (b.error) return b.error
  const now = Date.now()
  const entries: [string, unknown][] = []
  if (b.data.banner) entries.push(['banner', BannerSchema.parse(b.data.banner)])
  if (b.data.maintenance) entries.push(['maintenance', MaintenanceSchema.parse(b.data.maintenance)])
  if (b.data.features) entries.push(['features', FeaturesSchema.parse(b.data.features)])
  if (b.data.teams) entries.push(['teams', TeamsConfigSchema.parse(b.data.teams)])
  if (!entries.length) return json({ error: 'Nothing to save' }, 400)
  await env.DB.batch(
    entries.map(([key, value]) =>
      env.DB.prepare(
        'INSERT INTO app_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by',
      ).bind(key, JSON.stringify(value), now, admin.email),
    ),
  )
  clearConfigCache()
  await audit(env, admin, 'config.update', 'config', entries.map(([k]) => k).join(','), Object.fromEntries(entries))
  return json(await siteConfig(env))
}

function csv(rows: Row[], filename: string): Response {
  const cols = rows[0] ? Object.keys(rows[0]) : []
  const cell = (v: unknown) => {
    if (v == null) return ''
    let s = String(v)
    // Stop spreadsheet apps from treating a value as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')
  return new Response(text, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

async function exportCsv(env: Env, what: string, url: URL): Promise<Response | null> {
  const r = reports.rangeOf(days(url))
  const stamp = new Date().toISOString().slice(0, 10)
  if (what === 'users') {
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.name, u.email, datetime(u.created_at / 1000, 'unixepoch') AS created, datetime(u.last_login / 1000, 'unixepoch') AS last_login,
              datetime(u.last_seen / 1000, 'unixepoch') AS last_seen, u.login_count, u.country, u.region, u.city,
              CAST(strftime('%Y', 'now') AS INTEGER) - u.birth_year AS age, u.gender,
              (SELECT COUNT(*) FROM game_participants p WHERE p.user_id = u.id) AS games,
              CASE WHEN u.banned_at IS NOT NULL THEN 'banned' WHEN u.deleted_at IS NOT NULL THEN 'deleted' ELSE 'active' END AS status
       FROM users u ORDER BY u.created_at`,
    ).all<Row>()
    return csv(results, `riffle-users-${stamp}.csv`)
  }
  if (what === 'games') {
    const { results } = await env.DB.prepare(
      `SELECT id, datetime(started_at / 1000, 'unixepoch') AS started, mode, kind, source_kind, source_label, region, difficulty, rounds, rounds_played,
              players, signed_in, completed, ROUND(accuracy, 3) AS accuracy, top_score, chats, reactions, voice_users, country,
              ROUND((ended_at - started_at) / 60000.0, 1) AS minutes
       FROM game_events WHERE day BETWEEN ? AND ? ORDER BY started_at`,
    )
      .bind(r.from, r.to)
      .all<Row>()
    return csv(results, `riffle-games-${stamp}.csv`)
  }
  if (what === 'visits') {
    const { results } = await env.DB.prepare(
      `SELECT date((day * 86400) , 'unixepoch') AS day, COUNT(*) AS visitors, SUM(views) AS views, SUM(user_id IS NOT NULL) AS signed_in
       FROM visits WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day`,
    )
      .bind(r.from, r.to)
      .all<Row>()
    return csv(results, `riffle-visits-${stamp}.csv`)
  }
  if (what === 'songs') {
    const { results } = await env.DB.prepare(
      'SELECT kind, title, subtitle, plays, answers, correct, ROUND(CAST(correct AS REAL) / MAX(answers, 1), 3) AS accuracy FROM item_stats ORDER BY plays DESC LIMIT 5000',
    ).all<Row>()
    return csv(results, `riffle-songs-${stamp}.csv`)
  }
  return null
}

// ---------------------------------------------------------------------------

export async function handleAdmin(request: Request, env: Env, url: URL, user: SessionUser | null): Promise<Response | null> {
  const path = url.pathname
  if (!path.startsWith('/api/admin')) return null
  if (!isAdmin(env, url, user)) return json({ error: 'Not found' }, 404)
  const admin = user!
  const method = request.method

  if (path === '/api/admin/me' && method === 'GET') return json({ email: admin.email })

  if (path === '/api/admin/overview' && method === 'GET') {
    const rooms = await liveRooms(env)
    const live = { rooms: rooms.filter((r) => r.players.some((p) => p.connected)).length, players: rooms.reduce((a, r) => a + r.players.filter((p) => p.connected).length, 0) }
    return json(await reports.overview(env, reports.rangeOf(days(url)), live))
  }

  const report = path.match(/^\/api\/admin\/analytics\/(audience|geo|games|content|retention|demographics)$/)
  if (report && method === 'GET') {
    const r = reports.rangeOf(days(url))
    switch (report[1]) {
      case 'audience':
        return json(await reports.audience(env, r))
      case 'geo':
        return json(await reports.geography(env, r))
      case 'games':
        return json(await reports.games(env, r))
      case 'content': {
        const kind = url.searchParams.get('kind')
        return json(await reports.content(env, kind && /^[a-z]{1,20}$/.test(kind) ? kind : null))
      }
      case 'retention':
        return json(await reports.retention(env, r))
      case 'demographics':
        return json(await reports.demographics(env, r))
    }
  }

  if (path === '/api/admin/users' && method === 'GET') return json(await listUsers(env, url))
  const userMatch = path.match(/^\/api\/admin\/users\/([A-Za-z0-9-]{1,60})$/)
  if (userMatch && method === 'GET') {
    const detail = await userDetail(env, userMatch[1]!)
    return detail ? json(detail) : json({ error: 'User not found' }, 404)
  }
  if (userMatch && method === 'POST') return userAction(request, env, admin, userMatch[1]!)

  if (path === '/api/admin/groups' && method === 'GET') return json(await listGroups(env, url))
  const groupMatch = path.match(/^\/api\/admin\/groups\/([A-Za-z0-9-]{1,60})$/)
  if (groupMatch && method === 'GET') {
    const detail = await groupDetail(env, groupMatch[1]!)
    return detail ? json(detail) : json({ error: 'Group not found' }, 404)
  }
  if (groupMatch && method === 'POST') return groupAction(request, env, admin, groupMatch[1]!)

  if (path === '/api/admin/quizzes' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 80)
    const removed = url.searchParams.get('filter') === 'removed'
    const p = page(url)
    const where = `WHERE ${removed ? 'q.removed_at IS NOT NULL' : 'q.removed_at IS NULL'} ${q ? 'AND (LOWER(q.title) LIKE ?1 OR LOWER(u.email) LIKE ?1)' : 'AND ?1 IS NULL'}`
    const param = q ? `%${q}%` : null
    const [list, count] = await env.DB.batch([
      env.DB.prepare(`${QUIZ_SELECT} ${where} ORDER BY q.created_at DESC LIMIT ?2 OFFSET ?3`).bind(param, PAGE_SIZE, (p - 1) * PAGE_SIZE),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM quizzes q JOIN users u ON u.id = q.owner_id ${where}`).bind(param),
    ])
    return json({ rows: (list!.results as unknown as QuizRow[]).map(adminQuizRow), total: num((count!.results[0] as Row).n), page: p, pageSize: PAGE_SIZE })
  }
  const quizMatch = path.match(/^\/api\/admin\/quizzes\/([A-Za-z0-9]{8,16})$/)
  if (quizMatch && method === 'POST') {
    const b = await body(request, QuizActionSchema)
    if (b.error) return b.error
    const quiz = await env.DB.prepare('SELECT title FROM quizzes WHERE id = ?').bind(quizMatch[1]).first<{ title: string }>()
    if (!quiz) return json({ error: 'Quiz not found' }, 404)
    if (b.data.action === 'remove') await env.DB.prepare('UPDATE quizzes SET removed_at = ?, removed_reason = ? WHERE id = ?').bind(Date.now(), b.data.reason || null, quizMatch[1]).run()
    else if (b.data.action === 'restore') await env.DB.prepare('UPDATE quizzes SET removed_at = NULL, removed_reason = NULL WHERE id = ?').bind(quizMatch[1]).run()
    else await env.DB.prepare('DELETE FROM quizzes WHERE id = ?').bind(quizMatch[1]).run()
    await audit(env, admin, `quiz.${b.data.action}`, 'quiz', quizMatch[1]!, { title: quiz.title, ...b.data })
    return json({ ok: true })
  }

  if (path === '/api/admin/rooms' && method === 'GET') return json({ rooms: await liveRooms(env) })
  const roomMatch = path.match(/^\/api\/admin\/rooms\/([A-Z]{4})$/)
  if (roomMatch && method === 'POST') {
    const b = await body(request, RoomActionSchema)
    if (b.error) return b.error
    const stub = roomStub(env, roomMatch[1]!)
    const ok = b.data.action === 'close' ? await stub.adminClose(b.data.message) : await stub.adminKick(b.data.playerId)
    if (!ok) return json({ error: 'That room or player is gone.' }, 404)
    await audit(env, admin, `room.${b.data.action}`, 'room', roomMatch[1]!, b.data)
    return json({ ok: true })
  }

  if (path === '/api/admin/daily' && method === 'GET') return json(await dailyAdmin(env, url))
  if (path === '/api/admin/daily/remove' && method === 'POST') {
    const b = await body(request, DailyRemoveSchema)
    if (b.error) return b.error
    const row = await env.DB.prepare('SELECT name, score FROM daily_scores WHERE day = ? AND room_code = ?').bind(b.data.day, b.data.roomCode).first<{ name: string; score: number }>()
    if (!row) return json({ error: 'Score not found' }, 404)
    await env.DB.prepare('DELETE FROM daily_scores WHERE day = ? AND room_code = ?').bind(b.data.day, b.data.roomCode).run()
    await audit(env, admin, 'daily.remove', 'daily', `${b.data.day}/${b.data.roomCode}`, row)
    return json({ ok: true })
  }

  if (path === '/api/admin/config' && method === 'GET') return json(await siteConfig(env))
  if (path === '/api/admin/config' && method === 'PUT') return saveConfig(request, env, admin)

  if (path === '/api/admin/audit' && method === 'GET') {
    const p = page(url)
    const [list, count] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM admin_actions ORDER BY id DESC LIMIT ? OFFSET ?').bind(PAGE_SIZE * 2, (p - 1) * PAGE_SIZE * 2),
      env.DB.prepare('SELECT COUNT(*) AS n FROM admin_actions'),
    ])
    return json({ rows: (list!.results as Row[]).map(reports.auditRow), total: num((count!.results[0] as Row).n), page: p, pageSize: PAGE_SIZE * 2 })
  }

  const exportMatch = path.match(/^\/api\/admin\/export\/([a-z]+)\.csv$/)
  if (exportMatch && method === 'GET') {
    const res = await exportCsv(env, exportMatch[1]!, url)
    if (res) {
      await audit(env, admin, 'export', 'csv', exportMatch[1]!, null)
      return res
    }
  }

  return json({ error: 'Not found' }, 404)
}
