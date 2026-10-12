import { DurableObject } from 'cloudflare:workers'
import { findPreset } from '../shared/catalog'
import {
  ClientMessageSchema,
  DEFAULT_SETTINGS,
  MAX_BLEND_TRACKS,
  normalizeSettings,
  SettingsSchema,
  TrackSchema,
  type BlendEntry,
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
import { buildQuestions, shuffle, type Question } from '../shared/questions'
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
import { compareKey, primaryArtist, sanitizeName } from '../shared/text'
import { json } from './http'
import { spotifyArtwork } from './playlist'
import type { RoomInitOptions } from './rooms'

/** Rooms with no activity for this long are wiped from storage. */
const IDLE_TTL_MS = 6 * 60 * 60 * 1000
/** Disconnected players are dropped when a new game starts after this long. */
const STALE_PLAYER_MS = 60_000
const MAX_MESSAGE_BYTES = 512 * 1024
const REACTION_COOLDOWN_MS = 400
const PREVIEW_SECONDS = 30

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
  allowGuests: boolean
  solo: boolean
  /** What each player added to the Blend; the songs themselves live under the 'blend' storage key. */
  blendMeta: Record<string, Omit<BlendEntry, 'playerId'>>
}

interface SessionIdentity {
  id: string
  name: string
  picture: string | null
}

interface Attachment {
  pid: string | null
  lastReaction: number
  user: SessionIdentity | null
  member: boolean
}

const IN_GAME: Phase[] = ['countdown', 'question', 'reveal']

/** Same song regardless of which service or player it came from. */
function trackKey(t: Track): string {
  return `${compareKey(t.title)}|${compareKey(primaryArtist(t.artist))}`
}

function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

function sourceTitle(source: Source): string {
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
 * One Durable Object per room. It is the single source of truth for the game:
 * it owns the player list, the questions, the timers (via alarms) and the scores,
 * and pushes a personalised snapshot to every connected browser after each change.
 */
export class GameRoom extends DurableObject<Env> {
  private room: RoomRecord | null = null
  /** Blend songs per player id (kept apart from the room record, which is rewritten on every answer). */
  private blend: Record<string, Track[]> = {}
  private blendDirty = false
  private artCache = new Map<string, string | null>()

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
        for (const p of stored.players) {
          p.userId ??= null
          p.photo ??= null
          p.bestStreak ??= p.streak
        }
      }
      this.room = stored ?? null
      this.blend = (await ctx.storage.get<Record<string, Track[]>>('blend')) ?? {}
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
      settings: opts.settings ? normalizeSettings(opts.settings) : DEFAULT_SETTINGS,
      players: [],
      game: null,
      phaseEndsAt: null,
      hostTransferAt: null,
      notice: null,
      group: opts.group ?? null,
      allowGuests: opts.group ? !!opts.allowGuests : true,
      solo: !!opts.solo,
      blendMeta: {},
    }
    this.blend = {}
    this.blendDirty = true
    await this.persist()
    await this.schedule()
    return true
  }

  async info(): Promise<RoomInfo> {
    const room = this.room
    if (!room) return { code: '', exists: false, phase: null, players: 0, group: null, membersOnly: false, solo: false }
    return {
      code: room.code,
      exists: true,
      phase: room.phase,
      players: room.players.filter((p) => p.connected).length,
      group: room.group,
      membersOnly: !!room.group && !room.allowGuests,
      solo: room.solo,
    }
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
    const changed = this.handle(ws, parsed)
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
  // Message handling. Returns true when room state changed.

  private handle(ws: WebSocket, msg: ClientMessage): boolean {
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

      case 'blend': {
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
        this.blend[player.id] = tracks
        this.blendDirty = true
        room.blendMeta[player.id] = { via: msg.via, label: msg.label, image: msg.image ?? null, count: tracks.length }
        return true
      }

      case 'unblend': {
        if (!room.blendMeta[player.id]) return false
        this.dropBlend(player.id)
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
        const next = SettingsSchema.safeParse({ ...room.settings, ...msg.settings })
        if (!next.success) return false
        if (next.data.source.kind === 'preset' && !findPreset(next.data.source.id)) {
          this.send(ws, { t: 'error', code: 'bad_source', message: 'Unknown category.' })
          return false
        }
        room.settings = next.data
        room.notice = null
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
        if (msg.settings && !(msg.settings.source.kind === 'preset' && !findPreset(msg.settings.source.id))) room.settings = msg.settings
        return this.start(msg.pool, now)

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
    if (room.group && !room.allowGuests && !att.member) {
      this.send(ws, {
        t: 'error',
        code: 'members_only',
        message: att.user ? `This game is only for members of “${room.group.name}”.` : `Sign in to join “${room.group.name}”’s game.`,
      })
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
    return true
  }

  private start(rawPool: unknown[], now: number): boolean {
    const room = this.room!
    if (room.phase !== 'loading' && room.phase !== 'lobby' && room.phase !== 'results') return false

    let pool: Track[] = []
    let owners = new Map<string, string[]>()
    const isBlend = room.settings.source.kind === 'blend'
    if (isBlend) {
      ;({ pool, owners } = this.blendPool())
    } else {
      for (const item of rawPool) {
        const parsed = TrackSchema.safeParse(item)
        if (parsed.success) pool.push(parsed.data)
      }
    }
    if (isBlend && pool.length < 4) {
      room.phase = room.game ? 'results' : 'lobby'
      room.phaseEndsAt = null
      room.notice = 'The Blend needs more songs — ask players to add their Spotify or a playlist.'
      return true
    }
    const built = buildQuestions(pool, { ...room.settings, order: isBlend ? 'given' : 'shuffle' }, secureRandom)
    if (!built.ok) {
      room.phase = room.game ? 'results' : 'lobby'
      room.phaseEndsAt = null
      room.notice = built.message
      return true
    }

    // The song plays through the question and keeps going during the reveal, so leave room for both.
    const maxOffset = Math.max(0, Math.floor(PREVIEW_SECONDS - 1 - room.settings.guessSeconds - REVEAL_MS / 1000))
    const questions: RoomQuestion[] = built.questions.map((q) => ({
      ...q,
      clipOffset: room.settings.clipStart === 'random' ? Math.floor(secureRandom() * (maxOffset + 1)) : 0,
      owners: isBlend ? (owners.get(trackKey(q.track)) ?? []) : [],
    }))

    this.pruneStalePlayers(now)
    this.resetScores()
    const game: GameRecord = { id: crypto.randomUUID(), questions, index: 0, startsAt: 0, endsAt: 0, answers: {}, history: [], recorded: false }
    room.game = game
    room.phase = 'countdown'
    room.phaseEndsAt = now + COUNTDOWN_MS
    room.notice = built.notice
    this.ctx.waitUntil(Promise.all([this.enrichRound(game, 0), this.enrichRound(game, 1)]))
    if (room.group) this.ctx.waitUntil(this.saveGroupSettings())
    return true
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
        room.notice = 'Loading songs took too long. Please try again.'
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
      this.blendDirty = true
    }
  }

  /**
   * Everyone's songs, interleaved so each player gets a fair share of rounds.
   * Songs that several players brought (a Blend match) come first.
   */
  private blendPool(): { pool: Track[]; owners: Map<string, string[]> } {
    const room = this.room!
    const lists = room.players
      .filter((p) => this.blend[p.id]?.length)
      .map((p) => ({ name: p.name, tracks: shuffle(this.blend[p.id]!, secureRandom) }))
    const owners = new Map<string, string[]>()
    for (const l of lists) {
      for (const t of l.tracks) {
        const names = owners.get(trackKey(t)) ?? []
        if (!names.includes(l.name)) names.push(l.name)
        owners.set(trackKey(t), names)
      }
    }
    const interleaved: Track[] = []
    for (let i = 0; lists.some((l) => i < l.tracks.length); i++) {
      for (const l of shuffle(lists, secureRandom)) if (l.tracks[i]) interleaved.push(l.tracks[i]!)
    }
    const shared = interleaved.filter((t) => (owners.get(trackKey(t))?.length ?? 0) > 1)
    return { pool: [...shuffle(shared, secureRandom), ...interleaved], owners }
  }

  // ---------------------------------------------------------------------------
  // Background work: album art, group history

  /**
   * Spotify playlist tracks arrive without album art. Fetch it for one round's song
   * and its wrong answers shortly before the round (a few requests per round).
   */
  private async enrichRound(game: GameRecord, index: number): Promise<void> {
    const q = game.questions[index]
    if (!q) return
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
    // Only persist if this game is still the current one.
    if (this.room?.game?.id === game.id) await this.persist()
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
          sourceTitle(room.settings.source).slice(0, 160),
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
              preview: question.track.preview,
              clipOffset: question.clipOffset ?? 0,
              difficulty: room.settings.difficulty,
              options: room.phase === 'countdown' ? null : question.options,
              optionArt: room.phase !== 'countdown' && question.showArt ? question.optionArt : null,
              yourChoice: mine ? mine.choice : null,
              yourResult: mine && live ? { correct: mine.correct, points: mine.points, first: !!mine.first, correctIndex: question.correct } : null,
              reveal: last ? { correct: last.correct, track: question.track, picks: last.picks, owners: question.owners ?? [] } : null,
              nextPreview: room.phase === 'reveal' ? (game.questions[game.index + 1]?.track.preview ?? null) : null,
            }
          : null,
      history:
        (room.phase === 'results' || room.phase === 'loading') && game
          ? game.history.map((h) => ({ ...h, optionArt: h.optionArt ?? null, owners: h.owners ?? [], track: game.questions[h.index]?.track ?? h.track }))
          : null,
      solo: room.solo,
      blend: Object.entries(room.blendMeta).map(([playerId, m]) => ({ playerId, ...m })),
    }
  }

  private async commit(): Promise<void> {
    await this.persist()
    await this.schedule()
    this.broadcastState()
  }

  private async persist(): Promise<void> {
    if (this.room) await this.ctx.storage.put('room', this.room)
    if (this.blendDirty) {
      this.blendDirty = false
      await this.ctx.storage.put('blend', this.blend)
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
    return { pid: a?.pid ?? null, lastReaction: a?.lastReaction ?? 0, user: a?.user ?? null, member: a?.member ?? false }
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
