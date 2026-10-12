// Reads public Spotify / Apple Music playlists and albums without API keys:
//  • Spotify: the public embed page carries the track list with 30 s MP3 previews.
//  • Apple Music: the public web page carries schema.org JSON-LD with each song's
//    store id; the browser then resolves previews with one iTunes lookup.
// Only URLs built from a validated id are fetched (no user-supplied URLs → no SSRF).
import { z } from 'zod'
import { REGION_CODES } from '../shared/catalog'
import {
  ARTWORK_URL_RE,
  PLAYLIST_ID_RE,
  PREVIEW_URL_RE,
  PlaylistKindSchema,
  PlaylistProviderSchema,
  type PlaylistInfo,
  type PlaylistTrackInfo,
} from '../shared/protocol'

export const PlaylistQuerySchema = z.object({
  provider: PlaylistProviderSchema,
  type: PlaylistKindSchema,
  id: z.string().regex(PLAYLIST_ID_RE),
  country: z.enum(REGION_CODES).optional(),
})
export type PlaylistQuery = z.infer<typeof PlaylistQuerySchema>

export class PlaylistError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
  }
}

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml',
}
const CACHE_SECONDS = 30 * 60
const MAX_TRACKS = 400

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(12_000) })
  if (res.status === 404) throw new PlaylistError('That playlist was not found. Make sure it is public.', 404)
  if (!res.ok) throw new PlaylistError(`The music service returned an error (${res.status}).`)
  return res.text()
}

interface SpotifyEntity {
  name?: string
  title?: string
  subtitle?: string
  coverArt?: { sources?: { url?: string }[] }
  visualIdentity?: { image?: { url?: string }[] }
  trackList?: { uri?: string; title?: string; subtitle?: string; audioPreview?: { url?: string } }[]
}

async function spotify(q: PlaylistQuery): Promise<PlaylistInfo> {
  const html = await fetchPage(`https://open.spotify.com/embed/${q.type}/${q.id}`)
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!m) throw new PlaylistError('Could not read this Spotify link.')
  let entity: SpotifyEntity | undefined
  try {
    entity = JSON.parse(m[1]!)?.props?.pageProps?.state?.data?.entity
  } catch {
    throw new PlaylistError('Could not read this Spotify link.')
  }
  if (!entity?.trackList) throw new PlaylistError('This Spotify playlist is private or empty.', 404)

  const image = [...(entity.coverArt?.sources ?? []), ...(entity.visualIdentity?.image ?? [])].map((s) => s.url).find((u) => u && ARTWORK_URL_RE.test(u)) ?? null

  const tracks: PlaylistTrackInfo[] = []
  for (const t of entity.trackList.slice(0, MAX_TRACKS)) {
    const spotifyId = t.uri?.match(/^spotify:track:([A-Za-z0-9]{10,40})$/)?.[1]
    const preview = t.audioPreview?.url
    if (!t.title || !t.subtitle) continue
    tracks.push({
      title: t.title.slice(0, 200),
      artist: t.subtitle.slice(0, 300),
      preview: preview && PREVIEW_URL_RE.test(preview) ? preview : null,
      spotifyId,
    })
  }
  return {
    provider: 'spotify',
    type: q.type,
    id: q.id,
    name: (entity.name ?? entity.title ?? 'Spotify playlist').slice(0, 160),
    owner: (entity.subtitle ?? '').slice(0, 120),
    image,
    tracks,
  }
}

interface LdTrack {
  name?: string
  url?: string
}
interface LdDoc {
  name?: string
  author?: { name?: string }
  byArtist?: { name?: string }[] | { name?: string }
  track?: LdTrack[]
  tracks?: LdTrack[]
}

async function apple(q: PlaylistQuery): Promise<PlaylistInfo> {
  const country = q.country ?? 'us'
  const html = await fetchPage(`https://music.apple.com/${country}/${q.type}/x/${q.id}`)
  const blocks = [...html.matchAll(/<script[^>]*type="?application\/ld\+json"?[^>]*>([\s\S]*?)<\/script>/g)]
  let doc: LdDoc | undefined
  for (const b of blocks) {
    try {
      const parsed = JSON.parse(b[1]!) as LdDoc
      if (parsed.track || parsed.tracks) {
        doc = parsed
        break
      }
    } catch {
      // ignore malformed blocks
    }
  }
  if (!doc) throw new PlaylistError('Could not read this Apple Music link. Make sure the playlist is public.', 404)

  const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&')
  const artists = Array.isArray(doc.byArtist) ? doc.byArtist : doc.byArtist ? [doc.byArtist] : []
  const owner = doc.author?.name ?? artists.map((a) => a.name).filter(Boolean).join(', ')

  const tracks: PlaylistTrackInfo[] = []
  for (const t of (doc.track ?? doc.tracks ?? []).slice(0, MAX_TRACKS)) {
    const appleId = t.url?.match(/\/(\d{5,15})(?:\?.*)?$/)?.[1] ?? t.url?.match(/[?&]i=(\d{5,15})/)?.[1]
    if (!t.name || !appleId) continue
    tracks.push({ title: t.name.slice(0, 200), artist: '', preview: null, appleId })
  }
  return {
    provider: 'apple',
    type: q.type,
    id: q.id,
    country,
    name: (doc.name ?? 'Apple Music playlist').slice(0, 160),
    owner: owner.slice(0, 120),
    image: og && ARTWORK_URL_RE.test(og) ? og : null,
    tracks,
  }
}

/** Fetch (and cache for 30 minutes) a playlist's track list. */
export async function getPlaylist(q: PlaylistQuery, ctx: ExecutionContext): Promise<PlaylistInfo> {
  const cacheKey = new Request(`https://playlist-cache.encore/${q.provider}/${q.type}/${q.country ?? '-'}/${q.id}`)
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return hit.json()

  const info = q.provider === 'spotify' ? await spotify(q) : await apple(q)
  if (info.tracks.length === 0) throw new PlaylistError('This playlist has no playable songs.', 404)
  ctx.waitUntil(
    cache.put(cacheKey, new Response(JSON.stringify(info), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CACHE_SECONDS}` } })),
  )
  return info
}

/** Album art for a Spotify track via the public oEmbed endpoint. */
export async function spotifyArtwork(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`, {
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { thumbnail_url?: string }
    return body.thumbnail_url && ARTWORK_URL_RE.test(body.thumbnail_url) ? body.thumbnail_url : null
  } catch {
    return null
  }
}
