// Numbers and awards for the results screen and the recap, all derived from the
// round history the server sends at the end of a game.
import type { LucideIcon } from 'lucide-react'
import { Bike, Clapperboard, Crown, EyeOff, Hourglass, Shield, Star, Target, TrendingUp, Zap } from 'lucide-react'
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

export function computeAwards(players: PublicPlayer[], history: RoundSummary[], stats: RoundStat[], solo: boolean): Award[] {
  const awards: Award[] = []
  const byId = new Map(players.map((p) => [p.id, p]))
  const party = !solo && players.length > 1

  const fastest = stats.filter((s) => s.fastest).sort((a, b) => a.fastest!.ms - b.fastest!.ms)[0]
  if (fastest?.fastest) {
    awards.push({
      id: 'dhoom',
      title: 'Dhoom Machale',
      line: 'Fastest answer of the night',
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
      title: 'Don',
      line: '“Don ko pakadna mushkil hi nahi, namumkin hai”',
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
      title: 'Mr. Perfectionist',
      line: 'Barely missed a beat',
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
        title: 'Baazigar',
        line: '“Haar kar jeetne waale ko Baazigar kehte hain”',
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
        title: 'Bullet Raja',
        line: 'First to the right answer, again and again',
        icon: Zap,
        tone: 'from-cyan-400 via-blue-700 to-blue-950',
        who: byId.get(firstId)!.name,
        player: byId.get(firstId),
        detail: `first in ${firstN} songs`,
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
        title: 'Main Hoon Na',
        line: 'Came through when nobody else could',
        icon: Shield,
        tone: 'from-sky-500 via-indigo-800 to-indigo-950',
        who: byId.get(loneId)!.name,
        player: byId.get(loneId),
        detail: `only one to get ${loneN} song${loneN === 1 ? '' : 's'}`,
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
          title: 'Tareekh Pe Tareekh',
          line: 'Got there… eventually',
          icon: Hourglass,
          tone: 'from-slate-500 via-slate-700 to-slate-950',
          who: slow.p.name,
          player: slow.p,
          detail: `${(slow.avg / 1000).toFixed(1)}s average answer`,
        })
      }
    }
  }

  // Final song right (double points when that's on).
  const last = history[history.length - 1]
  const clutch = last && Object.entries(last.picks).filter(([id, p]) => p.correct && byId.has(id)).sort((a, b) => b[1].points - a[1].points)[0]
  if (clutch && history.length > 1) {
    awards.push({
      id: 'picture',
      title: 'Picture Abhi Baaki Hai',
      line: 'Saved the best for the last song',
      icon: Clapperboard,
      tone: 'from-fuchsia-500 via-purple-800 to-purple-950',
      who: byId.get(clutch[0])!.name,
      player: byId.get(clutch[0]),
      detail: `nailed the final song (+${clutch[1].points})`,
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
        title: 'Superstar',
        line: 'Everyone knew their songs',
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
        title: 'Mr. India',
        line: 'Their songs stayed invisible',
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
