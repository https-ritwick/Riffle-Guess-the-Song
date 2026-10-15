// "Aaj Ka Challenge": one short challenge a day, the same questions for everyone,
// with a shared leaderboard. Days roll over at midnight India time.
import type { GameKind } from './challenges'
import { DEFAULT_SETTINGS, type Settings } from './protocol'

const DAY_MS = 86_400_000
const IST_OFFSET_MS = 330 * 60_000
/** 14 October 2026 (IST) is Daily #1. */
const FIRST_DAY = Math.floor(Date.UTC(2026, 9, 14) / DAY_MS)

export const DAILY_ROUNDS = 5
const DAILY_GAMES: Exclude<GameKind, 'songs'>[] = ['dialogue', 'emoji', 'actor']

export function dailyNumber(now = Date.now()): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) - FIRST_DAY + 1
}

export function msUntilNextDaily(now = Date.now()): number {
  const nextDay = Math.floor((now + IST_OFFSET_MS) / DAY_MS) + 1
  return nextDay * DAY_MS - IST_OFFSET_MS - now
}

export function dailyGame(n: number): Exclude<GameKind, 'songs'> {
  return DAILY_GAMES[((n % DAILY_GAMES.length) + DAILY_GAMES.length) % DAILY_GAMES.length]!
}

export function dailySettings(n: number): Settings {
  return { ...DEFAULT_SETTINGS, game: dailyGame(n), rounds: DAILY_ROUNDS, guessSeconds: 15, difficulty: 'medium', liveScoring: true, doubleFinal: true }
}

/** Repeatable random numbers, so every player gets the same daily questions. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** GET /api/daily */
export interface DailyBoard {
  day: number
  game: Exclude<GameKind, 'songs'>
  players: number
  top: { name: string; score: number; correct: number; total: number }[]
  /** With ?score=: where that score ranks today (1 = best). */
  rank: number | null
  nextInMs: number
}
