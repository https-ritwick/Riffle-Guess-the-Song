import { describe, expect, it } from 'vitest'
import { artistMatches, cleanTitle, compareKey, primaryArtist, sanitizeName } from '../../src/shared/text'

describe('cleanTitle', () => {
  it.each([
    ['Kesariya (From "Brahmastra")', 'Kesariya'],
    ['Sitaare (From "Ikkis")', 'Sitaare'],
    ['Bohemian Rhapsody - Remastered 2011', 'Bohemian Rhapsody'],
    ['Señorita (feat. Camila Cabello)', 'Señorita'],
    ['Old Town Road [Remix] (feat. Billy Ray Cyrus)', 'Old Town Road'],
    ['Tum Hi Ho - From "Aashiqui 2"', 'Tum Hi Ho'],
    ['Shape of You', 'Shape of You'],
  ])('%s -> %s', (raw, clean) => {
    expect(cleanTitle(raw)).toBe(clean)
  })

  it('keeps meaningful parentheses', () => {
    expect(cleanTitle("(I Can't Get No) Satisfaction")).toBe("(I Can't Get No) Satisfaction")
    expect(cleanTitle('Sweet Dreams (Are Made of This)')).toBe('Sweet Dreams (Are Made of This)')
  })

  it('never returns an empty string', () => {
    expect(cleanTitle('(Live)')).toBe('(Live)')
  })
})

describe('compareKey', () => {
  it('ignores case, accents, punctuation and metadata', () => {
    expect(compareKey('Beyoncé')).toBe(compareKey('beyonce'))
    expect(compareKey("Don't Stop Believin'")).toBe(compareKey('Dont Stop Believin'))
    expect(compareKey('Kesariya (From "Brahmastra")')).toBe(compareKey('Kesariya'))
  })

  it('keeps non-Latin scripts', () => {
    expect(compareKey('शम्भु स्तुति')).not.toBe('')
  })
})

describe('primaryArtist / artistMatches', () => {
  it('extracts the lead artist', () => {
    expect(primaryArtist('Arijit Singh, Pritam & Amitabh Bhattacharya')).toBe('Arijit Singh')
    expect(primaryArtist('Ed Sheeran feat. Justin Bieber')).toBe('Ed Sheeran')
    expect(primaryArtist('Drake')).toBe('Drake')
  })

  it('matches whole words in artist credits', () => {
    expect(artistMatches('Arijit Singh & Pritam', 'Arijit Singh')).toBe(true)
    expect(artistMatches('Kingfisher', 'King')).toBe(false)
    expect(artistMatches('AC/DC', 'AC/DC')).toBe(true)
    expect(artistMatches('Céline Dion', 'Celine Dion')).toBe(true)
    expect(artistMatches('Lata Mangeshkar & Mohd. Rafi', 'Mohd. Rafi')).toBe(true)
  })
})

describe('sanitizeName', () => {
  it('trims, collapses whitespace, strips control chars and limits length', () => {
    expect(sanitizeName('  Riya \u0000  K ')).toBe('Riya K')
    expect(sanitizeName('x'.repeat(50))).toHaveLength(20)
    expect(sanitizeName('​')).toBe('')
  })
})
