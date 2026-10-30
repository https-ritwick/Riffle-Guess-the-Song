// Power-ups, team battles and Antakshari: rules shared by the room server and the UI.
import { closeness, sameSongVariant, shuffle, type Question, type Random } from './questions'
import { z } from 'zod'
import { cleanTitle, compareKey } from './text'
import type { Difficulty, Track } from './protocol'

// ---------------------------------------------------------------------------
// Power-ups: each player gets one of each per game (when the host turns them on),
// one per round, used before answering. The host picks which ones are in play.

export const POWER_IDS = ['fifty', 'double', 'shield', 'hint', 'retry', 'rob', 'peek'] as const
export type PowerId = (typeof POWER_IDS)[number]

export const POWERS: Record<PowerId, { name: string; hint: string; /** Needs other players in the room. */ rivals?: boolean }> = {
  fifty: { name: '50-50', hint: 'Removes two wrong answers' },
  double: { name: 'Double', hint: 'A right answer scores ×2' },
  shield: { name: 'Shield', hint: 'A wrong answer costs nothing and keeps your streak' },
  hint: { name: 'Hint', hint: 'Shows the first letter of the answer (and the year for songs)' },
  retry: { name: 'Second chance', hint: 'If your first answer is wrong, pick again for half points' },
  rob: { name: 'Robin Hood', hint: 'A right answer also takes up to 150 points from the top-scoring rival', rivals: true },
  peek: { name: 'Crowd peek', hint: 'See how many players picked each answer so far', rivals: true },
}

/** Robin Hood takes up to this many points from the leader. */
export const ROB_POINTS = 150
/** A right answer after a Second chance scores this share. */
export const RETRY_SHARE = 0.5

// ---------------------------------------------------------------------------
// Team battles: two teams. Names default to Sholay's Jai and Veeru; the admin can
// change the defaults and the host can rename them for a room.

export const TEAM_IDS = ['a', 'b'] as const
export type TeamId = (typeof TEAM_IDS)[number]

export const TeamNameSchema = z.string().trim().min(1, 'Give the team a name').max(24)

export interface TeamLabel {
  name: string
  emoji: string
}

export const DEFAULT_TEAM_LABELS: Record<TeamId, TeamLabel> = {
  a: { name: 'Team Jai', emoji: '🔥' },
  b: { name: 'Team Veeru', emoji: '💧' },
}

/** Tailwind classes are spelled out in full so the CSS build finds them. */
export const TEAMS: Record<TeamId, { name: string; emoji: string; color: string; tile: string; bg: string; text: string; bar: string }> = {
  a: { name: 'Team Jai', emoji: '🔥', color: '#f97316', tile: 'bg-orange-500/15 ring-orange-400/40', bg: 'bg-orange-500/15', text: 'text-orange-300', bar: 'bg-orange-400' },
  b: { name: 'Team Veeru', emoji: '💧', color: '#38bdf8', tile: 'bg-sky-500/15 ring-sky-400/40', bg: 'bg-sky-500/15', text: 'text-sky-300', bar: 'bg-sky-400' },
}

export interface TeamStanding {
  id: TeamId
  /** Average score per member, so a smaller team isn't punished. */
  score: number
  total: number
  members: number
  correct: number
}

/** Rank the two teams from per-player scores. */
export function teamStandings(players: { team: TeamId | null; score: number; correct: number; connected?: boolean }[]): TeamStanding[] {
  return TEAM_IDS.map((id) => {
    const members = players.filter((p) => p.team === id)
    const total = members.reduce((n, p) => n + p.score, 0)
    return { id, total, members: members.length, score: members.length ? Math.round(total / members.length) : 0, correct: members.reduce((n, p) => n + p.correct, 0) }
  }).sort((x, y) => y.score - x.score)
}

/** Off-turn players in an Antakshari team battle can steal for this share of the points. */
export const STEAL_SHARE = 0.5

// ---------------------------------------------------------------------------
// Antakshari: each song starts with the last sound of the one before.

/** First letter of a song title (a–z), or null. */
export function firstLetter(title: string): string | null {
  return compareKey(cleanTitle(title)).match(/[a-z]/)?.[0] ?? null
}

/**
 * The letter the next song must start with: the title's last consonant, as in
 * Hindi antakshari ("Kesariya" → Y, "Tum Hi Ho" → H). All-vowel endings use the last letter.
 */
export function lastLetter(title: string): string | null {
  const letters = compareKey(cleanTitle(title)).replace(/[^a-z]/g, '')
  if (!letters) return null
  const stem = letters.replace(/[aeiou]+$/, '')
  return (stem || letters).slice(-1)
}

export interface AntakshariQuestion extends Question {
  /** The letter this song had to start with (null: the chain broke and started fresh). */
  letter: string | null
}

const JITTER: Record<Difficulty, number> = { easy: Infinity, medium: 3.5, hard: 0.75 }

/**
 * Build a chain of songs where each title starts with the previous title's last
 * letter. Wrong answers start with the same letter, so knowing the letter never
 * gives the answer away. When no song continues the chain, a fresh letter starts.
 */
export function buildAntakshari(pool: readonly Track[], opts: { rounds: number; difficulty: Difficulty }, rand: Random): AntakshariQuestion[] {
  const byLetter = new Map<string, Track[]>()
  const seen = new Set<string>()
  for (const t of pool) {
    const key = compareKey(cleanTitle(t.title))
    const l = firstLetter(t.title)
    if (!key || !l || seen.has(key)) continue
    seen.add(key)
    byLetter.set(l, [...(byLetter.get(l) ?? []), t])
  }
  const used = new Set<string>()
  const unused = (l: string) => (byLetter.get(l) ?? []).filter((t) => !used.has(t.id))
  // A letter can host a round if it has an unplayed song plus three more titles for wrong answers.
  const playable = (l: string | null, except?: string) => !!l && (byLetter.get(l)?.length ?? 0) >= 4 && unused(l).some((t) => t.id !== except)

  const questions: AntakshariQuestion[] = []
  let letter: string | null = null
  while (questions.length < opts.rounds) {
    const chained = letter !== null && playable(letter)
    let choices = chained ? unused(letter!) : []
    if (!chained) {
      const fresh = shuffle([...byLetter.keys()].filter((l) => playable(l)), rand)
      if (!fresh.length) break
      choices = unused(fresh[0]!)
    }
    // Prefer songs whose ending keeps the chain going.
    const ranked = shuffle(choices, rand).sort((x, y) => Number(playable(lastLetter(y.title), y.id)) - Number(playable(lastLetter(x.title), x.id)))
    const track = ranked[0]!
    const l = firstLetter(track.title)!
    used.add(track.id)

    const jitter = JITTER[opts.difficulty]
    const wrong = (byLetter.get(l) ?? [])
      .filter((t) => t.id !== track.id && !sameSongVariant(cleanTitle(t.title), cleanTitle(track.title)))
      .map((t) => ({ t, s: jitter === Infinity ? rand() : closeness(track, t) + rand() * jitter }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 3)
      .map((x) => x.t)
    if (wrong.length < 3) {
      letter = null
      continue
    }
    const options = shuffle([track, ...wrong], rand)
    questions.push({
      track,
      mode: 'title',
      options: options.map((t) => cleanTitle(t.title)),
      optionArt: options.map((t) => t.artwork),
      optionSpotify: options.map((t) => t.spotifyId ?? null),
      correct: options.indexOf(track),
      letter: chained ? l : null,
    })
    letter = lastLetter(track.title)
  }
  return questions
}
