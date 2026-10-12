import { findPreset, REGIONS } from '../../shared/catalog'
import type { Settings, Source } from '../../shared/protocol'

export interface SourceDescription {
  title: string
  subtitle: string
  emoji: string
  colors: [string, string]
}

export function describeSource(source: Source): SourceDescription {
  if (source.kind === 'artist') {
    return { title: source.name, subtitle: source.genre ? `Artist · ${source.genre}` : 'Artist', emoji: '🎤', colors: ['#8b5cf6', '#12dcef'] }
  }
  if (source.kind === 'playlist') {
    const service = source.provider === 'spotify' ? 'Spotify' : 'Apple Music'
    return { title: source.name, subtitle: `${service} ${source.type}${source.count ? ` · ${source.count} songs` : ''}`, emoji: '🎶', colors: ['#1db954', '#12dcef'] }
  }
  if (source.kind === 'blend') {
    return { title: 'Blend', subtitle: 'Everyone’s music, mixed', emoji: '✨', colors: ['#1db954', '#8b5cf6'] }
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
