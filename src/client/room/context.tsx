import { createContext, useContext } from 'react'
import type { ClientMessage, PublicPlayer, PublicState } from '../../shared/protocol'

export interface RoomContextValue {
  state: PublicState
  you: string
  me: PublicPlayer | undefined
  isHost: boolean
  send: (msg: ClientMessage) => boolean
  serverNow: () => number
  leave: () => void
  /** Players whose voice is coming through right now (for the talking glow). */
  speaking?: ReadonlySet<string>
}

export const RoomContext = createContext<RoomContextValue | null>(null)

export function useRoomContext(): RoomContextValue {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoomContext must be used inside a room')
  return ctx
}
