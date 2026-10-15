import type { AnswerType, Difficulty, QuestionMode, Track } from './protocol'
import { MIN_POOL } from './rules'
import { artistList, cleanTitle, compareKey, primaryArtist, similarity, titleWords } from './text'

export interface Question {
  track: Track
  mode: QuestionMode
  options: string[]
  /** Album art shown next to each option ('' when unknown). */
  optionArt: string[]
  /** Spotify track behind each option's art, so missing art can be fetched later. */
  optionSpotify: (string | null)[]
  correct: number
}

export type Random = () => number

export function shuffle<T>(items: readonly T[], rand: Random): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/**
 * Key for "has this room played it before?": the same song from any service or
 * player, or a challenge item's id.
 */
export function playedKey(t: Pick<Track, 'id' | 'title' | 'artist'>, mode: QuestionMode = 'title'): string {
  return mode === 'title' || mode === 'artist' ? `${compareKey(t.title)}|${compareKey(primaryArtist(t.artist))}` : t.id
}

/** Remove duplicate songs (same cleaned title by the same lead artist). */
export function dedupeTracks(pool: readonly Track[]): Track[] {
  const seen = new Set<string>()
  const out: Track[] = []
  for (const t of pool) {
    const key = `${compareKey(t.title)}|${compareKey(primaryArtist(t.artist))}`
    if (seen.has(key) || seen.has(`id:${t.id}`)) continue
    seen.add(key)
    seen.add(`id:${t.id}`)
    out.push(t)
  }
  return out
}

function answerText(track: Track, mode: 'title' | 'artist'): string {
  return mode === 'title' ? cleanTitle(track.title) : primaryArtist(track.artist)
}

/**
 * Near-identical spellings ("Kesariya" / "Kesariyaa") are probably the same song,
 * which would be an unfair wrong answer. Numbered siblings ("Part 1" / "Part 2") and
 * longer titles ("Tum Hi Ho" / "Tum Hi Ho Bandhu") are different songs and make
 * great look-alikes. Remixes and versions are already merged by cleanTitle().
 */
export function sameSongVariant(a: string, b: string): boolean {
  const x = compareKey(a)
  const y = compareKey(b)
  if (x === y) return true
  if (x.replace(/\d+/g, '') === y.replace(/\d+/g, '')) return false
  return similarity(a, b) >= 0.85
}

/**
 * How easily `t` could be mistaken for `c`: same singer, same album/movie, same era,
 * and a title that looks or sounds alike all make a wrong answer more convincing.
 */
export function closeness(c: Track, t: Track): number {
  let score = 0
  const ca = artistList(c.artist).map(compareKey)
  const ta = artistList(t.artist).map(compareKey)
  if (ca[0] && ca[0] === ta[0]) score += 4
  else if (ta.some((a) => a && ca.includes(a))) score += 2.5
  // Songs from the same movie soundtrack are the most confusing of all.
  if (c.album && t.album && compareKey(c.album) === compareKey(t.album)) score += 4.5
  if (c.year && t.year) {
    const d = Math.abs(c.year - t.year)
    score += d <= 1 ? 2 : d <= 3 ? 1.2 : d <= 6 ? 0.5 : 0
  }
  score += similarity(c.title, t.title) * 4
  const cw = new Set(titleWords(c.title))
  if (titleWords(t.title).some((w) => cw.has(w))) score += 1.5
  const a = cleanTitle(c.title)
  const b = cleanTitle(t.title)
  if (a[0]?.toLowerCase() === b[0]?.toLowerCase()) score += 0.5
  if (Math.abs(a.length - b.length) <= 3) score += 0.5
  return score
}

/** Random noise added to closeness: easy ignores closeness, hard follows it almost exactly. */
const JITTER: Record<Difficulty, number> = { easy: Infinity, medium: 3.5, hard: 0.75 }

interface Candidate {
  text: string
  key: string
  score: number
  art: string
  spotifyId: string | null
}

function rank(cands: Candidate[], difficulty: Difficulty, rand: Random): Candidate[] {
  const jitter = JITTER[difficulty]
  if (jitter === Infinity) return shuffle(cands, rand)
  return cands.map((c) => ({ c, s: c.score + rand() * jitter })).sort((x, y) => y.s - x.s).map((x) => x.c)
}

function titleCandidates(correct: Track, pool: readonly Track[]): Candidate[] {
  const correctKey = compareKey(answerText(correct, 'title'))
  const best = new Map<string, Candidate>()
  for (const t of pool) {
    if (t.id === correct.id) continue
    const text = answerText(t, 'title')
    const key = compareKey(text)
    if (!key || key === correctKey || sameSongVariant(text, cleanTitle(correct.title))) continue
    const score = closeness(correct, t)
    const prev = best.get(key)
    if (!prev || score > prev.score) best.set(key, { text, key, score, art: t.artwork, spotifyId: t.spotifyId ?? null })
  }
  return [...best.values()]
}

function artistCandidates(correct: Track, pool: readonly Track[]): Candidate[] {
  // Anyone credited on the right song would also be a right answer, so they are never offered.
  const credited = new Set(artistList(correct.artist).map(compareKey))
  const best = new Map<string, Candidate>()
  for (const t of pool) {
    const text = answerText(t, 'artist')
    const key = compareKey(text)
    if (!key || credited.has(key)) continue
    // Same-era, look-alike songs by other artists make their name more tempting.
    const score = closeness({ ...correct, artist: '' }, { ...t, artist: '' }) + similarity(text, primaryArtist(correct.artist)) * 2
    const prev = best.get(key)
    if (!prev || score > prev.score) best.set(key, { text, key, score, art: t.artwork, spotifyId: t.spotifyId ?? null })
  }
  return [...best.values()]
}

/** Three wrong answers: plausible look-alikes on medium/hard, random on easy. */
function pickDistractors(correct: Track, pool: readonly Track[], mode: 'title' | 'artist', difficulty: Difficulty, rand: Random): Candidate[] | null {
  const cands = mode === 'title' ? titleCandidates(correct, pool) : artistCandidates(correct, pool)
  if (cands.length < 3) return null
  return rank(cands, difficulty, rand).slice(0, 3)
}

export type BuildResult =
  | { ok: true; questions: Question[]; notice: string | null }
  | { ok: false; message: string }

/**
 * Turn a pool of candidate tracks into quiz questions. Each round asks about a
 * different song; options are four distinct titles (or lead artists), each with
 * the album art of the song it comes from.
 */
export function buildQuestions(
  rawPool: readonly Track[],
  opts: { rounds: number; answerType: AnswerType; difficulty?: Difficulty; order?: 'shuffle' | 'given' },
  rand: Random = Math.random,
): BuildResult {
  const pool = dedupeTracks(rawPool)
  if (pool.length < MIN_POOL) {
    return { ok: false, message: `Only found ${pool.length} playable song${pool.length === 1 ? '' : 's'} — try another category or search.` }
  }
  const difficulty = opts.difficulty ?? 'medium'

  const distinctArtists = new Set(pool.map((t) => compareKey(primaryArtist(t.artist)))).size
  const artistPossible = distinctArtists >= 4

  const questions: Question[] = []
  for (const track of opts.order === 'given' ? pool : shuffle(pool, rand)) {
    if (questions.length >= opts.rounds) break
    let mode: 'title' | 'artist' = 'title'
    if (opts.answerType === 'artist' && artistPossible) mode = 'artist'
    if (opts.answerType === 'mixed' && artistPossible && rand() < 0.5) mode = 'artist'

    let distractors = pickDistractors(track, pool, mode, difficulty, rand)
    if (!distractors && mode === 'artist') {
      mode = 'title'
      distractors = pickDistractors(track, pool, mode, difficulty, rand)
    }
    if (!distractors) continue

    const right: Candidate = { text: answerText(track, mode), key: '', score: 0, art: track.artwork, spotifyId: track.spotifyId ?? null }
    const options = shuffle([right, ...distractors], rand)
    questions.push({
      track,
      mode,
      options: options.map((o) => o.text),
      optionArt: options.map((o) => o.art),
      optionSpotify: options.map((o) => o.spotifyId),
      correct: options.indexOf(right),
    })
  }

  if (questions.length === 0) {
    return { ok: false, message: 'Could not build any questions from these songs — try another category.' }
  }

  const notices: string[] = []
  if (questions.length < opts.rounds) {
    notices.push(`Only ${questions.length} different songs were found, so this game has ${questions.length} rounds.`)
  }
  if (opts.answerType !== 'title' && !artistPossible) {
    notices.push('These songs are all by the same artist, so you will guess song titles.')
  }
  return { ok: true, questions, notice: notices.length ? notices.join(' ') : null }
}
