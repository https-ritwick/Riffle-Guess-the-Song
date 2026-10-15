import { ROOM_CODE_ALPHABET, type Settings } from '../shared/protocol'

export interface RoomInitOptions {
  group?: { id: string; name: string }
  allowGuests?: boolean
  hostUserId?: string
  settings?: Settings | null
  /** Single-player room. */
  solo?: boolean
  /** Songs and questions already played (group games), so the room starts with new ones. */
  played?: string[]
  /** Today's daily challenge (one attempt, fixed questions). */
  daily?: number
}

export function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code))
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('')
}

/** Claim a fresh 4-letter code and initialise its room. */
export async function allocateRoom(env: Env, opts: RoomInitOptions = {}): Promise<string | null> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode()
    if (await roomStub(env, code).init(code, opts)) return code
  }
  return null
}
