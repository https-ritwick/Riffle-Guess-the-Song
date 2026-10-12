// "Connect Spotify": types shared by the Worker (/api/spotify/*) and the browser.

export interface SpotifyConfig {
  enabled: boolean
}

/** One of a listener's top (or liked) tracks. Previews are resolved separately. */
export interface SpotifyTopTrack {
  id: string
  title: string
  artist: string
  album: string
  artwork: string
  year: number | null
}

export type SpotifyMe =
  | { connected: false }
  | {
      connected: true
      name: string
      image: string | null
      tracks: SpotifyTopTrack[]
      /** When the tracks were read from Spotify (ms). */
      fetchedAt: number
    }

export const SPOTIFY_TRACK_ID_RE = /^[A-Za-z0-9]{22}$/
/** Previews resolved per request (each one reads a public embed page). */
export const PREVIEW_BATCH = 20
