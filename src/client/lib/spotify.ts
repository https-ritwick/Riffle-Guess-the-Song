// Browser side of "Connect Spotify" and the Blend: reads the listener's saved top
// tracks from our server, resolves preview clips, and turns playlist links into
// Blend contributions.
import { useCallback, useEffect, useState } from 'react'
import type { RegionCode } from '../../shared/catalog'
import { parsePlaylistUrl } from '../../shared/playlist'
import type { PlaylistSource, Track } from '../../shared/protocol'
import { MAX_BLEND_TRACKS } from '../../shared/protocol'
import { PREVIEW_BATCH, type SpotifyConfig, type SpotifyMe } from '../../shared/spotify'
import { shuffle } from '../../shared/questions'
import { api } from './api'
import { loadPlaylist, MusicError, playlistTracks } from './itunes'

let configPromise: Promise<SpotifyConfig> | null = null

export function spotifyConfig(): Promise<SpotifyConfig> {
  configPromise ??= api<SpotifyConfig>('/api/spotify/config').catch(() => ({ enabled: false }))
  return configPromise
}

/** Spotify connection state for this browser. */
export function useSpotify() {
  const [config, setConfig] = useState<SpotifyConfig>({ enabled: false })
  const [me, setMe] = useState<SpotifyMe | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMe(await api<SpotifyMe>('/api/spotify/me'))
    } catch {
      setMe({ connected: false })
    }
  }, [])

  useEffect(() => {
    void spotifyConfig().then(setConfig)
    void refresh()
  }, [refresh])

  return { config, me, refresh }
}

/** Full-page redirect to Spotify; comes back to `returnTo` with ?spotify=connected. */
export function connectSpotify(returnTo = location.pathname) {
  location.href = `/api/spotify/start?returnTo=${encodeURIComponent(returnTo)}`
}

export async function disconnectSpotify(): Promise<void> {
  await api('/api/spotify/disconnect', { method: 'POST', body: {} })
}

async function resolvePreviews(ids: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (let i = 0; i < ids.length; i += PREVIEW_BATCH) {
    const chunk = ids.slice(i, i + PREVIEW_BATCH)
    const { previews } = await api<{ previews: Record<string, string | null> }>(`/api/spotify/previews?ids=${chunk.join(',')}`)
    Object.assign(out, previews)
  }
  return out
}

export const SPOTIFY_ERRORS: Record<string, string> = {
  cancelled: 'Spotify connection was cancelled.',
  state: 'The Spotify sign-in expired. Please try again.',
  token: 'Spotify sign-in failed. Please try again.',
  not_configured: 'Spotify isn’t set up on this server yet — add a playlist link instead.',
  access:
    'Spotify didn’t share your music. While the app is in Spotify’s development mode, its owner has to add your Spotify account to the app’s user list first. A playlist link works for everyone.',
  empty: 'Your Spotify doesn’t have top tracks yet — add a playlist link instead.',
  busy: 'Spotify is busy right now. Wait a minute and try again.',
  read: 'Spotify didn’t answer properly. Please try again in a moment, or add a playlist link.',
}

/**
 * The listener's top tracks as playable Blend songs. Previews are looked up until
 * there are enough (a few tracks on Spotify have none).
 */
export async function spotifyBlendTracks(me: Extract<SpotifyMe, { connected: true }>): Promise<Track[]> {
  const want = 30
  const tracks: Track[] = []
  const candidates = me.tracks.slice(0, 60)
  for (let i = 0; i < candidates.length && tracks.length < want; i += PREVIEW_BATCH) {
    const chunk = candidates.slice(i, i + PREVIEW_BATCH)
    const previews = await resolvePreviews(chunk.map((t) => t.id))
    for (const t of chunk) {
      const preview = previews[t.id]
      if (!preview) continue
      tracks.push({
        id: `sp:${t.id}`,
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork: t.artwork,
        preview,
        link: `https://open.spotify.com/track/${t.id}`,
        year: t.year,
        spotifyId: t.id,
      })
    }
  }
  if (tracks.length === 0) throw new MusicError('None of your top tracks have a preview clip on Spotify. Try a playlist link instead.')
  return tracks.slice(0, MAX_BLEND_TRACKS)
}

/** A public playlist or album link as Blend songs. */
export async function playlistBlendTracks(link: string, region: RegionCode): Promise<{ name: string; image: string | null; tracks: Track[] }> {
  const ref = parsePlaylistUrl(link)
  if (!ref) throw new MusicError('Paste a public Spotify or Apple Music playlist or album link.')
  const info = await loadPlaylist(ref)
  const source: PlaylistSource = { kind: 'playlist', provider: info.provider, type: info.type, id: info.id, name: info.name }
  if (info.country) source.country = info.country as RegionCode
  const tracks = shuffle(await playlistTracks(source, region), Math.random).slice(0, MAX_BLEND_TRACKS)
  if (tracks.length === 0) throw new MusicError('No playable songs in that playlist.')
  return { name: info.name, image: info.image, tracks }
}
