import { useSyncExternalStore } from 'react'
import { load, save } from './storage'

// Dark (the plum "marquee night") is the default look; light is the daytime
// variant. The choice is per device. index.html applies the saved theme before
// first paint so the page never flashes the wrong colours.

export type Theme = 'dark' | 'light'

const META_COLOR: Record<Theme, string> = { dark: '#0d0716', light: '#fbf5ee' }
const listeners = new Set<() => void>()

function read(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme])
}

export function setTheme(theme: Theme) {
  save('theme', theme)
  applyTheme(theme)
  listeners.forEach((l) => l())
}

export function toggleTheme() {
  setTheme(read() === 'light' ? 'dark' : 'light')
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changed it: follow along.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== 'encore:theme') return
    applyTheme(load('theme') === 'light' ? 'light' : 'dark')
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'dark')
}
