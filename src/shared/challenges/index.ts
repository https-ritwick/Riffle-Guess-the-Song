// Non-music challenges: guess the movie from a dialogue, guess the star, and guess
// the song from emojis. Items come from the curated bank (./data) and, when an
// Anthropic key is configured, from Claude (src/worker/ai.ts). Both are turned
// into the same four-option questions the song game uses.
import type { Difficulty, QuestionMode, Track } from '../protocol'
import { shuffle, type Random } from '../questions'
import { compareKey, similarity } from '../text'
import { DIALOGUES, EMOJI_SONGS, MOVIES, STARS } from './data'

export type GameKind = 'songs' | 'dialogue' | 'actor' | 'emoji'
export type ChallengeKind = 'dialogue' | 'actor' | 'quote' | 'emoji'

export interface ChallengeItem {
  /** Stable id used to avoid repeats ("dlg:…", "star:…", "emo:…", "ai:…"). */
  id: string
  kind: ChallengeKind
  /** What players see: the dialogue or the emojis ('' for star clues). */
  prompt: string
  /** Star rounds: clues revealed one by one, hardest first. */
  clues: string[]
  answer: string
  /** Look-alike wrong answers supplied with the item (AI items). The bank fills in the rest. */
  decoys: string[]
  /** Shown under the answer at the reveal. */
  detail: string
  /** A dialogue's meaning, shown at the reveal. */
  note: string
  year: number | null
  /** Emoji songs: used to find the song's clip (already found for AI puzzles, which are checked against iTunes). */
  song?: { title: string; movie: string; singer: string; preview?: string; artwork?: string; link?: string }
  ai: boolean
}

/** What players see during a challenge round (never the answer). */
export interface ChallengePrompt {
  kind: ChallengeKind
  prompt: string
  clues: string[]
  /** True when the item was freshly written by AI for this room. */
  ai: boolean
}

export const GAME_KINDS: GameKind[] = ['songs', 'dialogue', 'actor', 'emoji']

export const CHALLENGE_QUESTION: Record<ChallengeKind, string> = {
  dialogue: 'Which movie is this dialogue from?',
  quote: 'Who said this?',
  actor: 'Who’s the star?',
  emoji: 'Which song is this?',
}

const movieByTitle = new Map(MOVIES.map(([t, y, s]) => [compareKey(t), { title: t, year: y, stars: s }]))
const starByName = new Map(STARS.map(([n, g, era]) => [compareKey(n), { name: n, gender: g, era }]))

const slug = (s: string) => compareKey(s).slice(0, 48)

/**
 * The "have we played this?" key, from the content rather than where it came from:
 * the same dialogue (whether curated or AI-written, in a dialogue or a
 * "who said it?" round), the same star, or the same emoji song.
 */
export function challengeKey(kind: ChallengeKind, prompt: string, answer: string): string {
  if (kind === 'dialogue' || kind === 'quote') return `dlg:${slug(prompt)}`
  return kind === 'actor' ? `star:${slug(answer)}` : `emo:${slug(answer)}`
}

/** True when two dialogues are the same line, give or take spelling and punctuation. */
export function sameLine(a: string, b: string): boolean {
  const x = compareKey(a)
  const y = compareKey(b)
  if (!x || !y) return false
  if (x === y || (Math.min(x.length, y.length) >= 12 && (x.includes(y) || y.includes(x)))) return true
  return similarity(a, b) >= 0.62
}

let bankCache: Record<Exclude<GameKind, 'songs'>, ChallengeItem[]> | null = null

/** The curated items for one game kind. */
export function bankItems(game: Exclude<GameKind, 'songs'>): ChallengeItem[] {
  bankCache ??= {
    dialogue: DIALOGUES.map(([q, en, m, actor, character]) => {
      const movie = movieByTitle.get(compareKey(m))
      const year = movie?.year ?? null
      const who = actor === '—' ? character : `${character} (${actor})`
      return {
        id: `dlg:${slug(q)}`,
        kind: 'dialogue' as const,
        prompt: q,
        clues: [],
        answer: m,
        decoys: [],
        detail: `${who === '—' ? '' : `${who} · `}${m}${year ? ` (${year})` : ''}`,
        note: en === '—' ? '' : en,
        year,
        ai: false,
      }
    }),
    actor: [
      ...STARS.map(([name, , era, clues]) => ({
        id: `star:${slug(name)}`,
        kind: 'actor' as const,
        prompt: '',
        clues,
        answer: name,
        decoys: [],
        detail: clues[clues.length - 1]!,
        note: '',
        year: era,
        ai: false,
      })),
      // "Who said it?": dialogues whose speaker is a star we can offer look-alikes for.
      ...DIALOGUES.filter(([, , , actor]) => starByName.has(compareKey(actor))).map(([q, en, m, actor, character]) => {
        const year = movieByTitle.get(compareKey(m))?.year ?? null
        return {
          id: `dlg:${slug(q)}`,
          kind: 'quote' as const,
          prompt: q,
          clues: [],
          answer: actor,
          decoys: [],
          detail: `as ${character} in ${m}${year ? ` (${year})` : ''}`,
          note: en === '—' ? '' : en,
          year,
          ai: false,
        }
      }),
    ],
    emoji: EMOJI_SONGS.map(([emoji, title, movie, year, singer]) => ({
      id: `emo:${slug(title)}`,
      kind: 'emoji' as const,
      prompt: emoji,
      clues: [],
      answer: title,
      decoys: [],
      detail: `${movie} (${year}) · ${singer}`,
      note: '',
      year,
      song: { title, movie, singer },
      ai: false,
    })),
  }
  return bankCache[game]
}

// ---------------------------------------------------------------------------
// Wrong answers

interface Candidate {
  text: string
  score: number
}

/** How tempting each possible wrong answer is for `item` (higher = more confusable). */
function candidates(item: ChallengeItem): Candidate[] {
  const right = compareKey(item.answer)
  const out = new Map<string, Candidate>()
  const add = (text: string, score: number) => {
    const key = compareKey(text)
    if (!key || key === right || similarity(text, item.answer) >= 0.85) return
    const prev = out.get(key)
    if (!prev || score > prev.score) out.set(key, { text, score })
  }
  const yearScore = (a: number | null, b: number | null, span = 1) => {
    if (!a || !b) return 0
    const d = Math.abs(a - b) / span
    return d <= 1 ? 2 : d <= 3 ? 1.2 : d <= 8 ? 0.5 : 0
  }

  if (item.kind === 'dialogue') {
    const movie = movieByTitle.get(right)
    for (const [title, year, stars] of MOVIES) {
      const shared = movie ? stars.filter((s) => movie.stars.includes(s)).length : 0
      add(title, shared * 3 + yearScore(item.year, year))
    }
  } else if (item.kind === 'actor' || item.kind === 'quote') {
    const star = starByName.get(right)
    const movie = item.kind === 'quote' ? MOVIES.find(([t]) => item.detail.includes(` in ${t}`)) : undefined
    for (const [name, gender, era] of STARS) {
      if (star && gender !== star.gender) continue
      // Co-stars of the same film are the most tempting "who said it" answers.
      const coStar = movie?.[2].includes(name) ? 3 : 0
      add(name, coStar + yearScore(star?.era ?? item.year, era, 10) * 1.5)
    }
  } else {
    const song = item.song
    for (const [, title, movie, year, singer] of EMOJI_SONGS) {
      let s = yearScore(item.year, year)
      if (song && compareKey(movie) === compareKey(song.movie)) s += 4
      if (song && compareKey(singer) === compareKey(song.singer)) s += 2.5
      add(title, s)
    }
  }
  // Wrong answers written with the item (AI) are designed to be confusable.
  for (const d of item.decoys) add(d, 6)
  return [...out.values()]
}

const JITTER: Record<Difficulty, number> = { easy: Infinity, medium: 3.5, hard: 0.75 }

function pickDecoys(item: ChallengeItem, difficulty: Difficulty, rand: Random): string[] | null {
  const cands = candidates(item)
  if (cands.length < 3) return null
  const jitter = JITTER[difficulty]
  const ranked = jitter === Infinity ? shuffle(cands, rand) : cands.map((c) => ({ c, s: c.score + rand() * jitter })).sort((a, b) => b.s - a.s).map((x) => x.c)
  return ranked.slice(0, 3).map((c) => c.text)
}

// ---------------------------------------------------------------------------
// Building a game

export interface ChallengeQuestion {
  /** The answer and reveal details, shaped like a song so results and recaps can show it. */
  track: Track
  mode: QuestionMode
  options: string[]
  optionArt: string[]
  optionSpotify: (string | null)[]
  correct: number
  challenge: ChallengePrompt
  item: ChallengeItem
}

export function challengeTrack(item: ChallengeItem): Track {
  return {
    id: item.id.slice(0, 60),
    title: item.answer,
    artist: item.detail,
    album: item.note,
    artwork: item.song?.artwork ?? '',
    preview: item.song?.preview ?? '',
    link: item.song?.link ?? '',
    year: item.year && item.year >= 1900 ? item.year : null,
  }
}

/**
 * Pick this game's items and turn them into questions. Items nobody in the room
 * has played recently come first; AI-written items (fresh every time) get up to
 * 60% of the rounds, and no answer repeats within a game.
 */
export function buildChallengeQuestions(
  opts: { game: Exclude<GameKind, 'songs'>; ai: readonly ChallengeItem[]; played: ReadonlySet<string>; rounds: number; difficulty: Difficulty },
  rand: Random,
): { questions: ChallengeQuestion[]; notice: string | null } {
  const fresh = (items: readonly ChallengeItem[]) => shuffle(items.filter((i) => !opts.played.has(i.id)), rand)
  const stale = (items: readonly ChallengeItem[]) => shuffle(items.filter((i) => opts.played.has(i.id)), rand)
  const bank = bankItems(opts.game)
  const aiShare = Math.ceil(opts.rounds * 0.6)
  const ordered = [...fresh(opts.ai).slice(0, aiShare), ...fresh(bank), ...fresh(opts.ai).slice(aiShare), ...stale(bank), ...stale(opts.ai)]

  const answers = new Set<string>()
  const prompts = new Set<string>()
  const chosen: ChallengeItem[] = []
  for (const item of ordered) {
    if (chosen.length >= opts.rounds) break
    if (item.prompt && item.kind !== 'emoji' && chosen.some((c) => c.prompt && sameLine(c.prompt, item.prompt))) continue
    const a = compareKey(item.answer)
    // Emoji prompts have no letters, so compare them as written.
    const raw = item.prompt || item.clues.join(' ')
    const p = compareKey(raw) || raw.replace(/\s+/g, '')
    if (answers.has(a) || prompts.has(p)) continue
    answers.add(a)
    prompts.add(p)
    chosen.push(item)
  }

  const questions: ChallengeQuestion[] = []
  for (const item of shuffle(chosen, rand)) {
    const decoys = pickDecoys(item, opts.difficulty, rand)
    if (!decoys) continue
    const options = shuffle([item.answer, ...decoys], rand)
    questions.push({
      track: challengeTrack(item),
      mode: item.kind,
      options,
      optionArt: ['', '', '', ''],
      optionSpotify: [null, null, null, null],
      correct: options.indexOf(item.answer),
      challenge: { kind: item.kind, prompt: item.prompt, clues: item.clues, ai: item.ai },
      item,
    })
  }
  const notice = questions.length < opts.rounds ? `Only ${questions.length} fresh questions were ready, so this game has ${questions.length} rounds.` : null
  return { questions, notice }
}

/** A one-line reminder of an item, so AI writes new ones instead of repeats. */
export function summarize(i: ChallengeItem): string {
  return i.kind === 'actor' ? i.answer : `${i.prompt.slice(0, 48)} → ${i.answer}`
}

export function knownPrompts(game: Exclude<GameKind, 'songs'>): string[] {
  return bankItems(game).map(summarize)
}
