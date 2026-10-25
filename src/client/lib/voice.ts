// Voice channel: every player in it is connected to every other one with WebRTC
// (audio only, peer to peer). Offers, answers and ICE candidates travel over the
// room's WebSocket. Joining only listens; the microphone is opened when you
// unmute and closed again when you mute, so the browser's mic light is honest.
//
// Phones on mobile data or strict Wi-Fi often can't connect directly. For those
// pairs the voice goes through the room's own WebSocket instead (the relay): the
// mic is cut into 60 ms packets of 16 kHz μ-law audio, the room server forwards
// them, and listeners play them with a small jitter buffer. It works anywhere the
// game itself works, so nobody is ever left unable to hear.
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
  /** Player ids we couldn't connect to directly for a while (their voice comes through the relay). */
  unreachable: ReadonlySet<string>
  /** Player ids we're hearing through the relay right now. */
  relayed: ReadonlySet<string>
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const SPEAKING_LEVEL = 0.035
const RETRY_MS = 2500
/** A fresh connection isn't torn down by a "hello" that crossed its offer. */
const FRESH_MS = 3000
const HELLO_EVERY_MS = 5000
/** A player still not connected after this long is shown as unreachable. */
const UNREACHABLE_MS = 10_000
/** Players we can play at once without a fresh tap (phones only let audio start from a tap). */
const AUDIO_POOL = 10
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='

// Relay audio: 16 kHz μ-law packets of 60 ms (see public/voice-worklet.js).
const RELAY_RATE = 16000
const RELAY_CODEC = 1
/** Keep sending this long after the voice drops below the speaking level, so word endings aren't cut. */
const RELAY_HANGOVER_MS = 400
const RELAY_GATE = 0.012
/** Listener jitter buffer, and how far behind we let a speaker drift before catching up. */
const RELAY_BUFFER_S = 0.14
const RELAY_MAX_LAG_S = 0.6

const MU_LAW = (() => {
  const t = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff
    const sign = u & 0x80
    const exponent = (u >> 4) & 0x07
    const mantissa = u & 0x0f
    const s = (((mantissa << 3) + 0x84) << exponent) - 0x84
    t[i] = (sign ? -s : s) / 32768
  }
  return t
})()

interface RelayListener {
  gain: GainNode
  next: number
  speakingUntil: number
  heardAt: number
}

interface Peer {
  id: string
  sid: string
  createdAt: number
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  pendingIce: RTCIceCandidateInit[]
  meter: (() => number) | null
  retry?: number
  slow?: number
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
  private snapshot: VoiceSnapshot = { joined: false, muted: true, opening: false, micError: null, speaking: new Set(), connected: new Set(), unreachable: new Set(), relayed: new Set() }
  /** Everyone else in the voice channel right now. */
  private others = new Set<string>()
  private capture: { node: AudioNode; source: MediaStreamAudioSourceNode } | null = null
  private loudUntil = 0
  private listeners_ = new Map<string, RelayListener>()
  /** Audio elements unlocked during a tap, so every voice can play at once on phones (iOS blocks audio started later). */
  private pool: HTMLAudioElement[] = []

  constructor(
    private send: (msg: ClientMessage) => boolean,
    private sendBinary: (data: Uint8Array) => boolean = () => false,
  ) {}

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
    this.primeAudio()
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
    for (const l of this.listeners_.values()) l.gain.disconnect()
    this.listeners_.clear()
    this.others.clear()
    clearInterval(this.meterTimer)
    this.meterTimer = undefined
    this.update({ joined: false, muted: true, opening: false, speaking: new Set(), connected: new Set(), unreachable: new Set(), relayed: new Set() })
  }

  async setMuted(muted: boolean) {
    this.primeAudio()
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
      void this.startCapture(stream)
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
    this.others = others
    for (const id of [...this.peers.keys()]) if (!others.has(id)) this.closePeer(id)
    for (const id of [...this.helloAt.keys()]) if (!others.has(id)) this.helloAt.delete(id)
    for (const id of this.snapshot.unreachable) if (!others.has(id)) this.markUnreachable(id, false)
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
    const audio = this.pool.pop() ?? new Audio()
    audio.autoplay = true
    const peer: Peer = { id, sid, createdAt: Date.now(), pc, audio, pendingIce: [], meter: null }
    this.peers.set(id, peer)
    peer.slow = window.setTimeout(() => {
      if (this.peers.get(id) === peer && pc.connectionState !== 'connected') this.markUnreachable(id, true)
    }, UNREACHABLE_MS)

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
      if (pc.connectionState === 'connected') this.markUnreachable(id, false)
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
    clearTimeout(peer.slow)
    peer.pc.onicecandidate = peer.pc.ontrack = peer.pc.onconnectionstatechange = null
    peer.pc.close()
    peer.audio.srcObject = null
    // Unlocked elements go back to the pool for the next connection.
    if (this.pool.length < AUDIO_POOL) this.pool.push(peer.audio)
    // A retry keeps the "unreachable" mark; leaving the channel clears it in sync().
    if (this.snapshot.connected.has(id)) {
      const connected = new Set(this.snapshot.connected)
      connected.delete(id)
      this.update({ connected })
    }
  }

/** Relay packet from the room: [id length][player id][codec][μ-law samples]. */
  handleRelay(buf: ArrayBuffer) {
    if (!this.snapshot.joined) return
    const bytes = new Uint8Array(buf)
    const len = bytes[0] ?? 0
    if (bytes.length < len + 3) return
    const from = String.fromCharCode(...bytes.subarray(1, 1 + len))
    if (bytes[1 + len] !== RELAY_CODEC || from === this.you) return
    // A working direct connection already carries this voice.
    if (this.snapshot.connected.has(from)) return
    const ctx = this.audioContext()
    if (!ctx) return
    const payload = bytes.subarray(2 + len)
    const samples = new Float32Array(payload.length)
    let sum = 0
    for (let i = 0; i < payload.length; i++) {
      const v = MU_LAW[payload[i]!]!
      samples[i] = v
      sum += v * v
    }
    let l = this.listeners_.get(from)
    if (!l) {
      const gain = ctx.createGain()
      gain.connect(ctx.destination)
      l = { gain, next: 0, speakingUntil: 0, heardAt: 0 }
      this.listeners_.set(from, l)
    }
    const now = ctx.currentTime
    // Start (or restart after a gap) a little in the future to absorb network jitter; drop backlog.
    if (l.next < now + 0.02 || l.next > now + RELAY_MAX_LAG_S) l.next = now + RELAY_BUFFER_S
    const buffer = ctx.createBuffer(1, samples.length, RELAY_RATE)
    buffer.copyToChannel(samples, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(l.gain)
    src.start(l.next)
    l.next += buffer.duration
    l.heardAt = Date.now()
    if (Math.sqrt(sum / samples.length) > SPEAKING_LEVEL) l.speakingUntil = Date.now() + 300
  }

  /** Someone in the channel can't hear us directly, so our voice also goes through the relay. */
  private needsRelay(): boolean {
    for (const id of this.others) if (!this.snapshot.connected.has(id)) return true
    return false
  }

  private async startCapture(stream: MediaStream) {
    const ctx = this.audioContext()
    if (!ctx || this.capture) return
    const source = ctx.createMediaStreamSource(stream)
    const onFrame = (rms: number, data: Uint8Array) => {
      if (this.snapshot.muted || !this.needsRelay()) return
      if (rms > RELAY_GATE) this.loudUntil = Date.now() + RELAY_HANGOVER_MS
      if (Date.now() > this.loudUntil) return
      const packet = new Uint8Array(data.length + 1)
      packet[0] = RELAY_CODEC
      packet.set(data, 1)
      this.sendBinary(packet)
    }
    try {
      await ctx.audioWorklet.addModule('/voice-worklet.js')
      if (this.mic !== stream) return
      const node = new AudioWorkletNode(ctx, 'riffle-mic', { numberOfInputs: 1, numberOfOutputs: 0 })
      node.port.onmessage = (e: MessageEvent<{ rms: number; data: Uint8Array }>) => onFrame(e.data.rms, e.data.data)
      source.connect(node)
      this.capture = { node, source }
    } catch {
      // Older browsers: do the same on the main thread.
      if (this.mic !== stream) return
      const node = ctx.createScriptProcessor(4096, 1, 1)
      const ratio = ctx.sampleRate / RELAY_RATE
      let frame: number[] = []
      let pos = 0
      let acc = 0
      let count = 0
      node.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0)
        for (let i = 0; i < ch.length; i++) {
          acc += ch[i]!
          count++
          if (++pos >= ratio) {
            pos -= ratio
            frame.push(acc / count)
            acc = 0
            count = 0
            if (frame.length === 960) {
              const data = new Uint8Array(960)
              let sum = 0
              frame.forEach((v, j) => {
                sum += v * v
                data[j] = encodeMuLaw(v)
              })
              onFrame(Math.sqrt(sum / 960), data)
              frame = []
            }
          }
        }
      }
      source.connect(node)
      // A script processor only runs while connected to the output; it writes silence.
      node.connect(ctx.destination)
      this.capture = { node, source }
    }
  }

  private stopCapture() {
    if (!this.capture) return
    this.capture.source.disconnect()
    this.capture.node.disconnect()
    this.capture = null
  }

  private markUnreachable(id: string, on: boolean) {
    if (this.snapshot.unreachable.has(id) === on) return
    const unreachable = new Set(this.snapshot.unreachable)
    if (on) unreachable.add(id)
    else unreachable.delete(id)
    this.update({ unreachable })
  }

  /** Start (silent) playback on a pool of audio elements inside the user's tap, so voices can play later. */
  private primeAudio() {
    while (this.pool.length < AUDIO_POOL) {
      const el = new Audio()
      el.setAttribute('playsinline', '')
      el.src = SILENCE
      // A voice stream set later (srcObject) replaces this silence.
      void el.play().then(
        () => {
          if (!el.srcObject) el.pause()
        },
        () => {},
      )
      this.pool.push(el)
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
    this.stopCapture()
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
      const now = Date.now()
      const relayed = new Set<string>()
      for (const [id, l] of this.listeners_) {
        if (l.speakingUntil > now) speaking.add(id)
        if (now - l.heardAt < 3000) relayed.add(id)
      }
      const same = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((id) => b.has(id))
      if (!same(speaking, this.snapshot.speaking)) this.update({ speaking })
      if (!same(relayed, this.snapshot.relayed)) this.update({ relayed })
    }, 150)
  }
}

function encodeMuLaw(x: number): number {
  let s = Math.max(-1, Math.min(1, x)) * 32767
  const sign = s < 0 ? 0x80 : 0
  if (sign) s = -s
  s = Math.min(s, 32635) + 0x84
  let exponent = 7
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--
  return ~(sign | (exponent << 4) | ((s >> (exponent + 3)) & 0x0f)) & 0xff
}

/** One voice channel per room screen, kept in step with the room's players. */
export function useVoice(
  send: (msg: ClientMessage) => boolean,
  you: string | null,
  players: PublicPlayer[] | undefined,
  /** Changes whenever the server seats us again (it forgets the voice channel on a reconnect). */
  seat: number,
  sendBinary?: (data: Uint8Array) => boolean,
) {
  const ref = useRef<VoiceChannel | null>(null)
  ref.current ??= new VoiceChannel(send, sendBinary)
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
  const onRelay = useCallback((buf: ArrayBuffer) => voice.handleRelay(buf), [voice])
  return { voice, snapshot, onSignal, onRelay }
}
