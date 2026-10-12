import clsx from 'clsx'
import { ArrowRight, ExternalLink, Flag, Sparkles, Volume2, VolumeX, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PublicPlayer, PublicRound } from '../../shared/protocol'
import { MAX_STREAK_BONUS, REACTIONS, REVEAL_MS, STREAK_BONUS } from '../../shared/rules'
import { PlayerAvatar } from '../components/ui'
import { player as audio, usePlayer } from '../lib/audio'
import { playSfx, setSfxEnabled, useSfxEnabled, vibrate } from '../lib/sfx'
import { difficultyLabel } from '../lib/source'
import { useNow } from '../lib/useNow'
import { useRoomContext } from './context'
import { AnimatedNumber, Scoreboard } from './Scoreboard'

/**
 * Plays the round's preview in sync with the server clock. The song keeps playing
 * through the reveal, and the next song is downloaded meanwhile so it starts the
 * moment the reveal's countdown ends.
 */
function useRoundAudio(round: PublicRound | null, phase: string, serverNow: () => number) {
  const key = round ? `${round.index}:${round.preview}` : ''
  useEffect(() => {
    if (!round) return
    const offset = round.clipOffset + Math.max(0, (serverNow() - round.startsAt) / 1000)
    if (phase === 'countdown') audio.preload(round.preview)
    else if (phase === 'question') audio.play(round.preview, offset)
    // Joined during a reveal: catch up on the song everyone else is hearing.
    else if (phase === 'reveal') audio.ensurePlaying(round.preview, offset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, phase])

  const next = round?.nextPreview
  useEffect(() => {
    if (next) audio.warm(next)
  }, [next])
}

/** Sound effects: countdown ticks, "go", right/wrong. */
function useRoundSfx(round: PublicRound, phase: string, now: number) {
  const lastTick = useRef<string>('')
  const feedbackFor = useRef<number>(-1)

  const secondsLeft = phase === 'countdown' ? Math.ceil((round.startsAt - now) / 1000) : phase === 'question' ? Math.ceil((round.endsAt - now) / 1000) : 0
  useEffect(() => {
    const key = `${round.index}:${phase}:${secondsLeft}`
    if (key === lastTick.current) return
    lastTick.current = key
    if (phase === 'countdown' && secondsLeft >= 1 && secondsLeft <= 3) playSfx('tick')
    if (phase === 'question' && secondsLeft >= 1 && secondsLeft <= 3 && round.yourChoice === null) playSfx('tick')
  }, [round.index, phase, secondsLeft, round.yourChoice])

  useEffect(() => {
    if (phase === 'question') playSfx('go')
  }, [phase, round.index])

  useEffect(() => {
    if (feedbackFor.current === round.index) return
    let correct: boolean | null = null
    if (round.yourResult) correct = round.yourResult.correct
    else if (round.reveal && round.yourChoice !== null) correct = round.reveal.correct === round.yourChoice
    if (correct === null) return
    feedbackFor.current = round.index
    playSfx(correct ? 'correct' : 'wrong')
    vibrate(correct ? 40 : [60, 40, 60])
  }, [round.index, round.yourResult, round.reveal, round.yourChoice])
}

/** Remembers how you did in each round of this game (for the progress dots). */
function useRoundMarks(round: PublicRound, you: string) {
  // GameView remounts for every game (results and lobby sit in between), so this starts empty.
  const marks = useRef<Record<number, 'right' | 'wrong' | 'miss'>>({})
  if (round.reveal) {
    const pick = round.reveal.picks[you]
    marks.current[round.index] = pick?.correct ? 'right' : pick && pick.choice !== null ? 'wrong' : 'miss'
  }
  return marks.current
}

function Equalizer({ active, className }: { active: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex h-4 items-end gap-0.5', className)} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={clsx('w-1 rounded-sm bg-brand-400', active ? 'animate-[eq_0.9s_ease-in-out_infinite]' : 'h-1')}
          style={active ? { animationDelay: `${i * 0.15}s`, height: '100%' } : undefined}
        />
      ))}
    </span>
  )
}

function TimerRing({ progress, seconds, urgent }: { progress: number; seconds: number; urgent: boolean }) {
  const r = 22
  const c = 2 * Math.PI * r
  return (
    <span className={clsx('relative inline-flex h-14 w-14 shrink-0 items-center justify-center', urgent && 'animate-[pulse_0.8s_ease-in-out_infinite]')}>
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          stroke={urgent ? '#f87171' : 'url(#ring-g)'}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#12dcef" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      <span className={clsx('relative text-lg font-extrabold tabular-nums', urgent ? 'text-red-300' : 'text-white')} data-testid="countdown">
        {seconds}
      </span>
    </span>
  )
}

/** During the reveal: counts down to the next song (or the results) while the song plays on. */
function NextUp({ endsAt, now, last, double }: { endsAt: number | null; now: number; last: boolean; double: boolean }) {
  if (!endsAt) return null
  const left = Math.max(0, endsAt - now)
  const progress = Math.min(1, left / REVEAL_MS)
  const r = 18
  const c = 2 * Math.PI * r
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-xl bg-white/5 py-1.5 pr-3 pl-1.5" data-testid="next-up">
      <span className="relative inline-flex h-11 w-11 items-center justify-center">
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-white/10" />
          <circle cx="22" cy="22" r={r} fill="none" stroke="#a78bfa" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
        </svg>
        <span className="relative text-base font-extrabold text-white tabular-nums">{Math.ceil(left / 1000)}</span>
      </span>
      <span className="text-left text-xs leading-tight text-gray-300">
        {last ? 'Results' : double ? 'Final song · ×2' : 'Next song'}
        <span className="block text-gray-500">{last ? 'coming up' : 'starts in'}</span>
      </span>
    </div>
  )
}

/**
 * The record and its sleeve. While you guess, the record spins out of a blank
 * sleeve; at the reveal the sleeve flips to the real album art.
 */
function VinylStage({ round, spinning }: { round: PublicRound; spinning: boolean }) {
  const { state } = useRoomContext()
  const track = round.reveal?.track
  const flipped = !!track
  const fallback = state.settings.source.kind === 'playlist' ? state.settings.source.image : undefined
  const art = track?.artwork || fallback
  const owners = round.reveal?.owners ?? []
  return (
    <div className="flex flex-row items-center gap-4 sm:gap-5 xl:flex-col xl:items-start">
      <div className="relative h-28 w-38 shrink-0 sm:h-44 sm:w-60">
        {/* Record */}
        <div
          className={clsx(
            'absolute top-1 left-8 h-26 w-26 rounded-full transition-transform duration-700 sm:left-14 sm:h-42 sm:w-42',
            spinning || flipped ? 'translate-x-4' : 'translate-x-0',
          )}
        >
          <div className={clsx('vinyl relative h-full w-full rounded-full shadow-2xl', spinning && 'animate-[spin_2.4s_linear_infinite]')}>
            <div className="absolute inset-[33%] overflow-hidden rounded-full ring-2 ring-black/60">
              {flipped && art ? (
                <img src={art} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-linear-to-br from-brand-400 via-violet-500 to-pink-400" />
              )}
              <span className="absolute top-1/2 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black" />
            </div>
          </div>
        </div>
        {/* Sleeve */}
        <div className="perspective-1000 absolute top-0 left-0 h-28 w-28 sm:h-44 sm:w-44">
          <div className={clsx('preserve-3d relative h-full w-full transition-transform duration-700', flipped && 'rotate-y-180')}>
            <div className="backface-hidden absolute inset-0 overflow-hidden rounded-xl border border-white/10 bg-linear-to-br from-gray-800 via-gray-900 to-black shadow-2xl">
              <div className="sleeve-noise absolute inset-0 opacity-40" />
              <div className="relative flex h-full w-full flex-col items-center justify-center gap-2">
                <span className="bg-linear-to-br from-brand-300 to-violet-400 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">?</span>
                <Equalizer active={spinning} />
              </div>
            </div>
            <div className="backface-hidden rotate-y-180 absolute inset-0">
              {art ? (
                <img src={art} alt={track ? `${track.album || track.title} cover` : ''} className="h-full w-full rounded-xl object-cover shadow-2xl ring-1 ring-white/10" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-800 text-5xl">🎵</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full min-w-0 flex-1 text-left sm:min-h-24">
        {track ? (
          <div className="animate-pop">
            {owners.length > 0 && (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-xs font-bold text-emerald-200">
                <Sparkles className="h-3.5 w-3.5" />
                {owners.length > 1 ? `Blend match · ${owners.join(' & ')}` : `From ${owners[0]}’s music`}
              </p>
            )}
            <h3 className="mb-1 text-xl leading-tight font-extrabold text-white sm:text-2xl" data-testid="reveal-title">
              {track.title}
            </h3>
            <p className="mb-1 font-semibold text-brand-300">{track.artist}</p>
            <p className="truncate text-sm text-gray-400">
              {track.album}
              {track.year ? `${track.album ? ' · ' : ''}${track.year}` : ''}
            </p>
            {track.link && (
              <a href={track.link} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                {track.link.includes('spotify') ? 'Open in Spotify' : 'Listen on Apple Music'} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-2 pt-1" aria-hidden="true">
            <div className="h-6 w-3/4 animate-pulse rounded-lg bg-white/10" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
          </div>
        )}
      </div>
    </div>
  )
}

const OPTION_TINTS = ['from-cyan-500/30', 'from-violet-500/30', 'from-pink-500/30', 'from-amber-500/30']

function Choices({ round, players, onAnswer, locked }: { round: PublicRound; players: PublicPlayer[]; onAnswer: (i: number) => void; locked: boolean }) {
  const reveal = round.reveal
  const correctIndex = reveal?.correct ?? round.yourResult?.correctIndex
  const pickers = (i: number) => (reveal ? players.filter((p) => reveal.picks[p.id]?.choice === i) : [])

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="choices">
      {[0, 1, 2, 3].map((i) => {
        const text = round.options?.[i]
        const art = round.optionArt?.[i]
        const mine = round.yourChoice === i
        const known = correctIndex !== undefined
        let tone = 'border-white/10 bg-white/[0.04]'
        if (known) {
          if (i === correctIndex) tone = 'border-emerald-300/80 bg-emerald-500/20 shadow-[0_0_30px_-6px] shadow-emerald-400/50'
          else if (mine) tone = 'border-red-400/80 bg-red-500/20'
          else tone = 'border-white/5 bg-white/[0.02] opacity-45'
        } else if (round.yourChoice !== null) {
          tone = mine ? 'border-brand-400 bg-brand-500/15 ring-2 ring-brand-400/40' : 'border-white/5 bg-white/[0.02] opacity-45'
        }
        return (
          <button
            key={i}
            type="button"
            disabled={!text || locked}
            onClick={() => onAnswer(i)}
            data-choice={i}
            className={clsx(
              'group relative flex min-h-20 items-center gap-3 overflow-hidden rounded-2xl border p-2.5 pr-4 text-left transition-all duration-200',
              tone,
              text && !locked && 'hover:-translate-y-0.5 hover:border-brand-400/70 hover:bg-white/[0.08] hover:shadow-xl active:scale-[0.98]',
              known && i === correctIndex && 'animate-pop',
            )}
          >
            <span className={clsx('relative h-15 w-15 shrink-0 overflow-hidden rounded-xl bg-linear-to-br to-gray-900 ring-1 ring-white/10', OPTION_TINTS[i])} aria-hidden="true">
              {art ? <img src={art} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-xl font-black text-white/70">{i + 1}</span>}
              {art && <span className="absolute top-1 left-1 rounded-md bg-black/70 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>}
            </span>
            {text ? (
              <span className="min-w-0 flex-1 font-semibold leading-snug break-words text-white">{text}</span>
            ) : (
              <span className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
            )}
            {pickers(i).length > 0 && (
              <span className="absolute right-2 bottom-2 flex -space-x-1.5">
                {pickers(i).map((p) => (
                  <span key={p.id} title={p.name}>
                    <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" />
                  </span>
                ))}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Status({ phase, round, you, answeredCount, activeCount, solo }: { phase: string; round: PublicRound; you: string; answeredCount: number; activeCount: number; solo: boolean }) {
  const question = round.mode === 'title' ? 'What’s the song?' : 'Who’s the artist?'
  const waiting = solo ? null : (
    <span className="mt-1 block text-sm font-normal text-gray-400">
      Waiting for others ({answeredCount}/{activeCount})
    </span>
  )
  if (phase === 'countdown') return <p className="text-lg font-bold text-white">Get ready…</p>
  if (phase === 'question') {
    if (round.yourResult) {
      return round.yourResult.correct ? (
        <p className="text-lg font-bold text-emerald-300">
          ✅ Correct! <span className="text-white">+{round.yourResult.points}</span>
          {round.yourResult.first && <FirstBadge />}
          {waiting}
        </p>
      ) : (
        <p className="text-lg font-bold text-red-400">
          ❌ Not this one
          <Penalty points={round.yourResult.points} />
          {waiting}
        </p>
      )
    }
    return (
      <p className="flex flex-col gap-1 text-xl font-extrabold text-white">
        <span>{question}</span>
        {round.yourChoice !== null && !solo && (
          <span className="text-sm font-normal text-gray-400">
            Answer locked in — waiting for others ({answeredCount}/{activeCount})
          </span>
        )}
      </p>
    )
  }
  const pick = round.reveal?.picks[you]
  if (!pick || pick.choice === null) return <p className="text-lg font-bold text-amber-300">⏰ Time’s up!</p>
  return pick.correct ? (
    <p className="text-lg font-bold text-emerald-300">
      ✅ Correct! <span className="text-white">+{pick.points}</span>
      {pick.first && <FirstBadge />}
    </p>
  ) : (
    <p className="text-lg font-bold text-red-400">
      ❌ Wrong answer
      <Penalty points={pick.points} />
    </p>
  )
}

function FirstBadge() {
  return <span className="ml-2 inline-flex rounded-full bg-amber-400/15 px-2 py-0.5 align-middle text-xs font-extrabold text-amber-300">⚡ First! +bonus</span>
}

function Penalty({ points }: { points: number }) {
  return points < 0 ? <span className="ml-2 text-white/80 tabular-nums">−{-points}</span> : null
}

function CountdownOverlay({ round, now }: { round: PublicRound; now: number }) {
  const left = Math.max(1, Math.ceil((round.startsAt - now) / 1000))
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-gray-950/85 backdrop-blur-md" aria-live="assertive">
      <p className="mb-2 text-sm font-semibold tracking-[0.25em] text-gray-400 uppercase">
        Song {round.index + 1} of {round.total}
      </p>
      {round.double && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-sm font-extrabold text-amber-300">
          <Zap className="h-4 w-4" /> FINAL ROUND · DOUBLE POINTS
        </p>
      )}
      <span className="relative flex h-40 w-40 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/15" />
        <span key={left} className="animate-pop bg-linear-to-br from-brand-300 via-violet-400 to-pink-400 bg-clip-text text-9xl font-black text-transparent tabular-nums">
          {left}
        </span>
      </span>
      <p className="mt-3 text-sm text-gray-400">
        {difficultyLabel(round.difficulty)} · {round.difficulty === 'easy' ? 'warm-up answers' : 'look-alike answers'}
      </p>
    </div>
  )
}

function SfxToggle() {
  const on = useSfxEnabled()
  return (
    <button
      type="button"
      onClick={() => setSfxEnabled(!on)}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-white/5 hover:text-white"
      aria-pressed={on}
    >
      {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} Sound effects {on ? 'on' : 'off'}
    </button>
  )
}

function RoundDots({ total, current, marks }: { total: number; current: number; marks: Record<number, 'right' | 'wrong' | 'miss'> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={clsx(
            'h-2 rounded-full transition-all',
            i === current ? 'w-6 bg-white' : 'w-2',
            i !== current && marks[i] === 'right' && 'bg-emerald-400',
            i !== current && marks[i] === 'wrong' && 'bg-red-400',
            i !== current && marks[i] === 'miss' && 'bg-amber-400/70',
            i !== current && !marks[i] && 'bg-white/15',
          )}
        />
      ))}
    </div>
  )
}

/** Solo sidebar: your run so far instead of a leaderboard. */
function SoloPanel({ me, marks, round, onNext, phase }: { me: PublicPlayer | undefined; marks: Record<number, 'right' | 'wrong' | 'miss'>; round: PublicRound; onNext: () => void; phase: string }) {
  const played = Object.keys(marks).length
  const right = Object.values(marks).filter((m) => m === 'right').length
  const nextBonus = Math.min(MAX_STREAK_BONUS, (me?.streak ?? 0) * STREAK_BONUS)
  return (
    <section aria-label="Your run" className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="font-bold text-white">Your run</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <p className="text-xs text-gray-400">Accuracy</p>
          <p className="text-2xl font-extrabold text-white tabular-nums">{played ? Math.round((right / played) * 100) : 0}%</p>
        </div>
        <div className="rounded-2xl bg-white/[0.04] p-3">
          <p className="text-xs text-gray-400">Streak</p>
          <p className="text-2xl font-extrabold text-orange-300 tabular-nums">🔥 {me?.streak ?? 0}</p>
        </div>
      </div>
      {nextBonus > 0 && <p className="text-xs text-gray-400">Keep it going: next right answer earns +{nextBonus} streak bonus.</p>}
      <RoundDots total={round.total} current={round.index} marks={marks} />
      {phase === 'reveal' && (
        <button
          type="button"
          onClick={onNext}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white font-bold text-gray-900 hover:bg-gray-100"
          data-testid="next-song"
        >
          {round.index + 1 < round.total ? 'Next song' : 'See results'} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </section>
  )
}

export function GameView() {
  const { state, you, isHost, send, serverNow, me } = useRoomContext()
  const round = state.round!
  const phase = state.phase
  const now = useNow(serverNow, 100)
  const { playing } = usePlayer()
  const [pending, setPending] = useState<{ round: number; choice: number } | null>(null)
  const marks = useRoundMarks(round, you)

  useRoundAudio(round, phase, serverNow)

  const localRound = useMemo<PublicRound>(() => {
    if (round.yourChoice === null && pending && pending.round === round.index && phase === 'question') {
      return { ...round, yourChoice: pending.choice }
    }
    return round
  }, [round, pending, phase])

  useRoundSfx(localRound, phase, now)

  const locked = phase !== 'question' || localRound.yourChoice !== null || round.endsAt <= now

  const answer = (choice: number) => {
    if (locked) return
    audio.unlock()
    playSfx('pop')
    setPending({ round: round.index, choice })
    send({ t: 'answer', round: round.index, choice })
  }
  const next = () => send({ t: 'next' })

  // Keyboard shortcuts 1–4 (and Enter for the next song when solo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const n = Number(e.key)
      if (n >= 1 && n <= 4) answer(n - 1)
      if (e.key === 'Enter' && state.solo && phase === 'reveal') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const active = state.players.filter((p) => p.connected)
  const answeredCount = active.filter((p) => p.answered).length
  const totalMs = round.endsAt - round.startsAt
  const progress = phase === 'question' ? Math.max(0, Math.min(1, (round.endsAt - now) / totalMs)) : phase === 'countdown' ? 1 : 0
  const secondsLeft = Math.max(0, Math.ceil((round.endsAt - now) / 1000))
  const reacting = phase === 'reveal' && !state.solo
  const myPick = round.reveal?.picks[you]
  const outcome = localRound.yourResult
    ? { kind: localRound.yourResult.correct ? ('right' as const) : ('wrong' as const), points: localRound.yourResult.points }
    : myPick && myPick.choice !== null
      ? { kind: myPick.correct ? ('right' as const) : ('wrong' as const), points: myPick.points }
      : null
  const doubleNext = state.settings.doubleFinal && round.total > 1 && round.index + 2 === round.total

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10">
      {state.notice && round.index === 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{state.notice}</div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="game-card relative overflow-hidden rounded-3xl border border-white/10 p-5 shadow-2xl sm:p-7">
            {round.reveal?.track.artwork && <img src={round.reveal.track.artwork} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-20 blur-3xl" />}
            {phase === 'countdown' && <CountdownOverlay round={round} now={now} />}

            <div className="relative">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-base text-gray-300">
                    Song{' '}
                    <span className="font-extrabold text-white" data-testid="round-number">
                      {round.index + 1}
                    </span>{' '}
                    of {round.total}
                  </div>
                  {round.double && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-extrabold text-amber-300">
                      <Zap className="h-3.5 w-3.5" /> ×2
                    </span>
                  )}
                  {(me?.streak ?? 0) >= 2 && <span className="rounded-full bg-orange-400/15 px-2.5 py-1 text-xs font-extrabold text-orange-300">🔥 {me!.streak} streak</span>}
                </div>
                <div className="text-base text-gray-300">
                  Score{' '}
                  <span className="text-xl font-extrabold text-brand-300 tabular-nums" data-testid="my-score">
                    <AnimatedNumber value={me?.score ?? 0} />
                  </span>
                </div>
                <div className="w-full">
                  <RoundDots total={round.total} current={round.index} marks={marks} />
                </div>
              </div>

              <div className="mb-6 rounded-2xl border border-white/5 bg-black/20 p-4" aria-live="polite">
                <div className="flex items-center gap-4">
                  {phase === 'question' && <TimerRing progress={progress} seconds={secondsLeft} urgent={secondsLeft <= 3} />}
                  <div className="min-w-0 flex-1">
                    <Status phase={phase} round={localRound} you={you} answeredCount={answeredCount} activeCount={active.length} solo={state.solo} />
                  </div>
                  {phase === 'question' && <Equalizer active={playing} className="h-6" />}
                  {phase === 'reveal' && (
                    <NextUp endsAt={state.phaseEndsAt} now={now} last={round.index + 1 >= round.total} double={doubleNext} />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-5 sm:gap-7 xl:flex-row">
                <div className="xl:w-[40%]">
                  <VinylStage round={round} spinning={playing && phase !== 'countdown'} />
                </div>
                <div key={`${round.index}:${outcome?.kind ?? ''}`} className={clsx('relative flex-1', outcome?.kind === 'wrong' && 'animate-shake')}>
                  <Choices round={localRound} players={state.players} onAnswer={answer} locked={locked} />
                  {outcome?.kind === 'right' && (
                    <span aria-hidden="true" className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 animate-float-up text-5xl font-black text-emerald-300 drop-shadow-[0_4px_20px_rgba(16,185,129,0.6)]">
                      +{outcome.points}
                    </span>
                  )}
                </div>
              </div>

              {reacting && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 border-t border-white/5 pt-5" aria-label="Send a reaction">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => send({ t: 'react', emoji })}
                      className="rounded-full bg-white/5 px-3 py-1.5 text-xl transition-transform hover:scale-110 hover:bg-white/10 active:scale-95"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <SfxToggle />
            {isHost && (
              <button
                type="button"
                onClick={() => confirm('End the game now and show results?') && send({ t: 'end' })}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-white/5 hover:text-white"
              >
                <Flag className="h-4 w-4" /> End game
              </button>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          {state.solo ? (
            <SoloPanel me={me} marks={marks} round={round} onNext={next} phase={phase} />
          ) : (
            <Scoreboard players={state.players} you={you} hostId={state.hostId} phase={phase} />
          )}
        </aside>
      </div>
    </main>
  )
}
