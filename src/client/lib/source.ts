import { findPreset, REGIONS } from '../../shared/catalog'
import type { GameKind } from '../../shared/challenges'
import type { Settings, Source } from '../../shared/protocol'

export interface SourceDescription {
  title: string
  subtitle: string
  emoji: string
  colors: [string, string]
}

export function describeSource(source: Source): SourceDescription {
  if (source.kind === 'artist') {
    return { title: source.name, subtitle: source.genre ? `Artist · ${source.genre}` : 'Artist', emoji: '🎤', colors: ['#ff6a3d', '#ffc44d'] }
  }
  if (source.kind === 'playlist') {
    const service = source.provider === 'spotify' ? 'Spotify' : 'Apple Music'
    return { title: source.name, subtitle: `${service} ${source.type}${source.count ? ` · ${source.count} songs` : ''}`, emoji: '🎶', colors: ['#1db954', '#ffc44d'] }
  }
  if (source.kind === 'blend') {
    return { title: 'Blend', subtitle: 'Everyone’s music, mixed', emoji: '✨', colors: ['#1db954', '#ff6a3d'] }
  }
  if (source.kind === 'quiz') {
    return { title: source.name, subtitle: `Player-made quiz${source.count ? ` · ${source.count} songs` : ''}`, emoji: '🧩', colors: ['#a855f7', '#ffc44d'] }
  }
  if (source.kind === 'search') {
    return { title: `“${source.query}”`, subtitle: 'Search', emoji: '🔎', colors: ['#0ea5e9', '#6366f1'] }
  }
  const preset = findPreset(source.id)
  if (!preset) return { title: 'Unknown', subtitle: '', emoji: '🎵', colors: ['#374151', '#111827'] }
  const subtitle = preset.kind === 'chart' ? 'Live chart' : preset.group === 'decades' ? 'Decade mix' : 'Mix'
  return { title: preset.name, subtitle, emoji: preset.emoji, colors: preset.colors }
}

export function regionLabel(code: Settings['region']): string {
  return REGIONS.find((r) => r.code === code)?.label ?? code.toUpperCase()
}

export function answerTypeLabel(t: Settings['answerType']): string {
  return t === 'title' ? 'Song title' : t === 'artist' ? 'Artist' : 'Mix of both'
}

export function difficultyLabel(d: Settings['difficulty']): string {
  return d === 'easy' ? 'Easy' : d === 'medium' ? 'Medium' : 'Hard'
}

export const DIFFICULTY_HINTS: Record<Settings['difficulty'], string> = {
  easy: 'Random wrong answers',
  medium: 'Look-alike answers: same singer, movie or era',
  hard: 'Closest look-alikes · a wrong answer costs 100 points',
}

export interface GameMode {
  id: GameKind
  emoji: string
  title: string
  tagline: string
  how: string
  /** Tile gradient (Tailwind classes). */
  tone: string
}

export const GAME_MODES: GameMode[] = [
  {
    id: 'songs',
    emoji: '🎵',
    title: 'Guess the Song',
    tagline: 'Hear a clip, name the song',
    how: 'Everyone hears the same clip at the same time. Pick the title (or singer) from four look-alikes.',
    tone: 'from-brand-400/35 via-brand-600/15 to-transparent',
  },
  {
    id: 'dialogue',
    emoji: '🎬',
    title: 'Dialogue Baazi',
    tagline: 'Read the dialogue, name the movie',
    how: 'A famous filmi dialogue pops up — from Sholay to Jawan. Which movie is it from?',
    tone: 'from-rose-500/35 via-rose-700/15 to-transparent',
  },
  {
    id: 'actor',
    emoji: '🌟',
    title: 'Star Spotting',
    tagline: 'Clues drop one by one — who’s the star?',
    how: 'Three clues reveal over the timer, hardest first: answer early for more points. Plus “who said it?” rounds.',
    tone: 'from-fuchsia-500/35 via-fuchsia-700/15 to-transparent',
  },
  {
    id: 'emoji',
    emoji: '😎',
    title: 'Emoji Gaana',
    tagline: 'Decode the emojis, name the song',
    how: 'Bollywood songs spelled out in emojis. The real song plays at the reveal.',
    tone: 'from-amber-300/35 via-orange-600/15 to-transparent',
  },
]

/** Antakshari is a song game with a twist (settings.antakshari), shown as its own mode. */
export const ANTAKSHARI_MODE = {
  emoji: '🎤',
  title: 'Antakshari',
  tagline: 'Each song starts with the last letter',
  how: 'Every song starts with the last letter of the one before — “Tum Hi Ho” ends in H, so the next song starts with H. With teams, the two teams take turns and the other side can steal.',
  tone: 'from-emerald-400/35 via-emerald-700/15 to-transparent',
} as const

export function gameMode(id: GameKind): GameMode {
  return GAME_MODES.find((m) => m.id === id) ?? GAME_MODES[0]!
}

/** What the game is: the music source for song games, or the challenge. */
export function describeGame(settings: Settings): SourceDescription {
  if (settings.game === 'songs' && settings.antakshari) return { ...describeSource(settings.source), subtitle: `Antakshari · ${describeSource(settings.source).title}` }
  if (settings.game === 'songs') return describeSource(settings.source)
  const m = gameMode(settings.game)
  return { title: m.title, subtitle: m.tagline, emoji: m.emoji, colors: ['#ffae1f', '#e8336d'] }
}
