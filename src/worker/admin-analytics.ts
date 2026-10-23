// Read-only reports for the admin console. Each report is one D1 batch.
import {
  istDay,
  type AudienceReport,
  type ContentReport,
  type GamesReport,
  type GeoReport,
  type ItemRow,
  type Overview,
  type Ranked,
  type RetentionReport,
  type Stat,
} from '../shared/admin'
import { findPreset } from '../shared/catalog'
import { dailyNumber } from '../shared/daily'

const IST_MS = 19_800_000
const DAY_MS = 86_400_000

export interface Range {
  from: number
  to: number
  prevFrom: number
  prevTo: number
  days: number
}

export function rangeOf(days: number): Range {
  const to = istDay()
  const from = to - days + 1
  return { from, to, prevFrom: from - days, prevTo: from - 1, days }
}

type Row = Record<string, unknown>
const rows = (r: D1Result | undefined): Row[] => (r?.results ?? []) as Row[]
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const first = (r: D1Result | undefined): Row => rows(r)[0] ?? {}

function ranked(r: D1Result | undefined, label = (v: unknown) => String(v ?? 'Unknown')): Ranked[] {
  return rows(r).map((x) => ({ label: label(x.label), value: num(x.value), ...(x.extra !== undefined ? { extra: x.extra === null ? null : num(x.extra) } : {}) }))
}

function stat(r: D1Result | undefined): Stat {
  const x = first(r)
  return { value: num(x.cur), previous: x.prev === undefined ? null : num(x.prev) }
}

/** 7×24 grid (Sunday first, IST hours) from rows of {dow, hour, value}. */
function heat(r: D1Result | undefined): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0))
  for (const x of rows(r)) {
    const d = num(x.dow)
    const h = num(x.hour)
    if (grid[d] && h >= 0 && h < 24) grid[d]![h] = num(x.value)
  }
  return grid
}

/** SQL for the IST weekday (0 = Sunday) and hour of a millisecond timestamp column. */
const DOW = (col: string) => `((${col} + ${IST_MS}) / ${DAY_MS} + 4) % 7`
const HOUR = (col: string) => `((${col} + ${IST_MS}) % ${DAY_MS}) / 3600000`

const presetName = (v: unknown) => findPreset(String(v))?.name ?? String(v ?? 'Unknown')

const MODE_LABEL: Record<string, string> = { party: 'Party room', solo: 'Solo', group: 'Group', daily: 'Daily challenge' }
const KIND_LABEL: Record<string, string> = { songs: 'Songs', dialogue: 'Dialogue Baazi', actor: 'Star Spotting', emoji: 'Emoji Gaana' }
const SOURCE_LABEL: Record<string, string> = {
  preset: 'Preset mix',
  artist: 'Artist',
  search: 'Search',
  playlist: 'Playlist link',
  blend: 'Spotify Blend',
  challenge: 'Challenge',
  unknown: 'Unknown (older games)',
}

// ---------------------------------------------------------------------------

export async function overview(env: Env, r: Range, live: { rooms: number; players: number }): Promise<Overview> {
  const db = env.DB
  const msFrom = r.from * DAY_MS - IST_MS
  const msPrevFrom = r.prevFrom * DAY_MS - IST_MS
  const [totals, visitors, active, newUsers, games, players, rooms, daily, signups, dailyGames, recentUsers, recentActions] = await db.batch([
    db.prepare(
      `SELECT (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users, (SELECT COUNT(*) FROM groups) AS groups,
              (SELECT COUNT(*) FROM game_events) AS games, (SELECT COUNT(*) FROM visitors) AS visitors,
              (SELECT COUNT(*) FROM users WHERE banned_at IS NOT NULL) AS banned, (SELECT COUNT(*) FROM users WHERE deleted_at IS NOT NULL) AS deleted`,
    ),
    db.prepare(
      `SELECT (SELECT COUNT(DISTINCT visitor) FROM visits WHERE day BETWEEN ?1 AND ?2) AS cur, (SELECT COUNT(DISTINCT visitor) FROM visits WHERE day BETWEEN ?3 AND ?4) AS prev`,
    ).bind(r.from, r.to, r.prevFrom, r.prevTo),
    db.prepare(
      `SELECT (SELECT COUNT(DISTINCT user_id) FROM visits WHERE day BETWEEN ?1 AND ?2 AND user_id IS NOT NULL) AS cur,
              (SELECT COUNT(DISTINCT user_id) FROM visits WHERE day BETWEEN ?3 AND ?4 AND user_id IS NOT NULL) AS prev`,
    ).bind(r.from, r.to, r.prevFrom, r.prevTo),
    db.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE created_at >= ?1) AS cur, (SELECT COUNT(*) FROM users WHERE created_at >= ?2 AND created_at < ?1) AS prev`).bind(
      msFrom,
      msPrevFrom,
    ),
    db.prepare(`SELECT (SELECT COUNT(*) FROM game_events WHERE day BETWEEN ?1 AND ?2) AS cur, (SELECT COUNT(*) FROM game_events WHERE day BETWEEN ?3 AND ?4) AS prev`).bind(
      r.from,
      r.to,
      r.prevFrom,
      r.prevTo,
    ),
    db.prepare(
      `SELECT (SELECT COALESCE(SUM(players), 0) FROM game_events WHERE day BETWEEN ?1 AND ?2) AS cur, (SELECT COALESCE(SUM(players), 0) FROM game_events WHERE day BETWEEN ?3 AND ?4) AS prev`,
    ).bind(r.from, r.to, r.prevFrom, r.prevTo),
    db.prepare(`SELECT (SELECT COUNT(*) FROM rooms_log WHERE created_at >= ?1) AS cur, (SELECT COUNT(*) FROM rooms_log WHERE created_at >= ?2 AND created_at < ?1) AS prev`).bind(
      msFrom,
      msPrevFrom,
    ),
    db.prepare('SELECT day, COUNT(*) AS n FROM visits WHERE day BETWEEN ? AND ? GROUP BY day').bind(r.from, r.to),
    db.prepare(`SELECT (created_at + ${IST_MS}) / ${DAY_MS} AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day`).bind(msFrom),
    db.prepare('SELECT day, COUNT(*) AS n FROM game_events WHERE day BETWEEN ? AND ? GROUP BY day').bind(r.from, r.to),
    db.prepare(
      `SELECT id, name, email, picture, created_at, last_login, last_seen, country, city, banned_at, deleted_at,
              (SELECT COUNT(*) FROM game_participants p WHERE p.user_id = users.id) AS games,
              (SELECT COUNT(*) FROM group_members m WHERE m.user_id = users.id) AS groups
       FROM users ORDER BY created_at DESC LIMIT 6`,
    ),
    db.prepare('SELECT * FROM admin_actions ORDER BY id DESC LIMIT 8'),
  ])
  const t = first(totals)
  const byDay = (res: D1Result | undefined) => new Map(rows(res).map((x) => [num(x.day), num(x.n)]))
  const v = byDay(daily)
  const s = byDay(signups)
  const g = byDay(dailyGames)
  return {
    totals: { users: num(t.users), groups: num(t.groups), games: num(t.games), visitors: num(t.visitors), banned: num(t.banned), deleted: num(t.deleted) },
    period: { visitors: stat(visitors), activeUsers: stat(active), newUsers: stat(newUsers), games: stat(games), players: stat(players), rooms: stat(rooms) },
    daily: Array.from({ length: r.days }, (_, i) => {
      const day = r.from + i
      return { day, visitors: v.get(day) ?? 0, games: g.get(day) ?? 0, signups: s.get(day) ?? 0 }
    }),
    live,
    recentUsers: rows(recentUsers).map((x) => userRow(x)),
    recentActions: rows(recentActions).map(auditRow),
  }
}

export function userRow(x: Row, admins: string[] = []): Overview['recentUsers'][number] {
  return {
    id: String(x.id),
    name: String(x.name),
    email: String(x.email),
    picture: (x.picture as string | null) ?? null,
    createdAt: num(x.created_at),
    lastLogin: num(x.last_login),
    lastSeen: x.last_seen == null ? null : num(x.last_seen),
    country: (x.country as string | null) ?? null,
    city: (x.city as string | null) ?? null,
    games: num(x.games),
    groups: num(x.groups),
    bannedAt: x.banned_at == null ? null : num(x.banned_at),
    deletedAt: x.deleted_at == null ? null : num(x.deleted_at),
    isAdmin: admins.includes(String(x.email).toLowerCase()),
  }
}

export function auditRow(x: Row): Overview['recentActions'][number] {
  return {
    id: num(x.id),
    adminEmail: String(x.admin_email),
    action: String(x.action),
    targetType: (x.target_type as string | null) ?? null,
    targetId: (x.target_id as string | null) ?? null,
    detail: (x.detail as string | null) ?? null,
    createdAt: num(x.created_at),
  }
}

// ---------------------------------------------------------------------------

export async function audience(env: Env, r: Range): Promise<AudienceReport> {
  const db = env.DB
  const today = istDay()
  const [byDay, newByDay, devices, os, browsers, referrers, pages, hours, dau, wau, mau, returning] = await db.batch([
    db.prepare('SELECT day, COUNT(*) AS visitors, SUM(views) AS views, SUM(user_id IS NOT NULL) AS signed FROM visits WHERE day BETWEEN ? AND ? GROUP BY day').bind(r.from, r.to),
    db.prepare('SELECT first_day AS day, COUNT(*) AS n FROM visitors WHERE first_day BETWEEN ? AND ? GROUP BY first_day').bind(r.from, r.to),
    db.prepare('SELECT device AS label, COUNT(DISTINCT visitor) AS value FROM visits WHERE day BETWEEN ? AND ? GROUP BY device ORDER BY value DESC').bind(r.from, r.to),
    db.prepare('SELECT os AS label, COUNT(DISTINCT visitor) AS value FROM visits WHERE day BETWEEN ? AND ? GROUP BY os ORDER BY value DESC LIMIT 8').bind(r.from, r.to),
    db.prepare('SELECT browser AS label, COUNT(DISTINCT visitor) AS value FROM visits WHERE day BETWEEN ? AND ? GROUP BY browser ORDER BY value DESC LIMIT 8').bind(r.from, r.to),
    db.prepare("SELECT COALESCE(referrer, 'Direct / app') AS label, COUNT(*) AS value FROM visits WHERE day BETWEEN ? AND ? GROUP BY label ORDER BY value DESC LIMIT 12").bind(
      r.from,
      r.to,
    ),
    db.prepare('SELECT path AS label, SUM(views) AS value FROM page_views WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY value DESC LIMIT 12').bind(r.from, r.to),
    db.prepare(`SELECT ${DOW('first_at')} AS dow, ${HOUR('first_at')} AS hour, COUNT(*) AS value FROM visits WHERE day BETWEEN ? AND ? GROUP BY dow, hour`).bind(r.from, r.to),
    db.prepare('SELECT COALESCE(AVG(n), 0) AS n FROM (SELECT COUNT(*) AS n FROM visits WHERE day BETWEEN ? AND ? GROUP BY day)').bind(r.from, r.to),
    db.prepare('SELECT COUNT(DISTINCT visitor) AS n FROM visits WHERE day > ?').bind(today - 7),
    db.prepare('SELECT COUNT(DISTINCT visitor) AS n FROM visits WHERE day > ?').bind(today - 30),
    db.prepare('SELECT COALESCE(AVG(v.day > vs.first_day), 0) AS n FROM visits v JOIN visitors vs ON vs.id = v.visitor WHERE v.day BETWEEN ? AND ?').bind(r.from, r.to),
  ])
  const d = new Map(rows(byDay).map((x) => [num(x.day), x]))
  const nv = new Map(rows(newByDay).map((x) => [num(x.day), num(x.n)]))
  const cap = (s: unknown) => {
    const str = String(s ?? 'unknown')
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
  return {
    visitorsByDay: Array.from({ length: r.days }, (_, i) => {
      const day = r.from + i
      const x = d.get(day)
      return { day, visitors: num(x?.visitors), newVisitors: nv.get(day) ?? 0, signedIn: num(x?.signed), views: num(x?.views) }
    }),
    devices: ranked(devices, cap),
    os: ranked(os),
    browsers: ranked(browsers),
    referrers: ranked(referrers),
    pages: ranked(pages),
    hours: heat(hours),
    stickiness: { dau: Math.round(num(first(dau).n)), wau: num(first(wau).n), mau: num(first(mau).n) },
    returningShare: num(first(returning).n),
  }
}

// ---------------------------------------------------------------------------

export async function geography(env: Env, r: Range): Promise<GeoReport> {
  const db = env.DB
  const [countries, players, regions, cities, modes] = await db.batch([
    db.prepare("SELECT COALESCE(country, '??') AS label, COUNT(DISTINCT visitor) AS value FROM visits WHERE day BETWEEN ? AND ? GROUP BY label ORDER BY value DESC LIMIT 30").bind(
      r.from,
      r.to,
    ),
    db.prepare(
      `SELECT COALESCE(p.country, '??') AS label, COUNT(*) AS players, COUNT(DISTINCT p.game_id) AS games
       FROM game_participants p JOIN game_events g ON g.id = p.game_id WHERE g.day BETWEEN ? AND ? GROUP BY label`,
    ).bind(r.from, r.to),
    db.prepare(
      `SELECT region AS label, country, COUNT(DISTINCT visitor) AS value FROM visits WHERE day BETWEEN ? AND ? AND region IS NOT NULL
       GROUP BY country, region ORDER BY value DESC LIMIT 20`,
    ).bind(r.from, r.to),
    db.prepare(
      `SELECT city AS label, country, COUNT(DISTINCT visitor) AS value FROM visits WHERE day BETWEEN ? AND ? AND city IS NOT NULL
       GROUP BY country, city ORDER BY value DESC LIMIT 20`,
    ).bind(r.from, r.to),
    db.prepare(
      `SELECT COALESCE(p.country, '??') AS cc, g.kind AS label, COUNT(*) AS value
       FROM game_participants p JOIN game_events g ON g.id = p.game_id WHERE g.day BETWEEN ? AND ? GROUP BY cc, g.kind`,
    ).bind(r.from, r.to),
  ])
  const play = new Map(rows(players).map((x) => [String(x.label), { players: num(x.players), games: num(x.games) }]))
  const list = rows(countries).map((x) => ({ code: String(x.label), label: String(x.label), value: num(x.value), ...(play.get(String(x.label)) ?? { players: 0, games: 0 }) }))
  // Countries where people only played (no page-view beacon, e.g. tracking blocked) still count.
  for (const [code, p] of play) if (!list.some((c) => c.code === code)) list.push({ code, label: code, value: 0, ...p })
  list.sort((a, b) => b.value + b.players - (a.value + a.players))
  const byCountry = new Map<string, Ranked[]>()
  for (const x of rows(modes)) {
    const arr = byCountry.get(String(x.cc)) ?? []
    arr.push({ label: KIND_LABEL[String(x.label)] ?? String(x.label), value: num(x.value) })
    byCountry.set(String(x.cc), arr)
  }
  return {
    countries: list.slice(0, 30),
    regions: rows(regions).map((x) => ({ label: String(x.label), value: num(x.value), country: String(x.country ?? '') })),
    cities: rows(cities).map((x) => ({ label: String(x.label), value: num(x.value), country: String(x.country ?? '') })),
    countryModes: list.slice(0, 6).map((c) => ({ code: c.code, modes: (byCountry.get(c.code) ?? []).sort((a, b) => b.value - a.value) })),
  }
}

// ---------------------------------------------------------------------------

export async function games(env: Env, r: Range): Promise<GamesReport> {
  const db = env.DB
  const where = 'WHERE day BETWEEN ?1 AND ?2'
  const by = (col: string, extra = '') =>
    db.prepare(`SELECT ${col} AS label, COUNT(*) AS value${extra} FROM game_events ${where} AND ${col} IS NOT NULL GROUP BY ${col} ORDER BY value DESC LIMIT 15`).bind(r.from, r.to)
  const [byDay, modes, kinds, sources, presets, difficulty, rounds, guess, answers, regions, counts, summary, hours, features] = await db.batch([
    db.prepare(`SELECT day, kind, COUNT(*) AS n FROM game_events ${where} GROUP BY day, kind`).bind(r.from, r.to),
    by('mode', ', AVG(players) AS extra'),
    by('kind', ', AVG(accuracy) * 100 AS extra'),
    by('source_kind'),
    db.prepare(`SELECT source_label AS label, COUNT(*) AS value, SUM(players) AS extra FROM game_events ${where} AND source_kind = 'preset' GROUP BY source_label ORDER BY value DESC LIMIT 15`).bind(
      r.from,
      r.to,
    ),
    by('difficulty'),
    by('rounds'),
    by('guess_seconds'),
    by('answer_type'),
    by('region'),
    db.prepare(
      `SELECT CASE WHEN players <= 1 THEN '1 (solo)' WHEN players = 2 THEN '2' WHEN players <= 4 THEN '3–4' WHEN players <= 8 THEN '5–8' ELSE '9+' END AS label,
              COUNT(*) AS value, MIN(players) AS ord FROM game_events ${where} GROUP BY label ORDER BY ord`,
    ).bind(r.from, r.to),
    db.prepare(
      `SELECT COALESCE(AVG(completed), 0) AS completion, COALESCE(AVG(players), 0) AS players, COALESCE(AVG(accuracy), 0) AS accuracy,
              COALESCE(AVG(CASE WHEN ended_at > started_at THEN (ended_at - started_at) / 60000.0 END), 0) AS minutes,
              COALESCE(SUM(chats > 0), 0) AS chat, COALESCE(SUM(voice_users > 0), 0) AS voice, COALESCE(SUM(reactions > 0), 0) AS react, COUNT(*) AS total
       FROM game_events ${where}`,
    ).bind(r.from, r.to),
    db.prepare(`SELECT ${DOW('started_at')} AS dow, ${HOUR('started_at')} AS hour, COUNT(*) AS value FROM game_events ${where} GROUP BY dow, hour`).bind(r.from, r.to),
    db.prepare('SELECT name AS label, SUM(count) AS value FROM feature_usage WHERE day BETWEEN ?1 AND ?2 GROUP BY name ORDER BY value DESC').bind(r.from, r.to),
  ])
  const perDay = new Map<number, GamesReport['gamesByDay'][number]>()
  for (let i = 0; i < r.days; i++) perDay.set(r.from + i, { day: r.from + i, songs: 0, dialogue: 0, actor: 0, emoji: 0 })
  for (const x of rows(byDay)) {
    const row = perDay.get(num(x.day))
    const k = String(x.kind) as 'songs'
    if (row && k in row) row[k] = num(x.n)
  }
  const s = first(summary)
  const label = (map: Record<string, string>) => (v: unknown) => map[String(v)] ?? String(v ?? 'Unknown')
  return {
    gamesByDay: [...perDay.values()],
    modes: ranked(modes, label(MODE_LABEL)),
    kinds: ranked(kinds, label(KIND_LABEL)),
    sources: ranked(sources, label(SOURCE_LABEL)),
    presets: ranked(presets, presetName),
    difficulty: ranked(difficulty, (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1)),
    rounds: ranked(rounds, (v) => `${v} rounds`),
    guessSeconds: ranked(guess, (v) => `${v}s to answer`),
    answerTypes: ranked(answers, label({ title: 'Song title', artist: 'Artist', mixed: 'Mixed' })),
    regions: ranked(regions, (v) => String(v).toUpperCase()),
    playerCounts: ranked(counts),
    completion: num(s.completion),
    avgPlayers: num(s.players),
    avgAccuracy: num(s.accuracy),
    avgMinutes: num(s.minutes),
    social: { chatGames: num(s.chat), voiceGames: num(s.voice), reactionGames: num(s.react), total: num(s.total) },
    hours: heat(hours),
    features: ranked(features),
  }
}

// ---------------------------------------------------------------------------

function itemRow(x: Row): ItemRow {
  const answers = num(x.answers)
  return {
    key: String(x.key),
    kind: String(x.kind),
    title: String(x.title),
    subtitle: String(x.subtitle),
    plays: num(x.plays),
    answers,
    accuracy: answers ? num(x.correct) / answers : 0,
    avgSeconds: answers ? num(x.total_ms) / answers / 1000 : 0,
  }
}

export async function content(env: Env, kind: string | null): Promise<ContentReport> {
  const db = env.DB
  const filter = kind ? 'AND kind = ?1' : "AND ?1 IS NULL"
  const [most, hardest, easiest, artists, kinds] = await db.batch([
    db.prepare(`SELECT * FROM item_stats WHERE 1 = 1 ${filter} ORDER BY plays DESC LIMIT 25`).bind(kind),
    db.prepare(`SELECT * FROM item_stats WHERE answers >= 5 ${filter} ORDER BY CAST(correct AS REAL) / answers ASC, plays DESC LIMIT 15`).bind(kind),
    db.prepare(`SELECT * FROM item_stats WHERE answers >= 5 ${filter} ORDER BY CAST(correct AS REAL) / answers DESC, plays DESC LIMIT 15`).bind(kind),
    db.prepare(
      "SELECT subtitle AS label, SUM(plays) AS value, CAST(SUM(correct) AS REAL) * 100 / MAX(SUM(answers), 1) AS extra FROM item_stats WHERE kind = 'song' GROUP BY subtitle ORDER BY value DESC LIMIT 15",
    ),
    db.prepare('SELECT kind, SUM(plays) AS plays, CAST(SUM(correct) AS REAL) / MAX(SUM(answers), 1) AS accuracy FROM item_stats GROUP BY kind ORDER BY plays DESC'),
  ])
  return {
    mostPlayed: rows(most).map(itemRow),
    hardest: rows(hardest).map(itemRow),
    easiest: rows(easiest).map(itemRow),
    artists: ranked(artists),
    kinds: rows(kinds).map((x) => ({ kind: String(x.kind), plays: num(x.plays), accuracy: num(x.accuracy) })),
  }
}

// ---------------------------------------------------------------------------

const WEEK = (dayExpr: string) => `((${dayExpr}) + 3) / 7`
const COHORT_WEEKS = 8

function cohorts(res: D1Result | undefined, sizes: Map<number, number>, thisWeek: number): RetentionReport['cohorts'] {
  const grid = new Map<number, number[]>()
  for (let w = thisWeek - COHORT_WEEKS + 1; w <= thisWeek; w++) grid.set(w, Array<number>(thisWeek - w + 1).fill(0))
  for (const x of rows(res)) {
    const arr = grid.get(num(x.cw))
    const off = num(x.off)
    if (arr && off >= 0 && off < arr.length) arr[off] = num(x.n)
  }
  return [...grid.entries()].map(([week, counts]) => {
    const size = sizes.get(week) ?? counts[0] ?? 0
    return { week, size, weeks: counts.map((c) => (size ? c / size : 0)) }
  })
}

export async function retention(env: Env, r: Range): Promise<RetentionReport> {
  const db = env.DB
  const today = istDay()
  const thisWeek = Math.floor((today + 3) / 7)
  const firstWeekDay = (thisWeek - COHORT_WEEKS + 1) * 7 - 3
  const userDay = `(u.created_at + ${IST_MS}) / ${DAY_MS}`
  const daily = dailyNumber()
  const [visitorCohorts, visitorSizes, userCohorts, userSizes, top, dailyRows] = await db.batch([
    db.prepare(
      `SELECT ${WEEK('vs.first_day')} AS cw, ${WEEK('v.day')} - ${WEEK('vs.first_day')} AS off, COUNT(DISTINCT v.visitor) AS n
       FROM visits v JOIN visitors vs ON vs.id = v.visitor WHERE vs.first_day >= ? GROUP BY cw, off`,
    ).bind(firstWeekDay),
    db.prepare(`SELECT ${WEEK('first_day')} AS cw, COUNT(*) AS n FROM visitors WHERE first_day >= ? GROUP BY cw`).bind(firstWeekDay),
    db.prepare(
      `SELECT ${WEEK(userDay)} AS cw, ${WEEK('v.day')} - ${WEEK(userDay)} AS off, COUNT(DISTINCT u.id) AS n
       FROM users u JOIN visits v ON v.user_id = u.id WHERE ${userDay} >= ? GROUP BY cw, off`,
    ).bind(firstWeekDay),
    db.prepare(`SELECT ${WEEK(userDay)} AS cw, COUNT(*) AS n FROM users u WHERE ${userDay} >= ? GROUP BY cw`).bind(firstWeekDay),
    db.prepare(
      `SELECT u.id, u.name, u.picture, COUNT(*) AS games, SUM(p.rank = 1 AND g.players > 1) AS wins,
              CAST(SUM(p.correct) AS REAL) / MAX(SUM(g.rounds_played), 1) AS accuracy
       FROM game_participants p JOIN game_events g ON g.id = p.game_id JOIN users u ON u.id = p.user_id
       WHERE g.day BETWEEN ? AND ? GROUP BY u.id ORDER BY games DESC LIMIT 15`,
    ).bind(r.from, r.to),
    db.prepare('SELECT day, COUNT(*) AS players, AVG(score) AS avg FROM daily_scores WHERE day > ? GROUP BY day ORDER BY day').bind(daily - Math.min(r.days, 60)),
  ])
  const sizes = (res: D1Result | undefined) => new Map(rows(res).map((x) => [num(x.cw), num(x.n)]))
  return {
    cohorts: cohorts(visitorCohorts, sizes(visitorSizes), thisWeek),
    userCohorts: cohorts(userCohorts, sizes(userSizes), thisWeek),
    topPlayers: rows(top).map((x) => ({
      userId: String(x.id),
      name: String(x.name),
      picture: (x.picture as string | null) ?? null,
      games: num(x.games),
      wins: num(x.wins),
      accuracy: num(x.accuracy),
    })),
    // Daily challenge numbers count from launch; turn them into calendar days.
    dailyChallenge: rows(dailyRows).map((x) => ({ day: num(x.day) + today - daily, players: num(x.players), avgScore: Math.round(num(x.avg)) })),
  }
}
