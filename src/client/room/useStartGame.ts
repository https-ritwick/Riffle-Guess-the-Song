import { useCallback, useState } from 'react'
import { MIN_POOL } from '../../shared/rules'
import { buildPool, MusicError } from '../lib/itunes'
import { recentlyPlayed } from '../lib/played'
import { playedKey, shuffle } from '../../shared/questions'
import { useRoomContext } from './context'

/**
 * Host-only: fetch a pool of songs for the current settings from the music catalog
 * and hand it to the room server, which picks the questions and runs the game.
 */
export function useStartGame() {
  const { state, send, isHost } = useRoomContext()
  const [busy, setBusy] = useState(false)

  const start = useCallback(async () => {
    if (!isHost || busy) return
    setBusy(true)
    send({ t: 'prepare' })
    try {
      const settings = state.settings
      const avoid = recentlyPlayed()
      // The server builds challenge games and Blend games itself.
      if (settings.game !== 'songs' || settings.source.kind === 'blend') {
        send({ t: 'start', pool: [], settings, avoid })
        return
      }
      const pool = await buildPool(settings.source, settings.region)
      if (pool.length < MIN_POOL) {
        send({
          t: 'prepareFailed',
          message: pool.length === 0 ? 'No playable songs found for this choice — try something else.' : `Only found ${pool.length} playable songs — try something broader.`,
        })
      } else {
        // Big catalogs are trimmed to 300 songs: keep the ones this host hasn't played lately.
        const seen = new Set(avoid)
        const fresh = shuffle(pool.filter((t) => !seen.has(playedKey(t))), Math.random)
        const heard = shuffle(pool.filter((t) => seen.has(playedKey(t))), Math.random)
        send({ t: 'start', pool: [...fresh, ...heard].slice(0, 300), settings, avoid })
      }
    } catch (err) {
      send({ t: 'prepareFailed', message: err instanceof MusicError ? err.message : 'Something went wrong while loading songs.' })
    } finally {
      setBusy(false)
    }
  }, [isHost, busy, send, state.settings])

  return { start, busy: busy || state.phase === 'loading' }
}
