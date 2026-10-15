import clsx from 'clsx'
import { ArrowRight, CalendarDays, Crown, Loader2, Swords, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import type { GameKind } from '../../shared/challenges'
import { dailyNumber, msUntilNextDaily, type DailyBoard } from '../../shared/daily'
import { GameKindSchema } from '../../shared/protocol'
import { api } from '../lib/api'
import { player } from '../lib/audio'
import { BADGES, currentDayStreak, levelFor, useProgress } from '../lib/progress'
import { gameMode } from '../lib/source'
import { useNow } from '../lib/useNow'

const wallClock = () => Date.now()

async function createRoom(body: { solo?: boolean; daily?: boolean; game?: GameKind }): Promise<string> {
  const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = (await res.json().catch(() => ({}))) as { code?: string; error?: string }
  if (!res.ok || !data.code) throw new Error(data.error ?? 'Could not create a room.')
  return data.code
}

function Countdown() {
  const now = useNow(wallClock, 1000)
  const left = msUntilNextDaily(now)
  const h = Math.floor(left / 3_600_000)
  const m = Math.floor((left % 3_600_000) / 60_000)
  const sec = Math.floor((left % 60_000) / 1000)
  return (
    <span className="font-mono tabular-nums">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  )
}

/** "Aaj Ka Challenge": today's five questions, the same for everyone, with a leaderboard. */
export function DailyCard({ highlight }: { highlight?: boolean }) {
  const navigate = useNavigate()
  const progress = useProgress()
  const day = dailyNumber()
  const mine = progress.dailies[String(day)]
  const [board, setBoard] = useState<DailyBoard | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mode = gameMode(board?.game ?? 'dialogue')

  useEffect(() => {
    api<DailyBoard>(`/api/daily${mine ? `?score=${mine.score}` : ''}`)
      .then(setBoard)
      .catch(() => undefined)
  }, [mine])

  const play = async () => {
    player.unlock()
    setBusy(true)
    setError(null)
    try {
      navigate(`/r/${await createRoom({ daily: true })}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the challenge.')
      setBusy(false)
    }
  }

  return (
    <section
      id="daily"
      aria-labelledby="daily-title"
      className={clsx('ring-marquee glass relative overflow-hidden rounded-3xl p-5 sm:p-6', highlight && 'shadow-2xl shadow-brand-500/30')}
      data-testid="daily-card"
    >
      <div className={clsx('pointer-events-none absolute inset-0 bg-linear-to-br opacity-70', mode.tone)} />
      <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.25em] text-brand-200 uppercase">
            <CalendarDays className="h-4 w-4" /> Aaj Ka Challenge · #{day}
          </p>
          <h2 id="daily-title" className="mt-1 text-3xl font-black text-white">
            {mode.emoji} {mode.title}
          </h2>
          {mine ? (
            <>
              <p className="mt-2 text-gray-200">
                You scored <span className="font-black text-white">{mine.score.toLocaleString('en-IN')}</span> ({mine.correct}/{mine.total})
                {board?.rank ? ` · #${board.rank} of ${Math.max(board.players, board.rank)} today` : ''}
              </p>
              <p className="mt-2 font-mono text-2xl tracking-[0.15em]">{mine.grid}</p>
              <p className="mt-3 text-sm text-gray-300">
                Next challenge in <Countdown />
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-gray-200">5 questions, the same for everyone in India today. One shot — make it count.</p>
              <button
                type="button"
                onClick={play}
                disabled={busy}
                data-testid="daily-play"
                className="mt-4 inline-flex h-12 items-center gap-2 rounded-2xl bg-linear-to-r from-brand-300 via-brand-500 to-rose-500 px-6 font-black text-black shadow-lg shadow-rose-500/30 transition hover:-translate-y-0.5 disabled:opacity-70"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />} Play today’s challenge
              </button>
              {board && board.players > 0 && <p className="mt-2 text-sm text-gray-300">{board.players.toLocaleString('en-IN')} played today</p>}
              {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
            </>
          )}
        </div>
        <div className="rounded-2xl bg-black/35 p-3 ring-1 ring-white/10">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-white">
            <Trophy className="h-4 w-4 text-brand-300" /> Today’s top scores
          </p>
          {board && board.top.length > 0 ? (
            <ol className="space-y-1">
              {board.top.slice(0, 5).map((r, i) => (
                <li key={`${r.name}${i}`} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-100">{r.name}</span>
                  <span className="font-bold text-brand-200 tabular-nums">{r.score.toLocaleString('en-IN')}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-400">{board ? 'Nobody yet — be the first on the board!' : 'Loading…'}</p>
          )}
        </div>
      </div>
    </section>
  )
}

/** Your career on this device: level, XP, day streak and badges. */
export function CareerCard() {
  const p = useProgress()
  const { level, next, into, span } = levelFor(p.xp)
  const streak = currentDayStreak(p)
  if (p.games === 0) return null
  return (
    <section aria-label="Your career" className="glass rounded-3xl p-5" data-testid="career-card">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-300 to-rose-500 text-3xl shadow-lg shadow-rose-500/30">{level.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.2em] text-gray-400 uppercase">Level {level.n}</p>
          <p className="text-xl font-black text-white">{level.title}</p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-linear-to-r from-brand-300 to-rose-500" style={{ width: `${Math.max(3, (into / span) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-400">{next ? `${next.xp - p.xp} XP to ${next.title}` : 'Top of the poster!'}</p>
        </div>
        <div className="flex gap-2 text-center">
          <div className="rounded-xl bg-white/[0.05] px-3 py-2">
            <p className={clsx('text-xl font-black', streak ? 'text-orange-300' : 'text-gray-500')}>🔥 {streak}</p>
            <p className="text-[11px] text-gray-400">day streak</p>
          </div>
          <div className="rounded-xl bg-white/[0.05] px-3 py-2">
            <p className="text-xl font-black text-white">{p.games}</p>
            <p className="text-[11px] text-gray-400">games</p>
          </div>
          <div className="rounded-xl bg-white/[0.05] px-3 py-2">
            <p className="text-xl font-black text-white">{p.wins}</p>
            <p className="text-[11px] text-gray-400">wins</p>
          </div>
        </div>
      </div>
      {streak > 0 && !p.dailies[String(dailyNumber())] && p.lastDay !== dailyNumber() && (
        <p className="mt-3 rounded-xl bg-orange-500/10 px-3 py-2 text-sm font-semibold text-orange-200 ring-1 ring-orange-400/20">
          🔥 Play one game today to keep your {streak}-day streak alive!
        </p>
      )}
      <div className="mt-4">
        <p className="mb-2 text-sm font-semibold text-white">
          Badges <span className="font-normal text-gray-400">· {p.badges.length}/{BADGES.length}</span>
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {BADGES.map((b) => {
            const got = p.badges.includes(b.id)
            return (
              <li
                key={b.id}
                title={`${b.title} — ${b.how}`}
                className={clsx('flex h-10 w-10 items-center justify-center rounded-xl text-xl ring-1', got ? 'bg-brand-400/15 ring-brand-300/30' : 'bg-white/[0.03] opacity-40 grayscale ring-white/5')}
              >
                <span aria-label={`${b.title}${got ? '' : ' (locked)'}`}>{b.emoji}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/** Someone shared a "beat my score" link: show the challenge and start a solo run of that mode. */
export function BeatBanner({ params }: { params: URLSearchParams }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const score = Number(params.get('beat'))
  const by = (params.get('by') ?? '').replace(/[^\p{L}\p{N} ._'-]/gu, '').slice(0, 20) || 'A friend'
  const game = GameKindSchema.safeParse(params.get('g'))
  if (!Number.isFinite(score) || score <= 0 || score > 1_000_000 || !game.success) return null
  const mode = gameMode(game.data)
  return (
    <div className="ring-marquee glass relative mb-8 overflow-hidden rounded-3xl p-5 text-left" data-testid="beat-banner">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-brand-500/25 via-transparent to-rose-500/25" />
      <div className="relative flex flex-wrap items-center gap-4">
        <Swords className="h-10 w-10 shrink-0 text-brand-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-300">You’ve been challenged!</p>
          <p className="text-lg font-black text-white">
            {by} scored {score.toLocaleString('en-IN')} in {mode.emoji} {mode.title}. Think you can beat that?
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            player.unlock()
            setBusy(true)
            try {
              navigate(`/r/${await createRoom({ solo: true, game: game.data })}`)
            } catch {
              setBusy(false)
            }
          }}
          className="inline-flex h-12 items-center gap-2 rounded-2xl bg-linear-to-r from-brand-300 via-brand-500 to-rose-500 px-5 font-black text-black"
          data-testid="beat-accept"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Crown className="h-5 w-5" />} Accept the challenge
        </button>
      </div>
    </div>
  )
}
