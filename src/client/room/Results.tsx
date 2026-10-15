import clsx from 'clsx'
import { Check, Clapperboard, Crown, ExternalLink, Loader2, Pause, Play, RotateCcw, Settings2, Share2, Trophy, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { BRAND } from '../../shared/brand'
import type { PublicPlayer } from '../../shared/protocol'
import { useToast } from '../components/Toasts'
import { Button, PlayerAvatar } from '../components/ui'
import { player as audio, usePlayer } from '../lib/audio'
import { playSfx } from '../lib/sfx'
import { playedKey } from '../../shared/questions'
import { api } from '../lib/api'
import { rememberPlayed } from '../lib/played'
import { levelFor, recordGame, type ProgressUpdate } from '../lib/progress'
import { useNow } from '../lib/useNow'
import { msUntilNextDaily, type DailyBoard } from '../../shared/daily'
import { describeGame, difficultyLabel, gameMode } from '../lib/source'
import { load, save } from '../lib/storage'
import { useRoomContext } from './context'
import { ReactionBar } from './Reactions'
import { rankPlayers } from './Scoreboard'
import { AwardCard } from './results/AwardCard'
import { buildSlides, Recap } from './results/Recap'
import { ShareSheet, type ShareData } from './results/Share'
import { biggestComeback, computeAwards, emojiGrid, roundStats, scoreMessage, type RoundStat } from './results/stats'
import { useStartGame } from './useStartGame'

const CONFETTI_COLORS = ['#ffc44d', '#ff6a3d', '#e8336d', '#f59e0b', '#22c55e', '#ffffff']

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.4 + Math.random() * 1.6,
        drift: (Math.random() - 0.5) * 160,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
      })),
    [],
  )
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={
            {
              left: `${p.left}%`,
              backgroundColor: p.color,
              transform: `rotate(${p.rotate}deg)`,
              '--delay': `${p.delay}s`,
              '--dur': `${p.dur}s`,
              '--drift': `${p.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results page pieces

/** The wall of every album cover from this game, slowly drifting. */
function AlbumWall({ covers }: { covers: string[] }) {
  const tiles = covers.length ? Array.from({ length: Math.max(24, covers.length) }, (_, i) => covers[i % covers.length]!) : []
  if (!tiles.length) return <div className="absolute inset-0 bg-linear-to-br from-fuchsia-900/50 via-gray-950 to-amber-900/40" />
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -inset-x-1/4 -top-1/4 rotate-[-8deg]">
        <div className="album-wall grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {[...tiles, ...tiles].map((src, i) => (
            <img key={i} src={src} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-linear-to-r from-[#0d0716] via-[#0d0716]/85 to-[#0d0716]/40" />
      <div className="absolute inset-0 bg-linear-to-t from-[#0d0716] via-transparent to-[#0d0716]/40" />
    </div>
  )
}

function Ring({ value, label, children }: { value: number; label: string; children: ReactNode }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-black/30 p-3 backdrop-blur">
      <span className="relative inline-flex h-16 w-16 items-center justify-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-white/10" />
          <circle cx="32" cy="32" r={r} fill="none" stroke="url(#res-g)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value)} className="transition-[stroke-dashoffset] duration-1000" />
          <defs>
            <linearGradient id="res-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffc44d" />
              <stop offset="1" stopColor="#e8336d" />
            </linearGradient>
          </defs>
        </svg>
        <span className="relative text-sm font-extrabold text-white tabular-nums">{children}</span>
      </span>
      <span className="mt-1.5 text-xs text-gray-400">{label}</span>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/30 p-3 text-center backdrop-blur">
      <span className="text-2xl font-extrabold text-white tabular-nums">{value}</span>
      <span className="mt-1 text-xs text-gray-400">{label}</span>
    </div>
  )
}

function Podium({ ranked }: { ranked: PublicPlayer[] }) {
  const slots = [ranked[1], ranked[0], ranked[2]]
  const heights = ['h-24', 'h-32', 'h-16']
  const medals = ['🥈', '🥇', '🥉']
  const glow = ['from-gray-300/30', 'from-amber-300/40', 'from-amber-700/30']
  return (
    <div className="flex items-end justify-center gap-3 rounded-3xl border border-white/10 bg-white/[0.03] px-4 pt-8 sm:gap-6" aria-label="Podium">
      {slots.map((p, i) =>
        p ? (
          <div key={p.id} className="flex w-24 animate-pop flex-col items-center sm:w-32" style={{ animationDelay: `${[0.3, 0.6, 0][i]}s` }}>
            <span className="relative">
              {i === 1 && <Crown className="absolute -top-5 left-1/2 h-6 w-6 -translate-x-1/2 text-amber-300" />}
              <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="lg" />
            </span>
            <p className="mt-2 w-full truncate text-center font-bold text-white">{p.name}</p>
            <p className="text-sm text-brand-300 tabular-nums">{p.score.toLocaleString()}</p>
            <div className={clsx('mt-2 flex w-full items-start justify-center rounded-t-2xl border border-b-0 border-white/10 bg-linear-to-b to-transparent pt-2 text-3xl', heights[i], glow[i])}>{medals[i]}</div>
          </div>
        ) : (
          <div key={i} className="w-24 sm:w-32" />
        ),
      )}
    </div>
  )
}

function TrackRow({ s, n, you, solo }: { s: RoundStat; n: number; you: string; solo: boolean }) {
  const { r } = s
  const { playing } = usePlayer()
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!playing) setActive(false)
  }, [playing])
  const pick = r.picks[you]
  const answered = pick && pick.choice !== null
  const playable = !!r.track.preview
  const c = r.challenge
  return (
    <li className={clsx('group flex items-center gap-3 rounded-2xl p-2.5 transition-colors', active ? 'bg-white/10' : 'hover:bg-white/[0.04]')}>
      <span className="w-6 text-right text-sm font-bold text-gray-500 tabular-nums">{n}</span>
      <button
        type="button"
        disabled={!playable}
        onClick={() => {
          audio.unlock()
          if (active) {
            audio.stop()
            setActive(false)
          } else {
            audio.play(r.track.preview, 0)
            setActive(true)
          }
        }}
        aria-label={active ? `Pause ${r.track.title}` : `Play ${r.track.title}`}
        className="relative h-14 w-14 shrink-0"
      >
        <span className={clsx('vinyl absolute inset-0 rounded-full transition-transform duration-500', active ? 'translate-x-5 animate-[spin_2.4s_linear_infinite]' : 'translate-x-0')} />
        <span className="relative block h-14 w-14 overflow-hidden rounded-lg bg-linear-to-br from-brand-500/30 to-rose-600/30 shadow-lg ring-1 ring-white/10">
          {r.track.artwork ? (
            <img src={r.track.artwork} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full items-center justify-center text-2xl">{c ? (c.kind === 'emoji' ? '😎' : c.kind === 'actor' ? '🌟' : '🎬') : '🎵'}</span>
          )}
          <span className={clsx('absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity', !playable ? 'hidden' : active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
            {active ? <Pause className="h-5 w-5 fill-white text-white" /> : <Play className="h-5 w-5 fill-white text-white" />}
          </span>
        </span>
      </button>
      <div className={clsx('min-w-0 flex-1', active && 'pl-4')}>
        <p className="truncate font-semibold text-white">{r.track.title}</p>
        <p className="truncate text-sm text-brand-300">{r.track.artist}</p>
        {c && c.kind !== 'actor' && <p className={clsx('truncate text-sm text-gray-400', c.kind !== 'emoji' && 'italic')}>{c.kind === 'emoji' ? c.prompt : `“${c.prompt}”`}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
          {!solo && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-linear-to-r from-emerald-400 to-brand-400" style={{ width: `${s.acc * 100}%` }} />
              </span>
              {s.right}/{s.players}
            </span>
          )}
          {s.fastest && !solo && (
            <span className="inline-flex items-center gap-1">
              ⚡ {s.fastest.p.name} {(s.fastest.ms / 1000).toFixed(1)}s
            </span>
          )}
          {r.owners.length > 0 && <span className="text-emerald-300">✨ {r.owners.join(' & ')}</span>}
          {answered && !pick.correct && <span className="truncate text-gray-500">You said: {r.options[pick.choice!]}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {pick?.correct ? (
          <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-300">
            {pick.first && <span title="First right answer">⚡</span>}
            <Check className="h-4 w-4" />+{pick.points}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-400">
            <X className="h-4 w-4" />
            {answered ? (pick.points < 0 ? `−${-pick.points}` : 'Wrong') : 'No answer'}
          </span>
        )}
        {r.track.link && (
          <a href={r.track.link} target="_blank" rel="noreferrer noopener" aria-label={`Open ${r.track.title}`} className="text-gray-500 hover:text-white">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </li>
  )
}

/** What this game earned: XP, level progress, day streak and new badges. */
function ProgressCard({ update }: { update: ProgressUpdate }) {
  const after = levelFor(update.after)
  const before = levelFor(update.before)
  const [shown, setShown] = useState(before.level.n === after.level.n ? before.into / before.span : 0)
  useEffect(() => {
    const t = window.setTimeout(() => setShown(after.into / after.span), 400)
    return () => clearTimeout(t)
  }, [after.into, after.span])
  const total = update.after - update.before
  return (
    <div className="ring-marquee glass relative overflow-hidden rounded-3xl p-5" data-testid="progress-card">
      {update.levelUp && <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-brand-400/25 via-transparent to-rose-500/25" />}
      <div className="relative">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-bold tracking-[0.25em] text-brand-200 uppercase">Your career</p>
          <p className="rounded-full bg-brand-400 px-2.5 py-0.5 text-sm font-black text-black tabular-nums">+{total} XP</p>
        </div>
        {update.levelUp ? (
          <p className="mb-2 animate-pop text-2xl font-black text-white">
            {update.levelUp.emoji} Level up! You’re now a <span className="bg-linear-to-r from-brand-200 to-rose-300 bg-clip-text text-transparent">{update.levelUp.title}</span>
          </p>
        ) : (
          <p className="mb-2 text-lg font-extrabold text-white">
            {after.level.emoji} {after.level.title} <span className="text-sm font-semibold text-gray-400">· Level {after.level.n}</span>
          </p>
        )}
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-linear-to-r from-brand-300 via-brand-500 to-rose-500 transition-[width] duration-1000 ease-out" style={{ width: `${Math.max(3, shown * 100)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-gray-400">{after.next ? `${after.next.xp - update.after} XP to ${after.next.emoji} ${after.next.title}` : 'Top of the poster!'}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {update.gained.map((g) => (
            <li key={g.label} className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-gray-200">
              {g.label} <span className="font-bold text-brand-200">+{g.xp}</span>
            </li>
          ))}
        </ul>
        {update.dayStreak >= 2 && <p className="mt-3 text-sm font-bold text-orange-300">🔥 {update.dayStreak}-day streak — come back tomorrow to keep it alive!</p>}
        {update.newBadges.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-3">
            <p className="mb-2 text-sm font-bold text-white">New badge{update.newBadges.length > 1 ? 's' : ''} unlocked</p>
            <ul className="flex flex-wrap gap-2">
              {update.newBadges.map((b, i) => (
                <li key={b.id} className="rise-in flex items-center gap-2 rounded-xl bg-brand-400/15 px-3 py-2 ring-1 ring-brand-300/30" style={{ animationDelay: `${0.3 + i * 0.15}s` }}>
                  <span className="text-2xl">{b.emoji}</span>
                  <span>
                    <span className="block text-sm font-bold text-white">{b.title}</span>
                    <span className="block text-xs text-gray-300">{b.how}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

const wallClock = () => Date.now()

function NextDaily() {
  const now = useNow(wallClock, 1000)
  const left = msUntilNextDaily(now)
  const hh = String(Math.floor(left / 3_600_000)).padStart(2, '0')
  const mm = String(Math.floor((left % 3_600_000) / 60_000)).padStart(2, '0')
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')
  return (
    <div className="rounded-2xl bg-white/[0.04] p-4 text-center ring-1 ring-white/10">
      <p className="text-sm text-gray-300">Next daily challenge in</p>
      <p className="font-mono text-3xl font-black text-white tabular-nums">
        {hh}:{mm}:{ss}
      </p>
    </div>
  )
}

const recordedGames = new Set<string>()

/** The game as an album: a cover collage, then Side A and Side B. */
function GameAlbum({ stats, you, solo, title, players, noun }: { stats: RoundStat[]; you: string; solo: boolean; title: string; players: PublicPlayer[]; noun: string }) {
  const half = Math.ceil(stats.length / 2)
  const sides = stats.length > 4 ? [stats.slice(0, half), stats.slice(half)] : [stats]
  const covers = [...new Set(stats.map((s) => s.r.track.artwork).filter(Boolean))].slice(0, 4)
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]" aria-label="Your results">
      <div className="flex items-center gap-4 border-b border-white/5 bg-linear-to-r from-rose-600/20 via-transparent to-brand-500/10 p-5">
        <div className="grid h-20 w-20 shrink-0 grid-cols-2 overflow-hidden rounded-xl shadow-xl ring-1 ring-white/10">
          {covers.length === 4 ? covers.map((c) => <img key={c} src={c} alt="" className="h-full w-full object-cover" />) : <span className="col-span-2 row-span-2 bg-linear-to-br from-brand-300 via-brand-500 to-rose-500" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.25em] text-gray-400 uppercase">{BRAND.name} sessions · {date}</p>
          <h3 className="truncate text-2xl font-extrabold text-white">{title}</h3>
          <p className="text-sm text-gray-400">
            {stats.length} {noun === 'song' ? 'tracks' : 'questions'}
            {!solo && ` · played by ${players.map((p) => p.name).join(', ')}`}
          </p>
        </div>
      </div>
      {stats.length === 0 ? (
        <p className="p-5 text-sm text-gray-400">No songs were played.</p>
      ) : (
        <div className={clsx('grid gap-x-6 p-3 sm:p-4', sides.length > 1 && 'xl:grid-cols-2')}>
          {sides.map((side, si) => (
            <div key={si}>
              {sides.length > 1 && <p className="px-2.5 pt-2 pb-1 text-xs font-black tracking-[0.3em] text-gray-500 uppercase">Side {si === 0 ? 'A' : 'B'}</p>}
              <ul>
                {side.map((s) => (
                  <TrackRow key={s.r.index} s={s} n={s.r.index + 1} you={you} solo={solo} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {stats.some((x) => x.r.track.preview) && (
        <p className="px-5 pb-4 text-xs text-gray-500">{noun === 'song' ? 'Tap a cover to replay its hook.' : 'Tap a song’s cover to play it.'}</p>
      )}
    </section>
  )
}

const shownRecaps = new Set<string>()

export function Results() {
  const { state, you, isHost, send, me } = useRoomContext()
  const toast = useToast()
  const { start, busy } = useStartGame()
  const history = useMemo(() => state.history ?? [], [state.history])
  const ranked = rankPlayers(state.players)
  const host = state.players.find((p) => p.id === state.hostId)
  const myCorrect = history.filter((r) => r.picks[you]?.correct).length
  const myRank = ranked.findIndex((p) => p.id === you)
  const stats = useMemo(() => roundStats(history, state.players), [history, state.players])
  const challenge = state.settings.game !== 'songs'
  const noun = challenge ? 'question' : 'song'
  const awards = useMemo(
    () => computeAwards(state.players, history, stats, state.solo, state.awardNames, noun),
    [state.players, history, stats, state.solo, state.awardNames, noun],
  )
  const source = describeGame(state.settings)
  const covers = useMemo(() => [...new Set(history.map((r) => r.track.artwork).filter(Boolean))], [history])
  const myScore = me?.score ?? 0
  const answeredMs = history.map((r) => r.picks[you]).filter((p) => p?.correct && p.ms !== null).map((p) => p!.ms!)
  const avgMs = answeredMs.length ? answeredMs.reduce((a, b) => a + b, 0) / answeredMs.length : null

  // Solo personal best per music source and difficulty.
  const [best] = useState(() => {
    const key = `best:${source.title}:${state.settings.difficulty}`
    const prev = Number(load(key) ?? 0) || 0
    const isNew = state.solo && history.length > 0 && myScore > prev
    if (isNew) save(key, String(myScore))
    return { best: Math.max(prev, isNew ? myScore : 0), isNew }
  })

  const recapKey = `${state.code}:${history.length}:${history[0]?.track.id ?? ''}:${history[history.length - 1]?.track.id ?? ''}`
  const [recap, setRecap] = useState(() => history.length > 0 && !shownRecaps.has(recapKey))
  const comeback = useMemo(() => biggestComeback(history, ranked), [history, ranked])
  const slides = useMemo(
    () => buildSlides({ stats, ranked, you, me, solo: state.solo, sourceTitle: source.title, myScore, myRight: myCorrect, avgMs, best, awards, comeback, noun }),
    // Built once per game; live score updates after the game don't need to rebuild the story.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats, you, state.solo, source.title, myScore, myCorrect, best, awards, noun],
  )

  // Remember what was played, so this device's next games (in any room) start with new ones.
  useEffect(() => {
    if (history.length) rememberPlayed(history.map((r) => playedKey(r.track, r.mode)))
    // Once per game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapKey])

  const grid = useMemo(
    () => history.map((r): 'right' | 'wrong' | 'miss' => (r.picks[you]?.correct ? 'right' : r.picks[you] && r.picks[you]!.choice !== null ? 'wrong' : 'miss')),
    [history, you],
  )

  // XP, levels, streaks and badges: counted once per finished game.
  const [progress, setProgress] = useState<ProgressUpdate | null>(null)
  useEffect(() => {
    if (!history.length || recordedGames.has(recapKey)) return
    recordedGames.add(recapKey)
    const fastest = Math.min(...history.map((r) => r.picks[you]).filter((p) => p?.correct && p.ms !== null).map((p) => p!.ms!))
    const update = recordGame({
      mode: state.settings.game,
      score: myScore,
      correct: myCorrect,
      total: history.length,
      rank: myRank + 1,
      players: ranked.length,
      bestStreak: me?.bestStreak ?? 0,
      fastestMs: Number.isFinite(fastest) ? fastest : null,
      daily: state.daily,
      grid: grid.map((g) => (g === 'right' ? '🟩' : g === 'wrong' ? '🟥' : '⬛')).join(''),
    })
    // The career card celebrates level-ups (a toast would sit on top of the recap's Skip button).
    setProgress(update)
    // Once per game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recapKey])

  // Daily challenge: where today's score ranks (it's saved a moment after the game ends).
  const [dailyRank, setDailyRank] = useState<{ rank: number; of: number } | null>(null)
  useEffect(() => {
    if (!state.daily || !history.length) return
    const t = window.setTimeout(() => {
      api<DailyBoard>(`/api/daily?score=${myScore}`)
        .then((b) => b.rank && setDailyRank({ rank: b.rank, of: Math.max(b.players, b.rank) }))
        .catch(() => undefined)
    }, 1500)
    return () => clearTimeout(t)
  }, [state.daily, history.length, myScore])

  const [sharing, setSharing] = useState(false)
  const shareData = useMemo<ShareData>(() => {
    const lvl = levelFor(progress?.after ?? 0).level
    const mine = awards.find((a) => a.player?.id === you) ?? awards[0]
    const mode = gameMode(state.settings.game)
    const name = me?.name ?? 'I'
    const challengeUrl = state.daily
      ? `${location.origin}/?daily=1`
      : `${location.origin}/?beat=${myScore}&by=${encodeURIComponent(name)}&g=${state.settings.game}`
    return {
      modeEmoji: mode.emoji,
      modeTitle: challenge ? mode.title : source.title,
      name,
      score: myScore,
      correct: myCorrect,
      total: history.length,
      rank: state.solo ? null : myRank + 1,
      players: ranked.length,
      grid,
      levelTitle: lvl.title,
      levelEmoji: lvl.emoji,
      award: mine ? { title: mine.title, who: mine.who } : null,
      daily: state.daily,
      dailyRank,
      covers,
      challengeUrl,
    }
  }, [progress, awards, you, state.settings.game, state.daily, state.solo, me, myScore, myCorrect, history.length, myRank, ranked.length, grid, dailyRank, covers, challenge, source.title])
  const closeRecap = useCallback(() => {
    shownRecaps.add(recapKey)
    setRecap(false)
    audio.stop()
    playSfx('win')
  }, [recapKey])

  // Without a recap (e.g. the game ended before any song), let the last bars ring out briefly.
  const hadRecap = useRef(recap)
  useEffect(() => {
    if (hadRecap.current) return
    const t = window.setTimeout(() => audio.stop(), 1500)
    return () => clearTimeout(t)
  }, [])

  const share = () => setSharing(true)

  const winnerLine = ranked[0] && ranked.length > 1 ? (ranked[0].id === you ? 'You win!' : `${ranked[0].name} wins!`) : null

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12">
      {recap && slides.length > 0 && <Recap slides={slides} onClose={closeRecap} />}
      {sharing && <ShareSheet data={shareData} onClose={() => setSharing(false)} />}
      {!recap && history.length > 0 && <Confetti />}
      {state.notice && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {state.notice}
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl border border-white/10">
        <AlbumWall covers={covers} />
        <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="rise-in">
            <p className="mb-2 text-xs font-bold tracking-[0.3em] text-brand-300 uppercase">
              {source.title} · {difficultyLabel(state.settings.difficulty)}
              {state.solo && ' · Solo'}
            </p>
            <h2 className="mb-3 text-4xl font-black text-white sm:text-5xl">Game Complete! 🎉</h2>
            {winnerLine && (
              <p className="mb-2 inline-flex items-center gap-2 text-xl text-white">
                <Crown className="h-5 w-5 text-amber-300" /> <span className="font-extrabold">{winnerLine}</span>
              </p>
            )}
            <p className="text-lg text-gray-300">
              Final Score:{' '}
              <span className="bg-linear-to-r from-brand-200 to-rose-300 bg-clip-text text-4xl font-black text-transparent tabular-nums" data-testid="final-score">
                {myScore.toLocaleString()}
              </span>
              {ranked.length > 1 && myRank >= 0 && <span className="ml-2 text-base text-gray-400">· #{myRank + 1} of {ranked.length}</span>}
            </p>
            <p className="mt-2 text-gray-200">
              You got{' '}
              <span className="font-bold text-white">
                {myCorrect}/{history.length}
              </span>{' '}
              {noun}s right.
            </p>
            <p className="text-gray-400">{scoreMessage(myCorrect, history.length)}</p>
            {state.solo && (best.isNew ? <p className="mt-3 inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-sm font-bold text-amber-200">🏆 New personal best!</p> : best.best > 0 && <p className="mt-3 text-sm text-gray-400">Personal best: {best.best.toLocaleString()}</p>)}
            {state.daily && (
              <p className="mt-3 inline-flex rounded-full bg-brand-400/15 px-3 py-1 text-sm font-bold text-brand-100">
                📅 Daily #{state.daily}
                {dailyRank ? ` · #${dailyRank.rank} of ${dailyRank.of} players today` : ''}
              </p>
            )}
            <p className="mt-4 font-mono text-2xl tracking-[0.15em]" aria-label="Your song-by-song results">
              {emojiGrid(history, you)}
            </p>
            {history.length > 0 && (
              <button
                type="button"
                onClick={share}
                data-testid="share-open"
                className="mt-5 inline-flex h-12 items-center gap-2 rounded-2xl bg-linear-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] px-5 font-extrabold text-white shadow-lg shadow-rose-600/30 transition hover:-translate-y-0.5 hover:brightness-110"
              >
                <Share2 className="h-5 w-5" /> Share to Story, Status & more
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 rise-in [animation-delay:0.15s]">
            <Ring value={history.length ? myCorrect / history.length : 0} label="Accuracy">
              {history.length ? Math.round((myCorrect / history.length) * 100) : 0}%
            </Ring>
            <Tile label="Best streak" value={`🔥${me?.bestStreak ?? 0}`} />
            <Tile label="Avg. answer" value={avgMs !== null ? `${(avgMs / 1000).toFixed(1)}s` : '—'} />
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          {ranked.length > 1 && <Podium ranked={ranked} />}
          <GameAlbum stats={stats} you={you} solo={state.solo} title={source.title} players={ranked} noun={noun} />
        </div>

        <aside className="space-y-6">
          {progress && <ProgressCard update={progress} />}
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-4 text-lg font-bold text-white">{state.daily ? 'That’s today’s challenge!' : 'Ready for more?'}</h3>
            {state.daily ? (
              <div className="space-y-3">
                <NextDaily />
                <Link to="/" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-brand-300 via-brand-500 to-rose-500 font-bold text-black">
                  Keep playing — other games
                </Link>
              </div>
            ) : isHost ? (
              <div className="space-y-3">
                <Button
                  variant="gradient"
                  className="w-full"
                  loading={busy}
                  icon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => {
                    audio.unlock()
                    void start()
                  }}
                  data-testid="play-again"
                >
                  {busy ? (challenge ? 'Setting the stage…' : 'Loading songs…') : 'Play again'}
                </Button>
                <Button variant="dark" className="w-full" icon={<Settings2 className="h-4 w-4" />} onClick={() => send({ t: 'lobby' })} data-testid="change-music">
                  {challenge ? 'Change game or settings' : 'Change music or settings'}
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-gray-300">
                {state.phase === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-brand-400" /> Loading the next game…
                  </>
                ) : (
                  <>Waiting for {host?.name ?? 'the host'} to start another game…</>
                )}
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="dark" size="sm" icon={<Share2 className="h-4 w-4" />} onClick={share} disabled={history.length === 0}>
                Share
              </Button>
              <Button variant="dark" size="sm" icon={<Clapperboard className="h-4 w-4" />} onClick={() => setRecap(true)} disabled={slides.length === 0}>
                Watch recap
              </Button>
            </div>
            {!state.solo && ranked.length > 1 && <ReactionBar compact className="mt-4 border-t border-white/5 pt-4" />}
            {state.group && (
              <Link to={`/groups/${state.group.id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200">
                <Users className="h-4 w-4" /> Saved to {state.group.name}’s leaderboard →
              </Link>
            )}
          </div>

          {!state.solo && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="mb-3 text-lg font-bold text-white">Standings</h3>
              <ol className="space-y-2" data-testid="standings">
                {ranked.map((p, i) => (
                  <li key={p.id} className={clsx('flex items-center gap-3 rounded-xl border px-3 py-2', p.id === you ? 'border-brand-500/50 bg-brand-500/10' : 'border-white/5 bg-white/[0.03]')}>
                    <span className="w-6 text-center font-bold text-gray-400">{i + 1}</span>
                    <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" dim={!p.connected} />
                    <span className="min-w-0 flex-1 truncate font-semibold text-white">
                      {p.name}
                      {p.id === you && <span className="ml-1 text-sm font-normal text-gray-400">(you)</span>}
                    </span>
                    <span className="text-sm text-gray-400">
                      {p.correct}/{history.length}
                    </span>
                    <span className="w-16 text-right font-bold text-brand-300 tabular-nums">{p.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {awards.length > 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="mb-1 flex items-center gap-2 text-lg font-bold text-white">
                <Trophy className="h-4 w-4 text-amber-300" /> Filmy awards
              </h3>
              <p className="mb-3 text-xs text-gray-400">Tonight’s winners, Bollywood style — new names every game{state.ai ? ', written fresh by AI' : ''}.</p>
              <ul className="space-y-2.5" data-testid="awards">
                {awards.map((a, i) => (
                  <li key={a.id} className="rise-in" style={{ animationDelay: `${i * 0.08}s` }}>
                    <AwardCard award={a} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
