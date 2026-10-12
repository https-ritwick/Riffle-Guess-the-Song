import { useCallback, useState } from 'react'
import { MIN_POOL } from '../../shared/rules'
import { buildPool, MusicError } from '../lib/itunes'
import { shuffle } from '../../shared/questions'
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
      // The server builds a Blend game from the songs players contributed.
      if (settings.source.kind === 'blend') {
        send({ t: 'start', pool: [], settings })
        return
      }
      const pool = await buildPool(settings.source, settings.region)
      if (pool.length < MIN_POOL) {
        send({
          t: 'prepareFailed',
          message: pool.length === 0 ? 'No playable songs found for this choice — try something else.' : `Only found ${pool.length} playable songs — try something broader.`,
        })
      } else {
        send({ t: 'start', pool: shuffle(pool, Math.random).slice(0, 300), settings })
      }
    } catch (err) {
      send({ t: 'prepareFailed', message: err instanceof MusicError ? err.message : 'Something went wrong while loading songs.' })
    } finally {
      setBusy(false)
    }
  }, [isHost, busy, send, state.settings])

  return { start, busy: busy || state.phase === 'loading' }
}
