import { useCallback, useEffect, useRef, useState } from 'react'
import { CHAT_HISTORY, type ChatMessage } from '../../shared/chat'
import type { ClientMessage, PublicState, RoomInfo, ServerMessage, Settings, Source } from '../../shared/protocol'
import { load, remove, save } from './storage'

export type ConnectionStatus =
  | 'checking' // looking up the room
  | 'missing' // room code does not exist (or expired)
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'kicked'
  | 'replaced' // the same seat was opened in another tab

export interface RoomError {
  code: string
  message: string
  at: number
}

export interface Suggestion {
  id: number
  from: string
  source: Source
}

export interface Reaction {
  id: number
  from: string
  emoji: string
}

const HEARTBEAT_MS = 25_000
/** Unconfirmed settings changes are dropped after this long (e.g. the server refused them). */
const PENDING_SETTINGS_MS = 5_000

/**
 * The host's own settings changes, shown right away and kept on screen until the
 * server confirms them. Without this, the reply to an earlier change could briefly
 * undo a newer one, and pressing Start in that moment would start with old settings.
 */
function applyPending(state: PublicState, pending: { patch: Partial<Settings>; at: number }): PublicState {
  if (Date.now() - pending.at > PENDING_SETTINGS_MS) pending.patch = {}
  const patch = pending.patch as Record<string, unknown>
  for (const key of Object.keys(patch)) {
    if (JSON.stringify((state.settings as Record<string, unknown>)[key]) === JSON.stringify(patch[key])) delete patch[key]
  }
  return Object.keys(patch).length ? { ...state, settings: { ...state.settings, ...pending.patch } } : state
}
const MAX_BACKOFF_MS = 8_000

export async function fetchRoomInfo(code: string): Promise<RoomInfo | null> {
  try {
    const res = await fetch(`/api/rooms/${code}`)
    if (!res.ok) return null
    return (await res.json()) as RoomInfo
  } catch {
    return null
  }
}

export const tokenKey = (code: string) => `token:${code}`

/**
 * Connects to a room over WebSocket, keeps the connection alive, reconnects with
 * backoff and re-joins the same seat using the token the server handed out.
 */
export function useRoom(code: string, opts: { display?: boolean } = {}) {
  const display = !!opts.display
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [state, setState] = useState<PublicState | null>(null)
  const [you, setYou] = useState<string | null>(null)
  const [error, setError] = useState<RoomError | null>(null)
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  /** Goes up every time the server seats us (first join and every reconnect). */
  const [seat, setSeat] = useState(0)
  const rtcHandler = useRef<((from: string, data: string) => void) | null>(null)
  const relayHandler = useRef<((data: ArrayBuffer) => void) | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const nameRef = useRef<string | null>(load(tokenKey(code)) ? load('name') : null)
  const offsetRef = useRef(0)
  const bestRttRef = useRef(Infinity)
  const reactionId = useRef(0)
  const pendingSettings = useRef<{ patch: Partial<Settings>; at: number }>({ patch: {}, at: 0 })

  const sendRaw = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
      // Show the host's own settings change immediately; the server echo confirms it.
      if (msg.t === 'settings') {
        pendingSettings.current = { patch: { ...pendingSettings.current.patch, ...msg.settings }, at: Date.now() }
        setState((s) => (s ? { ...s, settings: { ...s.settings, ...msg.settings } } : s))
      }
      return true
    }
    return false
  }, [])

  useEffect(() => {
    let disposed = false
    let attempt = 0
    let retryTimer: number | undefined
    let heartbeat: number | undefined

    const sendJoin = () => {
      const name = nameRef.current
      if (!name) return
      const token = load(tokenKey(code)) ?? undefined
      sendRaw({ t: 'join', name, token })
    }

    const onMessage = (ev: MessageEvent) => {
      // Binary messages are relayed voice.
      if (ev.data instanceof ArrayBuffer) {
        relayHandler.current?.(ev.data)
        return
      }
      if (ev.data === 'pong' || typeof ev.data !== 'string') return
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data) as ServerMessage
      } catch {
        return
      }
      switch (msg.t) {
        case 'state':
          if (bestRttRef.current === Infinity) offsetRef.current = msg.now - Date.now()
          setState(applyPending(msg.state, pendingSettings.current))
          break
        case 'time': {
          const rtt = Date.now() - msg.c
          if (rtt < bestRttRef.current) {
            bestRttRef.current = rtt
            offsetRef.current = msg.s + rtt / 2 - Date.now()
          }
          break
        }
        case 'welcome':
          save(tokenKey(code), msg.token)
          setYou(msg.you)
          setError(null)
          setSeat((n) => n + 1)
          break
        case 'chatHistory':
          setChat(msg.messages)
          break
        case 'chat':
          setChat((c) => (c.some((m) => m.id === msg.message.id) ? c : [...c.slice(-(CHAT_HISTORY - 1)), msg.message]))
          break
        case 'rtc':
          rtcHandler.current?.(msg.from, msg.data)
          break
        case 'error':
          setError({ code: msg.code, message: msg.message, at: Date.now() })
          break
        case 'kicked':
          remove(tokenKey(code))
          setStatus('kicked')
          break
        case 'suggestion':
          setSuggestion({ id: ++reactionId.current, from: msg.from, source: msg.source })
          break
        case 'reaction': {
          const id = ++reactionId.current
          setReactions((r) => [...r.slice(-20), { id, from: msg.from, emoji: msg.emoji }])
          window.setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 3100)
          break
        }
      }
    }

    const scheduleReconnect = () => {
      if (disposed) return
      setStatus('reconnecting')
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt)
      attempt++
      retryTimer = window.setTimeout(async () => {
        const info = await fetchRoomInfo(code)
        if (disposed) return
        if (info && !info.exists) {
          setStatus('missing')
          return
        }
        connect()
      }, delay)
    }

    const connect = () => {
      if (disposed) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/api/rooms/${code}/ws`)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws
      setStatus((s) => (s === 'checking' ? 'connecting' : s))

      ws.onopen = () => {
        attempt = 0
        setStatus('open')
        bestRttRef.current = Infinity
        for (let i = 0; i < 3; i++) window.setTimeout(() => sendRaw({ t: 'time', c: Date.now() }), i * 200)
        // A TV screen watches without taking a seat.
        if (display) sendRaw({ t: 'display' })
        else sendJoin()
      }
      ws.onmessage = onMessage
      ws.onclose = (ev) => {
        if (wsRef.current === ws) wsRef.current = null
        if (disposed) return
        if (ev.code === 4003) {
          remove(tokenKey(code))
          setStatus('kicked')
        } else if (ev.code === 4000) {
          setStatus('replaced')
        } else if (ev.code === 4004) {
          setStatus('missing')
        } else {
          scheduleReconnect()
        }
      }
    }

    void (async () => {
      const info = await fetchRoomInfo(code)
      if (disposed) return
      if (!info || !info.exists) {
        // A network failure looks the same as a missing room; retry once quietly.
        if (!info) return scheduleReconnect()
        setStatus('missing')
        return
      }
      connect()
    })()

    heartbeat = window.setInterval(() => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) ws.send('ping')
    }, HEARTBEAT_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !wsRef.current && !disposed && retryTimer !== undefined) {
        clearTimeout(retryTimer)
        attempt = 0
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      disposed = true
      clearTimeout(retryTimer)
      clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', onVisible)
      wsRef.current?.close(1000, 'Leaving')
      wsRef.current = null
    }
  }, [code, sendRaw, display])

  const join = useCallback(
    (name: string) => {
      nameRef.current = name
      save('name', name)
      setError(null)
      sendRaw({ t: 'join', name, token: load(tokenKey(code)) ?? undefined })
    },
    [code, sendRaw],
  )

  const leave = useCallback(() => {
    remove(tokenKey(code))
    nameRef.current = null
    wsRef.current?.close(1000, 'Leaving')
  }, [code])

  /** Current time on the server's clock (ms). */
  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  /** Voice relay: send one packet (dropped when the connection is backed up, so voice never lags the game). */
  const sendBinary = useCallback((data: Uint8Array) => {
    const ws = wsRef.current
    if (ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 64_000) return false
    ws.send(data as Uint8Array<ArrayBuffer>)
    return true
  }, [])

  const onRelay = useCallback((fn: ((data: ArrayBuffer) => void) | null) => {
    relayHandler.current = fn
  }, [])

  /** Who handles WebRTC signalling from other players (the voice channel). */
  const onRtc = useCallback((fn: ((from: string, data: string) => void) | null) => {
    rtcHandler.current = fn
  }, [])

  return { status, state, you, error, reactions, suggestion, chat, seat, onRtc, onRelay, sendBinary, send: sendRaw, join, leave, serverNow, wantsSeat: nameRef.current !== null }
}
