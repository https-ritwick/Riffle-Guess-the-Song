import { describe, expect, it } from 'vitest'
import type { Pick, PublicPlayer, RoundSummary, Track } from '../../src/shared/protocol'
import { biggestComeback, computeAwards, emojiGrid, roundStats } from '../../src/client/room/results/stats'

function player(id: string, score: number, extra: Partial<PublicPlayer> = {}): PublicPlayer {
  return { id, name: id.toUpperCase(), avatar: 0, photo: null, signedIn: false, score, streak: 0, bestStreak: 0, correct: 0, connected: true, answered: false, answerMs: null, roundPoints: null, first: false, voice: null, team: null, powers: [], ...extra }
}

const track = (i: number): Track => ({ id: String(i), title: `Song ${i}`, artist: 'A', album: '', artwork: '', preview: `https://audio-ssl.itunes.apple.com/${i}.m4a`, link: '', year: null })

function round(index: number, picks: Record<string, Partial<Pick>>, owners: string[] = []): RoundSummary {
  const full: Record<string, Pick> = {}
  for (const [id, p] of Object.entries(picks)) full[id] = { choice: 0, points: 0, correct: false, ms: 5000, ...p }
  return { index, mode: 'title', options: ['a', 'b', 'c', 'd'], optionArt: null, correct: 0, track: track(index), picks: full, owners }
}

describe('filmy awards', () => {
  // B trails for most of the game, then wins the last two songs.
  const history = [
    round(0, { a: { correct: true, points: 900, ms: 1200, first: true }, b: { correct: false, points: -100, choice: 1 } }),
    round(1, { a: { correct: true, points: 800, ms: 3000, first: true }, b: { correct: false, points: -100, choice: 2 } }),
    round(2, { a: { correct: false, points: -100, choice: 1 }, b: { correct: true, points: 1000, ms: 2000, first: true } }),
    round(3, { a: { correct: false, points: -100, choice: 3 }, b: { correct: true, points: 1900, ms: 2500, first: true } }),
  ]
  const players = [player('b', 2900, { correct: 2, bestStreak: 2 }), player('a', 1500, { correct: 2, bestStreak: 2 })]

  it('names awards after Bollywood films and dialogues', () => {
    const awards = computeAwards(players, history, roundStats(history, players), false)
    const byId = Object.fromEntries(awards.map((a) => [a.id, a]))
    expect(byId.dhoom?.title).toBe('Dhoom Machale')
    expect(byId.dhoom?.who).toBe('A')
    expect(byId.don?.title).toBe('Don')
    expect(byId.baazigar?.who).toBe('B')
    expect(byId.picture?.who).toBe('B')
    expect(byId['bullet-raja']).toBeDefined()
    expect(awards.every((a) => typeof a.icon === 'object' || typeof a.icon === 'function')).toBe(true)
    expect(awards.every((a) => a.tone && a.line)).toBe(true)
  })

  it('finds the comeback from the replayed scores', () => {
    expect(biggestComeback(history, players)).toMatchObject({ p: { id: 'b' }, from: 2, to: 1 })
  })

  it('skips party-only awards when solo', () => {
    const solo = [player('a', 1500, { correct: 2, bestStreak: 2 })]
    const ids = computeAwards(solo, history, roundStats(history, solo), true).map((a) => a.id)
    expect(ids).not.toContain('baazigar')
    expect(ids).not.toContain('bullet-raja')
    expect(ids).toContain('dhoom')
  })

  it('gives Blend awards to the most and least recognised music', () => {
    const blend = [round(0, { a: { correct: true, points: 900 }, b: { correct: true, points: 700 } }, ['A']), round(1, { a: { correct: false, choice: 1 }, b: { correct: false, choice: 2 } }, ['B'])]
    const awards = computeAwards(players, blend, roundStats(blend, players), false)
    expect(awards.find((a) => a.id === 'superstar')?.who).toBe('A')
    expect(awards.find((a) => a.id === 'mr-india')?.who).toBe('B')
  })

  it('draws a Wordle-style grid', () => {
    expect(emojiGrid(history, 'a')).toBe('🟩🟩🟥🟥')
    expect(emojiGrid([round(0, { a: { choice: null } })], 'a')).toBe('⬛')
  })
})
