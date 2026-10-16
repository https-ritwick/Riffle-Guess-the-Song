// Wire protocol between browsers and a room's Durable Object.
// Every client message is validated with these schemas on the server.
import { z } from 'zod'
import { GUESS_SECONDS_OPTIONS, REGION_CODES, ROUND_OPTIONS } from './catalog'
import type { AwardName } from './awards'
import type { ChallengePrompt } from './challenges'
import { REACTIONS } from './rules'
import { MAX_CHAT_LENGTH, MAX_SIGNAL_LENGTH, STICKER_IDS, type ChatMessage, type VoiceState } from './chat'

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const ROOM_CODE_RE = /^[A-HJ-NP-Z]{4}$/
/** Songs a player can add to a Blend at once (one Spotify library or one playlist). */
export const MAX_BLEND_TRACKS = 150
/** Each player can add up to this many sources (Spotify + playlists) to a Blend… */
export const MAX_BLEND_SOURCES = 3
/** …holding at most this many songs in total. */
export const MAX_BLEND_PER_PLAYER = 300
/** Recently played songs/questions the host's browser asks the room to avoid. */
export const MAX_AVOID = 800

// ---------------------------------------------------------------------------
// Tracks & settings

/** Audio, artwork and links may only point at these CDNs. */
export const PREVIEW_URL_RE = /^https:\/\/(audio-ssl\.itunes\.apple\.com|p\.scdn\.co)\//
export const ARTWORK_URL_RE = /^https:\/\/(is\d+-ssl\.mzstatic\.com|i\.scdn\.co|mosaic\.scdn\.co|image-cdn-[a-z0-9-]+\.spotifycdn\.com)\//
export const LINK_URL_RE = /^https:\/\/((music|itunes)\.apple\.com|open\.spotify\.com)\//

export const TrackSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(300),
  album: z.string().max(200).default(''),
  artwork: z.string().max(500).regex(ARTWORK_URL_RE, 'artwork must come from a known CDN').or(z.literal('')).default(''),
  preview: z.string().max(500).regex(PREVIEW_URL_RE, 'preview must come from a known CDN'),
  link: z.string().max(500).regex(LINK_URL_RE).or(z.literal('')).default(''),
  year: z.number().int().min(1900).max(2100).nullable().default(null),
  /** Spotify track id, used to look up album art the playlist embed doesn't include. */
  spotifyId: z.string().regex(/^[A-Za-z0-9]{10,40}$/).optional(),
})
export type Track = z.infer<typeof TrackSchema>

export const PlaylistProviderSchema = z.enum(['spotify', 'apple'])
export const PlaylistKindSchema = z.enum(['playlist', 'album'])
export const PLAYLIST_ID_RE = /^(pl\.[A-Za-z0-9-]{8,80}|[A-Za-z0-9]{8,40})$/

export const SourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('preset'), id: z.string().min(1).max(60) }),
  z.object({
    kind: z.literal('artist'),
    id: z.number().int().positive(),
    name: z.string().min(1).max(120),
    genre: z.string().max(60).optional(),
    image: z.string().max(500).regex(ARTWORK_URL_RE).optional(),
  }),
  z.object({ kind: z.literal('search'), query: z.string().trim().min(2).max(80) }),
  z.object({
    kind: z.literal('playlist'),
    provider: PlaylistProviderSchema,
    type: PlaylistKindSchema,
    id: z.string().regex(PLAYLIST_ID_RE),
    country: z.enum(REGION_CODES).optional(),
    name: z.string().min(1).max(160),
    owner: z.string().max(120).optional(),
    image: z.string().max(500).regex(ARTWORK_URL_RE).optional(),
    count: z.number().int().min(0).max(10_000).optional(),
  }),
  /** Songs contributed by the players themselves (Spotify top tracks or a playlist each). */
  z.object({ kind: z.literal('blend') }),
])
export type Source = z.infer<typeof SourceSchema>
export type PlaylistSource = Extract<Source, { kind: 'playlist' }>

export const AnswerTypeSchema = z.enum(['title', 'artist', 'mixed'])
export type AnswerType = z.infer<typeof AnswerTypeSchema>

/**
 * How convincing the wrong answers are. easy: random; medium: look-alikes
 * (same singer, album, era or a similar title); hard: the closest possible.
 */
export const DifficultySchema = z.enum(['easy', 'medium', 'hard'])
export type Difficulty = z.infer<typeof DifficultySchema>

/** What the game is about: songs (audio), or a Bollywood challenge. */
export const GameKindSchema = z.enum(['songs', 'dialogue', 'actor', 'emoji'])

const literalUnion = <T extends readonly number[]>(values: T) =>
  z.number().refine((v): v is T[number] => (values as readonly number[]).includes(v), 'invalid option')

const SettingsShape = {
  source: SourceSchema,
  rounds: literalUnion(ROUND_OPTIONS),
  guessSeconds: literalUnion(GUESS_SECONDS_OPTIONS),
  answerType: AnswerTypeSchema,
  region: z.enum(REGION_CODES),
  /** Award points (and show right/wrong to the answerer) the moment someone answers. */
  liveScoring: z.boolean(),
  /** Start the clip at a random point instead of the start of the preview (usually the hook). */
  clipStart: z.enum(['start', 'random']),
  difficulty: DifficultySchema,
  /** Final song is worth double points. */
  doubleFinal: z.boolean(),
  game: GameKindSchema,
}

export const SettingsSchema = z.object({
  ...SettingsShape,
  liveScoring: SettingsShape.liveScoring.default(true),
  clipStart: SettingsShape.clipStart.default('random'),
  difficulty: SettingsShape.difficulty.default('hard'),
  doubleFinal: SettingsShape.doubleFinal.default(true),
  game: SettingsShape.game.default('songs'),
})
export type Settings = z.infer<typeof SettingsSchema>

/**
 * A change to some settings. No defaults here: zod fills defaults in even for
 * optional fields, which would silently reset the settings a change doesn't mention.
 */
export const SettingsPatchSchema = z.object(SettingsShape).partial()

export const DEFAULT_SETTINGS: Settings = {
  source: { kind: 'preset', id: 'bollywood-hits' },
  rounds: 10,
  guessSeconds: 15,
  answerType: 'title',
  region: 'in',
  liveScoring: true,
  clipStart: 'random',
  difficulty: 'hard',
  doubleFinal: true,
  game: 'songs',
}

/** Fill in settings added after a room was created. */
export function normalizeSettings(raw: unknown): Settings {
  const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(raw as object) })
  return parsed.success ? parsed.data : DEFAULT_SETTINGS
}

// ---------------------------------------------------------------------------
// Client -> server

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('join'), name: z.string().min(1).max(40), token: z.string().max(64).optional() }),
  z.object({ t: z.literal('time'), c: z.number() }),
  z.object({ t: z.literal('settings'), settings: SettingsPatchSchema }),
  z.object({ t: z.literal('prepare') }),
  z.object({ t: z.literal('prepareFailed'), message: z.string().max(200) }),
  // A Blend game is built from the players' contributions, so its pool may be empty.
  z.object({
    t: z.literal('start'),
    pool: z.array(z.unknown()).max(400),
    settings: SettingsSchema.optional(),
    /** Songs/questions this host played recently in other rooms; the room plays them last. */
    avoid: z.array(z.string().max(200)).max(MAX_AVOID).optional(),
  }),
  z.object({ t: z.literal('answer'), round: z.number().int().min(0), choice: z.number().int().min(0).max(3) }),
  z.object({ t: z.literal('kick'), playerId: z.string().max(40) }),
  z.object({ t: z.literal('makeHost'), playerId: z.string().max(40) }),
  z.object({ t: z.literal('end') }),
  z.object({ t: z.literal('next') }),
  z.object({ t: z.literal('lobby') }),
  z.object({ t: z.literal('react'), emoji: z.enum(REACTIONS) }),
  z.object({ t: z.literal('suggest'), source: SourceSchema }),
  z.object({
    t: z.literal('blend'),
    via: z.enum(['spotify', 'playlist']),
    label: z.string().trim().min(1).max(120),
    image: z.string().max(500).regex(ARTWORK_URL_RE).optional(),
    tracks: z.array(z.unknown()).min(1).max(MAX_BLEND_TRACKS),
  }),
  /** Remove one of your Blend sources, or all of them. */
  z.object({ t: z.literal('unblend'), index: z.number().int().min(0).max(MAX_BLEND_SOURCES).optional() }),
  /** A chat message: some text (emoji welcome) or one sticker. */
  z.object({ t: z.literal('chat'), text: z.string().max(MAX_CHAT_LENGTH * 2).optional(), sticker: z.enum(STICKER_IDS).optional() }),
  /** Join the voice channel (muted or talking), or leave it (null). */
  z.object({ t: z.literal('voice'), state: z.enum(['muted', 'live']).nullable() }),
  /** WebRTC signalling (offer / answer / ICE candidate as JSON) for another player in the voice channel. */
  z.object({ t: z.literal('rtc'), to: z.string().min(1).max(40), data: z.string().min(1).max(MAX_SIGNAL_LENGTH) }),
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>

// ---------------------------------------------------------------------------
// Server -> client

export type Phase = 'lobby' | 'loading' | 'countdown' | 'question' | 'reveal' | 'results'
/** Songs: name the title or artist. Challenges: dialogue → movie, star clues, "who said it", emoji → song. */
export type QuestionMode = 'title' | 'artist' | 'dialogue' | 'actor' | 'quote' | 'emoji'

export interface PublicPlayer {
  id: string
  name: string
  avatar: number
  /** Google profile photo for signed-in players. */
  photo: string | null
  signedIn: boolean
  score: number
  streak: number
  bestStreak: number
  correct: number
  connected: boolean
  answered: boolean
  /** How long this player took to answer the current round (ms), once they have. */
  answerMs: number | null
  /** Points gained (or lost, on Hard) in the current round, once known to everyone. */
  roundPoints: number | null
  /** First correct answer of the current round. */
  first: boolean
  /** In the voice channel (muted or talking), or not (null). */
  voice: VoiceState | null
}

export interface Pick {
  choice: number | null
  /** Negative for a wrong answer on Hard. */
  points: number
  correct: boolean
  ms: number | null
  /** First correct answer of the round. */
  first?: boolean
}

export interface RevealInfo {
  correct: number
  track: Track
  picks: Record<string, Pick>
  /** Blend games: names of the players whose music this song came from. */
  owners: string[]
  /** Emoji rounds whose clip the server couldn't fetch: the song for the browser to look up. */
  find?: { title: string; movie: string }
}

export interface YourResult {
  correct: boolean
  points: number
  first: boolean
  correctIndex: number
  /** Emoji rounds: the song's clip, to play as soon as you've cracked it. */
  song?: string | null
  /** …or, when the server couldn't fetch it, the song for your browser to look up. */
  find?: { title: string; movie: string }
}

export interface PublicRound {
  index: number
  total: number
  mode: QuestionMode
  /** Final round with double points. */
  double: boolean
  /** When answering opens (end of the countdown). */
  startsAt: number
  /** When answering closes. */
  endsAt: number
  preview: string
  /** Seconds into the preview where the clip starts. */
  clipOffset: number
  difficulty: Difficulty
  options: string[] | null
  /** Album art for each option (only when every option has art, so art never gives the answer away). */
  optionArt: string[] | null
  yourChoice: number | null
  /** With live scoring: your own result, right after you answer. */
  yourResult: YourResult | null
  reveal: RevealInfo | null
  /** Challenge rounds: the dialogue, emojis or clues to solve (no audio while answering). */
  challenge: ChallengePrompt | null
  /** During the reveal: the next song's clip, so browsers can load it before it starts. */
  nextPreview: string | null
}

export interface RoundSummary {
  index: number
  mode: QuestionMode
  options: string[]
  optionArt: string[] | null
  correct: number
  track: Track
  picks: Record<string, Pick>
  owners: string[]
  challenge?: ChallengePrompt | null
}

/** A player's contribution to a Blend (the songs themselves stay on the server). */
export interface BlendEntry {
  playerId: string
  /** The first source the player added (kept for older screens). */
  via: 'spotify' | 'playlist'
  label: string
  image: string | null
  /** Songs from all their sources together. */
  count: number
  sources: BlendSource[]
}

export interface BlendSource {
  via: 'spotify' | 'playlist'
  label: string
  image: string | null
  count: number
}

export interface PublicState {
  code: string
  phase: Phase
  hostId: string | null
  settings: Settings
  players: PublicPlayer[]
  /** When the current phase ends on its own (countdown, question, reveal, loading). */
  phaseEndsAt: number | null
  round: PublicRound | null
  history: RoundSummary[] | null
  notice: string | null
  group: { id: string; name: string } | null
  /** Single-player room: nobody else can join. */
  solo: boolean
  blend: BlendEntry[]
  /** Challenge games can include freshly AI-written questions on this server. */
  ai: boolean
  /** This game's names for the filmy awards, by award id (results only). */
  awardNames: Record<string, AwardName> | null
  /** Daily challenge rooms: the day number. */
  daily: number | null
}

export type ServerMessage =
  | { t: 'welcome'; you: string; token: string }
  | { t: 'state'; state: PublicState; now: number }
  | { t: 'time'; c: number; s: number }
  | { t: 'error'; code: string; message: string }
  | { t: 'kicked' }
  | { t: 'reaction'; from: string; emoji: string }
  | { t: 'suggestion'; from: string; source: Source }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'chatHistory'; messages: ChatMessage[] }
  | { t: 'rtc'; from: string; data: string }

export interface RoomInfo {
  code: string
  exists: boolean
  phase: Phase | null
  players: number
  group: { id: string; name: string } | null
  membersOnly: boolean
  /** Group games: everyone has to sign in to join. */
  signInRequired: boolean
  solo: boolean
}

// ---------------------------------------------------------------------------
// Playlists (GET /api/playlist)

export interface PlaylistTrackInfo {
  title: string
  artist: string
  preview: string | null
  spotifyId?: string
  appleId?: string
}

export interface PlaylistInfo {
  provider: 'spotify' | 'apple'
  type: 'playlist' | 'album'
  id: string
  country?: string
  name: string
  owner: string
  image: string | null
  tracks: PlaylistTrackInfo[]
}
