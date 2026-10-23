// Site settings, analytics beacons and the admin console's API types.
import { z } from 'zod'

const IST_OFFSET_MS = 330 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Analytics day buckets: days since the epoch in India time (matches the daily challenge). */
export function istDay(ms = Date.now()): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS)
}

/** Midnight IST of an analytics day, as a timestamp. */
export function dayStart(day: number): number {
  return day * DAY_MS - IST_OFFSET_MS
}

// ---------------------------------------------------------------------------
// Site settings (public: everyone's browser reads them)

export const BannerSchema = z.object({
  enabled: z.boolean(),
  text: z.string().trim().max(240),
  tone: z.enum(['brand', 'info', 'warning']),
  /** Changes whenever the text changes, so a dismissed banner comes back for new news. */
  version: z.string().max(40),
})
export type Banner = z.infer<typeof BannerSchema>

export const MaintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(240),
})
export type Maintenance = z.infer<typeof MaintenanceSchema>

export const FeaturesSchema = z.object({
  chat: z.boolean(),
  voice: z.boolean(),
  ai: z.boolean(),
  spotify: z.boolean(),
  groups: z.boolean(),
  daily: z.boolean(),
})
export type Features = z.infer<typeof FeaturesSchema>

export interface SiteConfig {
  banner: Banner
  maintenance: Maintenance
  features: Features
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  banner: {
    enabled: true,
    text: 'New: 📅 Aaj Ka Challenge — same 5 questions for everyone daily, plus levels, streaks, badges and Story-ready result posters.',
    tone: 'brand',
    version: '6',
  },
  maintenance: { enabled: false, message: 'Riffle is getting a quick upgrade. New games are paused for a few minutes.' },
  features: { chat: true, voice: true, ai: true, spotify: true, groups: true, daily: true },
}

export const SiteConfigPatchSchema = z.object({
  banner: BannerSchema.optional(),
  maintenance: MaintenanceSchema.optional(),
  features: FeaturesSchema.optional(),
})

// ---------------------------------------------------------------------------
// Analytics beacon (POST /api/track)

/** Client-side features worth counting. Anything else is ignored. */
export const FEATURE_EVENTS = [
  'share_result',
  'story_poster',
  'copy_invite',
  'qr_invite',
  'spotify_connect',
  'playlist_added',
  'install_app',
  'sign_in_click',
  'daily_share',
  'challenge_link',
] as const
export type FeatureEvent = (typeof FEATURE_EVENTS)[number]

export const TrackSchema = z.object({
  /** Random id this browser keeps in local storage (hashed on the server). */
  vid: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  path: z.string().max(200).optional(),
  referrer: z.string().max(500).optional(),
  event: z.enum(FEATURE_EVENTS).optional(),
})

// ---------------------------------------------------------------------------
// Admin API

export interface AdminMe {
  email: string
}

export interface Stat {
  value: number
  /** The same measure over the previous period of equal length. */
  previous: number | null
}

export interface SeriesPoint {
  day: number
  value: number
}

export interface Ranked {
  label: string
  value: number
  /** Optional second measure (e.g. accuracy %, players). */
  extra?: number | null
  id?: string
}

export interface Overview {
  totals: { users: number; groups: number; games: number; visitors: number; banned: number; deleted: number }
  period: { visitors: Stat; activeUsers: Stat; newUsers: Stat; games: Stat; players: Stat; rooms: Stat }
  daily: { day: number; visitors: number; games: number; signups: number }[]
  live: { rooms: number; players: number }
  recentUsers: AdminUserRow[]
  recentActions: AuditRow[]
}

export interface AudienceReport {
  visitorsByDay: { day: number; visitors: number; newVisitors: number; signedIn: number; views: number }[]
  devices: Ranked[]
  os: Ranked[]
  browsers: Ranked[]
  referrers: Ranked[]
  pages: Ranked[]
  hours: number[][]
  stickiness: { dau: number; wau: number; mau: number }
  returningShare: number
}

export interface GeoReport {
  countries: (Ranked & { code: string; players: number; games: number })[]
  regions: (Ranked & { country: string })[]
  cities: (Ranked & { country: string })[]
  /** Game modes people in each of the top countries prefer. */
  countryModes: { code: string; modes: Ranked[] }[]
}

export interface GamesReport {
  gamesByDay: { day: number; songs: number; dialogue: number; actor: number; emoji: number }[]
  modes: Ranked[]
  kinds: Ranked[]
  sources: Ranked[]
  presets: Ranked[]
  difficulty: Ranked[]
  rounds: Ranked[]
  guessSeconds: Ranked[]
  answerTypes: Ranked[]
  regions: Ranked[]
  playerCounts: Ranked[]
  completion: number
  avgPlayers: number
  avgAccuracy: number
  avgMinutes: number
  social: { chatGames: number; voiceGames: number; reactionGames: number; total: number }
  hours: number[][]
  features: Ranked[]
}

export interface ItemRow {
  key: string
  kind: string
  title: string
  subtitle: string
  plays: number
  answers: number
  accuracy: number
  avgSeconds: number
}

export interface ContentReport {
  mostPlayed: ItemRow[]
  hardest: ItemRow[]
  easiest: ItemRow[]
  artists: Ranked[]
  kinds: { kind: string; plays: number; accuracy: number }[]
}

export interface RetentionReport {
  /** Weekly cohorts by first visit: share of each cohort seen again N weeks later. */
  cohorts: { week: number; size: number; weeks: number[] }[]
  userCohorts: { week: number; size: number; weeks: number[] }[]
  topPlayers: { userId: string; name: string; picture: string | null; games: number; wins: number; accuracy: number }[]
  dailyChallenge: { day: number; players: number; avgScore: number }[]
}

export interface AdminUserRow {
  id: string
  name: string
  email: string
  picture: string | null
  createdAt: number
  lastLogin: number
  lastSeen: number | null
  country: string | null
  city: string | null
  games: number
  groups: number
  bannedAt: number | null
  deletedAt: number | null
  isAdmin: boolean
}

export interface AdminUserDetail extends AdminUserRow {
  googleSub: string
  banReason: string | null
  adminNote: string | null
  loginCount: number
  region: string | null
  sessions: number
  stats: { games: number; wins: number; points: number; correct: number; answered: number; bestStreak: number; avgMs: number | null; dailyPlays: number }
  modes: Ranked[]
  sources: Ranked[]
  devices: Ranked[]
  activity: SeriesPoint[]
  groupsList: { id: string; name: string; role: string }[]
  recentGames: { id: string; at: number; mode: string; kind: string; source: string; rank: number; players: number; score: number; correct: number; rounds: number }[]
}

export interface AdminGroupRow {
  id: string
  name: string
  ownerName: string
  ownerEmail: string
  members: number
  games: number
  createdAt: number
  inviteEnabled: boolean
  lastPlayed: number | null
}

export interface AdminGroupDetail extends AdminGroupRow {
  inviteCode: string
  allowGuests: boolean
  memberList: { userId: string; name: string; email: string; picture: string | null; role: string; joinedAt: number }[]
  recent: { id: string; at: number; source: string; rounds: number; players: number }[]
}

export interface AdminRoomPlayer {
  id: string
  name: string
  userId: string | null
  connected: boolean
  score: number
  host: boolean
  country: string | null
}

export interface AdminRoom {
  code: string
  createdAt: number
  lastActive: number
  phase: string
  kind: string
  source: string
  group: string | null
  solo: boolean
  daily: number | null
  round: number | null
  rounds: number | null
  players: AdminRoomPlayer[]
  chats: number
}

export interface AuditRow {
  id: number
  adminEmail: string
  action: string
  targetType: string | null
  targetId: string | null
  detail: string | null
  createdAt: number
}

export interface DailyAdmin {
  day: number
  game: string
  players: number
  rows: { roomCode: string; name: string; userId: string | null; score: number; correct: number; total: number; playedAt: number }[]
}

export interface Page<T> {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export const UserActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('ban'), reason: z.string().trim().max(200).default('') }),
  z.object({ action: z.literal('unban') }),
  z.object({ action: z.literal('signout') }),
  z.object({ action: z.literal('delete') }),
  z.object({ action: z.literal('restore') }),
  z.object({ action: z.literal('purge'), confirm: z.string() }),
  z.object({ action: z.literal('note'), note: z.string().trim().max(1000) }),
])

export const GroupActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rename'), name: z.string().trim().min(1).max(40) }),
  z.object({ action: z.literal('invite'), enabled: z.boolean() }),
  z.object({ action: z.literal('guests'), enabled: z.boolean() }),
  z.object({ action: z.literal('remove'), userId: z.string().min(1).max(60) }),
  z.object({ action: z.literal('delete') }),
])

export const RoomActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('close'), message: z.string().trim().max(200).default('') }),
  z.object({ action: z.literal('kick'), playerId: z.string().min(1).max(40) }),
])

export const DailyRemoveSchema = z.object({ day: z.number().int(), roomCode: z.string().regex(/^[A-Z]{4}$/) })

export const RANGES = [7, 30, 90, 365] as const
