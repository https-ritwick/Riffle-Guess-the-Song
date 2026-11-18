import clsx from 'clsx'
import { ArrowLeft, Check, CheckCheck, ChevronDown, Clock3, Copy, Headphones, Info, MessageCircle, Mic, MicOff, PhoneOff, Reply, SendHorizontal, Smile, Sticker, X } from 'lucide-react'
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import {
  EMOJI_SETS,
  findSticker,
  isEmojiOnly,
  MAX_CHAT_LENGTH,
  recipientsOf,
  replySnapshot,
  STICKERS,
  tickState,
  TYPING_IDLE_MS,
  TYPING_PING_MS,
  type ChatMessage,
  type ChatReceipts,
  type ChatReply,
  type StickerId,
  type TickState,
} from '../../shared/chat'
import type { PublicPlayer } from '../../shared/protocol'
import { PlayerAvatar } from '../components/ui'
import { useSite } from '../lib/site'
import { load, save } from '../lib/storage'
import type { ChatRejection } from '../lib/useRoom'
import type { VoiceChannel, VoiceSnapshot } from '../lib/voice'
import { useRoomContext } from './context'

/** A sticker drawn as a die-cut decal: big emoji, bold caption, white border. */
export function StickerArt({ id, size = 'md' }: { id: StickerId; size?: 'sm' | 'md' }) {
  const s = findSticker(id)
  if (!s) return null
  const tilt = ((id.charCodeAt(0) + id.length) % 7) - 3
  return (
    <span
      className={clsx(
        'inline-flex flex-col items-center justify-center rounded-[1.4rem] border-[3px] border-white text-center shadow-[0_6px_18px_rgba(0,0,0,0.45)]',
        size === 'md' ? 'h-28 w-28 gap-1 p-2' : 'h-[4.6rem] w-full gap-0.5 p-1',
      )}
      style={{ background: `linear-gradient(135deg, ${s.colors[0]}, ${s.colors[1]})`, transform: `rotate(${tilt}deg)` }}
      aria-label={`${s.label} sticker`}
      role="img"
    >
      <span className={clsx('leading-none drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)]', size === 'md' ? 'text-5xl' : 'text-3xl')}>{s.emoji}</span>
      <span
        className={clsx('font-black leading-[1.05] tracking-tight text-white uppercase [text-shadow:0_2px_0_rgba(0,0,0,0.35)]', size === 'md' ? 'text-[13px]' : 'text-[9px]')}
      >
        {s.label}
      </span>
    </span>
  )
}

function timeLabel(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function dayLabel(at: number) {
  const day = new Date(at).toDateString()
  const today = new Date()
  if (day === today.toDateString()) return 'Today'
  today.setDate(today.getDate() - 1)
  if (day === today.toDateString()) return 'Yesterday'
  return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Like WhatsApp groups, everyone's name has its own colour. */
/** The palette lives in styles.css (--chat-name-0…11) so each theme gets readable shades. */
const NAME_COLOR_COUNT = 12
export function nameColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return `var(--chat-name-${Math.abs(h) % NAME_COLOR_COUNT})`
}

function snippet(r: { text?: string; sticker?: StickerId }) {
  if (r.sticker) return `${findSticker(r.sticker)?.emoji ?? ''} Sticker`
  return r.text ?? ''
}

function typingText(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  const others = names.length - 2
  return `${names[0]}, ${names[1]} and ${others} other${others === 1 ? '' : 's'} are typing…`
}

const BUBBLE_MINE = 'var(--color-bubble-mine)'
const BUBBLE_THEIRS = 'var(--color-raised)'

/** The little notch on the first bubble of a run. */
function Tail({ mine }: { mine: boolean }) {
  return (
    <svg viewBox="0 0 8 13" aria-hidden="true" className={clsx('absolute top-0 h-[13px] w-2', mine ? '-right-2' : '-left-2')} style={mine ? undefined : { transform: 'scaleX(-1)' }}>
      <path fill={mine ? BUBBLE_MINE : BUBBLE_THEIRS} d="M0 0h6.5a1.5 1.5 0 0 1 1.2 2.4L0 12.5z" />
    </svg>
  )
}

const TICK_LABEL: Record<TickState, string> = { pending: 'Sending', sent: 'Sent', delivered: 'Delivered', read: 'Read' }

/** WhatsApp's ticks: a clock while sending, one grey tick sent, two grey delivered, two blue read by everyone. */
function Ticks({ state }: { state: TickState }) {
  return (
    <span role="img" aria-label={TICK_LABEL[state]} title={TICK_LABEL[state]} data-testid="chat-ticks" data-state={state} className="inline-flex">
      {state === 'pending' ? (
        <Clock3 className="h-3 w-3" />
      ) : state === 'sent' ? (
        <Check className="h-[15px] w-[15px]" />
      ) : (
        <CheckCheck className={clsx('h-[15px] w-[15px]', state === 'read' && 'text-sky-400')} />
      )}
    </span>
  )
}

/** A quoted message: inside a reply, and above the message box while you write one. */
function Quote({ r, you, onJump }: { r: ChatReply; you: string; onJump?: (id: string) => void }) {
  const color = nameColor(r.from)
  const sticker = r.sticker ? findSticker(r.sticker) : null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onJump?.(r.id)
      }}
      className="mb-1 flex w-full min-w-0 overflow-hidden rounded-lg bg-black/25 text-left transition hover:bg-black/35"
      style={{ boxShadow: `inset 4px 0 0 ${color}` }}
      aria-label={`Replying to ${r.from === you ? 'you' : r.name}: ${snippet(r)}`}
      data-testid="chat-quote"
    >
      <span className="min-w-0 flex-1 py-1 pr-2 pl-3">
        <span className="block truncate text-[12.5px] font-semibold" style={{ color }}>
          {r.from === you ? 'You' : r.name}
        </span>
        <span className="line-clamp-2 text-[13px] leading-snug break-words text-gray-300" style={{ overflowWrap: 'anywhere' }}>
          {snippet(r)}
        </span>
      </span>
      {sticker && (
        <span className="flex w-11 shrink-0 items-center justify-center text-2xl" style={{ background: `linear-gradient(135deg, ${sticker.colors[0]}, ${sticker.colors[1]})` }}>
          {sticker.emoji}
        </span>
      )}
    </button>
  )
}

interface MessageActions {
  reply: (m: ChatMessage) => void
  select: (m: ChatMessage) => void
  jump: (id: string) => void
}
const NO_ACTIONS: MessageActions = { reply: () => {}, select: () => {}, jump: () => {} }

/** How far to drag a message to the right to reply to it. */
const SWIPE_REPLY_PX = 56

const Message = memo(function Message({
  m,
  you,
  first,
  ticks,
  selected,
  flash,
  actions,
}: {
  m: ChatMessage
  you: string
  /** First of a run from the same person: shows their name, avatar and the bubble's notch. */
  first: boolean
  ticks?: TickState
  selected?: boolean
  flash?: boolean
  actions: MessageActions
}) {
  const mine = m.from === you
  const big = !!m.text && !m.replyTo && isEmojiOnly(m.text)
  const color = nameColor(m.from)
  const live = !m.pending && !m.id.startsWith('local:')
  // Touch: swipe right to reply, press and hold to pick the message.
  const [dx, setDx] = useState(0)
  const gesture = useRef<{ x: number; y: number; dx: number; dir: 'h' | 'v' | null; timer: number } | null>(null)

  const end = (fire: boolean) => {
    const g = gesture.current
    if (g) clearTimeout(g.timer)
    gesture.current = null
    if (fire && g && g.dx >= SWIPE_REPLY_PX) actions.reply(m)
    setDx(0)
  }
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' || !live) return
    const timer = window.setTimeout(() => {
      if (gesture.current?.dir !== null) return
      gesture.current = null
      navigator.vibrate?.(12)
      actions.select(m)
    }, 450)
    gesture.current = { x: e.clientX, y: e.clientY, dx: 0, dir: null, timer }
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current
    if (!g) return
    const mx = e.clientX - g.x
    const my = e.clientY - g.y
    if (!g.dir) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      clearTimeout(g.timer)
      g.dir = mx > 0 && Math.abs(mx) > Math.abs(my) * 1.3 ? 'h' : 'v'
      if (g.dir === 'v') {
        gesture.current = null
        return
      }
    }
    g.dx = Math.max(0, Math.min(mx, 90))
    setDx(g.dx)
  }

  const meta = (
    <>
      {timeLabel(m.at)}
      {mine && ticks && <Ticks state={ticks} />}
    </>
  )
  const name = !mine && first && (
    <span className="block truncate px-1 text-[12.5px] font-semibold" style={{ color }}>
      {m.name}
    </span>
  )

  let body
  if (m.sticker || big) {
    body = (
      <div className={clsx('flex min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
        {name && <span className="mb-0.5 rounded-md bg-black/30 py-0.5">{name}</span>}
        {m.replyTo && (
          <div className="max-w-[15rem] rounded-xl p-1" style={{ background: mine ? BUBBLE_MINE : BUBBLE_THEIRS }}>
            <Quote r={m.replyTo} you={you} onJump={actions.jump} />
          </div>
        )}
        <span className="relative pt-1 pb-2">
          {m.sticker ? <StickerArt id={m.sticker} /> : <span className="block px-1 text-4xl leading-tight">{m.text}</span>}
          <span className="absolute right-0 bottom-0 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-px text-[10.5px] text-snow/85">{meta}</span>
        </span>
      </div>
    )
  } else {
    body = (
      <div
        className={clsx('relative min-w-0 rounded-xl px-1.5 pt-1 pb-1.5 text-[15px] leading-snug text-gray-50 shadow-sm', first && (mine ? 'rounded-tr-none' : 'rounded-tl-none'), m.replyTo && 'min-w-[9.5rem]')}
        style={{ background: mine ? BUBBLE_MINE : BUBBLE_THEIRS }}
      >
        {first && <Tail mine={mine} />}
        {name}
        {m.replyTo && <Quote r={m.replyTo} you={you} onJump={actions.jump} />}
        <p className="px-1 break-words whitespace-pre-wrap" style={{ overflowWrap: 'anywhere' }}>
          {m.text}
          {/* Keeps room on the last line for the time and ticks. */}
          <span aria-hidden="true" className={clsx('inline-block', mine ? 'w-[4.4rem]' : 'w-[3.3rem]')} />
        </p>
        <span className="absolute right-2 bottom-1 flex items-center gap-1 text-[11px] text-white/55">{meta}</span>
      </div>
    )
  }

  return (
    <li
      data-mid={m.id}
      data-testid="chat-message"
      data-pending={m.pending ? '' : undefined}
      className={clsx(
        'group/msg relative -mx-3 flex px-3 py-px transition-colors duration-200 select-text [-webkit-touch-callout:none] [touch-action:pan-y]',
        mine ? 'justify-end' : 'justify-start',
        first ? 'mt-2' : 'mt-0.5',
        selected && 'bg-sky-400/15',
        flash && 'msg-flash',
        m.pending && 'opacity-70',
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => end(true)}
      onPointerCancel={() => end(false)}
      onContextMenu={(e) => {
        if (!live) return
        e.preventDefault()
        actions.select(m)
      }}
    >
      {dx > 0 && (
        <span
          className="absolute top-1/2 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white"
          style={{ opacity: Math.min(1, dx / SWIPE_REPLY_PX), transform: `translateY(-50%) scale(${0.6 + 0.4 * Math.min(1, dx / SWIPE_REPLY_PX)})` }}
          aria-hidden="true"
        >
          <Reply className="h-4 w-4" />
        </span>
      )}
      <div
        className={clsx('flex max-w-[88%] min-w-0 items-start gap-1.5', mine && 'flex-row-reverse')}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: gesture.current ? 'none' : 'transform 0.2s' }}
      >
        {!mine && (
          <span className="w-7 shrink-0">
            {first && <PlayerAvatar avatar={m.avatar} photo={m.photo} name={m.name} size="sm" />}
          </span>
        )}
        {body}
        {live && actions !== NO_ACTIONS && (
          <span className="flex shrink-0 items-center self-center opacity-0 transition group-hover/msg:opacity-100 focus-within:opacity-100 [@media(hover:none)]:hidden">
            <button type="button" onClick={() => actions.reply(m)} aria-label="Reply" title="Reply" className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
              <Reply className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => actions.select(m)} aria-label="Message options" title="More" className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
              <ChevronDown className="h-4 w-4" />
            </button>
          </span>
        )}
      </div>
    </li>
  )
})

/** Someone (or several people) typing: their avatar and a bubble of bouncing dots. */
function TypingBubble({ players }: { players: PublicPlayer[] }) {
  const p = players[0]!
  return (
    <li className="mt-2 flex items-start gap-1.5" data-testid="chat-typing" aria-hidden="true">
      <span className="relative w-7 shrink-0">
        <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" />
        {players.length > 1 && (
          <span className="absolute -right-1 -bottom-1 rounded-full bg-gray-800 px-1 text-[9px] font-bold text-white ring-2 ring-panel">+{players.length - 1}</span>
        )}
      </span>
      <span className="relative flex items-center gap-1 rounded-xl rounded-tl-none px-3.5 py-3" style={{ background: BUBBLE_THEIRS }}>
        <Tail mine={false} />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-300" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-300" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-gray-300" />
      </span>
    </li>
  )
}

/** A new run starts with a new person, a new day, or after a few quiet minutes. */
const RUN_GAP_MS = 5 * 60_000

/**
 * The conversation. Kept apart from the message box so typing doesn't re-render
 * every message, and it follows new messages unless you've scrolled up to read.
 */
const MessageList = memo(function MessageList({
  messages,
  you,
  listRef,
  atBottom,
  receipts,
  roster,
  typists,
  selected,
  flash,
  unreadFrom,
  actions,
}: {
  messages: ChatMessage[]
  you: string
  listRef: RefObject<HTMLUListElement | null>
  atBottom: RefObject<boolean>
  receipts: ChatReceipts
  /** Everyone in the room (for working out the ticks). */
  roster: { id: string }[]
  typists: PublicPlayer[]
  selected: string | null
  flash: string | null
  /** What was unread when the chat was opened: messages after `at`, `count` of them. */
  unreadFrom: { at: number; count: number } | null
  actions: MessageActions
}) {
  const unreadCount = unreadFrom?.count ?? 0
  let dividerShown = false
  return (
    <ul
      ref={listRef}
      onScroll={(e) => {
        const el = e.currentTarget
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
      }}
      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-3 [contain:content]"
      aria-live="polite"
      data-testid="chat-messages"
    >
      {messages.length === 0 && (
        <li className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-gray-400">
          <span className="text-4xl">💬</span>
          Say hi, talk trash, drop a sticker.
        </li>
      )}
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const newDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()
        const divider = !dividerShown && unreadCount > 0 && m.at > unreadFrom!.at && m.from !== you
        if (divider) dividerShown = true
        const first = newDay || divider || !prev || prev.from !== m.from || m.at - prev.at > RUN_GAP_MS
        const key = m.cid ? `${m.from}:${m.cid}` : m.id
        return (
          <Fragment key={key}>
            {newDay && (
              <li className="my-2 flex justify-center pt-1" aria-hidden="true">
                <span className="rounded-lg bg-raised px-3 py-1 text-[11.5px] font-medium text-gray-300 shadow-sm">{dayLabel(m.at)}</span>
              </li>
            )}
            {divider && (
              <li data-unread className="-mx-3 my-2 bg-black/25 py-1 text-center text-[12px] font-semibold text-gray-200" data-testid="chat-unread-divider">
                {unreadCount} unread message{unreadCount === 1 ? '' : 's'}
              </li>
            )}
            <Message
              m={m}
              you={you}
              first={first}
              ticks={m.from === you ? tickState(m, receipts, roster) : undefined}
              selected={selected === m.id}
              flash={flash === m.id}
              actions={actions}
            />
          </Fragment>
        )
      })}
      {typists.length > 0 && <TypingBubble players={typists} />}
    </ul>
  )
})

/** Who has seen one of your messages: like WhatsApp's "Message info". */
function MessageInfo({ m, you, receipts, players }: { m: ChatMessage; you: string; receipts: ChatReceipts; players: PublicPlayer[] }) {
  const to = recipientsOf(m, receipts, players)
  const read = to.filter((id) => receipts[id]!.read >= m.at)
  const delivered = to.filter((id) => receipts[id]!.delivered >= m.at && receipts[id]!.read < m.at)
  const waiting = to.filter((id) => receipts[id]!.delivered < m.at)
  const section = (title: string, icon: ReactNode, ids: string[], testid: string) =>
    ids.length > 0 && (
      <section className="mb-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/5" data-testid={testid}>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-300 uppercase">
          {icon} {title} · {ids.length}
        </h3>
        <ul className="space-y-2">
          {ids.map((id) => {
            const p = players.find((x) => x.id === id)!
            return (
              <li key={id} className="flex items-center gap-2.5">
                <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-white">{p.name}</span>
                {!p.connected && <span className="text-[11px] text-gray-500">offline</span>}
              </li>
            )
          })}
        </ul>
      </section>
    )
  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-panel p-3" data-testid="chat-info">
      <ul className="pointer-events-none mb-4 rounded-2xl bg-black/25 px-3 pt-1 pb-3">
        <Message m={m} you={you} first ticks={tickState(m, receipts, players)} actions={NO_ACTIONS} />
      </ul>
      {section('Read by', <CheckCheck className="h-4 w-4 text-sky-400" />, read, 'chat-info-read')}
      {section('Delivered to', <CheckCheck className="h-4 w-4 text-gray-400" />, delivered, 'chat-info-delivered')}
      {section('Not delivered yet', <Check className="h-4 w-4 text-gray-500" />, waiting, 'chat-info-waiting')}
      {to.length === 0 && <p className="text-center text-sm text-gray-400">Nobody else was in the room when you sent this.</p>}
    </div>
  )
}

type Picker = 'emoji' | 'sticker' | null

function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [set, setSet] = useState(EMOJI_SETS[0]!.id)
  const current = EMOJI_SETS.find((s) => s.id === set) ?? EMOJI_SETS[0]!
  return (
    <div className="border-t border-white/10" data-testid="emoji-picker">
      <div className="flex gap-1 overflow-x-auto px-2 pt-2 [scrollbar-width:none]" role="tablist" aria-label="Emoji categories">
        {EMOJI_SETS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === set}
            aria-label={s.label}
            title={s.label}
            onClick={() => setSet(s.id)}
            className={clsx('shrink-0 rounded-lg px-2 py-1 text-lg transition', s.id === set ? 'bg-white/15' : 'opacity-60 hover:bg-white/10 hover:opacity-100')}
          >
            {s.icon}
          </button>
        ))}
      </div>
      <div className="grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {current.emojis.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onPick(e)}
            aria-label={`Insert ${e}`}
            className="flex aspect-square items-center justify-center rounded-lg text-2xl transition hover:scale-115 hover:bg-white/10 active:scale-90"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

function StickerPicker({ onPick }: { onPick: (id: StickerId) => void }) {
  return (
    <div className="grid max-h-56 grid-cols-4 gap-2.5 overflow-y-auto border-t border-white/10 p-3" data-testid="sticker-picker">
      {STICKERS.map((s) => (
        <button key={s.id} type="button" onClick={() => onPick(s.id)} aria-label={`Send ${s.label} sticker`} className="transition hover:scale-105 active:scale-95">
          <StickerArt id={s.id} size="sm" />
        </button>
      ))}
    </div>
  )
}

/** Who is in the voice channel, with a green ring around whoever is talking. */
function VoiceRoster({ players, snapshot, you }: { players: PublicPlayer[]; snapshot: VoiceSnapshot; you: string }) {
  const inVoice = players.filter((p) => p.voice && p.connected)
  if (!inVoice.length) return <p className="text-xs text-gray-400">Nobody’s in voice yet — hop in and say hi.</p>
  return (
    <ul className="flex flex-wrap gap-2" aria-label="In the voice channel">
      {inVoice.map((p) => {
        const talking = snapshot.speaking.has(p.id) && p.voice === 'live'
        const linking = snapshot.joined && p.id !== you && !snapshot.connected.has(p.id)
        return (
          <li key={p.id} className="flex flex-col items-center gap-1" title={`${p.name}${p.voice === 'muted' ? ' (muted)' : ''}`}>
            <span className={clsx('relative rounded-full transition', linking && !snapshot.relayed.has(p.id) && 'opacity-50')}>
              <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" speaking={talking} />
              {p.voice === 'muted' && (
                <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 ring-1 ring-white/20">
                  <MicOff className="h-2.5 w-2.5 text-red-300" />
                </span>
              )}
            </span>
            <span className="max-w-12 truncate text-[10px] text-gray-300">{p.id === you ? 'You' : p.name}</span>
          </li>
        )
      })}
    </ul>
  )
}


const OPEN_KEY = 'chat:open'

/**
 * Room chat and voice channel: a dock in the corner with the voice controls and
 * a chat panel (text, emoji and stickers) that opens above it. It works like a
 * WhatsApp group: swipe or hover to reply, see who's typing, and ticks for sent,
 * delivered and read.
 */
export function ChatDock({
  messages,
  rejected,
  receipts,
  typing,
  voice,
  snapshot,
  raised,
}: {
  messages: ChatMessage[]
  rejected?: ChatRejection | null
  receipts: ChatReceipts
  /** Players typing right now. */
  typing: string[]
  voice: VoiceChannel
  snapshot: VoiceSnapshot
  raised?: boolean
}) {
  const { state, you, send, serverNow } = useRoomContext()
  const { features } = useSite()
  const [open, setOpen] = useState(() => load(OPEN_KEY) === '1' && window.matchMedia('(min-width: 1024px)').matches)
  const [draft, setDraft] = useState('')
  const [picker, setPicker] = useState<Picker>(null)
  /** Messages up to this time are read (what was said before you arrived doesn't count). */
  const [seenAt, setSeenAt] = useState(() => serverNow())
  const [peek, setPeek] = useState<ChatMessage | null>(null)
  const [slowDown, setSlowDown] = useState(false)
  const [copied, setCopied] = useState(false)
  /** The message you're replying to. */
  const [replying, setReplying] = useState<ChatMessage | null>(null)
  /** A message picked (press and hold, right-click or its menu) to reply to, copy or get info on. */
  const [selected, setSelected] = useState<ChatMessage | null>(null)
  const [infoId, setInfoId] = useState<string | null>(null)
  /** A message briefly highlighted after jumping to it from a reply. */
  const [flash, setFlash] = useState<string | null>(null)
  const [unreadFrom, setUnreadFrom] = useState<{ at: number; count: number } | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const atBottom = useRef(true)
  /** Where the cursor goes after an emoji is inserted (applied once the box shows the new text). */
  const caret = useRef<number | null>(null)
  const lastReply = useRef<ChatMessage | null>(null)

  useLayoutEffect(() => {
    const el = input.current
    const at = caret.current
    caret.current = null
    if (!el || at === null) return
    // On phones, focusing the box would pop the keyboard up over the picker.
    if (!window.matchMedia('(pointer: coarse)').matches) el.focus()
    el.setSelectionRange(at, at)
  }, [draft])

  const last = messages.at(-1)
  const unread = useMemo(() => {
    if (open) return 0
    return messages.filter((m) => m.at > seenAt && m.from !== you).length
  }, [messages, seenAt, open, you])

  useEffect(() => {
    if (open && last) setSeenAt((t) => Math.max(t, last.at))
  }, [open, last])
  useEffect(() => save(OPEN_KEY, open ? '1' : '0'), [open])

  const openChat = () => {
    if (unread > 0) setUnreadFrom({ at: seenAt, count: unread })
    setOpen(true)
  }
  // Closing the chat drops whatever you were in the middle of.
  useEffect(() => {
    if (open) return
    setSelected(null)
    setInfoId(null)
    setUnreadFrom(null)
  }, [open])

  // Closed: show the newest message from someone else for a moment.
  useEffect(() => {
    if (open || !last || last.from === you || last.at <= seenAt) return
    setPeek(last)
    const t = window.setTimeout(() => setPeek((p) => (p?.id === last.id ? null : p)), 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id])

  // Read receipts: while the chat is open (and the tab visible), everything in it counts as read.
  const lastFromOthers = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!
      if (m.from !== you && !m.id.startsWith('local:')) return m
    }
    return null
  }, [messages, you])
  const myRead = receipts[you]?.read ?? 0
  const seenSent = useRef(0)
  useEffect(() => {
    if (!open || !lastFromOthers || lastFromOthers.at <= myRead) return
    const at = lastFromOthers.at
    const mark = () => {
      if (document.visibilityState !== 'visible' || at <= seenSent.current) return
      if (send({ t: 'seen', at })) seenSent.current = at
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [open, lastFromOthers, myRead, send])

  // "Typing…": tell the room when you start, remind it while you keep going, and say when you stop.
  const typingAt = useRef(0)
  const typingIdle = useRef<number | undefined>(undefined)
  const stopTyping = useCallback(
    (tell = true) => {
      clearTimeout(typingIdle.current)
      if (!typingAt.current) return
      typingAt.current = 0
      if (tell) send({ t: 'typing', on: false })
    },
    [send],
  )
  const noteTyping = (text: string) => {
    if (!text.trim()) return stopTyping()
    const now = Date.now()
    if (now - typingAt.current > TYPING_PING_MS && send({ t: 'typing', on: true })) typingAt.current = now
    clearTimeout(typingIdle.current)
    typingIdle.current = window.setTimeout(() => stopTyping(), TYPING_IDLE_MS)
  }
  useEffect(() => {
    if (!open) stopTyping()
  }, [open, stopTyping])
  useEffect(() => () => stopTyping(), [stopTyping])

  const typists = useMemo(
    () => typing.flatMap((id) => (id === you ? [] : state.players.filter((p) => p.id === id && p.connected))),
    [typing, you, state.players],
  )
  // Ticks only need the player ids, which change far less often than the rest of the room.
  const rosterKey = state.players.map((p) => p.id).join(',')
  const roster = useMemo(() => (rosterKey ? rosterKey.split(',').map((id) => ({ id })) : []), [rosterKey])

  // Stay pinned to the newest message unless the reader scrolled up: new messages glide in,
  // opening the panel (or a picker) jumps straight to the bottom, or to the first unread message.
  const jumped = useRef({ open, picker })
  useLayoutEffect(() => {
    const el = list.current
    const opening = open && !jumped.current.open
    const layout = jumped.current.open !== open || jumped.current.picker !== picker
    jumped.current = { open, picker }
    if (!el) return
    if (opening) {
      const divider = el.querySelector<HTMLElement>('[data-unread]')
      if (divider) {
        el.scrollTop = Math.max(0, divider.offsetTop - 12)
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        return
      }
    }
    if (!(atBottom.current || last?.from === you || layout)) return
    if (layout) el.scrollTop = el.scrollHeight
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    atBottom.current = true
  }, [messages.length, open, picker, last?.from, you])

  // Someone starts typing, or a reply is started: keep the bottom in view if that's where you were.
  useLayoutEffect(() => {
    const el = list.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [typists.length, replying])

  // A message the room turned down (too many too fast): put it back in the box.
  useEffect(() => {
    if (!rejected) return
    if (rejected.text) setDraft((d) => d || rejected.text!)
    setReplying((r) => r ?? lastReply.current)
    setSlowDown(true)
    const t = window.setTimeout(() => setSlowDown(false), 2500)
    return () => clearTimeout(t)
  }, [rejected])

  useEffect(() => {
    if (!open) return
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (infoId) setInfoId(null)
      else if (selected) setSelected(null)
      else if (picker) setPicker(null)
      else if (replying) setReplying(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, picker, selected, infoId, replying])

  // Stable callbacks for the (memoised) messages.
  const act = useRef<MessageActions>(NO_ACTIONS)
  act.current = {
    reply: (m) => {
      setReplying(m)
      setSelected(null)
      setPicker((p) => (p === 'sticker' ? null : p))
      input.current?.focus()
    },
    select: (m) => setSelected((s) => (s?.id === m.id ? null : m)),
    jump: (id) => {
      const el = list.current?.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setFlash(id)
      window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600)
    },
  }
  const actions = useMemo<MessageActions>(
    () => ({ reply: (m) => act.current.reply(m), select: (m) => act.current.select(m), jump: (id) => act.current.jump(id) }),
    [],
  )

  if (state.solo) return null

  const afterSend = () => {
    lastReply.current = replying
    setReplying(null)
    setPicker(null)
    setUnreadFrom(null)
    stopTyping(false)
  }
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (send({ t: 'chat', text, ...(replying ? { replyTo: replying.id } : {}) })) {
      setDraft('')
      afterSend()
    }
    input.current?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }
  const insertEmoji = (emoji: string) => {
    const el = input.current
    // Several quick taps land before the box re-renders: continue from the last insert.
    const start = caret.current ?? el?.selectionStart ?? draft.length
    const end = caret.current ?? el?.selectionEnd ?? draft.length
    caret.current = start + emoji.length
    setDraft((d) => (d.slice(0, start) + emoji + d.slice(end)).slice(0, MAX_CHAT_LENGTH))
    noteTyping(emoji)
  }
  const sendSticker = (id: StickerId) => {
    if (send({ t: 'chat', sticker: id, ...(replying ? { replyTo: replying.id } : {}) })) afterSend()
  }
  const copySelected = async () => {
    const text = selected?.text
    setSelected(null)
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked: nothing to do.
    }
  }

  const inVoice = state.players.filter((p) => p.voice && p.connected)
  const talking = !snapshot.muted && snapshot.speaking.has(you)
  const someoneTalking = inVoice.some((p) => p.id !== you && p.voice === 'live' && snapshot.speaking.has(p.id))
  const here = state.players.filter((p) => p.connected)
  const memberLine = [...(here.some((p) => p.id === you) ? ['You'] : []), ...here.filter((p) => p.id !== you).map((p) => p.name)].join(', ')
  const info = infoId ? messages.find((m) => m.id === infoId) : undefined

  const dockButton = 'relative flex h-12 w-12 items-center justify-center rounded-full ring-1 transition active:scale-95'
  const headerButton = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-300 hover:bg-white/10 hover:text-white'

  return (
    <>
      {open && (
        <section
          className={clsx(
            // Solid, not frosted: a blur over the ticking game behind it makes phones stutter.
            'fixed right-3 z-50 flex w-[min(23rem,calc(100vw-1.5rem))] animate-pop flex-col overflow-hidden rounded-3xl border border-white/10 bg-panel shadow-2xl sm:right-5',
            raised ? 'bottom-40 h-[min(32rem,calc(100dvh-12rem))] lg:bottom-24 lg:h-[min(34rem,calc(100dvh-8rem))]' : 'bottom-24 h-[min(34rem,calc(100dvh-8rem))]',
          )}
          aria-label="Room chat"
          data-testid="chat-panel"
        >
          <header className="border-b border-white/10 px-3 pt-2.5 pb-2.5">
            <div className={clsx('flex min-h-10 items-center gap-2', info || !features.voice ? '' : picker ? 'sm:mb-2' : 'mb-2')}>
              {selected ? (
                <>
                  <button type="button" onClick={() => setSelected(null)} aria-label="Cancel" className={headerButton}>
                    <X className="h-5 w-5" />
                  </button>
                  <span className="flex-1 text-[15px] font-semibold text-white" data-testid="chat-selection">
                    1 selected
                  </span>
                  <button type="button" onClick={() => actions.reply(selected)} aria-label="Reply to message" title="Reply" className={headerButton}>
                    <Reply className="h-5 w-5" />
                  </button>
                  {selected.text && (
                    <button type="button" onClick={() => void copySelected()} aria-label="Copy message" title="Copy" className={headerButton}>
                      <Copy className="h-[18px] w-[18px]" />
                    </button>
                  )}
                  {selected.from === you && (
                    <button
                      type="button"
                      onClick={() => {
                        setInfoId(selected.id)
                        setSelected(null)
                      }}
                      aria-label="Message info"
                      title="Info"
                      className={headerButton}
                    >
                      <Info className="h-5 w-5" />
                    </button>
                  )}
                </>
              ) : info ? (
                <>
                  <button type="button" onClick={() => setInfoId(null)} aria-label="Back to chat" className={headerButton}>
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h2 className="flex-1 text-[15px] font-bold text-white">Message info</h2>
                </>
              ) : (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] leading-tight font-bold text-white">Room chat</h2>
                    <p className={clsx('truncate text-xs', typists.length ? 'font-medium text-emerald-400' : 'text-gray-400')} aria-live="polite" data-testid="chat-subtitle">
                      {typists.length ? typingText(typists.map((p) => p.name)) : memberLine}
                    </p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            <div className={clsx('rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/5', picker && 'max-sm:hidden', (!features.voice || info) && 'hidden')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-gray-300 uppercase">
                  <Headphones className="h-3.5 w-3.5" /> Voice · {inVoice.length}
                </p>
                {snapshot.joined ? (
                  <button
                    type="button"
                    onClick={() => voice.leave()}
                    className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-200 ring-1 ring-red-400/30 hover:bg-red-500/25"
                  >
                    <PhoneOff className="h-3 w-3" /> Leave
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void voice.join()}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/25"
                    data-testid="join-voice"
                  >
                    <Headphones className="h-3 w-3" /> Join voice
                  </button>
                )}
              </div>
              <VoiceRoster players={state.players} snapshot={snapshot} you={you} />
              {snapshot.micError && <p className="mt-2 text-xs text-amber-300">{snapshot.micError}</p>}
              {snapshot.joined && snapshot.relayed.size > 0 && (
                <p className="mt-2 text-[11px] text-gray-400" data-testid="voice-relayed">
                  Using backup voice for {state.players.filter((p) => snapshot.relayed.has(p.id)).map((p) => p.name).join(', ')} (their network blocks direct calls).
                </p>
              )}
              {snapshot.joined && <p className="mt-2 text-[11px] text-gray-500">🎧 Earphones let everyone talk at once without echo.</p>}
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <MessageList
              messages={messages}
              you={you}
              listRef={list}
              atBottom={atBottom}
              receipts={receipts}
              roster={roster}
              typists={typists}
              selected={selected?.id ?? null}
              flash={flash}
              unreadFrom={unreadFrom}
              actions={actions}
            />
            {slowDown && (
              <p role="status" className="border-t border-white/10 px-3 py-1.5 text-center text-xs text-amber-200">
                Whoa, slow down — that one didn’t send. Try again in a sec.
              </p>
            )}
            {copied && (
              <p role="status" className="border-t border-white/10 px-3 py-1.5 text-center text-xs text-gray-300">
                Message copied
              </p>
            )}

            {picker === 'emoji' && <EmojiPicker onPick={insertEmoji} />}
            {picker === 'sticker' && <StickerPicker onPick={sendSticker} />}

            {!features.chat && <p className="border-t border-white/10 p-3 text-center text-xs text-gray-400">Chat is paused right now.</p>}
            {replying && features.chat && (
              <div className="flex items-center gap-1.5 border-t border-white/10 px-2.5 pt-2" data-testid="chat-replying">
                <div className="min-w-0 flex-1">
                  <Quote r={replySnapshot(replying)} you={you} onJump={actions.jump} />
                </div>
                <button type="button" onClick={() => setReplying(null)} aria-label="Cancel reply" className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <form onSubmit={submit} className={clsx('flex items-end gap-1.5 p-2.5', replying ? 'pt-1' : 'border-t border-white/10', !features.chat && 'hidden')}>
              <button
                type="button"
                onClick={() => setPicker((p) => (p === 'emoji' ? null : 'emoji'))}
                aria-label="Emoji"
                aria-pressed={picker === 'emoji'}
                className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition', picker === 'emoji' ? 'bg-brand-400 text-black' : 'text-gray-300 hover:bg-white/10')}
              >
                <Smile className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setPicker((p) => (p === 'sticker' ? null : 'sticker'))}
                aria-label="Stickers"
                aria-pressed={picker === 'sticker'}
                className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition', picker === 'sticker' ? 'bg-brand-400 text-black' : 'text-gray-300 hover:bg-white/10')}
              >
                <Sticker className="h-5 w-5" />
              </button>
              <label htmlFor="chat-input" className="sr-only">
                Message
              </label>
              <textarea
                id="chat-input"
                ref={input}
                rows={1}
                value={draft}
                onChange={(e) => {
                  const v = e.target.value.slice(0, MAX_CHAT_LENGTH)
                  setDraft(v)
                  noteTyping(v)
                }}
                onBlur={() => !draft.trim() && stopTyping()}
                onKeyDown={onKey}
                placeholder={replying ? 'Write a reply…' : 'Message the room…'}
                autoComplete="off"
                maxLength={MAX_CHAT_LENGTH}
                className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-white/10 bg-black/30 px-3.5 py-2 text-[15px] text-white placeholder:text-gray-500 focus:border-brand-400/60 focus:outline-none [field-sizing:content]"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand-400 to-rose-500 text-black transition hover:opacity-90 disabled:opacity-30"
              >
                <SendHorizontal className="h-5 w-5" />
              </button>
            </form>
            {info && <MessageInfo m={info} you={you} receipts={receipts} players={state.players} />}
          </div>
        </section>
      )}

      {peek && !open && (
        <button
          type="button"
          onClick={openChat}
          className={clsx(
            // Phones: above the dock. Wider screens: beside it, clear of the page's buttons.
            'fixed right-3 z-40 flex max-w-[min(18rem,calc(100vw-1.5rem))] animate-pop items-center gap-2 rounded-2xl rounded-br-md border border-white/10 bg-panel py-2 pr-3 pl-2 text-left shadow-xl sm:right-[12.5rem]',
            raised ? 'bottom-40 sm:bottom-24 lg:bottom-5' : 'bottom-24 sm:bottom-5',
          )}
        >
          <PlayerAvatar avatar={peek.avatar} photo={peek.photo} name={peek.name} size="sm" />
          <span className="min-w-0">
            <span className="block text-[11px] text-gray-400">{peek.name}</span>
            <span className="block truncate text-sm text-white">{peek.sticker ? `${findSticker(peek.sticker)?.emoji ?? ''} sent a sticker` : peek.text}</span>
          </span>
        </button>
      )}

      <div
        className={clsx(
          'fixed right-3 z-40 flex items-center gap-1.5 rounded-full border border-white/10 bg-panel/95 p-1.5 shadow-xl sm:right-5',
          raised ? 'bottom-24 lg:bottom-5' : 'bottom-5',
        )}
        data-testid="chat-dock"
      >
        <button
          type="button"
          onClick={() => (snapshot.joined ? voice.leave() : void voice.join())}
          aria-label={snapshot.joined ? 'Leave voice channel' : 'Join voice channel'}
          aria-pressed={snapshot.joined}
          title={snapshot.joined ? 'Leave voice' : 'Join voice (listen)'}
          className={clsx(dockButton, snapshot.joined ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40' : 'bg-white/[0.06] text-gray-200 ring-white/10 hover:bg-white/[0.12]', !features.voice && 'hidden')}
        >
          <Headphones className="h-5 w-5" />
          {inVoice.length > 0 && (
            <span className={clsx('absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold', someoneTalking ? 'bg-emerald-400 text-black' : 'bg-gray-700 text-white')}>
              {inVoice.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => void voice.setMuted(!snapshot.muted)}
          disabled={snapshot.opening}
          aria-label={snapshot.joined && !snapshot.muted ? 'Mute microphone' : 'Unmute microphone'}
          aria-pressed={snapshot.joined && !snapshot.muted}
          title={snapshot.joined && !snapshot.muted ? 'Mute' : 'Unmute to talk'}
          data-testid="mic-toggle"
          className={clsx(
            dockButton,
            !features.voice && 'hidden',
            snapshot.joined && !snapshot.muted
              ? 'bg-emerald-500 text-black ring-emerald-300'
              : snapshot.micError
                ? 'bg-red-500/15 text-red-300 ring-red-400/30'
                : 'bg-white/[0.06] text-gray-200 ring-white/10 hover:bg-white/[0.12]',
            talking && 'shadow-[0_0_0_4px_rgba(52,211,153,0.35),0_0_18px_rgba(52,211,153,0.6)]',
            snapshot.opening && 'animate-pulse',
          )}
        >
          {snapshot.joined && !snapshot.muted ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openChat())}
          aria-label={open ? 'Close chat' : unread ? `Open chat, ${unread} unread` : 'Open chat'}
          aria-expanded={open}
          data-testid="chat-toggle"
          className={clsx(dockButton, open ? 'bg-brand-400 text-black ring-brand-300' : 'bg-white/[0.06] text-gray-200 ring-white/10 hover:bg-white/[0.12]')}
        >
          <MessageCircle className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-snow" data-testid="chat-unread">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
          {!open && unread === 0 && typists.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 items-center gap-0.5 rounded-full bg-emerald-500 px-1.5" aria-hidden="true">
              <span className="typing-dot h-1 w-1 rounded-full bg-black" />
              <span className="typing-dot h-1 w-1 rounded-full bg-black" />
              <span className="typing-dot h-1 w-1 rounded-full bg-black" />
            </span>
          )}
        </button>
      </div>
    </>
  )
}
