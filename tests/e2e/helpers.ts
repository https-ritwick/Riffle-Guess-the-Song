import { expect, type BrowserContext, type Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Deterministic fake of the iTunes Search API. Every song's title is encoded in
// its preview URL, so a test can tell which song is playing and pick the right answer.

const AUDIO_HOST = 'https://audio-ssl.itunes.apple.com'

// 0.2s of 8-bit silence as a WAV file.
function silentWav(): Buffer {
  const samples = 1600
  const buf = Buffer.alloc(44 + samples, 128)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(8000, 24)
  buf.writeUInt32LE(8000, 28)
  buf.writeUInt16LE(1, 32)
  buf.writeUInt16LE(8, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples, 40)
  return buf
}
const WAV = silentWav()

let nextId = 1000
function song(title: string, artist: string, year = 1985, artistId?: number) {
  const id = nextId++
  return {
    wrapperType: 'track',
    kind: 'song',
    trackId: id,
    artistId: artistId ?? 400 + (artist.length % 50),
    primaryGenreName: 'Pop',
    trackName: title,
    artistName: artist,
    collectionName: `${artist} Greatest`,
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/test/100x100bb.jpg',
    previewUrl: `${AUDIO_HOST}/itunes-assets/test/${encodeURIComponent(title)}.m4a`,
    trackViewUrl: `https://music.apple.com/us/album/test/${id}`,
    releaseDate: `${year}-06-01T07:00:00Z`,
  }
}

export async function mockItunes(context: BrowserContext) {
  await context.route('https://itunes.apple.com/**', async (route) => {
    const url = new URL(route.request().url())
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }

    if (url.pathname.includes('/rss/topsongs')) {
      const entry = Array.from({ length: 12 }, (_, i) => {
        const s = song(`Chart Song ${i + 1}`, `Chart Artist ${(i % 5) + 1}`, 2026)
        return {
          id: { label: s.trackViewUrl, attributes: { 'im:id': String(s.trackId) } },
          'im:name': { label: s.trackName },
          'im:artist': { label: s.artistName },
          'im:collection': { 'im:name': { label: s.collectionName } },
          'im:image': [{ label: s.artworkUrl100 }],
          'im:releaseDate': { label: s.releaseDate },
          link: [{ attributes: { rel: 'alternate', href: s.trackViewUrl } }, { attributes: { rel: 'enclosure', href: s.previewUrl } }],
        }
      })
      return route.fulfill({ headers, body: JSON.stringify({ feed: { entry } }) })
    }

    const term = url.searchParams.get('term') ?? ''
    if (url.searchParams.get('entity') === 'musicArtist') {
      const results = [1, 2, 3].map((n) => ({ wrapperType: 'artist', artistType: 'Artist', artistId: 500 + n, artistName: `${term} Band ${n}`, primaryGenreName: 'Pop' }))
      return route.fulfill({ headers, body: JSON.stringify({ resultCount: results.length, results }) })
    }

    if (url.pathname === '/lookup') {
      const id = url.searchParams.get('id')
      const results = [
        { wrapperType: 'artist', artistId: Number(id), artistName: 'Looked Up Artist' },
        ...Array.from({ length: 8 }, (_, i) => song(`Lookup Track ${i + 1}`, 'Looked Up Artist', 2010)),
      ]
      return route.fulfill({ headers, body: JSON.stringify({ resultCount: results.length, results }) })
    }

    // Song search: artist-term searches return songs credited to that artist.
    const artistSearch = url.searchParams.get('attribute') === 'artistTerm'
    const results = Array.from({ length: artistSearch ? 6 : 4 }, (_, i) =>
      artistSearch ? song(`${term} Hit ${i + 1}`, term) : song(`${term} Hit ${i + 1}`, `${term} Band ${i + 1}`, 1985, 500 + i),
    )
    return route.fulfill({ headers, body: JSON.stringify({ resultCount: results.length, results }) })
  })

  await context.route(`${AUDIO_HOST}/**`, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV }))
  await context.route('https://p.scdn.co/**', (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV }))
  await context.route('https://*.scdn.co/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#1db954"/></svg>' }),
  )
  await context.route('**/api/playlist?**', (route) => {
    const tracks = Array.from({ length: 12 }, (_, i) => ({
      title: `Item Song ${i + 1}`,
      artist: `Singer ${(i % 4) + 1}, Composer`,
      preview: `https://p.scdn.co/mp3-preview/${encodeURIComponent(`Item Song ${i + 1}`)}`,
      spotifyId: `TrackId${String(i).padStart(14, '0')}`,
    }))
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ provider: 'spotify', type: 'playlist', id: '4Y3NZDQJePGNtIXx28M6uG', name: 'Test Item Songs', owner: 'Tester', image: 'https://mosaic.scdn.co/640/test', tracks }),
    })
  })
  await context.route('https://*.mzstatic.com/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#8b5cf6"/></svg>',
    }),
  )
}

/** Remembers the most recent preview each page requested, i.e. the song playing now. */
export function trackAudio(page: Page) {
  let last: string | null = null
  page.on('request', (req) => {
    const u = req.url()
    if (u.startsWith(AUDIO_HOST) || u.startsWith('https://p.scdn.co/')) last =decodeURIComponent(u.split('/').pop()!.replace(/\.m4a$/, ''))
  })
  return () => last
}

export async function newPlayer(context: BrowserContext) {
  await mockItunes(context)
  const page = await context.newPage()
  const currentSong = trackAudio(page)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return { page, currentSong, errors }
}

export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create a game' }).click()
  await page.waitForURL(/\/r\/[A-Z]{4}$/)
  await joinAs(page, name)
  const code = (await page.getByTestId('room-code').textContent())!.trim()
  expect(code).toMatch(/^[A-Z]{4}$/)
  return code
}

export async function joinAs(page: Page, name: string) {
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join game' }).click()
  await expect(page.getByTestId('player-list').or(page.getByTestId('choices')).or(page.getByTestId('start-game')).first()).toBeVisible()
}

/** The results screen opens with a story-style recap; tap Skip if it is showing. */
export async function skipRecap(page: Page) {
  const skip = page.getByTestId('recap').getByRole('button', { name: 'Skip' })
  try {
    await skip.click({ timeout: 4000 })
  } catch {
    // no recap (e.g. the game ended before any song finished)
  }
  await expect(page.getByTestId('recap')).toHaveCount(0)
}

export async function playerNames(page: Page): Promise<string[]> {
  const items = page.getByTestId('player-list').locator('li')
  return (await items.allTextContents()).map((t) => t.trim())
}

/** Local-only developer sign-in (stands in for Google in tests). */
export async function devSignIn(page: Page, name: string, email: string) {
  const res = await page.request.post('/api/auth/dev-login', { data: { name, email } })
  expect(res.ok()).toBe(true)
  // Signed-in players are asked their age and gender once; answer it so tests go straight to the app.
  const profile = await page.request.post('/api/me/profile', { data: { age: 25, gender: 'undisclosed' } })
  expect(profile.ok()).toBe(true)
}
