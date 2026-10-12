import { describe, expect, it } from 'vitest'
import { ClientMessageSchema, SettingsSchema, TrackSchema } from '../../src/shared/protocol'
import { scoreAnswer } from '../../src/shared/rules'

describe('scoreAnswer', () => {
  it('gives nothing for a wrong answer', () => {
    expect(scoreAnswer(false, 1000, 15000, 3)).toBe(0)
  })

  it('rewards speed between 500 and 1000 points', () => {
    expect(scoreAnswer(true, 0, 15000, 1)).toBe(1000)
    expect(scoreAnswer(true, 15000, 15000, 1)).toBe(500)
    expect(scoreAnswer(true, 7500, 15000, 1)).toBe(750)
  })

  it('adds a capped streak bonus', () => {
    expect(scoreAnswer(true, 15000, 15000, 2)).toBe(550)
    expect(scoreAnswer(true, 15000, 15000, 10)).toBe(650)
  })
})

describe('protocol validation', () => {
  it('rejects tracks whose audio is not from the iTunes CDN', () => {
    const base = { id: '1', title: 'x', artist: 'y', album: '', artwork: '', link: '', year: null }
    expect(TrackSchema.safeParse({ ...base, preview: 'https://audio-ssl.itunes.apple.com/a.m4a' }).success).toBe(true)
    expect(TrackSchema.safeParse({ ...base, preview: 'https://evil.example/a.m4a' }).success).toBe(false)
    expect(TrackSchema.safeParse({ ...base, preview: 'https://audio-ssl.itunes.apple.com/a.m4a', artwork: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('only accepts allowed setting values', () => {
    const ok = { source: { kind: 'preset', id: 'decade-80s' }, rounds: 10, guessSeconds: 15, answerType: 'title', region: 'in' }
    expect(SettingsSchema.safeParse(ok).success).toBe(true)
    expect(SettingsSchema.safeParse({ ...ok, rounds: 999 }).success).toBe(false)
    expect(SettingsSchema.safeParse({ ...ok, region: 'zz' }).success).toBe(false)
  })

  it('rejects unknown or malformed client messages', () => {
    expect(ClientMessageSchema.safeParse({ t: 'answer', round: 0, choice: 2 }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'answer', round: 0, choice: 9 }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ t: 'hack' }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ t: 'react', emoji: '💩' }).success).toBe(false)
  })
})
