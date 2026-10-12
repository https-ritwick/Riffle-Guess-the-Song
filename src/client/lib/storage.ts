// localStorage is only used for per-device conveniences (your name, your seat
// token for reconnecting, volume). It can be unavailable, so every access is guarded.

export function load(key: string): string | null {
  try {
    return window.localStorage.getItem(`encore:${key}`)
  } catch {
    return null
  }
}

export function save(key: string, value: string): void {
  try {
    window.localStorage.setItem(`encore:${key}`, value)
  } catch {
    // ignore
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(`encore:${key}`)
  } catch {
    // ignore
  }
}
