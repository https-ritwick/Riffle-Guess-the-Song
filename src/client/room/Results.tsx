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
import { describeSource, difficultyLabel } from '../lib/source'
import { load, save } from '../lib/storage'
import { useRoomContext } from './context'
import { rankPlayers } from './Scoreboard'
import { AwardCard } from './results/AwardCard'
import { buildSlides, Recap } from './results/Recap'
import { biggestComeback, computeAwards, emojiGrid, roundStats, scoreMessage, type RoundStat } from './results/stats'
import { useStartGame } from './useStartGame'

const CONFETTI_COLORS = ['#12dcef', '#8b5cf6', '#f472b6', '#f59e0b', '#22c55e', '#ffffff']

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
  if (!tiles.length) return <div className="absolute inset-0 bg-linear-to-br from-violet-900/50 via-gray-950 to-cyan-900/40" />
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -inset-x-1/4 -top-1/4 rotate-[-8deg]">
        <div className="album-wall grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {[...tiles, ...tiles].map((src, i) => (
            <img key={i} src={src} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      </div>
      <div className="absolute inset-0 bg-linear-to-r from-[#07060d] via-[#07060d]/85 to-[#07060d]/40" />
      <div className="absolute inset-0 bg-linear-to-t from-[#07060d] via-transparent to-[#07060d]/40" />
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
              <stop offset="0" stopColor="#12dcef" />
              <stop offset="1" stopColor="#f472b6" />
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
  return (
    <li className={clsx('group flex items-center gap-3 rounded-2xl p-2.5 transition-colors', active ? 'bg-white/10' : 'hover:bg-white/[0.04]')}>
      <span className="w-6 text-right text-sm font-bold text-gray-500 tabular-nums">{n}</span>
      <button
        type="button"
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
        <span className="relative block h-14 w-14 overflow-hidden rounded-lg bg-gray-800 shadow-lg">
          {r.track.artwork ? <img src={r.track.artwork} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="flex h-full items-center justify-center">🎵</span>}
          <span className={clsx('absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
            {active ? <Pause className="h-5 w-5 fill-white text-white" /> : <Play className="h-5 w-5 fill-white text-white" />}
          </span>
        </span>
      </button>
      <div className={clsx('min-w-0 flex-1', active && 'pl-4')}>
        <p className="truncate font-semibold text-white">{r.track.title}</p>
        <p className="truncate text-sm text-brand-300">{r.track.artist}</p>
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

/** The game as an album: a cover collage, then Side A and Side B. */
function GameAlbum({ stats, you, solo, title, players }: { stats: RoundStat[]; you: string; solo: boolean; title: string; players: PublicPlayer[] }) {
  const half = Math.ceil(stats.length / 2)
  const sides = stats.length > 4 ? [stats.slice(0, half), stats.slice(half)] : [stats]
  const covers = [...new Set(stats.map((s) => s.r.track.artwork).filter(Boolean))].slice(0, 4)
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]" aria-label="Your results">
      <div className="flex items-center gap-4 border-b border-white/5 bg-linear-to-r from-violet-600/20 via-transparent to-cyan-500/10 p-5">
        <div className="grid h-20 w-20 shrink-0 grid-cols-2 overflow-hidden rounded-xl shadow-xl ring-1 ring-white/10">
          {covers.length === 4 ? covers.map((c) => <img key={c} src={c} alt="" className="h-full w-full object-cover" />) : <span className="col-span-2 row-span-2 bg-linear-to-br from-brand-400 via-violet-500 to-pink-400" />}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.25em] text-gray-400 uppercase">{BRAND.name} sessions · {date}</p>
          <h3 className="truncate text-2xl font-extrabold text-white">{title}</h3>
          <p className="text-sm text-gray-400">
            {stats.length} tracks{!solo && ` · played by ${players.map((p) => p.name).join(', ')}`}
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
      <p className="px-5 pb-4 text-xs text-gray-500">Tap a cover to replay its hook.</p>
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
  const awards = useMemo(() => computeAwards(state.players, history, stats, state.solo), [state.players, history, stats, state.solo])
  const source = describeSource(state.settings.source)
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
    () => buildSlides({ stats, ranked, you, me, solo: state.solo, sourceTitle: source.title, myScore, myRight: myCorrect, avgMs, best, awards, comeback }),
    // Built once per game; live score updates after the game don't need to rebuild the story.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stats, you, state.solo, source.title, myScore, myCorrect, best, awards],
  )
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

  const share = async () => {
    const text = `${BRAND.name} 🎵 ${source.title} · ${difficultyLabel(state.settings.difficulty)}\n${myScore.toLocaleString()} pts · ${myCorrect}/${history.length}${!state.solo && myRank >= 0 ? ` · #${myRank + 1} of ${ranked.length}` : ''}\n${emojiGrid(history, you)}\n${location.origin}`
    try {
      if (typeof navigator.share === 'function') await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        toast({ title: 'Copied!', body: 'Paste your results anywhere.', tone: 'success', durationMs: 2500 })
      }
    } catch {
      // cancelled
    }
  }

  const winnerLine = ranked[0] && ranked.length > 1 ? (ranked[0].id === you ? 'You win!' : `${ranked[0].name} wins!`) : null

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-12">
      {recap && slides.length > 0 && <Recap slides={slides} onClose={closeRecap} />}
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
              <span className="bg-linear-to-r from-brand-300 to-pink-300 bg-clip-text text-4xl font-black text-transparent tabular-nums" data-testid="final-score">
                {myScore.toLocaleString()}
              </span>
              {ranked.length > 1 && myRank >= 0 && <span className="ml-2 text-base text-gray-400">· #{myRank + 1} of {ranked.length}</span>}
            </p>
            <p className="mt-2 text-gray-200">
              You got{' '}
              <span className="font-bold text-white">
                {myCorrect}/{history.length}
              </span>{' '}
              songs right.
            </p>
            <p className="text-gray-400">{scoreMessage(myCorrect, history.length)}</p>
            {state.solo && (best.isNew ? <p className="mt-3 inline-flex rounded-full bg-amber-400/15 px-3 py-1 text-sm font-bold text-amber-200">🏆 New personal best!</p> : best.best > 0 && <p className="mt-3 text-sm text-gray-400">Personal best: {best.best.toLocaleString()}</p>)}
            <p className="mt-4 font-mono text-2xl tracking-[0.15em]" aria-label="Your song-by-song results">
              {emojiGrid(history, you)}
            </p>
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
          <GameAlbum stats={stats} you={you} solo={state.solo} title={source.title} players={ranked} />
        </div>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-4 text-lg font-bold text-white">Ready for more?</h3>
            {isHost ? (
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
                  {busy ? 'Loading songs…' : 'Play again'}
                </Button>
                <Button variant="dark" className="w-full" icon={<Settings2 className="h-4 w-4" />} onClick={() => send({ t: 'lobby' })} data-testid="change-music">
                  Change music or settings
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
            {state.group && (
              <Link to={`/groups/${state.group.id}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-violet-300 hover:text-violet-200">
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
              <p className="mb-3 text-xs text-gray-400">Tonight’s winners, Bollywood style.</p>
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
