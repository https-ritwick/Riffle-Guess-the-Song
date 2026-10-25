import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronDown, Crown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Phase, PublicPlayer } from '../../shared/protocol'
import { PlayerAvatar } from '../components/ui'
import { useTeamLabels } from '../lib/teams'
import { useRoomContext } from './context'
import { TEAMS } from '../../shared/modes'

/** Animates a number from its previous value (score count-up). */
export function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700)
      const eased = 1 - (1 - k) ** 3
      setShown(Math.round(a + (b - a) * eased))
      if (k < 1) raf = requestAnimationFrame(step)
      else from.current = b
    }
    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      from.current = b
    }
  }, [value])
  return <>{shown.toLocaleString()}</>
}

export function rankPlayers(players: PublicPlayer[]): PublicPlayer[] {
  return [...players].sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name))
}

/**
 * Live, ranked leaderboard. Rows glide to their new positions (FLIP) whenever
 * scores change; arrows show who just moved up or down.
 */
export function Scoreboard({ players, you, hostId, phase }: { players: PublicPlayer[]; you: string; hostId: string | null; phase: Phase }) {
  const ranked = rankPlayers(players)
  const { speaking, state } = useRoomContext()
  const labels = useTeamLabels(state.settings)
  const rows = useRef(new Map<string, HTMLLIElement>())
  const lastTops = useRef(new Map<string, number>())
  const lastRanks = useRef(new Map<string, number>())
  const [moves, setMoves] = useState<Record<string, 'up' | 'down'>>({})
  const [expanded, setExpanded] = useState(false)
  const order = ranked.map((p) => p.id).join(',')

  // FLIP: animate each row from where it was to where it is now.
  useLayoutEffect(() => {
    const changed: Record<string, 'up' | 'down'> = {}
    ranked.forEach((p, i) => {
      const prev = lastRanks.current.get(p.id)
      if (prev !== undefined && prev !== i) changed[p.id] = i < prev ? 'up' : 'down'
      lastRanks.current.set(p.id, i)
    })
    for (const [id, el] of rows.current) {
      const top = el.getBoundingClientRect().top
      const before = lastTops.current.get(id)
      if (before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'translateY(0)' }], { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
      }
      lastTops.current.set(id, top)
    }
    if (Object.keys(changed).length) {
      setMoves((m) => ({ ...m, ...changed }))
      const t = window.setTimeout(() => setMoves({}), 2500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  const visible = expanded ? ranked : ranked.filter((p, i) => i < 5 || p.id === you)

  return (
    <section aria-label="Live leaderboard" className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-white">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-400" />
          </span>
          Live leaderboard
        </h2>
        <span className="text-xs text-gray-400">{players.filter((p) => p.connected).length} playing</span>
      </div>
      <ol className="space-y-1.5" data-testid="scoreboard">
        {visible.map((p) => {
          const rank = ranked.indexOf(p)
          const move = moves[p.id]
          const showPoints = p.roundPoints !== null && (phase === 'question' || phase === 'reveal')
          return (
            <li
              key={p.id}
              ref={(el) => {
                if (el) rows.current.set(p.id, el)
                else rows.current.delete(p.id)
              }}
              className={clsx(
                'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                p.id === you ? 'bg-brand-500/10 ring-1 ring-brand-500/40' : 'bg-white/[0.04]',
                !p.connected && 'opacity-50',
              )}
              data-player={p.name}
            >
              <span
                className={clsx(
                  'w-5 text-center text-sm font-extrabold tabular-nums',
                  rank === 0 ? 'text-amber-300' : rank === 1 ? 'text-gray-300' : rank === 2 ? 'text-amber-600' : 'text-gray-500',
                )}
              >
                {rank + 1}
              </span>
              <span className="relative">
                <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" speaking={!!speaking?.has(p.id)} />
                {rank === 0 && p.score > 0 && <Crown className="absolute -top-2.5 -right-1.5 h-3.5 w-3.5 rotate-12 text-amber-300" />}
                {showPoints && p.first && (
                  <span className="absolute -right-1.5 -bottom-1 flex h-4 w-4 animate-pop items-center justify-center rounded-full bg-amber-400 text-[9px] ring-2 ring-gray-950" title="First right answer">
                    ⚡
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  {p.team && <span className={clsx('h-2 w-2 shrink-0 rounded-full', TEAMS[p.team].bar)} title={labels[p.team].name} />}
                  <span className="truncate text-sm font-semibold text-white">{p.name}</span>
                  {p.id === hostId && <span className="text-[10px]">👑</span>}
                  {p.streak >= 2 && <span className="text-xs text-orange-300">🔥{p.streak}</span>}
                </span>
                <span className="block text-[11px] text-gray-500">
                  {phase === 'question' && !p.answered && p.connected && <span className="animate-pulse">thinking…</span>}
                  {(phase === 'question' || phase === 'reveal') && p.answerMs !== null && <span>answered in {(p.answerMs / 1000).toFixed(1)}s</span>}
                  {phase !== 'question' && phase !== 'reveal' && `${p.correct} correct`}
                </span>
              </span>
              {move && (move === 'up' ? <ArrowUp className="h-3.5 w-3.5 text-brand-400" /> : <ArrowDown className="h-3.5 w-3.5 text-red-400" />)}
              {showPoints && (
                <span className={clsx('animate-pop rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums', p.roundPoints! > 0 ? 'bg-brand-500/15 text-brand-300' : 'bg-red-500/15 text-red-300')}>
                  {p.roundPoints! > 0 ? `+${p.roundPoints}` : p.roundPoints! < 0 ? `−${-p.roundPoints!}` : '✗'}
                </span>
              )}
              <span className="w-14 text-right text-sm font-bold text-white tabular-nums">
                <AnimatedNumber value={p.score} />
              </span>
            </li>
          )
        })}
      </ol>
      {ranked.length > visible.length || expanded ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 flex w-full items-center justify-center gap-1 text-xs font-semibold text-gray-400 hover:text-white">
          {expanded ? 'Show less' : `Show all ${ranked.length}`}
          <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      ) : null}
    </section>
  )
}
