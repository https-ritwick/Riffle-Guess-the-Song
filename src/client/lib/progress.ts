// Your Riffle career on this device: XP and filmi rank levels, a daily play streak,
// and badges. Updated once at the end of every game (see Results).
import { useSyncExternalStore } from 'react'
import { dailyNumber } from '../../shared/daily'
import { load, save } from './storage'

export interface Level {
  n: number
  title: string
  emoji: string
  xp: number
}

/** From the back row to the top of the poster. */
export const LEVELS: Level[] = [
  { n: 1, title: 'Junior Artist', emoji: '🎭', xp: 0 },
  { n: 2, title: 'Extra', emoji: '🎬', xp: 100 },
  { n: 3, title: 'Side Hero', emoji: '🕺', xp: 300 },
  { n: 4, title: 'Lead Hero', emoji: '🦸', xp: 650 },
  { n: 5, title: 'Superstar', emoji: '⭐', xp: 1200 },
  { n: 6, title: 'Megastar', emoji: '🌟', xp: 2000 },
  { n: 7, title: 'Shahenshah', emoji: '👑', xp: 3200 },
  { n: 8, title: 'Living Legend', emoji: '🏆', xp: 5000 },
  { n: 9, title: 'Bollywood Ka Baadshah', emoji: '💎', xp: 7500 },
]

export interface Badge {
  id: string
  emoji: string
  title: string
  how: string
}

export const BADGES: Badge[] = [
  { id: 'first-game', emoji: '🎟️', title: 'Pehli Picture', how: 'Finish your first game' },
  { id: 'first-win', emoji: '🏆', title: 'Box Office Hit', how: 'Win a game with friends' },
  { id: 'perfect', emoji: '💯', title: 'Mr. Perfectionist', how: 'Get every answer right (5+ rounds)' },
  { id: 'streak5', emoji: '🔥', title: 'Don', how: '5 right answers in a row' },
  { id: 'speed', emoji: '⚡', title: 'Dhoom', how: 'A right answer in under 2 seconds' },
  { id: 'all-modes', emoji: '🎪', title: 'All-Rounder', how: 'Play all four game modes' },
  { id: 'daily', emoji: '📅', title: 'Aaj Ka Hero', how: 'Finish a daily challenge' },
  { id: 'days3', emoji: '🥉', title: 'Hat-trick', how: 'Play 3 days in a row' },
  { id: 'days7', emoji: '🗓️', title: 'Ek Hafta Superstar', how: 'Play 7 days in a row' },
  { id: 'games10', emoji: '🎞️', title: 'Housefull', how: 'Play 10 games' },
  { id: 'games50', emoji: '🥇', title: 'Golden Jubilee', how: 'Play 50 games' },
  { id: 'party8', emoji: '💃', title: 'Baraat', how: 'Play a game with 8+ players' },
  { id: 'night', emoji: '🌙', title: 'Raat Baaki Hai', how: 'Play between midnight and 4 am' },
  { id: 'xp-superstar', emoji: '⭐', title: 'Star Ban Gaye', how: 'Reach Superstar level' },
]

export interface Progress {
  xp: number
  games: number
  wins: number
  modes: string[]
  /** Consecutive days (India time) with at least one game. */
  dayStreak: number
  bestDayStreak: number
  lastDay: number
  badges: string[]
  /** Daily challenges played: day → score. */
  dailies: Record<string, { score: number; correct: number; total: number; grid: string }>
}

const KEY = 'progress:v1'
const EMPTY: Progress = { xp: 0, games: 0, wins: 0, modes: [], dayStreak: 0, bestDayStreak: 0, lastDay: 0, badges: [], dailies: {} }

let cache: Progress | null = null
const listeners = new Set<() => void>()

export function getProgress(): Progress {
  if (cache) return cache
  try {
    cache = { ...EMPTY, ...(JSON.parse(load(KEY) ?? '{}') as Partial<Progress>) }
  } catch {
    cache = { ...EMPTY }
  }
  return cache
}

function setProgress(p: Progress): void {
  cache = p
  save(KEY, JSON.stringify(p))
  for (const l of listeners) l()
}

export function useProgress(): Progress {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getProgress,
    getProgress,
  )
}

export function levelFor(xp: number): { level: Level; next: Level | null; into: number; span: number } {
  let level = LEVELS[0]!
  for (const l of LEVELS) if (xp >= l.xp) level = l
  const next = LEVELS.find((l) => l.n === level.n + 1) ?? null
  return { level, next, into: xp - level.xp, span: next ? next.xp - level.xp : 1 }
}

/** The streak as it stands today: it's broken once a whole day passes without a game. */
export function currentDayStreak(p: Progress, today = dailyNumber()): number {
  return p.lastDay >= today - 1 ? p.dayStreak : 0
}

export interface GameOutcome {
  mode: string
  score: number
  correct: number
  total: number
  /** 1-based finishing position; 1 with nobody else counts as solo. */
  rank: number
  players: number
  bestStreak: number
  fastestMs: number | null
  daily: number | null
  grid: string
}

export interface ProgressUpdate {
  gained: { label: string; xp: number }[]
  before: number
  after: number
  levelUp: Level | null
  newBadges: Badge[]
  dayStreak: number
}

/** Add a finished game to your career and say what it earned. */
export function recordGame(g: GameOutcome, now = new Date()): ProgressUpdate {
  const p = { ...getProgress(), modes: [...getProgress().modes], badges: [...getProgress().badges], dailies: { ...getProgress().dailies } }
  const today = dailyNumber(now.getTime())
  const party = g.players > 1
  const win = party && g.rank === 1
  const perfect = g.total >= 5 && g.correct === g.total

  const gained: ProgressUpdate['gained'] = [
    { label: 'Played a game', xp: 20 },
    { label: `${g.correct} right answer${g.correct === 1 ? '' : 's'}`, xp: g.correct * 10 },
    { label: 'Score bonus', xp: Math.round(g.score / 200) },
  ]
  if (win) gained.push({ label: 'Won the room', xp: 60 })
  else if (party && g.rank <= 3) gained.push({ label: `Finished #${g.rank}`, xp: 25 })
  if (perfect) gained.push({ label: 'Perfect game', xp: 50 })
  if (g.daily) gained.push({ label: 'Daily challenge', xp: 40 })
  if (p.lastDay !== today) gained.push({ label: 'First game today', xp: 25 })

  // Day streak.
  if (p.lastDay === today - 1) p.dayStreak += 1
  else if (p.lastDay !== today) p.dayStreak = 1
  p.lastDay = today
  p.bestDayStreak = Math.max(p.bestDayStreak, p.dayStreak)
  if (p.dayStreak >= 2 && gained.some((x) => x.label === 'First game today')) gained.push({ label: `${p.dayStreak}-day streak`, xp: Math.min(100, p.dayStreak * 10) })

  const before = p.xp
  p.xp += gained.reduce((n, x) => n + x.xp, 0)
  p.games += 1
  if (win) p.wins += 1
  if (!p.modes.includes(g.mode)) p.modes.push(g.mode)
  if (g.daily) p.dailies[String(g.daily)] = { score: g.score, correct: g.correct, total: g.total, grid: g.grid }

  const earned = (id: string, ok: boolean) => ok && !p.badges.includes(id) && p.badges.push(id)
  const hour = now.getHours()
  earned('first-game', true)
  earned('first-win', win)
  earned('perfect', perfect)
  earned('streak5', g.bestStreak >= 5)
  earned('speed', g.fastestMs !== null && g.fastestMs < 2000)
  earned('all-modes', ['songs', 'dialogue', 'actor', 'emoji'].every((m) => p.modes.includes(m)))
  earned('daily', !!g.daily)
  earned('days3', p.dayStreak >= 3)
  earned('days7', p.dayStreak >= 7)
  earned('games10', p.games >= 10)
  earned('games50', p.games >= 50)
  earned('party8', g.players >= 8)
  earned('night', hour < 4)
  earned('xp-superstar', p.xp >= LEVELS[4]!.xp)

  const was = levelFor(before).level
  const now_ = levelFor(p.xp).level
  const newBadges = BADGES.filter((b) => p.badges.includes(b.id) && !getProgress().badges.includes(b.id))
  setProgress(p)
  return { gained, before, after: p.xp, levelUp: now_.n > was.n ? now_ : null, newBadges, dayStreak: p.dayStreak }
}
