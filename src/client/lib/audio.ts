// A single shared <audio> element for song previews. Browsers block audio until the
// user interacts with the page, so `unlock()` is called from click handlers.
import { useSyncExternalStore } from 'react'
import { load, save } from './storage'

// 0.1s of silence as a WAV data URI; playing it inside a click handler unlocks audio on iOS/Safari.
function silentWav(): string {
  const samples = 800
  const buf = new Uint8Array(44 + samples)
  const view = new DataView(buf.buffer)
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + samples, true)
  text(8, 'WAVEfmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, 8000, true) // sample rate
  view.setUint32(28, 8000, true) // byte rate
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  text(36, 'data')
  view.setUint32(40, samples, true)
  buf.fill(128, 44) // 8-bit PCM silence
  return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...buf))
}

type Listener = () => void

class PreviewPlayer {
  private el: HTMLAudioElement | null = null
  /** A second, silent element that downloads the next song while the current one plays. */
  private warmer: HTMLAudioElement | null = null
  private listeners = new Set<Listener>()
  private fadeTimer: number | null = null
  private snapshot = { unlocked: false, blocked: false, playing: false, volume: 0.8, muted: false }

  constructor() {
    const v = Number(load('volume'))
    if (load('volume') !== null && Number.isFinite(v)) this.snapshot.volume = Math.min(1, Math.max(0, v))
    this.snapshot.muted = load('muted') === '1'
  }

  private audio(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio()
      this.el.preload = 'auto'
      // Previews are 30 s; looping keeps music going if a clip runs out during a reveal or the recap.
      this.el.loop = true
      this.el.addEventListener('playing', () => this.set({ playing: true, blocked: false }))
      this.el.addEventListener('pause', () => this.set({ playing: false }))
      this.el.addEventListener('ended', () => this.set({ playing: false }))
      this.applyVolume()
    }
    return this.el
  }

  private set(patch: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((l) => l())
  }

  private applyVolume() {
    if (this.el) this.el.volume = this.snapshot.muted ? 0 : this.snapshot.volume
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getSnapshot = () => this.snapshot

  /** Must be called from a user gesture (click/tap/keypress). */
  unlock(): void {
    if (this.snapshot.unlocked) return
    const a = this.audio()
    a.src = silentWav()
    a.play()
      .then(() => this.set({ unlocked: true, blocked: false }))
      .catch(() => undefined)
  }

  preload(url: string): void {
    const a = this.audio()
    if (a.src !== url) {
      this.stopFade()
      a.pause()
      a.src = url
      a.load()
    }
  }

  /** Start downloading `url` without touching what's playing, so it starts instantly later. */
  warm(url: string): void {
    if (typeof Audio === 'undefined') return
    this.warmer ??= new Audio()
    if (this.warmer.src === url) return
    this.warmer.preload = 'auto'
    this.warmer.muted = true
    this.warmer.src = url
    this.warmer.load()
  }

  /** Keep `url` playing if it already is; otherwise start it at `offsetSeconds`. */
  ensurePlaying(url: string, offsetSeconds = 0): void {
    const a = this.el
    if (a && a.src === url && !a.paused && this.fadeTimer === null) return
    this.play(url, offsetSeconds)
  }

  /** Play `url` starting `offsetSeconds` in (used to sync late joiners). */
  play(url: string, offsetSeconds = 0): void {
    const a = this.audio()
    this.stopFade()
    this.applyVolume()
    if (a.src !== url) {
      a.src = url
    }
    const start = () => {
      try {
        a.currentTime = Math.max(0, Math.min(offsetSeconds, 29))
      } catch {
        // metadata not ready; start from the beginning
      }
      a.play()
        .then(() => this.set({ unlocked: true, blocked: false }))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'NotAllowedError') this.set({ blocked: true })
        })
    }
    if (a.readyState >= 1) start()
    else a.addEventListener('loadedmetadata', start, { once: true })
  }

  /** Fade out (default ~400ms), then pause. Snippet bursts use a short fade. */
  stop(fadeMs = 400): void {
    const a = this.el
    if (!a || a.paused) return
    this.stopFade()
    const startVol = a.volume
    const steps = Math.max(1, Math.round(fadeMs / 25))
    let step = 0
    this.fadeTimer = window.setInterval(() => {
      step++
      a.volume = Math.max(0, startVol * (1 - step / steps))
      if (step >= steps) {
        this.stopFade()
        a.pause()
        this.applyVolume()
      }
    }, 25)
  }

  private stopFade() {
    if (this.fadeTimer !== null) {
      clearInterval(this.fadeTimer)
      this.fadeTimer = null
    }
  }

  setVolume(volume: number) {
    this.set({ volume, muted: volume === 0 ? this.snapshot.muted : false })
    save('volume', String(volume))
    save('muted', this.snapshot.muted ? '1' : '0')
    this.applyVolume()
  }

  toggleMute() {
    this.set({ muted: !this.snapshot.muted })
    save('muted', this.snapshot.muted ? '1' : '0')
    this.applyVolume()
  }
}

export const player = new PreviewPlayer()

export function usePlayer() {
  return useSyncExternalStore(player.subscribe, player.getSnapshot)
}
