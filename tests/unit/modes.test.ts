import { describe, expect, it } from 'vitest'
import { buildAntakshari, firstLetter, lastLetter, teamStandings } from '../../src/shared/modes'
import type { Track } from '../../src/shared/protocol'
import { seededRandom } from '../../src/shared/daily'

const track = (title: string, i: number): Track => ({
  id: `t${i}`,
  title,
  artist: `Singer ${i % 5}`,
  album: '',
  artwork: '',
  preview: `https://audio-ssl.itunes.apple.com/${i}.m4a`,
  link: '',
  year: 2000 + (i % 20),
})

describe('antakshari letters', () => {
  it('uses the last consonant, like Hindi antakshari', () => {
    expect(lastLetter('Tum Hi Ho')).toBe('h')
    expect(lastLetter('Kesariya')).toBe('y')
    expect(lastLetter('Chaiyya Chaiyya')).toBe('y')
    expect(lastLetter('Kal Ho Naa Ho (From "Kal Ho Naa Ho")')).toBe('h')
    expect(lastLetter('Aao')).toBe('o')
    expect(firstLetter('Tum Hi Ho')).toBe('t')
    expect(firstLetter('"Dil" Se Re')).toBe('d')
  })

  it('chains songs by letter, with wrong answers that start with the same letter', () => {
    const titles = [
      'Tum Hi Ho', 'Tujhe Dekha', 'Tera Ban Jaunga', 'Tere Bina', 'Tu Hi Re',
      'Hawayein', 'Humma Humma', 'Hasi', 'Hosanna', 'Hey Shona',
      'Yeh Dosti', 'Yaara Teri Yaari', 'Ye Tune Kya Kiya', 'Yaadein', 'Yun Hi',
      'Dil Se Re', 'Dilbar', 'Dola Re Dola', 'Desi Girl', 'Dhoom Machale',
      'Sajni', 'Saathiya', 'Suraj Hua Maddham', 'Senorita', 'Sun Raha Hai',
      'Nagada', 'Naina', 'Nashe Si Chadh Gayi', 'Nadaan Parinde', 'Nazm Nazm',
    ]
    const qs = buildAntakshari(titles.map(track), { rounds: 12, difficulty: 'medium' }, seededRandom(7))
    expect(qs.length).toBe(12)
    const seen = new Set<string>()
    qs.forEach((q, i) => {
      const answer = q.options[q.correct]!
      expect(seen.has(answer), `${answer} played twice`).toBe(false)
      seen.add(answer)
      // Every option starts with the round's letter, so the letter never gives it away.
      const l = firstLetter(answer)
      for (const o of q.options) expect(firstLetter(o)).toBe(l)
      if (i > 0 && q.letter !== null) expect(q.letter).toBe(lastLetter(qs[i - 1]!.track.title))
    })
    // With these songs the chain mostly holds.
    expect(qs.filter((q) => q.letter !== null).length).toBeGreaterThanOrEqual(6)
  })

  it('gives up cleanly when no letter has enough songs', () => {
    const qs = buildAntakshari(['Alpha', 'Beta', 'Gamma', 'Delta'].map(track), { rounds: 5, difficulty: 'easy' }, seededRandom(1))
    expect(qs).toEqual([])
  })
})

describe('team battles', () => {
  it('ranks teams by average score, so a smaller team is not punished', () => {
    const standings = teamStandings([
      { team: 'a', score: 1000, correct: 2 },
      { team: 'a', score: 1000, correct: 2 },
      { team: 'a', score: 1000, correct: 2 },
      { team: 'b', score: 1600, correct: 3 },
      { team: null, score: 9999, correct: 9 },
    ])
    expect(standings.map((t) => t.id)).toEqual(['b', 'a'])
    expect(standings[0]).toMatchObject({ score: 1600, total: 1600, members: 1 })
    expect(standings[1]).toMatchObject({ score: 1000, total: 3000, members: 3 })
  })
})
