// User-facing product name in one place. Cookie and local-storage prefixes keep
// the original "encore" name; they're internal and changing them would log
// everyone out and forget saved seats.
export const BRAND = {
  name: 'Riffle',
  tagline: 'Name the song before your friends do.',
  description:
    'Riffle — the free guess-the-song party game. Play solo or with friends, blend everyone’s Spotify taste, and race to name the song from a few seconds of audio.',
  author: 'Ritwick Johari',
  email: 'ritwickjohari@gmail.com',
  github: 'https://github.com/https-ritwick',
  instagram: 'https://www.instagram.com/ritwickzzz/',
} as const
