import { DurableObject } from 'cloudflare:workers'
import { pickAwardNames, type AwardName } from '../shared/awards'
import { CHAT_COOLDOWN_MS, CHAT_HISTORY, sanitizeChat, type ChatMessage, type VoiceState } from '../shared/chat'
import { findPreset } from '../shared/catalog'
import { dailySettings, seededRandom } from '../shared/daily'
import { buildChallengeQuestions, CHALLENGE_QUESTION, summarize, type ChallengeItem, type ChallengePrompt, type GameKind } from '../shared/challenges'
import {
  ClientMessageSchema,
  DEFAULT_SETTINGS,
  MAX_BLEND_PER_PLAYER,
  MAX_BLEND_SOURCES,
  MAX_BLEND_TRACKS,
  normalizeSettings,
  SettingsSchema,
  TrackSchema,
  type BlendSource,
  type ClientMessage,
  type Phase,
  type Pick,
  type PublicState,
  type RoomInfo,
  type RoundSummary,
  type ServerMessage,
  type Settings,
  type Source,
  type Track,
} from '../shared/protocol'
import { buildQuestions, dedupeTracks, playedKey, shuffle, type Question } from '../shared/questions'
import {
  ANSWER_GRACE_MS,
  AVATARS,
  COUNTDOWN_MS,
  HOST_GRACE_MS,
  LOADING_TIMEOUT_MS,
  MAX_PLAYERS,
  FIRST_BONUS,
  REVEAL_MS,
  scoreAnswer,
  WRONG_PENALTY,
} from '../shared/rules'
import { sanitizeName } from '../shared/text'
import { matchSong, songSearchUrl, type SongClip, type SongRef } from '../shared/songs'
import { aiEnabled, generateAwardNames, generateChallenges } from './ai'
import { json } from './http'
import { spotifyArtwork } from './playlist'
import type { RoomInitOptions } from './rooms'

/** Rooms with no activity for this long are wiped from storage. */
const IDLE_TTL_MS = 6 * 60 * 60 * 1000
/** Disconnected players are dropped when a new game starts after this long. */
const STALE_PLAYER_MS = 60_000
const MAX_MESSAGE_BYTES = 512 * 1024
const REACTION_COOLDOWN_MS = 350
const PREVIEW_SECONDS = 30
/** Songs / questions the room remembers, so the next games play something new first. */
const MAX_PLAYED = 2000
/** How long a challenge game waits for freshly written AI questions before using the bank. */
const AI_WAIT_MS = 15_000
/** AI questions kept ready per challenge kind. */
const AI_TARGET = 20

type ChallengeGame = Exclude<GameKind, 'songs'>

interface PlayerRecord {
  id: string
  token: string
  userId: string | null
  photo: string | null
  name: string
  avatar: number
  score: number
  streak: number
  bestStreak: number
  correct: number
  connected: boolean
  joinedAt: number
  leftAt: number | null
  /** In the voice channel (cleared when they disconnect). */
  voice?: VoiceState | null
}

interface AnswerRecord {
  choice: number
  at: number
  ms: number
  correct: boolean
  points: number
  /** Points already added to the score (live scoring). */
  applied: boolean
  /** First correct answer of the round. */
  first?: boolean
}

interface RoomQuestion extends Question {
  clipOffset: number
  /** Blend games: players whose music this song came from. */
  owners?: string[]
  /** Decided when answering opens: show option art only if every option has some. */
  showArt?: boolean
  /** Challenge rounds: what players solve instead of listening. */
  challenge?: ChallengePrompt
  /** Emoji songs: looked up so the reveal can play the song. */
  song?: { title: string; movie: string; singer: string }
}

interface GameRecord {
  id: string
  questions: RoomQuestion[]
  index: number
  startsAt: number
  endsAt: number
  answers: Record<string, AnswerRecord>
  history: RoundSummary[]
  recorded: boolean
  /** This game's filmy award names (built-in first, AI-written ones when they arrive). */
  awardNames?: Record<string, AwardName>
}

interface RoomRecord {
  code: string
  createdAt: number
  lastActive: number
  phase: Phase
  hostId: string | null
  /** Signed-in user who should become host when they join (group games). */
  hostUserId: string | null
  settings: Settings
  players: PlayerRecord[]
  game: GameRecord | null
  phaseEndsAt: number | null
  hostTransferAt: number | null
  notice: string | null
  group: { id: string; name: string } | null
  /** Group games: let signed-in people who aren't members join. */
  allowGuests: boolean
  solo: boolean
  /** What each player added to the Blend; the songs themselves live under 'blend:<player id>'. */
  blendMeta: Record<string, BlendSource[]>
  /** Recently played songs and questions (playedKey), oldest first. */
  played: string[]
  /** Award names this room has seen recently, so each game gets new ones. */
  recentAwards: string[]
  /** Daily challenge rooms: which day's challenge (one attempt, recorded on the daily leaderboard). */
  daily: number | null
}

/** AI-written challenge questions waiting to be played, and summaries of ones already used. */
interface AiStore {
  ready: Partial<Record<ChallengeGame, ChallengeItem[]>>
  seen: Partial<Record<ChallengeGame, string[]>>
}

interface SessionIdentity {
  id: string
  name: string
  picture: string | null
}

interface Attachment {
  pid: string | null
  lastReaction: number
  lastChat?: number
  user: SessionIdentity | null
  member: boolean
}

const IN_GAME: Phase[] = ['countdown', 'question', 'reveal']

function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function sourceTitle(settings: Settings): string {
  if (settings.game === 'dialogue') return 'Dialogue Baazi'
  if (settings.game === 'actor') return 'Star Spotting'
  if (settings.game === 'emoji') return 'Emoji Gaana'
  const source: Source = settings.source
  switch (source.kind) {
    case 'preset':
      return findPreset(source.id)?.name ?? 'Mix'
    case 'artist':
      return source.name
    case 'search':
      return `“${source.query}”`
    case 'playlist':
      return source.name
    case 'blend':
      return 'Blend'
  }
}

/**
 * The song behind an emoji puzzle, from the iTunes store, so the reveal can play it.
 * `limited` means Apple refused to answer (it rate-limits server IPs); browsers then look it up themselves.
 */
async function findSong(song: SongRef, minScore = 1): Promise<{ clip: SongClip | null; limited: boolean }> {
  try {
    const res = await fetch(songSearchUrl(song), { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { clip: null, limited: res.status === 429 || res.status === 403 }
    const { results = [] } = (await res.json()) as { results?: Parameters<typeof matchSong>[0] }
    const match = matchSong(results, song)
    return { clip: match && match.score >= minScore ? match.clip : null, limited: false }
  } catch {
    return { clip: null, limited: true }
  }
}

/**
 * One Durable Object per room. It is the single source of truth for the game:
 * it owns the player list, the questions, the timers (via alarms) and the scores,
 * and pushes a personalised snapshot to every connected browser after each change.
 */
export class GameRoom extends DurableObject<Env> {
  private room: RoomRecord | null = null
  /** Blend songs per player id, one list per source (kept apart from the room record, which is rewritten on every answer). */
  private blend: Record<string, Track[][]> = {}
  private blendDirty = new Set<string>()
  private ai: AiStore = { ready: {}, seen: {} }
  private aiDirty = false
  private aiInflight = new Map<ChallengeGame, Promise<void>>()
  private starting = false
  private artCache = new Map<string, string | null>()
  /** Recent chat messages (kept under their own key so answers don't rewrite them). */
  private chat: ChatMessage[] = []

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomRecord>('room')
      if (stored) {
        // Rooms created by older versions may lack newer fields.
        stored.settings = normalizeSettings(stored.settings)
        stored.group ??= null
        stored.allowGuests ??= true
        stored.hostUserId ??= null
        stored.solo ??= false
        stored.blendMeta ??= {}
        stored.played ??= []
        stored.recentAwards ??= []
        stored.daily ??= null
        for (const [pid, meta] of Object.entries(stored.blendMeta)) {
          if (!Array.isArray(meta)) stored.blendMeta[pid] = [meta as BlendSource]
        }
        for (const p of stored.players) {
          p.userId ??= null
          p.photo ??= null
          p.bestStreak ??= p.streak
        }
      }
      this.room = stored ?? null
      for (const [key, lists] of await ctx.storage.list<Track[][]>({ prefix: 'blend:' })) this.blend[key.slice(6)] = lists
      // Older rooms kept every player's songs under one key.
      const legacy = await ctx.storage.get<Record<string, Track[]>>('blend')
      if (legacy) {
        for (const [pid, tracks] of Object.entries(legacy)) {
          this.blend[pid] = [tracks]
          this.blendDirty.add(pid)
        }
        await ctx.storage.delete('blend')
      }
      this.ai = (await ctx.storage.get<AiStore>('ai')) ?? { ready: {}, seen: {} }
      this.chat = (await ctx.storage.get<ChatMessage[]>('chat')) ?? []
    })
    // Keep-alive pings are answered without waking the object from hibernation.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  // ---------------------------------------------------------------------------
  // RPC entry points (called by the Worker)

  /** Claim this room code. Returns false when the code is already in use. */
  async init(code: string, opts: RoomInitOptions = {}): Promise<boolean> {
    const now = Date.now()
    if (this.room && now - this.room.lastActive < IDLE_TTL_MS) return false
    this.room = {
      code,
      createdAt: now,
      lastActive: now,
      phase: 'lobby',
      hostId: null,
      hostUserId: opts.hostUserId ?? null,
      settings: opts.daily ? dailySettings(opts.daily) : opts.settings ? normalizeSettings(opts.settings) : DEFAULT_SETTINGS,
      players: [],
      game: null,
      phaseEndsAt: null,
      hostTransferAt: null,
      notice: null,
      group: opts.group ?? null,
      allowGuests: opts.group ? !!opts.allowGuests : true,
      solo: !!opts.solo || !!opts.daily,
      blendMeta: {},
      played: opts.played?.slice(-MAX_PLAYED) ?? [],
      recentAwards: [],
      daily: opts.daily ?? null,
    }
    for (const pid of Object.keys(this.blend)) this.blendDirty.add(pid)
    this.blend = {}
    this.ai = { ready: {}, seen: {} }
    this.aiDirty = true
    await this.persist()
    await this.schedule()
    this.prefetch()
    return true
  }

  async info(): Promise<RoomInfo> {
    const room = this.room
    if (!room) return { code: '', exists: false, phase: null, players: 0, group: null, membersOnly: false, signInRequired: false, solo: false }
    return {
      code: room.code,
      exists: true,
      phase: room.phase,
      players: room.players.filter((p) => p.connected).length,
      group: room.group,
      membersOnly: !!room.group && !room.allowGuests,
      signInRequired: !!room.group,
      solo: room.solo,
    }
  }

  /** Songs and questions this room has played (group games carry them over to the next room). */
  async playedKeys(): Promise<string[]> {
    return this.room?.played ?? []
  }

  override async fetch(request: Request): Promise<Response> {
    if (!this.room) return json({ error: 'Room not found' }, 404)
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'Expected a WebSocket upgrade' }, 426)
    }
    // Identity headers are set by our Worker after validating the session cookie.
    let user: SessionIdentity | null = null
    try {
      const raw = request.headers.get('x-encore-user')
      if (raw) user = JSON.parse(raw) as SessionIdentity
    } catch {
      user = null
    }
    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ pid: null, lastReaction: 0, user, member: request.headers.get('x-encore-member') === '1' } satisfies Attachment)
    this.room.lastActive = Date.now()
    this.sendState(server)
    return new Response(null, { status: 101, webSocket: client })
  }

  // ---------------------------------------------------------------------------
  // WebSocket events (hibernation API)

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const room = this.room
    if (!room) {
      ws.close(4004, 'Room closed')
      return
    }
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) {
      this.send(ws, { t: 'error', code: 'bad_message', message: 'Message rejected.' })
      return
    }

    let parsed: ClientMessage
    try {
      const result = ClientMessageSchema.safeParse(JSON.parse(raw))
      if (!result.success) {
        this.send(ws, { t: 'error', code: 'bad_message', message: 'Invalid message.' })
        return
      }
      parsed = result.data
    } catch {
      this.send(ws, { t: 'error', code: 'bad_message', message: 'Invalid JSON.' })
      return
    }

    room.lastActive = Date.now()
    const changed = await this.handle(ws, parsed)
    if (changed) await this.commit()
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws)
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.handleDisconnect(ws)
  }

  override async alarm(): Promise<void> {
    const room = this.room
    if (!room) return
    const now = Date.now()

    if (this.connectedSockets().length === 0) {
      if (now - room.lastActive >= IDLE_TTL_MS) {
        await this.ctx.storage.deleteAll()
        this.room = null
        this.blend = {}
        this.chat = []
        return
      }
      // Nobody is watching: don't keep cycling through rounds.
      if (IN_GAME.includes(room.phase) || room.phase === 'loading') {
        room.phase = room.game ? 'results' : 'lobby'
        room.phaseEndsAt = null
      }
    }

    if (room.phaseEndsAt !== null && room.phaseEndsAt <= now + 25) this.advance(now)
    if (room.hostTransferAt !== null && room.hostTransferAt <= now) this.transferHost()
    await this.commit()
  }

  // ---------------------------------------------------------------------------
  // Message handling. Resolves to true when room state changed.

  private async handle(ws: WebSocket, msg: ClientMessage): Promise<boolean> {
    const room = this.room!
    const now = Date.now()
    const att = this.attachment(ws)

    if (msg.t === 'time') {
      this.send(ws, { t: 'time', c: msg.c, s: now })
      return false
    }
    if (msg.t === 'join') return this.join(ws, msg.name, msg.token)

    const player = att.pid ? room.players.find((p) => p.id === att.pid) : undefined
    if (!player) {
      this.send(ws, { t: 'error', code: 'not_joined', message: 'Join the room first.' })
      return false
    }

    switch (msg.t) {
      case 'answer':
        return this.answer(player, msg.round, msg.choice, now)

      case 'react': {
        if (now - att.lastReaction < REACTION_COOLDOWN_MS) return false
        ws.serializeAttachment({ ...att, lastReaction: now } satisfies Attachment)
        this.broadcastRaw({ t: 'reaction', from: player.id, emoji: msg.emoji })
        return false
      }

      case 'suggest': {
        if (now - att.lastReaction < 2000 || room.hostId === player.id) return false
        if (msg.source.kind === 'preset' && !findPreset(msg.source.id)) return false
        ws.serializeAttachment({ ...att, lastReaction: now } satisfies Attachment)
        for (const s of this.socketsOf(room.hostId ?? '')) this.send(s, { t: 'suggestion', from: player.id, source: msg.source })
        return false
      }

      case 'chat': {
        if (room.solo || now - (att.lastChat ?? 0) < CHAT_COOLDOWN_MS) return false
        const text = msg.text !== undefined ? sanitizeChat(msg.text) : ''
        if (!text && !msg.sticker) return false
        ws.serializeAttachment({ ...att, lastChat: now } satisfies Attachment)
        const message: ChatMessage = {
          id: newId(),
          from: player.id,
          name: player.name,
          avatar: player.avatar,
          photo: player.photo,
          at: now,
          ...(msg.sticker ? { sticker: msg.sticker } : { text }),
        }
        this.chat = [...this.chat.slice(-(CHAT_HISTORY - 1)), message]
        this.broadcastRaw({ t: 'chat', message })
        await this.ctx.storage.put('chat', this.chat)
        return false
      }

      case 'voice': {
        if (room.solo || (player.voice ?? null) === msg.state) return false
        player.voice = msg.state
        return true
      }

      case 'rtc': {
        // Only relay between two players who are both in the voice channel.
        if (!player.voice) return false
        const target = room.players.find((p) => p.id === msg.to)
        if (!target?.voice || target.id === player.id) return false
        for (const s of this.socketsOf(target.id)) this.send(s, { t: 'rtc', from: player.id, data: msg.data })
        return false
      }

      case 'blend':
        return this.addBlend(ws, player, msg)

      case 'unblend': {
        const sources = room.blendMeta[player.id]
        if (!sources) return false
        if (msg.index === undefined || sources.length <= 1) {
          this.dropBlend(player.id)
        } else if (msg.index < sources.length) {
          sources.splice(msg.index, 1)
          this.blend[player.id]?.splice(msg.index, 1)
          this.blendDirty.add(player.id)
        }
        return true
      }
    }

    // Everything below is host-only.
    if (room.hostId !== player.id) {
      this.send(ws, { t: 'error', code: 'not_host', message: 'Only the host can do that.' })
      return false
    }

    switch (msg.t) {
      case 'settings': {
        if (room.phase !== 'lobby' && room.phase !== 'results') return false
        if (room.daily) return false
        const next = SettingsSchema.safeParse({ ...room.settings, ...msg.settings })
        if (!next.success) return false
        if (next.data.source.kind === 'preset' && !findPreset(next.data.source.id)) {
          this.send(ws, { t: 'error', code: 'bad_source', message: 'Unknown category.' })
          return false
        }
        room.settings = next.data
        room.notice = null
        // Picking a challenge starts AI writing its questions while everyone gets ready.
        this.prefetch()
        return true
      }

      case 'prepare': {
        if (room.phase !== 'lobby' && room.phase !== 'results') return false
        room.phase = 'loading'
        room.notice = null
        room.phaseEndsAt = now + LOADING_TIMEOUT_MS
        return true
      }

      case 'prepareFailed': {
        if (room.phase !== 'loading') return false
        room.phase = room.game ? 'results' : 'lobby'
        room.phaseEndsAt = null
        room.notice = msg.message
        return true
      }

      case 'start':
        // The host's screen may be ahead of the last settings echo; use what they saw.
        if (msg.settings && !room.daily && !(msg.settings.source.kind === 'preset' && !findPreset(msg.settings.source.id))) room.settings = msg.settings
        return this.start(msg.pool, msg.avoid ?? [])

      case 'kick': {
        if (msg.playerId === player.id) return false
        const target = room.players.find((p) => p.id === msg.playerId)
        if (!target) return false
        room.players = room.players.filter((p) => p.id !== target.id)
        if (room.game) delete room.game.answers[target.id]
        this.dropBlend(target.id)
        for (const s of this.socketsOf(target.id)) {
          this.send(s, { t: 'kicked' })
          s.serializeAttachment({ ...this.attachment(s), pid: null } satisfies Attachment)
          s.close(4003, 'Removed by host')
        }
        if (room.phase === 'question' && this.everyoneAnswered()) this.reveal(now)
        return true
      }

      case 'makeHost': {
        const target = room.players.find((p) => p.id === msg.playerId && p.connected)
        if (!target || target.id === player.id) return false
        room.hostId = target.id
        room.hostTransferAt = null
        return true
      }

      case 'next': {
        // Solo players skip ahead instead of waiting out the reveal.
        if (!room.solo || room.phase !== 'reveal') return false
        this.advance(now)
        return true
      }

      case 'end': {
        if (!IN_GAME.includes(room.phase) && room.phase !== 'loading') return false
        if (room.phase === 'question') this.reveal(now)
        this.finish()
        return true
      }

      case 'lobby': {
        if (room.phase === 'lobby') return false
        room.phase = 'lobby'
        room.phaseEndsAt = null
        room.game = null
        room.notice = null
        this.resetScores()
        this.pruneStalePlayers(now)
        return true
      }
    }
    return false
  }

  private join(ws: WebSocket, rawName: string, token: string | undefined): boolean {
    const room = this.room!
    const now = Date.now()
    const att = this.attachment(ws)
    const name = sanitizeName(rawName)
    if (!name) {
      this.send(ws, { t: 'error', code: 'bad_name', message: 'Please enter a name.' })
      return false
    }
    // Group games are for signed-in people only (and only members, if the group says so).
    if (room.group && !att.user) {
      this.send(ws, { t: 'error', code: 'signin_required', message: `Sign in with Google to join “${room.group.name}”’s game.` })
      return false
    }
    if (room.group && !room.allowGuests && !att.member) {
      this.send(ws, { t: 'error', code: 'members_only', message: `This game is only for members of “${room.group.name}”.` })
      return false
    }

    // Same seat: matching token (refresh / reconnect) or the same signed-in account on another device.
    let player = token ? room.players.find((p) => p.token === token) : undefined
    if (!player && att.user) player = room.players.find((p) => p.userId === att.user!.id)

    if (player) {
      for (const other of this.socketsOf(player.id)) {
        if (other === ws) continue
        other.serializeAttachment({ ...this.attachment(other), pid: null } satisfies Attachment)
        other.close(4000, 'Opened in another tab')
      }
      player.name = name
      player.connected = true
      player.leftAt = null
      if (att.user) {
        player.userId = att.user.id
        player.photo = att.user.picture
      }
      if (room.hostId === player.id) room.hostTransferAt = null
    } else {
      if (room.solo && room.players.length > 0) {
        this.send(ws, { t: 'error', code: 'solo_room', message: 'This is a solo game — start your own from the home page.' })
        return false
      }
      if (room.players.length >= MAX_PLAYERS) this.pruneStalePlayers(now, 0)
      if (room.players.length >= MAX_PLAYERS) {
        this.send(ws, { t: 'error', code: 'room_full', message: `This room is full (${MAX_PLAYERS} players max).` })
        return false
      }
      const used = new Set(room.players.map((p) => p.avatar))
      const avatar = AVATARS.findIndex((_, i) => !used.has(i))
      player = {
        id: newId(),
        token: crypto.randomUUID(),
        userId: att.user?.id ?? null,
        photo: att.user?.picture ?? null,
        name,
        avatar: avatar === -1 ? room.players.length % AVATARS.length : avatar,
        score: 0,
        streak: 0,
        bestStreak: 0,
        correct: 0,
        connected: true,
        joinedAt: now,
        leftAt: null,
      }
      room.players.push(player)
    }

    if (room.hostUserId && att.user?.id === room.hostUserId) {
      room.hostId = player.id
      room.hostUserId = null
      room.hostTransferAt = null
    } else if (!room.hostId || !room.players.some((p) => p.id === room.hostId)) {
      room.hostId = player.id
      room.hostTransferAt = null
    }

    // This socket previously held a different seat: that seat is now offline.
    const previous = att.pid
    if (previous && previous !== player.id) {
      const old = room.players.find((p) => p.id === previous)
      if (old && !this.socketsOf(previous).some((s) => s !== ws)) {
        old.connected = false
        old.leftAt = now
      }
    }

    ws.serializeAttachment({ ...att, pid: player.id } satisfies Attachment)
    this.send(ws, { t: 'welcome', you: player.id, token: player.token })
    if (!room.solo) this.send(ws, { t: 'chatHistory', messages: this.chat })
    return true
  }

  /** Add (or refresh) one of a player's Blend sources. */
  private addBlend(ws: WebSocket, player: PlayerRecord, msg: Extract<ClientMessage, { t: 'blend' }>): boolean {
    const room = this.room!
    if (room.phase !== 'lobby' && room.phase !== 'results') return false
    const tracks: Track[] = []
    for (const item of msg.tracks.slice(0, MAX_BLEND_TRACKS)) {
      const parsed = TrackSchema.safeParse(item)
      if (parsed.success) tracks.push(parsed.data)
    }
    if (tracks.length === 0) {
      this.send(ws, { t: 'error', code: 'bad_blend', message: 'None of those songs can be played.' })
      return false
    }
    const sources = [...(room.blendMeta[player.id] ?? [])]
    const lists = [...(this.blend[player.id] ?? [])]
    // Re-adding Spotify (or the same playlist) refreshes that source instead of duplicating it.
    const same = sources.findIndex((s) => (msg.via === 'spotify' ? s.via === 'spotify' : s.via === 'playlist' && s.label === msg.label))
    if (same >= 0) {
      sources.splice(same, 1)
      lists.splice(same, 1)
    }
    while (sources.length >= MAX_BLEND_SOURCES) {
      sources.shift()
      lists.shift()
    }
    const space = MAX_BLEND_PER_PLAYER - lists.reduce((n, l) => n + l.length, 0)
    const kept = tracks.slice(0, Math.max(0, space))
    if (kept.length === 0) {
      this.send(ws, { t: 'error', code: 'blend_full', message: `You already have ${MAX_BLEND_PER_PLAYER} songs in the Blend. Remove a source first.` })
      return false
    }
    sources.push({ via: msg.via, label: msg.label, image: msg.image ?? null, count: kept.length })
    lists.push(kept)
    room.blendMeta[player.id] = sources
    this.blend[player.id] = lists
    this.blendDirty.add(player.id)
    return true
  }

  private async start(rawPool: unknown[], avoid: string[]): Promise<boolean> {
    const room = this.room!
    if (room.phase !== 'loading' && room.phase !== 'lobby' && room.phase !== 'results') return false
    if (this.starting) return false
    if (room.daily) {
      if (room.game) {
        this.backToMenu('You’ve played today’s challenge — a new one drops at midnight.')
        return true
      }
      room.settings = dailySettings(room.daily)
    }
    if (room.settings.game !== 'songs') return this.startChallenge(room.settings.game, avoid)

    const played = this.playedSet(avoid)
    let pool: Track[] = []
    let owners = new Map<string, string[]>()
    const isBlend = room.settings.source.kind === 'blend'
    if (isBlend) {
      ;({ pool, owners } = this.blendPool(played))
    } else {
      const all: Track[] = []
      for (const item of rawPool) {
        const parsed = TrackSchema.safeParse(item)
        if (parsed.success) all.push(parsed.data)
      }
      // Songs this room (or this host) hasn't heard lately come first, in a fresh order every game.
      pool = [...shuffle(all.filter((t) => !played.has(playedKey(t))), secureRandom), ...shuffle(all.filter((t) => played.has(playedKey(t))), secureRandom)]
    }
    if (isBlend && pool.length < 4) {
      this.backToMenu('The Blend needs more songs — ask players to add their Spotify or a playlist.')
      return true
    }
    const built = buildQuestions(pool, { ...room.settings, order: 'given' }, secureRandom)
    if (!built.ok) {
      this.backToMenu(built.message)
      return true
    }

    // The song plays through the question and keeps going during the reveal, so leave room for both.
    const maxOffset = Math.max(0, Math.floor(PREVIEW_SECONDS - 1 - room.settings.guessSeconds - REVEAL_MS / 1000))
    const questions: RoomQuestion[] = built.questions.map((q) => ({
      ...q,
      clipOffset: room.settings.clipStart === 'random' ? Math.floor(secureRandom() * (maxOffset + 1)) : 0,
      owners: isBlend ? (owners.get(playedKey(q.track)) ?? []) : [],
    }))
    this.beginGame(questions, built.notice)
    return true
  }

  /** Dialogue, star and emoji games: curated questions plus any fresh AI-written ones. */
  private async startChallenge(game: ChallengeGame, avoid: string[]): Promise<boolean> {
    const room = this.room!
    if (room.daily) {
      // Everyone gets the same curated questions today, in the same order.
      const built = buildChallengeQuestions({ game, ai: [], played: new Set(), rounds: room.settings.rounds, difficulty: room.settings.difficulty }, seededRandom(room.daily * 2654435761))
      this.beginGame(built.questions.map((q) => this.toRoomQuestion(q)), null)
      return true
    }
    this.starting = true
    try {
      this.prefetch()
      const pending = this.aiInflight.get(game)
      if (pending && this.unplayedAi(game).length < room.settings.rounds) await Promise.race([pending, sleep(AI_WAIT_MS)])
    } finally {
      this.starting = false
    }
    // The host may have ended things (or the room been wiped) while we waited.
    if (this.room !== room || (room.phase !== 'loading' && room.phase !== 'lobby' && room.phase !== 'results')) return false

    const ready = this.ai.ready[game] ?? []
    const built = buildChallengeQuestions(
      { game, ai: ready, played: this.playedSet(avoid), rounds: room.settings.rounds, difficulty: room.settings.difficulty },
      secureRandom,
    )
    if (built.questions.length === 0) {
      this.backToMenu('Could not build any questions right now. Please try again.')
      return true
    }
    // AI questions are used once; remember them so the next batch is all new.
    const used = new Set(built.questions.filter((q) => q.item.ai).map((q) => q.item.id))
    if (used.size) {
      this.ai.ready[game] = ready.filter((i) => !used.has(i.id))
      this.ai.seen[game] = [...(this.ai.seen[game] ?? []), ...built.questions.filter((q) => used.has(q.item.id)).map((q) => summarize(q.item))].slice(-150)
      this.aiDirty = true
    }
    this.beginGame(
      built.questions.map((q) => this.toRoomQuestion(q)),
      built.notice,
    )
    // Write the next batch while this game plays.
    this.prefetch()
    return true
  }

  private toRoomQuestion(q: ReturnType<typeof buildChallengeQuestions>['questions'][number]): RoomQuestion {
    return {
      track: q.track,
      mode: q.mode,
      options: q.options,
      optionArt: q.optionArt,
      optionSpotify: q.optionSpotify,
      correct: q.correct,
      clipOffset: 0,
      owners: [],
      challenge: q.challenge,
      ...(q.item.song ? { song: { title: q.item.song.title, movie: q.item.song.movie, singer: q.item.song.singer } } : {}),
    }
  }

  private beginGame(questions: RoomQuestion[], notice: string | null): void {
    const room = this.room!
    const now = Date.now()
    this.pruneStalePlayers(now)
    this.resetScores()
    const awardNames = pickAwardNames(secureRandom, room.recentAwards)
    const game: GameRecord = { id: crypto.randomUUID(), questions, index: 0, startsAt: 0, endsAt: 0, answers: {}, history: [], recorded: false, awardNames }
    room.game = game
    room.phase = 'countdown'
    room.phaseEndsAt = now + COUNTDOWN_MS
    room.notice = notice
    room.played = [...room.played, ...questions.map((q) => playedKey(q.track, q.mode))].slice(-MAX_PLAYED)
    room.recentAwards = [...room.recentAwards, ...Object.values(awardNames).map((n) => n.title)].slice(-80)
    this.ctx.waitUntil(Promise.all([this.enrichRound(game, 0), this.enrichRound(game, 1)]))
    if (room.group) this.ctx.waitUntil(this.saveGroupSettings())
    if (aiEnabled(this.env)) this.ctx.waitUntil(this.nameAwards(game))
  }

  private backToMenu(notice: string): void {
    const room = this.room!
    room.phase = room.game ? 'results' : 'lobby'
    room.phaseEndsAt = null
    room.notice = notice
  }

  private playedSet(avoid: string[]): Set<string> {
    return new Set([...this.room!.played, ...avoid])
  }

  private answer(player: PlayerRecord, round: number, choice: number, now: number): boolean {
    const room = this.room!
    const game = room.game
    if (room.phase !== 'question' || !game || round !== game.index) return false
    if (game.answers[player.id]) return false
    if (now > game.endsAt + ANSWER_GRACE_MS) return false

    const question = game.questions[game.index]!
    const total = game.endsAt - game.startsAt
    const elapsed = Math.min(total, Math.max(0, now - game.startsAt))
    const correct = choice === question.correct
    const multiplier = this.isDoubleRound() ? 2 : 1
    // Racing the room: the first right answer earns a bonus; on Hard a wrong guess costs points.
    const rivals = room.players.filter((p) => p.connected).length > 1
    const first = correct && rivals && !Object.values(game.answers).some((a) => a.correct)
    const base = correct ? scoreAnswer(true, elapsed, total, player.streak + 1) + (first ? FIRST_BONUS : 0) : -WRONG_PENALTY[room.settings.difficulty]
    const points = base * multiplier
    const live = room.settings.liveScoring
    game.answers[player.id] = { choice, at: now, ms: elapsed, correct, points, applied: live, first }
    if (live) this.applyResult(player, correct, points)
    if (this.everyoneAnswered()) this.reveal(now)
    return true
  }

  private applyResult(p: PlayerRecord, correct: boolean, points: number): void {
    if (correct) {
      p.streak += 1
      p.bestStreak = Math.max(p.bestStreak, p.streak)
      p.correct += 1
      p.score += points
    } else {
      p.streak = 0
      p.score = Math.max(0, p.score + points)
    }
  }

  private isDoubleRound(): boolean {
    const room = this.room!
    const game = room.game
    return !!game && room.settings.doubleFinal && game.questions.length > 1 && game.index === game.questions.length - 1
  }

  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const room = this.room
    const att = this.attachment(ws)
    try {
      ws.close(1000, 'Closed')
    } catch {
      // already closed
    }
    if (!room || !att.pid) return

    const pid = att.pid
    const player = room.players.find((p) => p.id === pid)
    const stillHere = this.socketsOf(pid).some((s) => s !== ws)
    if (!player || stillHere) return

    const now = Date.now()
    player.connected = false
    player.leftAt = now
    player.voice = null
    if (room.hostId === pid && room.players.some((p) => p.connected)) {
      room.hostTransferAt = now + HOST_GRACE_MS
    }
    if (room.phase === 'question' && this.everyoneAnswered()) this.reveal(now)
    await this.commit()
  }

  // ---------------------------------------------------------------------------
  // Game flow

  private advance(now: number): void {
    const room = this.room!
    const game = room.game
    switch (room.phase) {
      case 'loading':
        room.phase = game ? 'results' : 'lobby'
        room.phaseEndsAt = null
        room.notice = 'Loading took too long. Please try again.'
        return
      case 'countdown':
        if (game) this.startQuestion(game, now)
        return
      case 'question':
        this.reveal(now)
        return
      case 'reveal':
        if (!game) return
        // Straight into the next song: the reveal itself counts down to it.
        if (game.index + 1 < game.questions.length) {
          game.index += 1
          game.answers = {}
          this.startQuestion(game, now)
        } else {
          this.finish()
        }
        return
      default:
        room.phaseEndsAt = null
    }
  }

  /** Open answering for the current song. */
  private startQuestion(game: GameRecord, now: number): void {
    const room = this.room!
    const q = game.questions[game.index]
    if (q) q.showArt = (q.optionArt ?? []).length === 4 && q.optionArt.every(Boolean)
    room.phase = 'question'
    game.startsAt = now
    game.endsAt = now + room.settings.guessSeconds * 1000
    room.phaseEndsAt = game.endsAt
    // Fetch the following song's missing art while this one plays.
    this.ctx.waitUntil(this.enrichRound(game, game.index + 1))
  }

  /** Close the current question: apply remaining scores and record the round. */
  private reveal(now: number): void {
    const room = this.room!
    const game = room.game
    if (!game || room.phase !== 'question') return
    const question = game.questions[game.index]!

    const picks: Record<string, Pick> = {}
    for (const p of room.players) {
      const a = game.answers[p.id]
      if (!a) p.streak = 0
      else if (!a.applied) {
        this.applyResult(p, a.correct, a.points)
        a.applied = true
      }
      picks[p.id] = { choice: a ? a.choice : null, points: a?.points ?? 0, correct: !!a?.correct, ms: a ? a.ms : null, first: !!a?.first }
    }

    game.history.push({
      index: game.index,
      mode: question.mode,
      options: question.options,
      optionArt: question.showArt ? question.optionArt : null,
      correct: question.correct,
      track: question.track,
      picks,
      owners: question.owners ?? [],
      challenge: question.challenge ?? null,
    })
    room.phase = 'reveal'
    room.phaseEndsAt = now + REVEAL_MS
  }

  private finish(): void {
    const room = this.room!
    room.phase = room.game ? 'results' : 'lobby'
    room.phaseEndsAt = null
    if (room.group && room.game && !room.game.recorded && room.game.history.length > 0) {
      room.game.recorded = true
      this.ctx.waitUntil(this.recordGame(room.game))
    }
    if (room.daily && room.game && !room.game.recorded && room.game.history.length === room.game.questions.length) {
      room.game.recorded = true
      this.ctx.waitUntil(this.recordDaily(room.daily))
    }
  }

  private everyoneAnswered(): boolean {
    const room = this.room!
    const game = room.game
    if (!game) return false
    const active = room.players.filter((p) => p.connected)
    return active.length > 0 && active.every((p) => game.answers[p.id])
  }

  private transferHost(): void {
    const room = this.room!
    room.hostTransferAt = null
    const host = room.players.find((p) => p.id === room.hostId)
    if (host?.connected) return
    const next = room.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0]
    if (next) room.hostId = next.id
  }

  private resetScores(): void {
    for (const p of this.room!.players) {
      p.score = 0
      p.streak = 0
      p.bestStreak = 0
      p.correct = 0
    }
  }

  private pruneStalePlayers(now: number, olderThan = STALE_PLAYER_MS): void {
    const room = this.room!
    room.players = room.players.filter(
      (p) => p.connected || p.id === room.hostId || p.leftAt === null || now - p.leftAt < olderThan,
    )
    for (const id of Object.keys(room.blendMeta)) if (!room.players.some((p) => p.id === id)) this.dropBlend(id)
  }

  private dropBlend(playerId: string): void {
    delete this.room!.blendMeta[playerId]
    if (this.blend[playerId]) {
      delete this.blend[playerId]
      this.blendDirty.add(playerId)
    }
  }

  /**
   * Everyone's songs, interleaved so each player gets a fair share of rounds.
   * Songs nobody has played in this room come first (in a new order every game),
   * and a few songs several players brought (Blend matches) lead the way.
   */
  private blendPool(played: Set<string>): { pool: Track[]; owners: Map<string, string[]> } {
    const room = this.room!
    const lists = room.players
      .filter((p) => this.blend[p.id]?.some((l) => l.length))
      .map((p) => {
        const mine = dedupeTracks(this.blend[p.id]!.flat())
        return {
          name: p.name,
          fresh: shuffle(mine.filter((t) => !played.has(playedKey(t))), secureRandom),
          heard: shuffle(mine.filter((t) => played.has(playedKey(t))), secureRandom),
        }
      })
    const owners = new Map<string, string[]>()
    for (const l of lists) {
      for (const t of [...l.fresh, ...l.heard]) {
        const names = owners.get(playedKey(t)) ?? []
        if (!names.includes(l.name)) names.push(l.name)
        owners.set(playedKey(t), names)
      }
    }
    const interleave = (pick: (l: (typeof lists)[number]) => Track[]) => {
      const out: Track[] = []
      for (let i = 0; lists.some((l) => i < pick(l).length); i++) {
        for (const l of shuffle(lists, secureRandom)) if (pick(l)[i]) out.push(pick(l)[i]!)
      }
      return out
    }
    const fresh = interleave((l) => l.fresh)
    const heard = interleave((l) => l.heard)
    const matches = fresh.filter((t) => (owners.get(playedKey(t))?.length ?? 0) > 1)
    const leaders = shuffle(matches, secureRandom).slice(0, Math.ceil(room.settings.rounds * 0.3))
    return { pool: [...leaders, ...fresh, ...heard], owners }
  }

  // ---------------------------------------------------------------------------
  // AI: fresh challenge questions and award names

  private unplayedAi(game: ChallengeGame): ChallengeItem[] {
    const played = new Set(this.room?.played ?? [])
    return (this.ai.ready[game] ?? []).filter((i) => !played.has(i.id))
  }

  /** Have the AI write questions for the room's current challenge, unless enough are ready. */
  private prefetch(): void {
    const game = this.room?.settings.game
    if (!game || game === 'songs' || this.room?.daily || !aiEnabled(this.env) || this.aiInflight.has(game)) return
    if (this.unplayedAi(game).length >= AI_TARGET) return
    const task = (async () => {
      let items = await generateChallenges(this.env, game, AI_TARGET, this.ai.seen[game] ?? [])
      // An emoji puzzle is only as good as its song: keep the ones iTunes knows, with their clip.
      if (game === 'emoji') items = await this.verifySongs(items)
      if (!items.length || !this.room) return
      const have = this.ai.ready[game] ?? []
      const ids = new Set(have.map((i) => i.id))
      this.ai.ready[game] = [...have, ...items.filter((i) => !ids.has(i.id))].slice(-60)
      this.aiDirty = true
      await this.persist()
      this.broadcastState()
    })()
      .catch((err) => console.error('ai prefetch failed', err))
      .finally(() => this.aiInflight.delete(game))
    this.aiInflight.set(game, task)
    this.ctx.waitUntil(task)
  }

  /**
   * Keep emoji puzzles whose song iTunes knows (with its clip). When Apple won't answer
   * this server, the puzzles are kept unchecked rather than thrown away.
   */
  private async verifySongs(items: ChallengeItem[]): Promise<ChallengeItem[]> {
    const out: ChallengeItem[] = []
    let checked = 0
    for (let i = 0; i < items.length; i += 4) {
      const batch = items.slice(i, i + 4)
      const found = await Promise.all(batch.map((it) => (it.song ? findSong(it.song, 3) : Promise.resolve({ clip: null, limited: true }))))
      batch.forEach((it, n) => {
        const f = found[n]!
        if (f.limited) {
          out.push(it)
          return
        }
        checked++
        if (f.clip && it.song) out.push({ ...it, song: { ...it.song, preview: f.clip.preview, artwork: f.clip.artwork, link: f.clip.link } })
      })
    }
    console.log(`ai: ${out.length}/${items.length} emoji puzzles kept (${checked} checked against iTunes)`)
    console.log('ai: sample', out.slice(0, 6).map((i) => `${i.prompt} → ${i.answer} [${i.note}]`).join(' | '))
    return out
  }

  /** Swap in AI-written award names themed on this game (they're ready long before the results). */
  private async nameAwards(game: GameRecord): Promise<void> {
    const room = this.room
    if (!room) return
    const names = await generateAwardNames(this.env, {
      what: room.settings.game === 'songs' ? `guess the song from “${sourceTitle(room.settings)}”` : `${sourceTitle(room.settings)} — ${CHALLENGE_QUESTION[game.questions[0]?.challenge?.kind ?? 'dialogue']}`,
      highlights: game.questions.map((q) => (q.challenge ? q.track.title : `${q.track.title} (${q.track.artist})`)),
      players: room.players.filter((p) => p.connected).length,
      avoid: room.recentAwards,
    })
    if (!names || this.room?.game?.id !== game.id) return
    game.awardNames = { ...game.awardNames, ...names }
    room.recentAwards = [...room.recentAwards, ...Object.values(names).map((n) => n.title)].slice(-80)
    await this.commit()
  }

  // ---------------------------------------------------------------------------
  // Background work: album art, emoji songs, group history

  /**
   * Spotify playlist tracks arrive without album art, and emoji puzzles need their
   * song's clip for the reveal. Fetch them for one round shortly before it plays.
   */
  private async enrichRound(game: GameRecord, index: number): Promise<void> {
    const q = game.questions[index]
    if (!q) return
    if (q.song && !q.track.preview) {
      const { clip } = await findSong(q.song)
      // The album line stays the puzzle's decode.
      if (clip) q.track = { ...q.track, preview: clip.preview, artwork: clip.artwork, link: clip.link }
    } else if (!q.challenge) {
      q.optionArt ??= []
      q.optionSpotify ??= []
      const jobs = q.options.map(async (_, i) => {
        const id = q.optionSpotify[i]
        if (q.optionArt[i] || !id) return
        if (!this.artCache.has(id)) this.artCache.set(id, await spotifyArtwork(id))
        const art = this.artCache.get(id)
        if (art) q.optionArt[i] = art
      })
      await Promise.all(jobs)
      if (!q.track.artwork && q.optionArt[q.correct]) q.track.artwork = q.optionArt[q.correct]!
    }
    // Only persist if this game is still the current one.
    if (this.room?.game?.id === game.id) await this.persist()
  }

  /** A finished daily challenge goes on today's leaderboard. */
  private async recordDaily(day: number): Promise<void> {
    const room = this.room
    const p = room?.players[0]
    if (!room || !p) return
    try {
      await this.env.DB.prepare(
        `INSERT OR IGNORE INTO daily_scores (day, room_code, user_id, name, score, correct, total, played_at)
         VALUES (?, ?, (SELECT id FROM users WHERE id = ?), ?, ?, ?, ?, ?)`,
      )
        .bind(day, room.code, p.userId, p.name, p.score, p.correct, room.game?.questions.length ?? 0, Date.now())
        .run()
    } catch (err) {
      console.error('recording daily score failed (is migration 0004 applied?)', err)
    }
  }

  private async saveGroupSettings(): Promise<void> {
    const room = this.room
    if (!room?.group) return
    try {
      await this.env.DB.prepare('UPDATE groups SET settings_json = ?, active_room = ?, active_room_at = ? WHERE id = ?')
        .bind(JSON.stringify(room.settings), room.code, Date.now(), room.group.id)
        .run()
    } catch (err) {
      console.error('saving group settings failed', err)
    }
  }

  private async recordGame(game: GameRecord): Promise<void> {
    const room = this.room
    if (!room?.group) return
    const ranked = [...room.players].sort((a, b) => b.score - a.score || b.correct - a.correct)
    const now = Date.now()
    try {
      const statements = [
        this.env.DB.prepare('INSERT INTO games (id, group_id, room_code, source_title, rounds, played_at) VALUES (?, ?, ?, ?, ?, ?)').bind(
          game.id,
          room.group.id,
          room.code,
          sourceTitle(room.settings).slice(0, 160),
          game.history.length,
          now,
        ),
        ...ranked.map((p, i) =>
          this.env.DB.prepare(
            `INSERT INTO game_players (game_id, user_id, name, score, correct, rank)
             VALUES (?, (SELECT id FROM users WHERE id = ?), ?, ?, ?, ?)`,
          ).bind(game.id, p.userId, p.name, p.score, p.correct, i + 1),
        ),
      ]
      await this.env.DB.batch(statements)
    } catch (err) {
      console.error('recording game failed', err)
    }
    // The group remembers what it played, so its next room starts with new songs too.
    // (Kept apart from the history batch: it needs migration 0003.)
    try {
      await this.env.DB.prepare('UPDATE groups SET played_json = ? WHERE id = ?').bind(JSON.stringify(room.played.slice(-600)), room.group.id).run()
    } catch (err) {
      console.error('saving played songs failed (is migration 0003 applied?)', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Views, persistence and transport

  private view(pid: string | null): PublicState {
    const room = this.room!
    const game = room.game
    const inRound = game && IN_GAME.includes(room.phase)
    const question = inRound ? game.questions[game.index] : undefined
    const last = room.phase === 'reveal' && game ? game.history[game.history.length - 1] : undefined
    const live = room.settings.liveScoring
    const answering = room.phase === 'question' || room.phase === 'reveal'
    const mine = pid && game && answering ? game.answers[pid] : undefined
    const next = game?.questions[game.index + 1]

    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      settings: room.settings,
      phaseEndsAt: room.phaseEndsAt,
      notice: room.notice,
      group: room.group,
      players: room.players.map((p) => {
        const a = game && answering ? game.answers[p.id] : undefined
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          photo: p.photo,
          signedIn: !!p.userId,
          score: p.score,
          streak: p.streak,
          bestStreak: p.bestStreak,
          correct: p.correct,
          connected: p.connected,
          answered: room.phase === 'question' && !!a,
          answerMs: a ? a.ms : null,
          roundPoints: a && (live || room.phase === 'reveal') ? a.points : null,
          first: !!a?.first && (live || room.phase === 'reveal'),
          voice: p.connected ? (p.voice ?? null) : null,
        }
      }),
      round:
        game && question
          ? {
              index: game.index,
              total: game.questions.length,
              mode: question.mode,
              double: this.isDoubleRound(),
              startsAt: room.phase === 'countdown' ? (room.phaseEndsAt ?? 0) : game.startsAt,
              endsAt: room.phase === 'countdown' ? (room.phaseEndsAt ?? 0) + room.settings.guessSeconds * 1000 : game.endsAt,
              // Challenge rounds are silent while answering; an emoji song plays at its reveal.
              preview: question.challenge ? '' : question.track.preview,
              clipOffset: question.clipOffset ?? 0,
              difficulty: room.settings.difficulty,
              options: room.phase === 'countdown' ? null : question.options,
              optionArt: room.phase !== 'countdown' && question.showArt ? question.optionArt : null,
              yourChoice: mine ? mine.choice : null,
              yourResult:
                mine && live
                  ? {
                      correct: mine.correct,
                      points: mine.points,
                      first: !!mine.first,
                      correctIndex: question.correct,
                      song: mine.correct && question.challenge?.kind === 'emoji' && question.track.preview ? question.track.preview : null,
                      ...(mine.correct && question.song && !question.track.preview ? { find: { title: question.song.title, movie: question.song.movie } } : {}),
                    }
                  : null,
              reveal: last
                ? {
                    correct: last.correct,
                    track: question.track,
                    picks: last.picks,
                    owners: question.owners ?? [],
                    ...(question.song && !question.track.preview ? { find: { title: question.song.title, movie: question.song.movie } } : {}),
                  }
                : null,
              challenge: room.phase === 'countdown' ? null : (question.challenge ?? null),
              nextPreview: room.phase === 'reveal' && next && !next.challenge ? next.track.preview : null,
            }
          : null,
      history:
        (room.phase === 'results' || room.phase === 'loading') && game
          ? game.history.map((h) => ({ ...h, optionArt: h.optionArt ?? null, owners: h.owners ?? [], challenge: h.challenge ?? null, track: game.questions[h.index]?.track ?? h.track }))
          : null,
      solo: room.solo,
      blend: Object.entries(room.blendMeta)
        .filter(([, sources]) => sources.length > 0)
        .map(([playerId, sources]) => ({ playerId, ...sources[0]!, count: sources.reduce((n, s) => n + s.count, 0), sources })),
      ai: aiEnabled(this.env),
      daily: room.daily,
      awardNames: room.phase === 'results' || room.phase === 'loading' ? (game?.awardNames ?? null) : null,
    }
  }

  private async commit(): Promise<void> {
    await this.persist()
    await this.schedule()
    this.broadcastState()
  }

  private async persist(): Promise<void> {
    if (this.room) await this.ctx.storage.put('room', this.room)
    for (const pid of this.blendDirty) {
      if (this.blend[pid]) await this.ctx.storage.put(`blend:${pid}`, this.blend[pid])
      else await this.ctx.storage.delete(`blend:${pid}`)
    }
    this.blendDirty.clear()
    if (this.aiDirty) {
      this.aiDirty = false
      await this.ctx.storage.put('ai', this.ai)
    }
  }

  private async schedule(): Promise<void> {
    const room = this.room
    if (!room) return
    const times = [room.phaseEndsAt, room.hostTransferAt, room.lastActive + IDLE_TTL_MS].filter((t): t is number => t !== null)
    await this.ctx.storage.setAlarm(Math.min(...times))
  }

  private attachment(ws: WebSocket): Attachment {
    const a = ws.deserializeAttachment() as Partial<Attachment> | null
    return { pid: a?.pid ?? null, lastReaction: a?.lastReaction ?? 0, lastChat: a?.lastChat ?? 0, user: a?.user ?? null, member: a?.member ?? false }
  }

  private connectedSockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s.readyState === WebSocket.OPEN)
  }

  private socketsOf(pid: string): WebSocket[] {
    return this.connectedSockets().filter((s) => this.attachment(s).pid === pid)
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      // Socket is going away; the close handler will clean up.
    }
  }

  private sendState(ws: WebSocket): void {
    if (!this.room) return
    this.send(ws, { t: 'state', state: this.view(this.attachment(ws).pid), now: Date.now() })
  }

  private broadcastState(): void {
    for (const ws of this.connectedSockets()) this.sendState(ws)
  }

  private broadcastRaw(msg: ServerMessage): void {
    const data = JSON.stringify(msg)
    for (const ws of this.connectedSockets()) {
      try {
        ws.send(data)
      } catch {
        // ignore
      }
    }
  }
}
