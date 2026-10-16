// Voice channel: every player in it is connected to every other one with WebRTC
// (audio only, peer to peer). Offers, answers and ICE candidates travel over the
// room's WebSocket. Joining only listens; the microphone is opened when you
// unmute and closed again when you mute, so the browser's mic light is honest.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { ClientMessage, PublicPlayer } from '../../shared/protocol'

/** `sid` names one connection attempt, so answers and candidates for an older attempt are ignored. */
type Signal =
  | { kind: 'hello' }
  | { kind: 'offer'; sid: string; sdp: string }
  | { kind: 'answer'; sid: string; sdp: string }
  | { kind: 'ice'; sid: string; candidate: RTCIceCandidateInit }

export interface VoiceSnapshot {
  joined: boolean
  muted: boolean
  /** Asking for the microphone. */
  opening: boolean
  micError: string | null
  /** Player ids currently making sound (you included, as your own id). */
  speaking: ReadonlySet<string>
  /** Player ids we have a working audio connection with. */
  connected: ReadonlySet<string>
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const SPEAKING_LEVEL = 0.035
const RETRY_MS = 2500
/** A fresh connection isn't torn down by a "hello" that crossed its offer. */
const FRESH_MS = 3000
const HELLO_EVERY_MS = 5000

interface Peer {
  id: string
  sid: string
  createdAt: number
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  pendingIce: RTCIceCandidateInit[]
  meter: (() => number) | null
  retry?: number
}

let iceServers: Promise<RTCIceServer[]> | null = null
function loadIceServers(): Promise<RTCIceServer[]> {
  iceServers ??= fetch('/api/rtc/ice')
    .then((r) => (r.ok ? (r.json() as Promise<{ iceServers?: RTCIceServer[] }>) : null))
    .then((j) => (j?.iceServers?.length ? j.iceServers : FALLBACK_ICE))
    .catch(() => FALLBACK_ICE)
  return iceServers
}

export class VoiceChannel {
  private you = ''
  private peers = new Map<string, Peer>()
  private helloAt = new Map<string, number>()
  private mic: MediaStream | null = null
  private micMeter: (() => number) | null = null
  private ctx: AudioContext | null = null
  private meterTimer: number | undefined
  private listeners = new Set<() => void>()
  private snapshot: VoiceSnapshot = { joined: false, muted: true, opening: false, micError: null, speaking: new Set(), connected: new Set() }

  constructor(private send: (msg: ClientMessage) => boolean) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.snapshot

  private update(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const fn of this.listeners) fn()
  }

  setYou(you: string) {
    this.you = you
  }

  /** Tell the room where we are again (after a reconnect the server forgets). */
  announce() {
    if (this.snapshot.joined) this.send({ t: 'voice', state: this.snapshot.muted ? 'muted' : 'live' })
  }

  async join(unmuted = false) {
    if (this.snapshot.joined) return
    this.audioContext()
    void loadIceServers()
    this.update({ joined: true, muted: true, micError: null })
    this.send({ t: 'voice', state: 'muted' })
    this.startMeters()
    if (unmuted) await this.setMuted(false)
  }

  leave() {
    if (!this.snapshot.joined) return
    this.send({ t: 'voice', state: null })
    for (const id of [...this.peers.keys()]) this.closePeer(id)
    this.helloAt.clear()
    this.closeMic()
    clearInterval(this.meterTimer)
    this.meterTimer = undefined
    this.update({ joined: false, muted: true, opening: false, speaking: new Set(), connected: new Set() })
  }

  async setMuted(muted: boolean) {
    if (!this.snapshot.joined) await this.join()
    if (muted) {
      this.closeMic()
      this.update({ muted: true })
      this.send({ t: 'voice', state: 'muted' })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.update({ micError: 'This browser can’t use a microphone here (it needs HTTPS).' })
      return
    }
    this.update({ opening: true, micError: null })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (!this.snapshot.joined) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      this.mic = stream
      this.micMeter = this.meterFor(stream)
      const track = stream.getAudioTracks()[0] ?? null
      for (const peer of this.peers.values()) void this.senderOf(peer.pc)?.replaceTrack(track)
      this.update({ muted: false, opening: false })
      this.send({ t: 'voice', state: 'live' })
    } catch (err) {
      const denied = err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')
      this.update({
        opening: false,
        micError: denied ? 'Microphone blocked — allow it in your browser’s site settings to talk.' : 'No microphone found.',
      })
    }
  }

  /** Keep one connection to every other player in the voice channel. */
  sync(players: PublicPlayer[]) {
    if (!this.snapshot.joined || !this.you) return
    const others = new Set(players.filter((p) => p.id !== this.you && p.connected && p.voice).map((p) => p.id))
    for (const id of [...this.peers.keys()]) if (!others.has(id)) this.closePeer(id)
    for (const id of [...this.helloAt.keys()]) if (!others.has(id)) this.helloAt.delete(id)
    for (const id of others) if (!this.peers.has(id)) void this.connect(id).catch(() => {})
  }

  async handleSignal(from: string, raw: string) {
    if (!this.snapshot.joined) return
    let signal: Signal
    try {
      signal = JSON.parse(raw) as Signal
    } catch {
      return
    }
    try {
      await this.onSignal(from, signal)
    } catch (err) {
      console.warn('voice: signalling failed', err)
    }
  }

  private async onSignal(from: string, signal: Signal) {
    switch (signal.kind) {
      case 'hello': {
        // The other side (re)started: offer it a fresh connection.
        if (!this.initiates(from)) return
        const peer = this.peers.get(from)
        if (peer && Date.now() - peer.createdAt < FRESH_MS) return
        await this.connect(from, true)
        break
      }
      case 'offer': {
        if (this.initiates(from)) return
        const peer = await this.createPeer(from, signal.sid)
        await peer.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp })
        const transceiver = peer.pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio')
        if (transceiver) {
          transceiver.direction = 'sendrecv'
          await transceiver.sender.replaceTrack(this.micTrack())
        }
        await this.flushIce(peer)
        await peer.pc.setLocalDescription(await peer.pc.createAnswer())
        this.signal(from, { kind: 'answer', sid: peer.sid, sdp: peer.pc.localDescription!.sdp })
        break
      }
      case 'answer': {
        const peer = this.peers.get(from)
        if (!peer || peer.sid !== signal.sid || peer.pc.signalingState !== 'have-local-offer') return
        await peer.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp })
        await this.flushIce(peer)
        break
      }
      case 'ice': {
        const peer = this.peers.get(from)
        if (!peer || peer.sid !== signal.sid) return
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate).catch(() => {})
        else peer.pendingIce.push(signal.candidate)
        break
      }
    }
  }

  destroy() {
    this.leave()
    void this.ctx?.close()
    this.ctx = null
  }

  // ---------------------------------------------------------------------------

  /** The player with the smaller id makes the offer, so two offers never cross. */
  private initiates(other: string) {
    return this.you < other
  }

  private async connect(id: string, force = false) {
    if (!force && this.peers.has(id)) return
    if (!this.initiates(id)) {
      // Ask the other side to (re)offer; it creates the connection.
      const last = this.helloAt.get(id) ?? 0
      if (!force && Date.now() - last < HELLO_EVERY_MS) return
      this.helloAt.set(id, Date.now())
      this.signal(id, { kind: 'hello' })
      return
    }
    const peer = await this.createPeer(id, crypto.randomUUID().slice(0, 8))
    const transceiver = peer.pc.addTransceiver('audio', { direction: 'sendrecv' })
    await transceiver.sender.replaceTrack(this.micTrack())
    await peer.pc.setLocalDescription(await peer.pc.createOffer())
    if (this.peers.get(id) === peer) this.signal(id, { kind: 'offer', sid: peer.sid, sdp: peer.pc.localDescription!.sdp })
  }

  private async createPeer(id: string, sid: string): Promise<Peer> {
    const servers = await loadIceServers()
    this.closePeer(id)
    const pc = new RTCPeerConnection({ iceServers: servers })
    const audio = new Audio()
    audio.autoplay = true
    const peer: Peer = { id, sid, createdAt: Date.now(), pc, audio, pendingIce: [], meter: null }
    this.peers.set(id, peer)

    pc.onicecandidate = (e) => {
      if (e.candidate && this.peers.get(id) === peer) this.signal(id, { kind: 'ice', sid, candidate: e.candidate.toJSON() })
    }
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track])
      audio.srcObject = stream
      void audio.play().catch(() => {})
      peer.meter = this.meterFor(stream)
    }
    pc.onconnectionstatechange = () => {
      if (this.peers.get(id) !== peer) return
      const connected = new Set(this.snapshot.connected)
      if (pc.connectionState === 'connected') connected.add(id)
      else connected.delete(id)
      this.update({ connected })
      if (pc.connectionState === 'failed') {
        clearTimeout(peer.retry)
        peer.retry = window.setTimeout(() => {
          if (this.peers.get(id) === peer) void this.connect(id, true).catch(() => {})
        }, RETRY_MS)
      }
    }
    return peer
  }

  private closePeer(id: string) {
    const peer = this.peers.get(id)
    if (!peer) return
    this.peers.delete(id)
    clearTimeout(peer.retry)
    peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = null
    peer.pc.close()
    peer.audio.srcObject = null
    if (this.snapshot.connected.has(id)) {
      const connected = new Set(this.snapshot.connected)
      connected.delete(id)
      this.update({ connected })
    }
  }

  private async flushIce(peer: Peer) {
    const queued = peer.pendingIce.splice(0)
    for (const c of queued) await peer.pc.addIceCandidate(c).catch(() => {})
  }

  private signal(to: string, signal: Signal) {
    this.send({ t: 'rtc', to, data: JSON.stringify(signal) })
  }

  private micTrack(): MediaStreamTrack | null {
    return this.mic?.getAudioTracks()[0] ?? null
  }

  private senderOf(pc: RTCPeerConnection): RTCRtpSender | undefined {
    return pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio')?.sender
  }

  private closeMic() {
    if (!this.mic) return
    for (const peer of this.peers.values()) void this.senderOf(peer.pc)?.replaceTrack(null)
    this.mic.getTracks().forEach((t) => t.stop())
    this.mic = null
    this.micMeter = null
  }

  private audioContext(): AudioContext | null {
    if (!this.ctx && typeof AudioContext !== 'undefined') this.ctx = new AudioContext()
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** A function returning the stream's current loudness (0..1). */
  private meterFor(stream: MediaStream): (() => number) | null {
    const ctx = this.audioContext()
    if (!ctx) return null
    try {
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.fftSize)
      return () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (const v of data) sum += ((v - 128) / 128) ** 2
        return Math.sqrt(sum / data.length)
      }
    } catch {
      return null
    }
  }

  private startMeters() {
    clearInterval(this.meterTimer)
    this.meterTimer = window.setInterval(() => {
      const speaking = new Set<string>()
      if (!this.snapshot.muted && this.micMeter && this.micMeter() > SPEAKING_LEVEL) speaking.add(this.you)
      for (const peer of this.peers.values()) if (peer.meter && peer.meter() > SPEAKING_LEVEL) speaking.add(peer.id)
      const prev = this.snapshot.speaking
      if (speaking.size !== prev.size || [...speaking].some((id) => !prev.has(id))) this.update({ speaking })
    }, 150)
  }
}

/** One voice channel per room screen, kept in step with the room's players. */
export function useVoice(
  send: (msg: ClientMessage) => boolean,
  you: string | null,
  players: PublicPlayer[] | undefined,
  /** Changes whenever the server seats us again (it forgets the voice channel on a reconnect). */
  seat: number,
) {
  const ref = useRef<VoiceChannel | null>(null)
  ref.current ??= new VoiceChannel(send)
  const voice = ref.current
  const snapshot = useSyncExternalStore(voice.subscribe, voice.getSnapshot)

  useEffect(() => () => voice.destroy(), [voice])
  useEffect(() => {
    if (you) voice.setYou(you)
  }, [voice, you])
  // Back online (or a fresh seat): tell the room we're still in the channel.
  useEffect(() => {
    if (seat > 0) voice.announce()
  }, [voice, seat])
  useEffect(() => {
    if (players) voice.sync(players)
  }, [voice, players])

  const onSignal = useCallback((from: string, data: string) => void voice.handleSignal(from, data), [voice])
  return { voice, snapshot, onSignal }
}
