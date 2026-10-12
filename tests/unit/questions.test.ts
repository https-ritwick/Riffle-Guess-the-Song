import { describe, expect, it } from 'vitest'
import type { Track } from '../../src/shared/protocol'
import { buildQuestions, dedupeTracks } from '../../src/shared/questions'

function seeded(seed = 42) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

function track(i: number, title: string, artist: string): Track {
  return {
    id: String(i),
    title,
    artist,
    album: 'Album',
    artwork: '',
    preview: `https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/${i}.m4a`,
    link: '',
    year: 2020,
  }
}

const ARTISTS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']
const POOL = Array.from({ length: 20 }, (_, i) => track(i, `Song ${i}`, ARTISTS[i % ARTISTS.length]!))

describe('dedupeTracks', () => {
  it('drops remasters/feature variants of the same song by the same artist', () => {
    const pool = [track(1, 'Hello', 'Adele'), track(2, 'Hello (Live)', 'Adele'), track(3, 'Hello', 'Lionel Richie')]
    expect(dedupeTracks(pool).map((t) => t.id)).toEqual(['1', '3'])
  })
})

describe('buildQuestions', () => {
  it('creates the requested number of rounds with unique songs', () => {
    const r = buildQuestions(POOL, { rounds: 10, answerType: 'title' }, seeded())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.questions).toHaveLength(10)
    expect(new Set(r.questions.map((q) => q.track.id)).size).toBe(10)
    expect(r.notice).toBeNull()
  })

  it('always offers 4 distinct options including the right answer', () => {
    const r = buildQuestions(POOL, { rounds: 15, answerType: 'mixed' }, seeded(7))
    if (!r.ok) throw new Error(r.message)
    for (const q of r.questions) {
      expect(q.options).toHaveLength(4)
      expect(new Set(q.options).size).toBe(4)
      expect(q.correct).toBeGreaterThanOrEqual(0)
      const expected = q.mode === 'title' ? q.track.title : q.track.artist
      expect(q.options[q.correct]).toBe(expected)
    }
  })

  it('uses artist questions when asked and possible', () => {
    const r = buildQuestions(POOL, { rounds: 5, answerType: 'artist' }, seeded())
    if (!r.ok) throw new Error(r.message)
    expect(r.questions.every((q) => q.mode === 'artist')).toBe(true)
  })

  it('falls back to titles when every song is by the same artist', () => {
    const solo = Array.from({ length: 8 }, (_, i) => track(i, `Track ${i}`, 'Solo Artist'))
    const r = buildQuestions(solo, { rounds: 5, answerType: 'artist' }, seeded())
    if (!r.ok) throw new Error(r.message)
    expect(r.questions.every((q) => q.mode === 'title')).toBe(true)
    expect(r.notice).toMatch(/same artist/)
  })

  it('shortens the game when there are fewer songs than rounds', () => {
    const r = buildQuestions(POOL.slice(0, 6), { rounds: 10, answerType: 'title' }, seeded())
    if (!r.ok) throw new Error(r.message)
    expect(r.questions).toHaveLength(6)
    expect(r.notice).toMatch(/6 rounds/)
  })

  it('fails with a helpful message when the pool is too small', () => {
    const r = buildQuestions(POOL.slice(0, 3), { rounds: 5, answerType: 'title' }, seeded())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Only found 3/)
  })
})
