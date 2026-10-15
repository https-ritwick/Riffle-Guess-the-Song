import { describe, expect, it } from 'vitest'
import { AWARD_CATEGORIES, pickAwardNames } from '../../src/shared/awards'
import { bankItems, buildChallengeQuestions, type ChallengeItem } from '../../src/shared/challenges'
import { DIALOGUES, EMOJI_SONGS, MOVIES, STARS } from '../../src/shared/challenges/data'
import { playedKey } from '../../src/shared/questions'
import { REACTIONS } from '../../src/shared/rules'
import { compareKey } from '../../src/shared/text'
import { dropRepeats, toItems } from '../../src/worker/ai'
import { challengeKey, sameLine } from '../../src/shared/challenges'
import { dailyGame, dailyNumber, msUntilNextDaily, seededRandom } from '../../src/shared/daily'
import { getProgress, levelFor, recordGame } from '../../src/client/lib/progress'

/** Deterministic random numbers for repeatable tests. */
function seeded(seed = 7) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return x / 2 ** 31
  }
}

describe('challenge bank', () => {
  it('only uses movies, stars and songs it can offer look-alikes for', () => {
    const movies = new Set(MOVIES.map(([t]) => compareKey(t)))
    for (const [q, , movie] of DIALOGUES) expect(movies.has(compareKey(movie)), `${q} → ${movie}`).toBe(true)
    for (const [name, , , clues] of STARS) {
      expect(clues).toHaveLength(3)
      // The first, hardest clue must not give the name away.
      expect(clues[0]!.toLowerCase()).not.toContain(name.toLowerCase())
    }
    expect(new Set(EMOJI_SONGS.map(([, t]) => compareKey(t))).size).toBe(EMOJI_SONGS.length)
    for (const [emoji] of EMOJI_SONGS) expect(emoji).not.toMatch(/[a-z]/i)
  })

  it('has unique ids per game', () => {
    for (const game of ['dialogue', 'actor', 'emoji'] as const) {
      const ids = bankItems(game).map((i) => i.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('building a challenge game', () => {
  for (const game of ['dialogue', 'actor', 'emoji'] as const) {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      it(`${game} on ${difficulty}: four distinct options with the right answer`, () => {
        const { questions } = buildChallengeQuestions({ game, ai: [], played: new Set(), rounds: 20, difficulty }, seeded())
        expect(questions).toHaveLength(20)
        const answers = new Set<string>()
        for (const q of questions) {
          expect(q.options).toHaveLength(4)
          expect(new Set(q.options.map(compareKey)).size).toBe(4)
          expect(q.options[q.correct]).toBe(q.item.answer)
          expect(q.track.title).toBe(q.item.answer)
          expect(q.track.preview).toBe('')
          answers.add(compareKey(q.item.answer))
        }
        // No answer twice in one game.
        expect(answers.size).toBe(questions.length)
      })
    }
  }

  it('plays unplayed items first, then repeats only when it runs out', () => {
    const all = bankItems('emoji')
    const played = new Set(all.slice(0, all.length - 5).map((i) => i.id))
    const { questions } = buildChallengeQuestions({ game: 'emoji', ai: [], played, rounds: 10, difficulty: 'medium' }, seeded(3))
    const fresh = questions.filter((q) => !played.has(q.item.id))
    expect(fresh).toHaveLength(5)
    expect(questions).toHaveLength(10)
  })

  it('gives fresh AI items most of the rounds and uses their own wrong answers', () => {
    const ai: ChallengeItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `ai:test${i}`,
      kind: 'dialogue',
      prompt: ['Chal hat', 'Picture dekhoge?', 'Kaun hai tu', 'Babu bhaiya!', 'Ruk ja zara', 'Jaldi bol', 'Hum bhi hain', 'Koi baat nahi', 'Aaj nahi kal', 'Bas karo yaar', 'Seedha ghar ja', 'Woh dekho'][i]!,
      clues: [],
      answer: `Film ${i}`,
      decoys: [`Decoy A${i}`, `Decoy B${i}`, `Decoy C${i}`],
      detail: '',
      note: '',
      year: 2024,
      ai: true,
    }))
    const { questions } = buildChallengeQuestions({ game: 'dialogue', ai, played: new Set(), rounds: 10, difficulty: 'hard' }, seeded(5))
    const fromAi = questions.filter((q) => q.item.ai)
    expect(fromAi.length).toBe(6)
    for (const q of fromAi) expect(q.options.filter((o) => o.startsWith('Decoy')).length).toBe(3)
  })

  it('keys songs by title and artist, and challenges by id', () => {
    const t = { id: 'x', title: 'Tum Hi Ho (From "Aashiqui 2")', artist: 'Arijit Singh, Mithoon', album: '', artwork: '', preview: '', link: '', year: null }
    expect(playedKey(t)).toBe(playedKey({ ...t, id: 'other', title: 'Tum Hi Ho', artist: 'Arijit Singh' }))
    expect(playedKey({ ...t, id: 'dlg:abc' }, 'dialogue')).toBe('dlg:abc')
  })
})

describe('AI answers are checked before use', () => {
  it('drops dialogues that are missing decoys or name their own film', () => {
    const items = toItems('dialogue', {
      items: [
        { dialogue: 'Picture abhi baaki hai', meaning: 'x', movie: 'Om Shanti Om', year: 2007, character: 'Om', actor: 'SRK', wrongMovies: ['Main Hoon Na', 'Kal Ho Naa Ho', 'Veer-Zaara'] },
        { dialogue: 'Om Shanti Om, bolo', meaning: 'x', movie: 'Om Shanti Om', year: 2007, character: 'Om', actor: 'SRK', wrongMovies: ['A', 'B', 'C'] },
        { dialogue: 'Kuch bhi', meaning: 'x', movie: 'Dhoom', year: 2004, character: 'Jai', actor: 'Abhishek', wrongMovies: ['Dhoom', 'Dhoom', 'Race'] },
      ],
    })
    expect(items).toHaveLength(1)
    expect(items[0]!.decoys).toEqual(['Main Hoon Na', 'Kal Ho Naa Ho', 'Veer-Zaara'])
    expect(items[0]!.id.startsWith('dlg:')).toBe(true)
  })

  it('drops star clues that contain the name, and emoji clues with letters', () => {
    const stars = toItems('actor', {
      items: [
        { name: 'Vicky Kaushal', clues: ['Son of an action director', 'Played Sardar Udham', 'Asked “How’s the josh?”'], peakDecade: 2010, wrongStars: ['Rajkummar Rao', 'Ayushmann Khurrana', 'Kartik Aaryan'] },
        { name: 'Kartik Aaryan', clues: ['Kartik is his first name', 'b', 'c'], peakDecade: 2020, wrongStars: ['x', 'y', 'z'] },
      ],
    })
    expect(stars.map((s) => s.answer)).toEqual(['Vicky Kaushal'])
    const emoji = toItems('emoji', {
      items: [
        { emojis: '🚂🕺', decode: '🚂 train · 🕺 dance', song: 'Chaiyya Chaiyya', movie: 'Dil Se..', year: 1998, singer: 'Sukhwinder Singh', wrongSongs: ['Dil Se Re', 'Jiya Jale', 'Satrangi Re'] },
        { emojis: 'Tum 🫵', decode: '🫵 tum (you)', song: 'Tum Hi Ho', movie: 'Aashiqui 2', year: 2013, singer: 'Arijit Singh', wrongSongs: ['a', 'b', 'c'] },
        { emojis: '🚂🕺', decode: '', song: 'Kajra Re', movie: 'Bunty Aur Babli', year: 2005, singer: 'Alisha Chinai', wrongSongs: ['x', 'y', 'z'] },
      ],
    })
    expect(emoji.map((e) => e.answer)).toEqual(['Chaiyya Chaiyya'])
    expect(emoji[0]!.song?.movie).toBe('Dil Se..')
    // The decode is shown at the reveal.
    expect(emoji[0]!.note).toContain('train')
  })
})

describe('awards and reactions', () => {
  it('draws a name for every award, avoiding recent ones', () => {
    const recent = AWARD_CATEGORIES.map((c) => c.names[0]!.title)
    const names = pickAwardNames(seeded(9), recent)
    for (const c of AWARD_CATEGORIES) {
      expect(names[c.id]).toBeDefined()
      expect(names[c.id]!.title).not.toBe(c.names[0]!.title)
    }
  })

  it('offers 40 distinct reactions, middle finger included', () => {
    expect(REACTIONS).toHaveLength(40)
    expect(new Set(REACTIONS).size).toBe(40)
    expect(REACTIONS).toContain('🖕')
  })
})

describe('no repeats across games', () => {
  it('treats the same dialogue as one item whether curated, AI-written or a “who said it?” round', () => {
    expect(challengeKey('dialogue', 'Kitne aadmi the?', 'Sholay')).toBe(challengeKey('quote', 'Kitne aadmi the?', 'Amjad Khan'))
    expect(sameLine('Kitne aadmi the?', 'Kitne aadmi thhe!!')).toBe(true)
    expect(sameLine('Mogambo khush hua!', 'Mogambo khush hua')).toBe(true)
    expect(sameLine('Mogambo khush hua!', 'Mere paas maa hai.')).toBe(false)
  })

  it('has no two curated dialogues that count as the same line', () => {
    const lines = DIALOGUES.map(([q]) => q)
    const clashes = lines.flatMap((a, i) => lines.slice(i + 1).filter((b) => sameLine(a, b)).map((b) => `${a} ~ ${b}`))
    expect(clashes).toEqual([])
  })

  it('drops AI dialogues the bank already has, and ones seen in earlier games', () => {
    const ai = (prompt: string, answer: string): ChallengeItem => ({ id: challengeKey('dialogue', prompt, answer), kind: 'dialogue', prompt, clues: [], answer, decoys: ['a', 'b', 'c'], detail: '', note: '', year: null, ai: true })
    const kept = dropRepeats(
      'dialogue',
      [ai('Kitne aadmi the re?', 'Sholay'), ai('Ek naya dialogue jo pehle kabhi nahi aaya', 'Film X'), ai('Main hoon na, tension mat lo yaar', 'Main Hoon Na')],
      ['Main hoon na, tension mat lo yaar → Main Hoon Na'],
    )
    expect(kept.map((k) => k.answer)).toEqual(['Film X'])
  })

  it('never offers a played dialogue again while fresh ones remain', () => {
    const all = bankItems('dialogue')
    const played = new Set<string>()
    const seen = new Set<string>()
    for (let game = 0; game < Math.floor(all.length / 10); game++) {
      const { questions } = buildChallengeQuestions({ game: 'dialogue', ai: [], played, rounds: 10, difficulty: 'hard' }, seeded(game + 1))
      for (const q of questions) {
        expect(seen.has(q.item.id)).toBe(false)
        seen.add(q.item.id)
        played.add(q.item.id)
      }
    }
  })
})

describe('daily challenge', () => {
  it('rolls over at midnight India time and rotates the mode', () => {
    const d1 = Date.UTC(2026, 9, 14, 18, 29) // 23:59 IST on 14 Oct
    const d2 = Date.UTC(2026, 9, 14, 18, 31) // 00:01 IST on 15 Oct
    expect(dailyNumber(d2)).toBe(dailyNumber(d1) + 1)
    expect(dailyNumber(d1)).toBe(1)
    expect(msUntilNextDaily(d1)).toBe(60_000)
    expect(new Set([dailyGame(1), dailyGame(2), dailyGame(3)]).size).toBe(3)
  })

  it('gives everyone the same questions', () => {
    const build = () => buildChallengeQuestions({ game: dailyGame(7), ai: [], played: new Set(), rounds: 5, difficulty: 'medium' }, seededRandom(7 * 2654435761))
    const a = build().questions
    expect(a).toHaveLength(5)
    expect(build().questions.map((q) => [q.item.id, ...q.options])).toEqual(a.map((q) => [q.item.id, ...q.options]))
  })
})

describe('career progress', () => {
  it('earns XP, levels, a day streak and badges', () => {
    const base = { mode: 'emoji', score: 4200, correct: 5, total: 5, rank: 1, players: 3, bestStreak: 5, fastestMs: 1500, daily: null, grid: '🟩🟩🟩🟩🟩' }
    const first = recordGame(base, new Date(Date.UTC(2026, 9, 20, 8)))
    expect(first.after).toBeGreaterThan(first.before)
    expect(first.newBadges.map((b) => b.id)).toEqual(expect.arrayContaining(['first-game', 'first-win', 'perfect', 'streak5', 'speed']))
    const next = recordGame({ ...base, daily: 7 }, new Date(Date.UTC(2026, 9, 21, 8)))
    expect(next.dayStreak).toBe(2)
    expect(next.newBadges.map((b) => b.id)).toContain('daily')
    expect(getProgress().dailies['7']?.score).toBe(4200)
    expect(levelFor(0).level.title).toBe('Junior Artist')
    expect(levelFor(1400).level.title).toBe('Superstar')
  })
})
