// Groups: saved friend circles with an admin, invitations, shared history and
// one-click "start a game for the group".
import {
  CreateGroupSchema,
  InviteSchema,
  JoinGroupSchema,
  RoleSchema,
  UpdateGroupSchema,
  type GameRecord,
  type GroupDetail,
  type GroupMember,
  type GroupPreview,
  type GroupSummary,
  type LeaderboardRow,
  type LiveGame,
  type MemberPreview,
  type PendingInvite,
} from '../shared/account'
import { normalizeSettings } from '../shared/protocol'
import { randomToken, type SessionUser } from './auth'
import { json } from './http'
import { allocateRoom, roomStub } from './rooms'

const MAX_GROUPS_PER_USER = 30
const MAX_MEMBERS = 50
const LIVE_STALE_MS = 3 * 60 * 1000

interface GroupRow {
  id: string
  name: string
  owner_id: string
  invite_code: string
  invite_enabled: number
  allow_guests: number
  settings_json: string | null
  active_room: string | null
  active_room_at: number | null
}

type Role = 'admin' | 'member'

function inviteCode(): string {
  return randomToken(9).replace(/[-_]/g, 'x').slice(0, 10)
}

async function body<T>(request: Request, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return { error: json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400) }
  return { data: parsed.data }
}

async function membership(env: Env, groupId: string, userId: string): Promise<{ group: GroupRow; role: Role } | null> {
  const row = await env.DB.prepare(
    `SELECT g.*, m.role AS role FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = ? WHERE g.id = ?`,
  )
    .bind(userId, groupId)
    .first<GroupRow & { role: Role }>()
  if (!row) return null
  return { group: row, role: row.role }
}

export async function isGroupMember(env: Env, groupId: string, userId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT 1 AS ok FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, userId).first()
  return !!row
}

/** Live game info for a group's active room, or null if it has gone quiet. */
async function liveGame(env: Env, group: GroupRow): Promise<LiveGame | null> {
  if (!group.active_room) return null
  const info = await roomStub(env, group.active_room).info()
  if (!info.exists || info.group?.id !== group.id) return null
  const idle = info.players === 0 && Date.now() - (group.active_room_at ?? 0) > LIVE_STALE_MS
  if (idle) return null
  return { code: info.code, phase: info.phase ?? 'lobby', players: info.players }
}

async function memberPreviews(env: Env, groupIds: string[]): Promise<Map<string, MemberPreview[]>> {
  const map = new Map<string, MemberPreview[]>()
  if (groupIds.length === 0) return map
  const placeholders = groupIds.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT m.group_id, u.name, u.picture FROM group_members m JOIN users u ON u.id = m.user_id
     WHERE m.group_id IN (${placeholders}) ORDER BY m.joined_at`,
  )
    .bind(...groupIds)
    .all<{ group_id: string; name: string; picture: string | null }>()
  for (const r of results) {
    const list = map.get(r.group_id) ?? []
    list.push({ name: r.name, picture: r.picture })
    map.set(r.group_id, list)
  }
  return map
}

async function listGroups(env: Env, user: SessionUser): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT g.*, m.role AS role FROM groups g JOIN group_members m ON m.group_id = g.id
     WHERE m.user_id = ? ORDER BY COALESCE(g.active_room_at, g.created_at) DESC`,
  )
    .bind(user.id)
    .all<GroupRow & { role: Role }>()
  const previews = await memberPreviews(env, results.map((g) => g.id))
  const groups: GroupSummary[] = await Promise.all(
    results.map(async (g) => {
      const members = previews.get(g.id) ?? []
      return { id: g.id, name: g.name, role: g.role, memberCount: members.length, members: members.slice(0, 6), live: await liveGame(env, g) }
    }),
  )

  const { results: invites } = await env.DB.prepare(
    `SELECT i.id, i.group_id, g.name AS group_name, u.name AS invited_by, i.created_at FROM group_invites i
     JOIN groups g ON g.id = i.group_id JOIN users u ON u.id = i.invited_by
     WHERE i.email = ? AND NOT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = i.group_id AND m.user_id = ?)
     ORDER BY i.created_at DESC`,
  )
    .bind(user.email, user.id)
    .all<{ id: string; group_id: string; group_name: string; invited_by: string; created_at: number }>()

  return json({
    groups,
    invites: invites.map((i) => ({ id: i.id, groupId: i.group_id, groupName: i.group_name, invitedBy: i.invited_by, createdAt: i.created_at }) satisfies PendingInvite),
  })
}

async function groupDetail(env: Env, user: SessionUser, groupId: string): Promise<Response> {
  const m = await membership(env, groupId, user.id)
  if (!m) return json({ error: 'Group not found' }, 404)
  const { group, role } = m

  const [membersRes, invitesRes, boardRes, gamesRes] = await env.DB.batch([
    env.DB.prepare(
      `SELECT u.id AS user_id, u.name, u.email, u.picture, m.role, m.joined_at FROM group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = ? ORDER BY m.role = 'admin' DESC, m.joined_at`,
    ).bind(groupId),
    env.DB.prepare('SELECT id, email, created_at FROM group_invites WHERE group_id = ? ORDER BY created_at DESC').bind(groupId),
    env.DB.prepare(
      `SELECT gp.user_id, u.name, u.picture, COUNT(*) AS games, SUM(CASE WHEN gp.rank = 1 THEN 1 ELSE 0 END) AS wins,
              SUM(gp.score) AS points, SUM(gp.correct) AS correct
       FROM game_players gp JOIN games g ON g.id = gp.game_id JOIN users u ON u.id = gp.user_id
       WHERE g.group_id = ? GROUP BY gp.user_id ORDER BY wins DESC, points DESC LIMIT 50`,
    ).bind(groupId),
    env.DB.prepare('SELECT id, played_at, source_title, rounds FROM games WHERE group_id = ? ORDER BY played_at DESC LIMIT 10').bind(groupId),
  ])

  const games = (gamesRes!.results as { id: string; played_at: number; source_title: string; rounds: number }[]) ?? []
  const gamePlayers = new Map<string, GameRecord['players']>()
  if (games.length) {
    const { results } = await env.DB.prepare(
      `SELECT game_id, user_id, name, score, correct, rank FROM game_players WHERE game_id IN (${games.map(() => '?').join(',')}) ORDER BY rank`,
    )
      .bind(...games.map((g) => g.id))
      .all<{ game_id: string; user_id: string | null; name: string; score: number; correct: number; rank: number }>()
    for (const r of results) {
      const list = gamePlayers.get(r.game_id) ?? []
      list.push({ name: r.name, userId: r.user_id, score: r.score, correct: r.correct, rank: r.rank })
      gamePlayers.set(r.game_id, list)
    }
  }

  const detail: GroupDetail = {
    id: group.id,
    name: group.name,
    role,
    ownerId: group.owner_id,
    inviteCode: role === 'admin' ? group.invite_code : group.invite_enabled ? group.invite_code : null,
    inviteEnabled: !!group.invite_enabled,
    allowGuests: !!group.allow_guests,
    members: (membersRes!.results as { user_id: string; name: string; email: string; picture: string | null; role: Role; joined_at: number }[]).map(
      (r): GroupMember => ({
        userId: r.user_id,
        name: r.name,
        email: role === 'admin' || r.user_id === user.id ? r.email : '',
        picture: r.picture,
        role: r.role,
        joinedAt: r.joined_at,
        isOwner: r.user_id === group.owner_id,
      }),
    ),
    invites:
      role === 'admin'
        ? (invitesRes!.results as { id: string; email: string; created_at: number }[]).map((i) => ({ id: i.id, email: i.email, createdAt: i.created_at }))
        : [],
    live: await liveGame(env, group),
    leaderboard: (boardRes!.results as { user_id: string; name: string; picture: string | null; games: number; wins: number; points: number; correct: number }[]).map(
      (r): LeaderboardRow => ({ userId: r.user_id, name: r.name, picture: r.picture, games: r.games, wins: r.wins, points: r.points, correct: r.correct }),
    ),
    recent: games.map((g) => ({ id: g.id, playedAt: g.played_at, sourceTitle: g.source_title, rounds: g.rounds, players: gamePlayers.get(g.id) ?? [] })),
    settings: group.settings_json ? normalizeSettings(JSON.parse(group.settings_json)) : null,
  }
  return json(detail)
}

async function addMember(env: Env, groupId: string, userId: string, role: Role): Promise<'ok' | 'full'> {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?').bind(groupId).first<{ n: number }>()
  if ((count?.n ?? 0) >= MAX_MEMBERS) return 'full'
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').bind(groupId, userId, role, Date.now()),
    env.DB.prepare('DELETE FROM group_invites WHERE group_id = ? AND email = (SELECT email FROM users WHERE id = ?)').bind(groupId, userId),
  ])
  return 'ok'
}

/** Remove a member; keep at least one admin, and delete the group when it empties. */
async function removeMember(env: Env, group: GroupRow, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(group.id, userId).run()
  const remaining = await env.DB.prepare('SELECT user_id, role FROM group_members WHERE group_id = ? ORDER BY joined_at')
    .bind(group.id)
    .all<{ user_id: string; role: Role }>()
  if (remaining.results.length === 0) {
    await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(group.id).run()
    return
  }
  if (!remaining.results.some((r) => r.role === 'admin')) {
    await env.DB.prepare("UPDATE group_members SET role = 'admin' WHERE group_id = ? AND user_id = ?").bind(group.id, remaining.results[0]!.user_id).run()
  }
  if (group.owner_id === userId) {
    const nextOwner = remaining.results.find((r) => r.role === 'admin') ?? remaining.results[0]!
    await env.DB.prepare('UPDATE groups SET owner_id = ? WHERE id = ?').bind(nextOwner.user_id, group.id).run()
  }
}

export async function handleGroups(request: Request, env: Env, url: URL, user: SessionUser | null): Promise<Response | null> {
  const path = url.pathname
  const method = request.method
  if (!path.startsWith('/api/groups') && !path.startsWith('/api/invites')) return null

  // Public: preview a group from its invite code (to show "Join <name>").
  const byCode = path.match(/^\/api\/groups\/by-code\/([A-Za-z0-9]{6,16})$/)
  if (byCode && method === 'GET') {
    const g = await env.DB.prepare('SELECT * FROM groups WHERE invite_code = ? AND invite_enabled = 1').bind(byCode[1]).first<GroupRow>()
    if (!g) return json({ error: 'This invite link is invalid or has been turned off.' }, 404)
    const members = (await memberPreviews(env, [g.id])).get(g.id) ?? []
    const preview: GroupPreview = {
      id: g.id,
      name: g.name,
      memberCount: members.length,
      members: members.slice(0, 6),
      isMember: user ? await isGroupMember(env, g.id, user.id) : false,
    }
    return json(preview)
  }

  if (!user) return json({ error: 'Please sign in first.' }, 401)

  if (path === '/api/groups' && method === 'GET') return listGroups(env, user)

  if (path === '/api/groups' && method === 'POST') {
    const b = await body(request, CreateGroupSchema)
    if (b.error) return b.error
    const owned = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?').bind(user.id).first<{ n: number }>()
    if ((owned?.n ?? 0) >= MAX_GROUPS_PER_USER) return json({ error: `You can be in at most ${MAX_GROUPS_PER_USER} groups.` }, 400)
    const id = crypto.randomUUID()
    const now = Date.now()
    await env.DB.batch([
      env.DB.prepare('INSERT INTO groups (id, name, owner_id, invite_code, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, b.data.name, user.id, inviteCode(), now),
      env.DB.prepare("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'admin', ?)").bind(id, user.id, now),
    ])
    return json({ id }, 201)
  }

  if (path === '/api/groups/join' && method === 'POST') {
    const b = await body(request, JoinGroupSchema)
    if (b.error) return b.error
    const g = await env.DB.prepare('SELECT * FROM groups WHERE invite_code = ? AND invite_enabled = 1').bind(b.data.code).first<GroupRow>()
    if (!g) return json({ error: 'This invite link is invalid or has been turned off.' }, 404)
    if ((await addMember(env, g.id, user.id, 'member')) === 'full') return json({ error: 'This group is full.' }, 400)
    return json({ id: g.id })
  }

  const invite = path.match(/^\/api\/invites\/([0-9a-f-]{36})\/(accept|decline)$/)
  if (invite && method === 'POST') {
    const row = await env.DB.prepare('SELECT * FROM group_invites WHERE id = ? AND email = ?').bind(invite[1], user.email).first<{ id: string; group_id: string }>()
    if (!row) return json({ error: 'Invitation not found' }, 404)
    if (invite[2] === 'accept') {
      if ((await addMember(env, row.group_id, user.id, 'member')) === 'full') return json({ error: 'This group is full.' }, 400)
      return json({ id: row.group_id })
    }
    await env.DB.prepare('DELETE FROM group_invites WHERE id = ?').bind(row.id).run()
    return json({ ok: true })
  }

  const m = path.match(/^\/api\/groups\/([0-9a-f-]{36})(\/.*)?$/)
  if (!m) return json({ error: 'Not found' }, 404)
  const groupId = m[1]!
  const sub = m[2] ?? ''

  if (sub === '' && method === 'GET') return groupDetail(env, user, groupId)

  const mine = await membership(env, groupId, user.id)
  if (!mine) return json({ error: 'Group not found' }, 404)
  const { group, role } = mine
  const isAdmin = role === 'admin'
  const adminOnly = () => json({ error: 'Only group admins can do that.' }, 403)

  // Any member can start (or rejoin) the group's game.
  if (sub === '/play' && method === 'POST') {
    const live = await liveGame(env, group)
    if (live) return json({ code: live.code, existing: true })
    const code = await allocateRoom(env, {
      group: { id: group.id, name: group.name },
      allowGuests: !!group.allow_guests,
      hostUserId: user.id,
      settings: group.settings_json ? normalizeSettings(JSON.parse(group.settings_json)) : null,
    })
    if (!code) return json({ error: 'Could not create a room. Try again.' }, 503)
    await env.DB.prepare('UPDATE groups SET active_room = ?, active_room_at = ? WHERE id = ?').bind(code, Date.now(), group.id).run()
    return json({ code, existing: false }, 201)
  }

  if (sub === '' && method === 'PATCH') {
    if (!isAdmin) return adminOnly()
    const b = await body(request, UpdateGroupSchema)
    if (b.error) return b.error
    const d = b.data
    await env.DB.prepare(
      `UPDATE groups SET name = COALESCE(?, name), allow_guests = COALESCE(?, allow_guests), invite_enabled = COALESCE(?, invite_enabled) WHERE id = ?`,
    )
      .bind(d.name ?? null, d.allowGuests === undefined ? null : d.allowGuests ? 1 : 0, d.inviteEnabled === undefined ? null : d.inviteEnabled ? 1 : 0, groupId)
      .run()
    return json({ ok: true })
  }

  if (sub === '' && method === 'DELETE') {
    if (!isAdmin) return adminOnly()
    await env.DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run()
    return json({ ok: true })
  }

  if (sub === '/invite-code' && method === 'POST') {
    if (!isAdmin) return adminOnly()
    const code = inviteCode()
    await env.DB.prepare('UPDATE groups SET invite_code = ?, invite_enabled = 1 WHERE id = ?').bind(code, groupId).run()
    return json({ inviteCode: code })
  }

  if (sub === '/invites' && method === 'POST') {
    if (!isAdmin) return adminOnly()
    const b = await body(request, InviteSchema)
    if (b.error) return b.error
    const already = await env.DB.prepare(
      'SELECT 1 AS ok FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? AND u.email = ?',
    )
      .bind(groupId, b.data.email)
      .first()
    if (already) return json({ error: 'That person is already in the group.' }, 400)
    const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM group_invites WHERE group_id = ?').bind(groupId).first<{ n: number }>()
    if ((pending?.n ?? 0) >= 100) return json({ error: 'Too many pending invitations.' }, 400)
    await env.DB.prepare('INSERT OR IGNORE INTO group_invites (id, group_id, email, invited_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), groupId, b.data.email, user.id, Date.now())
      .run()
    return json({ ok: true }, 201)
  }

  const inv = sub.match(/^\/invites\/([0-9a-f-]{36})$/)
  if (inv && method === 'DELETE') {
    if (!isAdmin) return adminOnly()
    await env.DB.prepare('DELETE FROM group_invites WHERE id = ? AND group_id = ?').bind(inv[1], groupId).run()
    return json({ ok: true })
  }

  const member = sub.match(/^\/members\/([0-9a-f-]{36})$/)
  if (member) {
    const targetId = member[1]!
    const target = await env.DB.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, targetId).first<{ role: Role }>()
    if (!target) return json({ error: 'Member not found' }, 404)

    if (method === 'PATCH') {
      if (!isAdmin) return adminOnly()
      const b = await body(request, RoleSchema)
      if (b.error) return b.error
      if (b.data.role === 'member' && target.role === 'admin') {
        const admins = await env.DB.prepare("SELECT COUNT(*) AS n FROM group_members WHERE group_id = ? AND role = 'admin'").bind(groupId).first<{ n: number }>()
        if ((admins?.n ?? 0) <= 1) return json({ error: 'A group needs at least one admin.' }, 400)
      }
      await env.DB.prepare('UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?').bind(b.data.role, groupId, targetId).run()
      return json({ ok: true })
    }

    if (method === 'DELETE') {
      if (targetId !== user.id && !isAdmin) return adminOnly()
      await removeMember(env, group, targetId)
      return json({ ok: true })
    }
  }

  return json({ error: 'Not found' }, 404)
}
