// Builds candidate song pools from the public iTunes Search API.
// Runs in the host's browser (the API allows cross-origin requests), which keeps
// Apple's per-IP rate limits off the server. The room server re-validates every track.
import { findPreset, type RegionCode } from '../../shared/catalog'
import type { PlaylistInfo, PlaylistSource, Source, Track } from '../../shared/protocol'
import { api, ApiError } from './api'
import { shuffle } from '../../shared/questions'
import { artistMatches, compareKey } from '../../shared/text'
import { matchSong, songSearchUrl, type SongClip, type SongRef } from '../../shared/songs'

const API = 'https://itunes.apple.com'
const TIMEOUT_MS = 12_000

interface ItunesSong {
  wrapperType?: string
  kind?: string
  trackId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  artworkUrl100?: string
  previewUrl?: string
  trackViewUrl?: string
  releaseDate?: string
}

interface ItunesArtist {
  wrapperType?: string
  artistType?: string
  artistId: number
  artistName: string
  primaryGenreName?: string
}

interface RssEntry {
  id?: { label?: string; attributes?: { 'im:id'?: string } }
  'im:name'?: { label?: string }
  'im:artist'?: { label?: string }
  'im:collection'?: { 'im:name'?: { label?: string } }
  'im:image'?: { label?: string }[]
  'im:releaseDate'?: { label?: string }
  link?: { attributes?: { rel?: string; href?: string } }[] | { attributes?: { rel?: string; href?: string } }
}

export class MusicError extends Error {}

const cache = new Map<string, Promise<unknown>>()

async function getJson<T>(url: string): Promise<T> {
  const hit = cache.get(url)
  if (hit) return hit as Promise<T>

  const task = (async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: ctrl.signal })
      if (res.status === 403 || res.status === 429) {
        throw new MusicError('The music catalog is rate-limiting requests. Wait a minute and try again.')
      }
      if (!res.ok) throw new MusicError(`The music catalog returned an error (${res.status}).`)
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof MusicError) throw err
      throw new MusicError('Could not reach the music catalog. Check your connection and try again.')
    } finally {
      clearTimeout(timer)
    }
  })()

  cache.set(url, task)
  task.catch(() => cache.delete(url))
  return task
}

function bigArtwork(url: string | undefined): string {
  if (!url || !/^https:\/\/is\d+-ssl\.mzstatic\.com\//.test(url)) return ''
  return url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, '/300x300bb.jpg')
}

function yearOf(date: string | undefined): number | null {
  if (!date) return null
  const y = new Date(date).getUTCFullYear()
  return Number.isFinite(y) && y >= 1900 && y <= 2100 ? y : null
}

function fromSong(r: ItunesSong): Track | null {
  if (r.kind !== 'song' || !r.trackId || !r.trackName || !r.artistName) return null
  if (!r.previewUrl?.startsWith('https://audio-ssl.itunes.apple.com/')) return null
  return {
    id: String(r.trackId),
    title: r.trackName.slice(0, 200),
    artist: r.artistName.slice(0, 200),
    album: (r.collectionName ?? '').slice(0, 200),
    artwork: bigArtwork(r.artworkUrl100),
    preview: r.previewUrl,
    link: r.trackViewUrl?.startsWith('https://music.apple.com/') ? r.trackViewUrl.split('?')[0]! : '',
    year: yearOf(r.releaseDate),
  }
}

function fromRss(e: RssEntry): Track | null {
  const links = Array.isArray(e.link) ? e.link : e.link ? [e.link] : []
  const preview = links.find((l) => l.attributes?.rel === 'enclosure')?.attributes?.href
  const id = e.id?.attributes?.['im:id']
  const title = e['im:name']?.label
  const artist = e['im:artist']?.label
  if (!id || !title || !artist || !preview?.startsWith('https://audio-ssl.itunes.apple.com/')) return null
  const images = e['im:image'] ?? []
  const link = e.id?.label ?? ''
  return {
    id,
    title: title.slice(0, 200),
    artist: artist.slice(0, 200),
    album: (e['im:collection']?.['im:name']?.label ?? '').slice(0, 200),
    artwork: bigArtwork(images[images.length - 1]?.label),
    preview,
    link: link.startsWith('https://music.apple.com/') ? link.split('?')[0]! : '',
    year: yearOf(e['im:releaseDate']?.label),
  }
}

function compact<T>(items: (T | null)[]): T[] {
  return items.filter((x): x is T => x !== null)
}

export async function topChart(country: string, genre?: number): Promise<Track[]> {
  const url = `${API}/${country}/rss/topsongs/limit=100${genre ? `/genre=${genre}` : ''}/json`
  const data = await getJson<{ feed?: { entry?: RssEntry[] | RssEntry } }>(url)
  const entries = data.feed?.entry
  return compact((Array.isArray(entries) ? entries : entries ? [entries] : []).map(fromRss))
}

export async function searchSongs(term: string, country: string, opts: { limit?: number; artistTerm?: boolean } = {}): Promise<Track[]> {
  const params = new URLSearchParams({
    term,
    country,
    media: 'music',
    entity: 'song',
    limit: String(opts.limit ?? 50),
  })
  if (opts.artistTerm) params.set('attribute', 'artistTerm')
  const data = await getJson<{ results?: ItunesSong[] }>(`${API}/search?${params}`)
  return compact((data.results ?? []).map(fromSong))
}

export async function artistSongs(artistId: number, country: string): Promise<Track[]> {
  const params = new URLSearchParams({ id: String(artistId), entity: 'song', limit: '150', country })
  const data = await getJson<{ results?: ItunesSong[] }>(`${API}/lookup?${params}`)
  return compact((data.results ?? []).map(fromSong))
}

export interface ArtistHit {
  id: number
  name: string
  genre?: string
  image?: string
}

/** Artists matching a query, each with the album art of their top song. */
export async function searchArtists(query: string, country: string): Promise<ArtistHit[]> {
  const params = new URLSearchParams({ term: query, country, media: 'music', entity: 'song', limit: '50' })
  const data = await getJson<{ results?: (ItunesSong & { artistId?: number; primaryGenreName?: string })[] }>(`${API}/search?${params}`)
  const byArtist = new Map<number, ArtistHit>()
  for (const r of data.results ?? []) {
    if (!r.artistId || !r.artistName || byArtist.has(r.artistId)) continue
    // Skip collaborations so each hit is a single artist.
    if (/,|&| feat\.| x /i.test(r.artistName)) continue
    byArtist.set(r.artistId, { id: r.artistId, name: r.artistName, genre: r.primaryGenreName, image: bigArtwork(r.artworkUrl100) || undefined })
    if (byArtist.size >= 8) break
  }
  return [...byArtist.values()]
}

/** Track list of a public Spotify / Apple Music playlist or album (read by our server). */
export async function loadPlaylist(ref: { provider: string; type: string; id: string; country?: string }): Promise<PlaylistInfo> {
  const params = new URLSearchParams({ provider: ref.provider, type: ref.type, id: ref.id })
  if (ref.country) params.set('country', ref.country)
  try {
    return await api<PlaylistInfo>(`/api/playlist?${params}`)
  } catch (err) {
    throw new MusicError(err instanceof ApiError ? err.message : 'Could not load that playlist.')
  }
}

export async function playlistTracks(source: PlaylistSource, region: RegionCode): Promise<Track[]> {
  const info = await loadPlaylist(source)
  if (info.provider === 'spotify') {
    return info.tracks
      .filter((t) => t.preview)
      .map((t, i) => ({
        id: t.spotifyId ? `sp:${t.spotifyId}` : `sp:${source.id}:${i}`,
        title: t.title,
        artist: t.artist,
        album: '',
        artwork: '',
        preview: t.preview!,
        link: t.spotifyId ? `https://open.spotify.com/track/${t.spotifyId}` : '',
        year: null,
        ...(t.spotifyId ? { spotifyId: t.spotifyId } : {}),
      }))
  }
  // Apple Music: resolve store ids to previews in batches (one request per 150 songs).
  const ids = info.tracks.map((t) => t.appleId).filter((x): x is string => !!x)
  const country = info.country ?? source.country ?? region
  const tracks: Track[] = []
  for (let i = 0; i < ids.length && i < 300; i += 150) {
    const params = new URLSearchParams({ id: ids.slice(i, i + 150).join(','), country, entity: 'song' })
    const data = await getJson<{ results?: ItunesSong[] }>(`${API}/lookup?${params}`)
    tracks.push(...compact((data.results ?? []).map(fromSong)))
  }
  return tracks
}

/** Run async jobs with limited parallelism. Failed jobs yield an empty list. */
async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R[]>): Promise<{ results: R[]; errors: number }> {
  const results: R[] = []
  let errors = 0
  let next = 0
  async function worker() {
    while (next < items.length) {
      const item = items[next++]!
      try {
        results.push(...(await fn(item)))
      } catch {
        errors++
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return { results, errors }
}

/**
 * Songs credited to an artist given by name. A keyword search is one request and works
 * for distinctive names; generic names ("Journey", "Oasis") mostly match other artists,
 * so those fall back to resolving the exact artist and looking up their catalog.
 */
async function songsByArtistName(name: string, country: string): Promise<Track[]> {
  const found = (await searchSongs(name, country, { limit: 40, artistTerm: true })).filter((t) => artistMatches(t.artist, name))
  if (found.length >= 5) return found

  const artists = await searchArtists(name, country)
  const exact = artists.find((a) => compareKey(a.name) === compareKey(name)) ?? artists.find((a) => artistMatches(a.name, name))
  if (!exact) return found
  const songs = await artistSongs(exact.id, country)
  return songs.slice(0, 30)
}

const MIX_BATCH = 8
const MIX_TARGET = 60

/** Resolve the room's music source into a list of playable tracks. */
export async function buildPool(source: Source, region: RegionCode): Promise<Track[]> {
  if (source.kind === 'artist') return artistSongs(source.id, region)
  if (source.kind === 'search') return searchSongs(source.query, region, { limit: 150 })
  if (source.kind === 'playlist') return playlistTracks(source, region)
  if (source.kind === 'blend') return []
  if (source.kind === 'quiz') return (await api<{ tracks: Track[] }>(`/api/quizzes/${source.id}`)).tracks

  const preset = findPreset(source.id)
  if (!preset) throw new MusicError('Unknown category.')
  const country = preset.country ?? region

  if (preset.kind === 'chart') return topChart(country, preset.genre)

  const jobs = shuffle(
    [
      ...(preset.artists ?? []).map((name) => ({ term: name, artist: true })),
      ...(preset.terms ?? []).map((term) => ({ term, artist: false })),
    ],
    Math.random,
  )

  let tracks: Track[] = []
  let failures = 0
  for (let i = 0; i < jobs.length && tracks.length < MIX_TARGET; i += MIX_BATCH) {
    const batch = jobs.slice(i, i + MIX_BATCH)
    const { results, errors } = await mapLimited(batch, 4, (job) => (job.artist ? songsByArtistName(job.term, country) : searchSongs(job.term, country, { limit: 25 })))
    failures += errors
    tracks = tracks.concat(results)
    if (preset.years) {
      const [from, to] = preset.years
      const inRange = tracks.filter((t) => t.year !== null && t.year >= from && t.year <= to)
      // Store release dates are often re-release dates, so only filter when enough remain.
      if (inRange.length >= MIX_TARGET / 2) tracks = inRange
    }
  }

  if (tracks.length === 0 && failures > 0) {
    throw new MusicError('Could not load songs from the music catalog. Wait a minute and try again.')
  }
  return tracks
}

/**
 * An emoji puzzle's song, looked up from this browser (Apple rate-limits the
 * server, but each player's own lookups are fine). Null when it isn't on iTunes.
 */
export async function findSongClip(song: SongRef): Promise<SongClip | null> {
  try {
    const { results = [] } = await getJson<{ results?: Parameters<typeof matchSong>[0] }>(songSearchUrl(song))
    return matchSong(results, song)?.clip ?? null
  } catch {
    return null
  }
}
