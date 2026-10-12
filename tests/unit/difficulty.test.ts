import { describe, expect, it } from 'vitest'
import { ClientMessageSchema, normalizeSettings, type Track } from '../../src/shared/protocol'
import { buildQuestions, closeness } from '../../src/shared/questions'
import { artistList, similarity } from '../../src/shared/text'

function seeded(seed = 42) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32
    return s / 2 ** 32
  }
}

let nextId = 1
function track(title: string, artist: string, album = '', year: number | null = null, artwork = ''): Track {
  const id = nextId++
  return { id: String(id), title, artist, album, artwork, preview: `https://audio-ssl.itunes.apple.com/p/${id}.m4a`, link: '', year }
}

describe('look-alike wrong answers', () => {
  const target = track('Tum Hi Ho', 'Arijit Singh', 'Aashiqui 2', 2013)
  const sameArtistSameAlbum = track('Sunn Raha Hai', 'Ankit Tiwari', 'Aashiqui 2', 2013)
  const sameArtist = track('Tum Hi Ho Bandhu', 'Arijit Singh', 'Cocktail', 2012)
  const lookalike = track('Tu Hi Haqeeqat', 'Javed Ali', 'Tum Mile', 2009)
  const strangers = Array.from({ length: 12 }, (_, i) => track(`Zebra Crossing ${i}`, `Band ${i}`, `Album ${i}`, 1975 + i))
  const pool = [target, sameArtistSameAlbum, sameArtist, lookalike, ...strangers]

  it('scores same artist, album, era and similar titles as closer', () => {
    expect(closeness(target, sameArtist)).toBeGreaterThan(closeness(target, strangers[0]!))
    expect(closeness(target, sameArtistSameAlbum)).toBeGreaterThan(closeness(target, strangers[0]!))
    expect(closeness(target, lookalike)).toBeGreaterThan(closeness(target, strangers[3]!))
  })

  it('hard mode offers the closest songs as wrong answers', () => {
    const r = buildQuestions(pool, { rounds: 16, answerType: 'title', difficulty: 'hard' }, seeded(3))
    if (!r.ok) throw new Error(r.message)
    const q = r.questions.find((x) => x.track.id === target.id)!
    const wrong = q.options.filter((_, i) => i !== q.correct)
    expect(wrong.sort()).toEqual(['Sunn Raha Hai', 'Tu Hi Haqeeqat', 'Tum Hi Ho Bandhu'].sort())
  })

  it('easy mode is random, so look-alikes are not always picked', () => {
    let lookalikesEveryTime = true
    for (let seed = 1; seed <= 10; seed++) {
      const r = buildQuestions(pool, { rounds: 16, answerType: 'title', difficulty: 'easy' }, seeded(seed))
      if (!r.ok) throw new Error(r.message)
      const q = r.questions.find((x) => x.track.id === target.id)!
      if (q.options.some((o) => o.startsWith('Zebra'))) lookalikesEveryTime = false
    }
    expect(lookalikesEveryTime).toBe(false)
  })

  it('never offers a near-identical version of the right title', () => {
    const versions = [track('Kesariya', 'Arijit Singh'), track('Kesariyaa', 'Someone Else'), ...strangers]
    const r = buildQuestions(versions, { rounds: 20, answerType: 'title', difficulty: 'hard' }, seeded(5))
    if (!r.ok) throw new Error(r.message)
    const q = r.questions.find((x) => x.track.title === 'Kesariya')!
    expect(q.options).not.toContain('Kesariyaa')
  })

  it('never offers an artist credited on the right song as a wrong artist', () => {
    const duet = track('Duet Song', 'Alpha & Bravo', '', 2020)
    const others = ['Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((a, i) => track(`Song ${i}`, a, '', 2020))
    const r = buildQuestions([duet, ...others], { rounds: 6, answerType: 'artist', difficulty: 'hard' }, seeded(9))
    if (!r.ok) throw new Error(r.message)
    const q = r.questions.find((x) => x.track.id === duet.id)!
    expect(q.mode).toBe('artist')
    expect(q.options[q.correct]).toBe('Alpha')
    expect(q.options).not.toContain('Bravo')
  })

  it('gives every option the art of the song it came from', () => {
    const arty = Array.from({ length: 8 }, (_, i) => track(`Track ${i}`, `Artist ${i}`, '', 2000, `https://is1-ssl.mzstatic.com/a/${i}.jpg`))
    const r = buildQuestions(arty, { rounds: 8, answerType: 'title', difficulty: 'medium' }, seeded(1))
    if (!r.ok) throw new Error(r.message)
    for (const q of r.questions) {
      expect(q.optionArt).toHaveLength(4)
      expect(q.optionArt[q.correct]).toBe(q.track.artwork)
      q.options.forEach((text, i) => {
        expect(q.optionArt[i]).toBe(arty.find((t) => t.title === text)!.artwork)
      })
    }
  })

  it('keeps the given order for Blend games', () => {
    const ordered = Array.from({ length: 8 }, (_, i) => track(`Ordered ${i}`, `Artist ${i}`))
    const r = buildQuestions(ordered, { rounds: 5, answerType: 'title', order: 'given' }, seeded(2))
    if (!r.ok) throw new Error(r.message)
    expect(r.questions.map((q) => q.track.title)).toEqual(['Ordered 0', 'Ordered 1', 'Ordered 2', 'Ordered 3', 'Ordered 4'])
  })
})

describe('text helpers', () => {
  it('measures title similarity', () => {
    expect(similarity('Tum Hi Ho', 'Tum Hi Ho')).toBe(1)
    expect(similarity('Kesariya', 'Kesariyaa')).toBeGreaterThan(0.85)
    expect(similarity('Kesariya', 'Zebra')).toBeLessThan(0.2)
  })

  it('splits artist credits', () => {
    expect(artistList('Vishal-Shekhar, Shreya Ghoshal & KK feat. Badshah')).toEqual(['Vishal-Shekhar', 'Shreya Ghoshal', 'KK', 'Badshah'])
  })
})

describe('protocol additions', () => {
  it('fills in difficulty and random clip start for older saved settings', () => {
    const s = normalizeSettings({ source: { kind: 'preset', id: 'decade-80s' }, rounds: 5, guessSeconds: 15, answerType: 'title', region: 'in' })
    expect(s.difficulty).toBe('hard')
  })

  it('a settings change only carries the fields it changes', () => {
    const parsed = ClientMessageSchema.parse({ t: 'settings', settings: { rounds: 5 } })
    expect(parsed).toEqual({ t: 'settings', settings: { rounds: 5 } })
  })

  it('accepts Blend contributions and the solo "next" message', () => {
    expect(ClientMessageSchema.safeParse({ t: 'blend', via: 'spotify', label: 'Me', tracks: [{}] }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'blend', via: 'spotify', label: 'Me', tracks: [] }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ t: 'blend', via: 'email', label: 'Me', tracks: [{}] }).success).toBe(false)
    expect(ClientMessageSchema.safeParse({ t: 'next' }).success).toBe(true)
    expect(ClientMessageSchema.safeParse({ t: 'settings', settings: { source: { kind: 'blend' }, difficulty: 'hard' } }).success).toBe(true)
  })
})
