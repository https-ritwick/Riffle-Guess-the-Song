import { REGION_CODES, type PlaylistKind, type PlaylistProvider, type RegionCode } from './catalog'
import { PLAYLIST_ID_RE } from './protocol'

export interface PlaylistRef {
  provider: PlaylistProvider
  type: PlaylistKind
  id: string
  country?: RegionCode
}

/**
 * Recognise a public Spotify or Apple Music playlist/album link, e.g.
 *   https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM?si=…
 *   https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy
 *   spotify:playlist:37i9dQZF1DX0XUfTFmNBRM
 *   https://music.apple.com/in/playlist/bollywood-hits/pl.d60caf02fcce4ba1a9e2a5cd2c5d8e05
 *   https://music.apple.com/us/album/1989/1440935467
 */
export function parsePlaylistUrl(input: string): PlaylistRef | null {
  const text = input.trim()

  const uri = text.match(/^spotify:(playlist|album):([A-Za-z0-9]{10,40})$/)
  if (uri) return { provider: 'spotify', type: uri[1] as PlaylistKind, id: uri[2]! }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  if (url.hostname === 'open.spotify.com') {
    const m = url.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?(playlist|album)\/([A-Za-z0-9]{10,40})\/?$/i)
    if (m) return { provider: 'spotify', type: m[1]!.toLowerCase() as PlaylistKind, id: m[2]! }
    return null
  }

  if (url.hostname === 'music.apple.com' || url.hostname === 'embed.music.apple.com') {
    const m = url.pathname.match(/^\/([a-z]{2})\/(playlist|album)\/(?:[^/]+\/)?([^/]+)\/?$/i)
    if (!m) return null
    const id = m[3]!
    if (!PLAYLIST_ID_RE.test(id)) return null
    const cc = m[1]!.toLowerCase()
    const country = (REGION_CODES as readonly string[]).includes(cc) ? (cc as RegionCode) : 'us'
    return { provider: 'apple', type: m[2]!.toLowerCase() as PlaylistKind, id, country }
  }

  return null
}

export function playlistWebUrl(ref: PlaylistRef): string {
  return ref.provider === 'spotify'
    ? `https://open.spotify.com/${ref.type}/${ref.id}`
    : `https://music.apple.com/${ref.country ?? 'us'}/${ref.type}/x/${ref.id}`
}
