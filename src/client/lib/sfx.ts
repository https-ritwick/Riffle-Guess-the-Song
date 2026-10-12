// Tiny synthesized sound effects (no audio files): countdown ticks, right/wrong
// answer, round start and a victory fanfare. Can be switched off per device.
import { useSyncExternalStore } from 'react'
import { load, save } from './storage'

type Effect = 'tick' | 'go' | 'correct' | 'wrong' | 'win' | 'pop'

let ctx: AudioContext | null = null
let enabled = load('sfx') !== '0'
const listeners = new Set<() => void>()

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.12) {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + start
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

export function playSfx(effect: Effect) {
  if (!enabled) return
  switch (effect) {
    case 'tick':
      tone(880, 0, 0.08, 'square', 0.05)
      break
    case 'go':
      tone(660, 0, 0.12, 'triangle')
      tone(990, 0.1, 0.18, 'triangle')
      break
    case 'correct':
      tone(784, 0, 0.12, 'triangle')
      tone(1046, 0.09, 0.22, 'triangle')
      break
    case 'wrong':
      tone(220, 0, 0.25, 'sawtooth', 0.06)
      tone(165, 0.12, 0.3, 'sawtooth', 0.06)
      break
    case 'pop':
      tone(1200, 0, 0.05, 'sine', 0.05)
      break
    case 'win':
      ;[523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle'))
      break
  }
}

export function vibrate(pattern: number | number[]) {
  try {
    if (enabled) navigator.vibrate?.(pattern)
  } catch {
    // unsupported
  }
}

export function setSfxEnabled(on: boolean) {
  enabled = on
  save('sfx', on ? '1' : '0')
  listeners.forEach((l) => l())
}

export function useSfxEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => enabled,
  )
}
