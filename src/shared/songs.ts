// Finding an emoji puzzle's song in the iTunes store, shared by the room server and
// the browser (Apple rate-limits server IPs, so each player's browser can look it up too).
import { ARTWORK_URL_RE, LINK_URL_RE, PREVIEW_URL_RE } from './protocol'
import { cleanTitle, compareKey, similarity } from './text'

export interface SongRef {
  title: string
  movie: string
}

export interface SongClip {
  preview: string
  artwork: string
  link: string
  album: string
}

interface ItunesHit {
  trackName?: string
  collectionName?: string
  previewUrl?: string
  artworkUrl100?: string
  trackViewUrl?: string
}

export function songSearchUrl(song: SongRef, country = 'in'): string {
  const term = encodeURIComponent(`${song.title} ${song.movie}`.slice(0, 100))
  return `https://itunes.apple.com/search?term=${term}&country=${country}&media=music&entity=song&limit=10`
}

/**
 * The best match for `song` among iTunes results, and how sure we are:
 * 3 = same title, 2 = title contained, 1 = similar title; +1 when the album is the film.
 */
export function matchSong(results: ItunesHit[], song: SongRef): { clip: SongClip; score: number } | null {
  const want = compareKey(song.title)
  const film = compareKey(song.movie).slice(0, 10)
  let best: { hit: ItunesHit; score: number } | null = null
  for (const r of results) {
    if (!r.trackName || !r.previewUrl || !PREVIEW_URL_RE.test(r.previewUrl)) continue
    const title = compareKey(cleanTitle(r.trackName))
    let s = title === want ? 3 : title.includes(want) || want.includes(title) ? 2 : similarity(r.trackName, song.title) >= 0.75 ? 1 : 0
    if (s && film && compareKey(r.collectionName ?? '').includes(film)) s += 1
    if (s && (!best || s > best.score)) best = { hit: r, score: s }
  }
  if (!best) return null
  const art = (best.hit.artworkUrl100 ?? '').replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, '/300x300bb.jpg')
  return {
    score: best.score,
    clip: {
      preview: best.hit.previewUrl!,
      artwork: ARTWORK_URL_RE.test(art) ? art : '',
      link: best.hit.trackViewUrl && LINK_URL_RE.test(best.hit.trackViewUrl) ? best.hit.trackViewUrl : '',
      album: (best.hit.collectionName ?? '').slice(0, 200),
    },
  }
}
