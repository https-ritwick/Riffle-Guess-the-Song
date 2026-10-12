import { describe, expect, it } from 'vitest'
import { parsePlaylistUrl } from '../../src/shared/playlist'
import { DEFAULT_SETTINGS, normalizeSettings, TrackSchema } from '../../src/shared/protocol'

describe('parsePlaylistUrl', () => {
  it.each([
    ['https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM?si=abc123', { provider: 'spotify', type: 'playlist', id: '37i9dQZF1DX0XUfTFmNBRM' }],
    ['https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy', { provider: 'spotify', type: 'album', id: '4aawyAB9vmqN3uQ7FjRGTy' }],
    ['spotify:playlist:4Y3NZDQJePGNtIXx28M6uG', { provider: 'spotify', type: 'playlist', id: '4Y3NZDQJePGNtIXx28M6uG' }],
    [
      'https://music.apple.com/in/playlist/global-hits/pl.0b6396cf63594f5cb834aff82520eb84',
      { provider: 'apple', type: 'playlist', id: 'pl.0b6396cf63594f5cb834aff82520eb84', country: 'in' },
    ],
    ['https://music.apple.com/us/album/1989-taylors-version/1708308989', { provider: 'apple', type: 'album', id: '1708308989', country: 'us' }],
    ['https://music.apple.com/in/playlist/my-mix/pl.u-AkAmPlyUxXkWz', { provider: 'apple', type: 'playlist', id: 'pl.u-AkAmPlyUxXkWz', country: 'in' }],
  ])('%s', (url, expected) => {
    expect(parsePlaylistUrl(url)).toEqual(expected)
  })

  it.each([
    'https://open.spotify.com/track/3zOYmiNOuyDL0ClxJcEJ0T',
    'https://evil.example/playlist/37i9dQZF1DX0XUfTFmNBRM',
    'https://music.apple.com/in/artist/arijit-singh/484568188',
    'not a url',
    'javascript:alert(1)',
    'https://open.spotify.com/playlist/../../etc',
  ])('rejects %s', (url) => {
    expect(parsePlaylistUrl(url)).toBeNull()
  })
})

describe('Spotify tracks', () => {
  it('accepts Spotify previews and artwork but nothing else', () => {
    const base = { id: 'sp:1', title: 'x', artist: 'y' }
    expect(TrackSchema.safeParse({ ...base, preview: 'https://p.scdn.co/mp3-preview/abc', artwork: 'https://i.scdn.co/image/abc' }).success).toBe(true)
    expect(TrackSchema.safeParse({ ...base, preview: 'https://p.scdn.co.evil.com/x' }).success).toBe(false)
  })
})

describe('normalizeSettings', () => {
  it('fills in settings added after a room was created', () => {
    const old = { source: { kind: 'preset', id: 'decade-80s' }, rounds: 5, guessSeconds: 10, answerType: 'title', region: 'us' }
    expect(normalizeSettings(old)).toEqual({ ...DEFAULT_SETTINGS, ...old })
  })

  it('falls back to defaults for garbage', () => {
    expect(normalizeSettings({ rounds: 'lots' })).toEqual(DEFAULT_SETTINGS)
  })
})
