// What this device has played lately (song keys and challenge ids). The host's
// browser sends it with "start", so a brand-new room with the same crew still
// plays new songs and questions first.
import { MAX_AVOID } from '../../shared/protocol'
import { load, save } from './storage'

const KEY = 'played:v1'

export function recentlyPlayed(): string[] {
  try {
    const list: unknown = JSON.parse(load(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string' && k.length <= 200).slice(-MAX_AVOID) : []
  } catch {
    return []
  }
}

export function rememberPlayed(keys: string[]): void {
  const fresh = new Set(keys)
  save(KEY, JSON.stringify([...recentlyPlayed().filter((k) => !fresh.has(k)), ...keys].slice(-MAX_AVOID)))
}
