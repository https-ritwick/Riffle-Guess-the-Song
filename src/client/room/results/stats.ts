// Numbers and awards for the results screen and the recap, all derived from the
// round history the server sends at the end of a game.
import type { LucideIcon } from 'lucide-react'
import { Bike, Clapperboard, Crown, Dices, EyeOff, Ghost, Hourglass, Shield, Star, Target, TrendingUp, Zap } from 'lucide-react'
import { AWARD_CATEGORIES, type AwardName } from '../../../shared/awards'
import type { PublicPlayer, RoundSummary } from '../../../shared/protocol'

export interface RoundStat {
  r: RoundSummary
  answered: number
  right: number
  players: number
  acc: number
  fastest: { p: PublicPlayer; ms: number } | null
}

export function roundStats(history: RoundSummary[], players: PublicPlayer[]): RoundStat[] {
  const byId = new Map(players.map((p) => [p.id, p]))
  return history.map((r) => {
    const picks = Object.entries(r.picks).filter(([id]) => byId.has(id))
    const right = picks.filter(([, p]) => p.correct)
    let fastest: RoundStat['fastest'] = null
    for (const [id, p] of right) if (p.ms !== null && (!fastest || p.ms < fastest.ms)) fastest = { p: byId.get(id)!, ms: p.ms }
    return {
      r,
      answered: picks.filter(([, p]) => p.choice !== null).length,
      right: right.length,
      players: picks.length,
      acc: picks.length ? right.length / picks.length : 0,
      fastest,
    }
  })
}

/** Filmi verdict on your score. */
export function scoreMessage(correct: number, total: number): string {
  if (total === 0) return ''
  const ratio = correct / total
  if (ratio === 1) return '“Mogambo khush hua!” A perfect score. 🏆'
  if (ratio >= 0.8) return 'Rockstar! You really know your music.'
  if (ratio >= 0.5) return 'Picture abhi baaki hai — run it back?'
  return '“Kuch kuch hota hai”… but not enough. Practice makes perfect.'
}

/** "🟩🟩🟥⬛…" — one square per song, Wordle-style. */
export function emojiGrid(history: RoundSummary[], you: string): string {
  return history.map((r) => (r.picks[you]?.correct ? '🟩' : r.picks[you] && r.picks[you]!.choice !== null ? '🟥' : '⬛')).join('')
}

/** Ranks after each round, replaying scores the way the server keeps them (never below 0). */
function rankHistory(history: RoundSummary[], players: PublicPlayer[]): Map<string, number[]> {
  const scores = new Map(players.map((p) => [p.id, 0]))
  const ranks = new Map(players.map((p) => [p.id, [] as number[]]))
  for (const r of history) {
    for (const p of players) scores.set(p.id, Math.max(0, scores.get(p.id)! + (r.picks[p.id]?.points ?? 0)))
    const order = [...players].sort((a, b) => scores.get(b.id)! - scores.get(a.id)!)
    order.forEach((p, i) => ranks.get(p.id)!.push(i + 1))
  }
  return ranks
}

/** The player who climbed the most places from their lowest point to the end. */
export function biggestComeback(history: RoundSummary[], ranked: PublicPlayer[]): { p: PublicPlayer; from: number; to: number } | null {
  if (ranked.length < 2 || history.length < 3) return null
  const ranks = rankHistory(history, ranked)
  let best: { p: PublicPlayer; from: number; to: number } | null = null
  for (const [finalIndex, p] of ranked.entries()) {
    // Ignore the first round (everyone starts level) and the final standings themselves.
    const list = ranks.get(p.id)!.slice(1, -1)
    if (!list.length) continue
    const worst = Math.max(...list)
    const to = finalIndex + 1
    if (worst - to >= 1 && (!best || worst - to > best.from - best.to)) best = { p, from: worst, to }
  }
  return best
}

export interface Award {
  id: string
  /** A Bollywood film, song or dialogue the award is named after. */
  title: string
  line: string
  icon: LucideIcon
  /** Poster gradient. */
  tone: string
  who: string
  player?: PublicPlayer
  detail: string
}

/**
 * The awards for a finished game. Titles and captions come from `names` (picked
 * fresh for every game by the room, often written by AI); each award keeps its
 * own icon and poster colours.
 */
export function computeAwards(players: PublicPlayer[], history: RoundSummary[], stats: RoundStat[], solo: boolean, names?: Record<string, AwardName> | null, noun = 'song'): Award[] {
  const awards: Award[] = []
  const named = (id: string): AwardName => names?.[id] ?? AWARD_CATEGORIES.find((c) => c.id === id)!.names[0]!
  const byId = new Map(players.map((p) => [p.id, p]))
  const party = !solo && players.length > 1

  const fastest = stats.filter((s) => s.fastest).sort((a, b) => a.fastest!.ms - b.fastest!.ms)[0]
  if (fastest?.fastest) {
    awards.push({
      id: 'dhoom',
      ...named('dhoom'),
      icon: Bike,
      tone: 'from-orange-500 via-red-600 to-red-950',
      who: fastest.fastest.p.name,
      player: fastest.fastest.p,
      detail: `${(fastest.fastest.ms / 1000).toFixed(2)}s on ${fastest.r.track.title}`,
    })
  }

  const streaker = [...players].sort((a, b) => b.bestStreak - a.bestStreak)[0]
  if (streaker && streaker.bestStreak >= 2) {
    awards.push({
      id: 'don',
      ...named('don'),
      icon: Crown,
      tone: 'from-amber-500 via-stone-800 to-black',
      who: streaker.name,
      player: streaker,
      detail: `${streaker.bestStreak} in a row`,
    })
  }

  const sharp = [...players]
    .map((p) => {
      const answered = history.filter((r) => r.picks[p.id] !== undefined && r.picks[p.id]!.choice !== null).length
      return { p, answered, acc: answered ? p.correct / answered : 0 }
    })
    .filter((x) => x.answered >= Math.max(1, Math.ceil(history.length / 2)))
    .sort((a, b) => b.acc - a.acc)[0]
  if (sharp && sharp.acc > 0) {
    awards.push({
      id: 'perfectionist',
      ...named('perfectionist'),
      icon: Target,
      tone: 'from-emerald-500 via-teal-700 to-teal-950',
      who: sharp.p.name,
      player: sharp.p,
      detail: `${Math.round(sharp.acc * 100)}% accuracy`,
    })
  }

  if (party) {
    const ranked = [...players].sort((a, b) => b.score - a.score)
    const comeback = biggestComeback(history, ranked)
    if (comeback) {
      awards.push({
        id: 'baazigar',
        ...named('baazigar'),
        icon: TrendingUp,
        tone: 'from-rose-500 via-rose-800 to-black',
        who: comeback.p.name,
        player: comeback.p,
        detail: `climbed from #${comeback.from} to #${comeback.to}`,
      })
    }

    // Most "first right answer" bonuses.
    const firsts = new Map<string, number>()
    for (const r of history) for (const [id, pick] of Object.entries(r.picks)) if (pick.first && byId.has(id)) firsts.set(id, (firsts.get(id) ?? 0) + 1)
    const [firstId, firstN] = [...firsts.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (firstId && firstN && firstN >= 2) {
      awards.push({
        id: 'bullet-raja',
        ...named('bullet-raja'),
        icon: Zap,
        tone: 'from-cyan-400 via-blue-700 to-blue-950',
        who: byId.get(firstId)!.name,
        player: byId.get(firstId),
        detail: `first in ${firstN} ${noun}s`,
      })
    }

    // Named a song nobody else got.
    const lone = new Map<string, number>()
    for (const s of stats) {
      if (s.right !== 1 || s.players < 2) continue
      const id = Object.entries(s.r.picks).find(([, p]) => p.correct)?.[0]
      if (id) lone.set(id, (lone.get(id) ?? 0) + 1)
    }
    const [loneId, loneN] = [...lone.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (loneId && loneN && byId.get(loneId)) {
      awards.push({
        id: 'main-hoon-na',
        ...named('main-hoon-na'),
        icon: Shield,
        tone: 'from-sky-500 via-indigo-800 to-indigo-950',
        who: byId.get(loneId)!.name,
        player: byId.get(loneId),
        detail: `only one to get ${loneN} ${noun}${loneN === 1 ? '' : 's'}`,
      })
    }

    // Slowest average right answer — a friendly roast.
    if (players.length >= 3) {
      const slow = players
        .map((p) => {
          const times = history.map((r) => r.picks[p.id]).filter((x) => x?.correct && x.ms !== null).map((x) => x!.ms!)
          return { p, n: times.length, avg: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0 }
        })
        .filter((x) => x.n >= 2)
        .sort((a, b) => b.avg - a.avg)[0]
      if (slow) {
        awards.push({
          id: 'tareekh',
          ...named('tareekh'),
          icon: Hourglass,
          tone: 'from-slate-500 via-slate-700 to-slate-950',
          who: slow.p.name,
          player: slow.p,
          detail: `${(slow.avg / 1000).toFixed(1)}s average answer`,
        })
      }
    }
  }

  if (party && history.length >= 3) {
    // Bold guesses that missed — and the quietest player — get a friendly roast.
    const misses = players
      .map((p) => ({ p, n: history.filter((r) => r.picks[p.id] && r.picks[p.id]!.choice !== null && !r.picks[p.id]!.correct).length }))
      .sort((a, b) => b.n - a.n)
    if (misses[0] && misses[0].n >= 2 && misses[0].n > (misses[1]?.n ?? 0)) {
      awards.push({
        id: 'risk',
        ...named('risk'),
        icon: Dices,
        tone: 'from-lime-500 via-emerald-800 to-black',
        who: misses[0].p.name,
        player: misses[0].p,
        detail: `${misses[0].n} brave wrong answers`,
      })
    }
    const silent = players
      .map((p) => ({ p, n: history.filter((r) => !r.picks[p.id] || r.picks[p.id]!.choice === null).length }))
      .sort((a, b) => b.n - a.n)
    if (silent[0] && silent[0].n >= 2 && silent[0].n > (silent[1]?.n ?? 0)) {
      awards.push({
        id: 'ghost',
        ...named('ghost'),
        icon: Ghost,
        tone: 'from-zinc-400 via-zinc-800 to-black',
        who: silent[0].p.name,
        player: silent[0].p,
        detail: `left ${silent[0].n} unanswered`,
      })
    }
  }

  // Final song right (double points when that's on).
  const last = history[history.length - 1]
  const clutch = last && Object.entries(last.picks).filter(([id, p]) => p.correct && byId.has(id)).sort((a, b) => b[1].points - a[1].points)[0]
  if (clutch && history.length > 1) {
    awards.push({
      id: 'picture',
      ...named('picture'),
      icon: Clapperboard,
      tone: 'from-fuchsia-500 via-purple-800 to-purple-950',
      who: byId.get(clutch[0])!.name,
      player: byId.get(clutch[0]),
      detail: `nailed the final ${noun} (+${clutch[1].points})`,
    })
  }

  // Blend: whose taste the room knew best, and whose stayed a mystery.
  const owned = new Map<string, { right: number; total: number }>()
  for (const s of stats) {
    for (const name of s.r.owners) {
      const o = owned.get(name) ?? { right: 0, total: 0 }
      o.right += s.right
      o.total += s.players
      owned.set(name, o)
    }
  }
  if (owned.size >= 2) {
    const sorted = [...owned.entries()].filter(([, o]) => o.total > 0).sort((a, b) => b[1].right / b[1].total - a[1].right / a[1].total)
    const top = sorted[0]
    const bottom = sorted[sorted.length - 1]
    const find = (name: string) => players.find((p) => p.name === name)
    if (top) {
      awards.push({
        id: 'superstar',
        ...named('superstar'),
        icon: Star,
        tone: 'from-yellow-400 via-orange-600 to-orange-950',
        who: top[0],
        player: find(top[0]),
        detail: `${Math.round((top[1].right / top[1].total) * 100)}% knew their picks`,
      })
    }
    if (bottom && bottom !== top) {
      awards.push({
        id: 'mr-india',
        ...named('mr-india'),
        icon: EyeOff,
        tone: 'from-blue-500 via-slate-800 to-black',
        who: bottom[0],
        player: find(bottom[0]),
        detail: `stumped ${Math.round((1 - bottom[1].right / bottom[1].total) * 100)}% of the room`,
      })
    }
  }

  return awards
}
