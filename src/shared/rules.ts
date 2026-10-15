// Game timing and scoring rules shared by the server (authoritative) and the UI (display).
import type { Difficulty } from './protocol'

export const COUNTDOWN_MS = 3000
/**
 * After each song the answer is shown for this long while the song keeps playing;
 * the next song starts straight after (the 3-2-1 countdown only opens the game).
 */
export const REVEAL_MS = 10_000
export const LOADING_TIMEOUT_MS = 45_000
export const HOST_GRACE_MS = 15_000
export const ANSWER_GRACE_MS = 750
export const MAX_PLAYERS = 16
export const MIN_POOL = 4

export const BASE_POINTS = 500
export const SPEED_POINTS = 500
export const STREAK_BONUS = 50
export const MAX_STREAK_BONUS = 150
/** The first correct answer of a round earns this on top (multiplayer only). */
export const FIRST_BONUS = 100
/** A wrong answer costs this much on each difficulty (scores never drop below 0; not answering costs nothing). */
export const WRONG_PENALTY: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 100 }

/**
 * Points for one answer. A correct answer earns 500 plus up to 500 more for speed,
 * plus 50 per consecutive correct answer after the first (max +150).
 */
export function scoreAnswer(correct: boolean, elapsedMs: number, totalMs: number, streak: number): number {
  if (!correct) return 0
  const remaining = Math.min(1, Math.max(0, 1 - elapsedMs / totalMs))
  const streakBonus = Math.min(MAX_STREAK_BONUS, Math.max(0, streak - 1) * STREAK_BONUS)
  return Math.round(BASE_POINTS + SPEED_POINTS * remaining) + streakBonus
}

export const AVATARS = [
  { emoji: '🦊', bg: '#f97316' },
  { emoji: '🐼', bg: '#64748b' },
  { emoji: '🐸', bg: '#22c55e' },
  { emoji: '🐯', bg: '#f59e0b' },
  { emoji: '🦄', bg: '#d946ef' },
  { emoji: '🐙', bg: '#ef4444' },
  { emoji: '🐧', bg: '#0ea5e9' },
  { emoji: '🐨', bg: '#a8a29e' },
  { emoji: '🐵', bg: '#a16207' },
  { emoji: '🦁', bg: '#eab308' },
  { emoji: '🐰', bg: '#f472b6' },
  { emoji: '🐻', bg: '#92400e' },
  { emoji: '🐳', bg: '#2563eb' },
  { emoji: '🦖', bg: '#16a34a' },
  { emoji: '🐝', bg: '#ca8a04' },
  { emoji: '🦉', bg: '#7c3aed' },
] as const

/** Quick reactions shown first; the rest open from the "more" button. */
export const QUICK_REACTIONS = ['🔥', '😂', '😮', '👏', '😭', '🖕', '💀', '🎉'] as const
export const REACTIONS = [
  ...QUICK_REACTIONS,
  '🤣', '😍', '🥵', '🤯', '😡', '🤡', '💯', '👀',
  '🙏', '💃', '🕺', '🎶', '🫡', '😎', '🤌', '😤',
  '🥲', '👑', '🐐', '🤦', '🙈', '❤️', '💔', '🤬',
  '😈', '🥳', '😴', '🤮', '🫠', '🍿', '🚀', '🧢',
] as const
