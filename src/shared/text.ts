// Song titles from music stores are noisy ("Song (feat. X) [Remastered 2011]").
// These helpers turn them into clean answer options and comparison keys.

const NOISE_WORDS =
  /\b(feat\.?|ft\.?|featuring|with|from|remaster(ed)?|version|edit|mono|stereo|bonus|deluxe|live|soundtrack|motion picture|original|radio|explicit|clean|mix|remix|acoustic|unplugged|demo|instrumental|lofi|lo-fi|slowed|reverb|sped up|reprise|female|male|duet|extended|karaoke)\b/i

/** Strip featuring credits, "From <movie>", remaster tags etc. from a title. */
export function cleanTitle(raw: string): string {
  let t = raw.trim()
  // Remove bracketed segments that only carry metadata.
  t = t.replace(/\s*[([]([^)\]]*)[)\]]/g, (match, inner: string) => (NOISE_WORDS.test(inner) ? '' : match))
  // Remove " - Remastered 2011", " - From "Movie"" style suffixes.
  t = t.replace(/\s+[-–—]\s+(.*)$/, (match, tail: string) => (NOISE_WORDS.test(tail) ? '' : match))
  t = t.replace(/\s{2,}/g, ' ').trim()
  return t || raw.trim()
}

/** Lowercase alphanumeric key used to detect duplicate songs/artists. */
export function compareKey(s: string): string {
  return cleanTitle(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

const ARTIST_SEPARATOR = /\s*(?:,|&|\bfeat\b\.?|\bft\b\.?|\bx\b|\band\b|\bwith\b|\/)\s*/i

/** "Arijit Singh, Pritam & Amitabh" -> "Arijit Singh". */
export function primaryArtist(artist: string): string {
  const first = artist.split(ARTIST_SEPARATOR)[0]?.trim()
  return first || artist.trim()
}

/** Loose check that a store artist credit matches the artist we searched for. */
export function artistMatches(credit: string, wanted: string): boolean {
  const words = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  return ` ${words(credit)} `.includes(` ${words(wanted)} `)
}

/** Keep only printable characters and collapse whitespace (used for player names). */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\p{C}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
}

/** Similarity of two strings from 0 to 1 (Sørensen–Dice over letter pairs). */
export function similarity(a: string, b: string): number {
  const x = compareKey(a)
  const y = compareKey(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return 0
  const pairs = new Map<string, number>()
  for (let i = 0; i < x.length - 1; i++) {
    const p = x.slice(i, i + 2)
    pairs.set(p, (pairs.get(p) ?? 0) + 1)
  }
  let shared = 0
  for (let i = 0; i < y.length - 1; i++) {
    const p = y.slice(i, i + 2)
    const n = pairs.get(p) ?? 0
    if (n > 0) {
      shared++
      pairs.set(p, n - 1)
    }
  }
  return (2 * shared) / (x.length - 1 + y.length - 1)
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'and', 'my', 'me', 'you', 'is', 'i', 'it', 'se', 'ka', 'ki', 'ke', 'hai', 'na', 'ho', 'de', 'la', 'el', 'lo'])

/** Meaningful lower-case words of a title ("Tum Hi Ho" -> ["tum", "hi"]). */
export function titleWords(s: string): string[] {
  return cleanTitle(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
}

/** Every artist credited on a track ("A, B & C feat. D" -> [A, B, C, D]). */
export function artistList(artist: string): string[] {
  return artist
    .split(ARTIST_SEPARATOR)
    .map((a) => a.trim())
    .filter(Boolean)
}
