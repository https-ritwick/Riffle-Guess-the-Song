import clsx from 'clsx'
import { Headphones, MessageCircle, Mic, MicOff, PhoneOff, SendHorizontal, Smile, Sticker, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { EMOJI_SETS, findSticker, isEmojiOnly, MAX_CHAT_LENGTH, STICKERS, type ChatMessage, type StickerId } from '../../shared/chat'
import type { PublicPlayer } from '../../shared/protocol'
import { PlayerAvatar } from '../components/ui'
import { useSite } from '../lib/site'
import { load, save } from '../lib/storage'
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

function Message({ m, mine, grouped }: { m: ChatMessage; mine: boolean; grouped: boolean }) {
  const big = !!m.text && isEmojiOnly(m.text)
  return (
    <li className={clsx('flex items-end gap-2', mine && 'flex-row-reverse', grouped ? 'mt-0.5' : 'mt-3')}>
      <span className={clsx('w-7 shrink-0', grouped && 'invisible')}>
        <PlayerAvatar avatar={m.avatar} photo={m.photo} name={m.name} size="sm" />
      </span>
      <div className={clsx('flex min-w-0 max-w-[78%] flex-col', mine ? 'items-end' : 'items-start')}>
        {!grouped && (
          <span className="mb-0.5 px-1 text-[11px] text-gray-400">
            {mine ? 'You' : m.name} · {timeLabel(m.at)}
          </span>
        )}
        {m.sticker ? (
          <span className="py-1">
            <StickerArt id={m.sticker} />
          </span>
        ) : big ? (
          <span className="px-1 text-4xl leading-tight">{m.text}</span>
        ) : (
          <span
            className={clsx(
              'rounded-2xl px-3 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap',
              mine ? 'rounded-br-md bg-linear-to-br from-brand-400 to-rose-500 text-black' : 'rounded-bl-md bg-white/[0.08] text-gray-100 ring-1 ring-white/5',
            )}
            style={{ overflowWrap: 'anywhere' }}
          >
            {m.text}
          </span>
        )}
      </div>
    </li>
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
            <span className={clsx('relative rounded-full ring-2 transition', talking ? 'ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]' : 'ring-transparent', linking && 'opacity-50')}>
              <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" />
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
 * a chat panel (text, emoji and stickers) that opens above it.
 */
export function ChatDock({ messages, voice, snapshot, raised }: { messages: ChatMessage[]; voice: VoiceChannel; snapshot: VoiceSnapshot; raised?: boolean }) {
  const { state, you, send, serverNow } = useRoomContext()
  const { features } = useSite()
  const [open, setOpen] = useState(() => load(OPEN_KEY) === '1' && window.matchMedia('(min-width: 1024px)').matches)
  const [draft, setDraft] = useState('')
  const [picker, setPicker] = useState<Picker>(null)
  /** Messages up to this time are read (what was said before you arrived doesn't count). */
  const [seenAt, setSeenAt] = useState(() => serverNow())
  const [peek, setPeek] = useState<ChatMessage | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const atBottom = useRef(true)
  /** Where the cursor goes after an emoji is inserted (applied once the box shows the new text). */
  const caret = useRef<number | null>(null)

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

  // Closed: show the newest message from someone else for a moment.
  useEffect(() => {
    if (open || !last || last.from === you || last.at <= seenAt) return
    setPeek(last)
    const t = window.setTimeout(() => setPeek((p) => (p?.id === last.id ? null : p)), 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.id])

  // Stay pinned to the newest message unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = list.current
    if (el && (atBottom.current || last?.from === you)) el.scrollTop = el.scrollHeight
  }, [messages.length, open, picker, last?.from, you])

  useEffect(() => {
    if (!open) return
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (picker) setPicker(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, picker])

  if (state.solo) return null

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text) return
    if (send({ t: 'chat', text })) {
      setDraft('')
      setPicker(null)
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
  }
  const sendSticker = (id: StickerId) => {
    if (send({ t: 'chat', sticker: id })) setPicker(null)
  }

  const inVoice = state.players.filter((p) => p.voice && p.connected)
  const talking = !snapshot.muted && snapshot.speaking.has(you)
  const someoneTalking = inVoice.some((p) => p.id !== you && p.voice === 'live' && snapshot.speaking.has(p.id))

  const dockButton = 'relative flex h-12 w-12 items-center justify-center rounded-full ring-1 transition active:scale-95'

  return (
    <>
      {open && (
        <section
          className={clsx(
            'fixed right-3 z-50 flex w-[min(23rem,calc(100vw-1.5rem))] animate-pop flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1a0f27]/95 shadow-2xl backdrop-blur-xl sm:right-5',
            raised ? 'bottom-40 h-[min(32rem,calc(100dvh-12rem))] lg:bottom-24 lg:h-[min(34rem,calc(100dvh-8rem))]' : 'bottom-24 h-[min(34rem,calc(100dvh-8rem))]',
          )}
          aria-label="Room chat"
          data-testid="chat-panel"
        >
          <header className="border-b border-white/10 px-4 pt-3 pb-3">
            <div className={clsx('flex items-center justify-between', picker ? 'sm:mb-2' : 'mb-2')}>
              <h2 className="flex items-center gap-2 text-base font-bold text-white">
                <MessageCircle className="h-4 w-4 text-brand-400" /> Chat
                <span className="text-xs font-medium text-gray-400">· {state.players.filter((p) => p.connected).length} here</span>
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="rounded-full p-1.5 text-gray-400 hover:bg-white/10 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={clsx('rounded-2xl bg-white/[0.04] p-2.5 ring-1 ring-white/5', picker && 'max-sm:hidden', !features.voice && 'hidden')}>
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
            </div>
          </header>

          <ul
            ref={list}
            onScroll={(e) => {
              const el = e.currentTarget
              atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
            }}
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
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
              const grouped = !!prev && prev.from === m.from && m.at - prev.at < 60_000 && !m.sticker && !prev.sticker
              return <Message key={m.id} m={m} mine={m.from === you} grouped={grouped} />
            })}
          </ul>

          {picker === 'emoji' && <EmojiPicker onPick={insertEmoji} />}
          {picker === 'sticker' && <StickerPicker onPick={sendSticker} />}

          {!features.chat && <p className="border-t border-white/10 p-3 text-center text-xs text-gray-400">Chat is paused right now.</p>}
          <form onSubmit={submit} className={clsx('flex items-end gap-1.5 border-t border-white/10 p-2.5', !features.chat && 'hidden')}>
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
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHAT_LENGTH))}
              onKeyDown={onKey}
              placeholder="Message the room…"
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
        </section>
      )}

      {peek && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={clsx(
            // Phones: above the dock. Wider screens: beside it, clear of the page's buttons.
            'fixed right-3 z-40 flex max-w-[min(18rem,calc(100vw-1.5rem))] animate-pop items-center gap-2 rounded-2xl rounded-br-md border border-white/10 bg-[#1a0f27]/95 py-2 pr-3 pl-2 text-left shadow-xl backdrop-blur sm:right-[12.5rem]',
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
          'fixed right-3 z-40 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#1a0f27]/90 p-1.5 shadow-xl backdrop-blur-xl sm:right-5',
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
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close chat' : unread ? `Open chat, ${unread} unread` : 'Open chat'}
          aria-expanded={open}
          data-testid="chat-toggle"
          className={clsx(dockButton, open ? 'bg-brand-400 text-black ring-brand-300' : 'bg-white/[0.06] text-gray-200 ring-white/10 hover:bg-white/[0.12]')}
        >
          <MessageCircle className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white" data-testid="chat-unread">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>
    </>
  )
}
