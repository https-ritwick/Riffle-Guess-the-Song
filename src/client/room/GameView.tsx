import clsx from 'clsx'
import { ArrowRight, ExternalLink, Flag, Lock, Sparkles, Tv, Volume2, VolumeX, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CHALLENGE_QUESTION } from '../../shared/challenges'
import type { PublicPlayer, PublicRound, QuestionMode } from '../../shared/protocol'
import { MAX_STREAK_BONUS, REVEAL_MS, STREAK_BONUS } from '../../shared/rules'
import { POWER_IDS, POWERS, TEAMS, type PowerId } from '../../shared/modes'
import { useTeamLabels } from '../lib/teams'
import { PowerChip, PowerIcon } from './powers'
import { PlayerAvatar } from '../components/ui'
import { player as audio, usePlayer } from '../lib/audio'
import { findSongClip } from '../lib/itunes'
import type { SongClip } from '../../shared/songs'
import { playSfx, setSfxEnabled, useSfxEnabled, vibrate } from '../lib/sfx'
import { difficultyLabel } from '../lib/source'
import { useNow } from '../lib/useNow'
import { useRoomContext } from './context'
import { ReactionBar } from './Reactions'
import { AnimatedNumber, rankPlayers, Scoreboard } from './Scoreboard'
import { TeamStandings } from './Teams'

/** Dialogue, star and emoji rounds have no clip while you answer. */
export function isChallengeMode(mode: QuestionMode): boolean {
  return mode !== 'title' && mode !== 'artist'
}

/**
 * An emoji round's song once you're allowed to hear it (you cracked it, or it's
 * revealed): from the server when it could fetch it, else looked up by this browser.
 */
export function useEmojiSong(round: PublicRound | null): SongClip | null {
  const find = round?.reveal?.find ?? round?.yourResult?.find ?? null
  const key = find ? `${find.title}|${find.movie}` : ''
  const [clip, setClip] = useState<{ key: string; clip: SongClip | null } | null>(null)
  useEffect(() => {
    if (!find || clip?.key === key) return
    let live = true
    void findSongClip(find).then((c) => live && setClip({ key, clip: c }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return clip?.key === key ? clip.clip : null
}

/**
 * Plays the round's preview in sync with the server clock. The song keeps playing
 * through the reveal, and the next song is downloaded meanwhile so it starts the
 * moment the reveal's countdown ends.
 */
export function useRoundAudio(round: PublicRound | null, phase: string, serverNow: () => number, looked: SongClip | null, muted = false) {
  const revealSong = round && isChallengeMode(round.mode) ? round.reveal?.track.preview || (round.reveal ? (looked?.preview ?? '') : '') : ''
  // Crack an emoji puzzle and its song starts right away, while the others are still thinking.
  const earnedSong = round?.yourResult?.song || (round?.yourResult?.correct ? (looked?.preview ?? '') : '')
  const key = round ? `${round.index}:${round.preview}:${revealSong}:${earnedSong}:${muted}` : ''
  useEffect(() => {
    if (!round) return
    if (muted) {
      audio.stop()
      return
    }
    if (isChallengeMode(round.mode)) {
      const song = phase === 'reveal' ? revealSong || earnedSong : phase === 'question' ? earnedSong : ''
      if (song) audio.ensurePlaying(song, 0)
      else if (phase === 'question') audio.stop()
      return
    }
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

export function Equalizer({ active, className }: { active: boolean; className?: string }) {
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

export function TimerRing({ progress, seconds, urgent }: { progress: number; seconds: number; urgent: boolean }) {
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
            <stop offset="0" stopColor="#ffc44d" />
            <stop offset="1" stopColor="#ff6a3d" />
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
function NextUp({ endsAt, now, last, double, noun }: { endsAt: number | null; now: number; last: boolean; double: boolean; noun: string }) {
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
          <circle cx="22" cy="22" r={r} fill="none" stroke="#ffae1f" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
        </svg>
        <span className="relative text-base font-extrabold text-white tabular-nums">{Math.ceil(left / 1000)}</span>
      </span>
      <span className="text-left text-xs leading-tight text-gray-300">
        {last ? 'Results' : double ? `Final ${noun} · ×2` : `Next ${noun}`}
        <span className="block text-gray-500">{last ? 'coming up' : 'starts in'}</span>
      </span>
    </div>
  )
}

/**
 * The record and its sleeve. While you guess, the record spins out of a blank
 * sleeve; at the reveal the sleeve flips to the real album art.
 */
export function VinylStage({ round, spinning }: { round: PublicRound; spinning: boolean }) {
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
                <div className="h-full w-full bg-linear-to-br from-brand-300 via-brand-500 to-rose-500" />
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
                <span className="bg-linear-to-br from-brand-200 to-rose-400 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">?</span>
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

const HYPE: Record<number, string> = { 3: '🔥 Hat-trick!', 4: '⚡ On fire!', 5: '💥 Unstoppable!', 7: '👑 Shahenshah mode!', 10: '🐐 Legendary!' }

/** A big burst when you hit a streak milestone (or keep going past ten). */
function StreakHype({ streak, round }: { streak: number; round: number }) {
  const text = HYPE[streak] ?? (streak > 10 ? `🐐 ${streak} in a row!` : null)
  if (!text) return null
  return (
    <div key={`${round}:${streak}`} aria-live="polite" className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center">
      <span className="hype-burst rounded-full bg-linear-to-r from-brand-300 via-brand-500 to-rose-500 px-6 py-2.5 text-2xl font-black text-black shadow-2xl shadow-rose-500/40 sm:text-3xl">
        {text} <span className="text-lg font-extrabold">{streak} in a row</span>
      </span>
    </div>
  )
}

/** Which of a star round's clues are showing: one more every third of the timer. */
function visibleClues(round: PublicRound, now: number): number {
  const clues = round.challenge?.clues.length ?? 0
  if (!clues || round.reveal) return clues
  const total = round.endsAt - round.startsAt
  const elapsed = Math.max(0, now - round.startsAt)
  return Math.min(clues, 1 + Math.floor((elapsed / total) * clues))
}

/** The challenge to solve (a dialogue, emojis or clues), turning into the answer at the reveal. */
export function ChallengeStage({ round, now }: { round: PublicRound; now: number }) {
  const c = round.challenge
  const answer = round.reveal?.track
  const shown = visibleClues(round, now)
  if (!c) {
    return (
      <div className="space-y-3 pt-1" aria-hidden="true">
        <div className="h-28 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="film-strip relative overflow-hidden rounded-2xl bg-black/45 px-5 py-7 ring-1 ring-white/10 sm:px-6" data-testid="challenge-prompt">
        <span className="absolute top-2.5 left-4 text-[10px] font-bold tracking-[0.3em] text-brand-200/80 uppercase">
          {c.kind === 'dialogue' ? 'Dialogue' : c.kind === 'quote' ? 'Who said it?' : c.kind === 'emoji' ? 'Emoji song' : 'Clues'}
        </span>
        {c.ai && (
          <span className="absolute top-2 right-3 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-brand-100" title="Freshly written by AI for this room">
            <Sparkles className="h-3 w-3" /> fresh
          </span>
        )}
        {c.kind === 'emoji' ? (
          <p className="animate-pop pt-3 text-center text-5xl leading-snug tracking-[0.15em] sm:text-6xl" aria-label={`Emoji clue: ${c.prompt}`}>
            {c.prompt}
          </p>
        ) : c.kind === 'actor' ? (
          <ol className="space-y-2 pt-3">
            {c.clues.map((clue, i) => (
              <li
                key={i}
                className={clsx(
                  'flex gap-3 rounded-xl px-3 py-2 transition-all duration-500',
                  i < shown ? 'bg-white/[0.07] text-white' : 'bg-white/[0.02] text-transparent select-none',
                )}
              >
                <span className={clsx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black', i < shown ? 'bg-brand-400 text-black' : 'bg-white/10 text-gray-500')}>
                  {i < shown ? i + 1 : <Lock className="h-3 w-3" />}
                </span>
                <span className={clsx('leading-snug', i < shown ? 'animate-pop' : 'blur-sm')}>{i < shown ? clue : 'Next clue unlocks soon…'}</span>
              </li>
            ))}
          </ol>
        ) : (
          <blockquote className="animate-pop pt-3 text-center font-serif text-2xl leading-snug text-amber-50 italic sm:text-3xl">“{c.prompt}”</blockquote>
        )}
      </div>
      {answer ? (
        <div className="flex animate-pop items-center gap-4">
          {answer.artwork && <img src={answer.artwork} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-xl ring-1 ring-white/10" />}
          <div className="min-w-0">
            <h3 className="text-xl leading-tight font-extrabold text-white sm:text-2xl" data-testid="reveal-title">
              {answer.title}
            </h3>
            <p className="font-semibold text-brand-300">{answer.artist}</p>
            {answer.album && (c.kind === 'emoji' ? <p className="mt-0.5 text-sm text-gray-300">{answer.album}</p> : <p className="mt-0.5 text-sm text-gray-400 italic">“{answer.album}”</p>)}
            {answer.link && (
              <a href={answer.link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                Listen on Apple Music <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      ) : (
        c.kind === 'actor' && (
          <p className="text-xs text-gray-400">Answer early for more points — a new clue unlocks every few seconds.</p>
        )
      )}
    </div>
  )
}

/** Each option has a colour and letter, the same on phones and on the TV. */
export const OPTION_STYLES = [
  { letter: 'A', badge: 'bg-amber-400 text-black', tint: 'from-amber-500/30', buzz: 'from-amber-500/25' },
  { letter: 'B', badge: 'bg-fuchsia-400 text-black', tint: 'from-fuchsia-500/30', buzz: 'from-fuchsia-500/25' },
  { letter: 'C', badge: 'bg-sky-400 text-black', tint: 'from-sky-500/30', buzz: 'from-sky-500/25' },
  { letter: 'D', badge: 'bg-emerald-400 text-black', tint: 'from-emerald-500/30', buzz: 'from-emerald-500/25' },
] as const

function Choices({ round, players, onAnswer, locked, buzzer }: { round: PublicRound; players: PublicPlayer[]; onAnswer: (i: number) => void; locked: boolean; buzzer: boolean }) {
  const reveal = round.reveal
  const correctIndex = reveal?.correct ?? round.yourResult?.correctIndex
  const pickers = (i: number) => (reveal ? players.filter((p) => reveal.picks[p.id]?.choice === i) : [])
  const removed = round.removed ?? []

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3" data-testid="choices">
      {[0, 1, 2, 3].map((i) => {
        const text = round.options?.[i]
        const art = round.optionArt?.[i]
        const style = OPTION_STYLES[i]!
        const mine = round.yourChoice === i
        const known = correctIndex !== undefined
        const gone = removed.includes(i) && !known
        let tone = 'border-white/10 bg-white/[0.04]'
        if (known) {
          if (i === correctIndex) tone = 'border-emerald-300/80 bg-emerald-500/20 shadow-[0_0_30px_-6px] shadow-emerald-400/50'
          else if (mine) tone = 'border-red-400/80 bg-red-500/20'
          else tone = 'border-white/5 bg-white/[0.02] opacity-45'
        } else if (gone) {
          tone = 'border-white/5 bg-white/[0.01] opacity-25'
        } else if (round.yourChoice !== null) {
          tone = mine ? 'border-brand-400 bg-brand-500/15 ring-2 ring-brand-400/40' : 'border-white/5 bg-white/[0.02] opacity-45'
        }
        return (
          <button
            key={i}
            type="button"
            disabled={!text || locked || gone}
            onClick={() => onAnswer(i)}
            data-choice={i}
            aria-label={text ? `${style.letter}: ${text}${gone ? ' (removed)' : ''}` : undefined}
            className={clsx(
              'group relative flex overflow-hidden rounded-2xl border text-left transition-all duration-200',
              // Phones: tall 2×2 buzzers. Wider screens: a row with the cover.
              'min-h-[5.5rem] flex-col justify-between gap-2 bg-linear-to-br to-transparent p-2.5 sm:min-h-20 sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:bg-none sm:p-2.5 sm:pr-4',
              buzzer && 'min-h-[7.5rem] sm:min-h-24',
              !known && !gone && round.yourChoice === null && style.buzz,
              tone,
              text && !locked && !gone && 'hover:-translate-y-0.5 hover:border-brand-400/70 hover:bg-white/[0.08] hover:shadow-xl active:scale-[0.97]',
              known && i === correctIndex && 'animate-pop',
            )}
          >
            {/* One letter per option (it matches the TV), then the cover when every option has one. */}
            <span className="flex items-center gap-2 sm:contents" aria-hidden="true">
              <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-black sm:h-9 sm:w-9 sm:text-base', style.badge)}>{style.letter}</span>
              {art && <img src={art} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover ring-1 ring-white/10 sm:h-15 sm:w-15 sm:rounded-xl" />}
            </span>
            {text ? (
              <span className={clsx('min-w-0 font-semibold leading-snug break-words text-white sm:flex-1', gone && 'line-through', buzzer ? 'text-base sm:text-lg' : 'text-[15px] sm:text-base', 'line-clamp-3')}>{text}</span>
            ) : (
              <span className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
            )}
            {round.peek && !known && (
              <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-violet-500/25 px-2 py-0.5 text-xs font-black text-violet-100" data-testid="peek-count">
                <PowerIcon id="peek" className="h-3 w-3" /> {round.peek[i] ?? 0}
              </span>
            )}
            {pickers(i).length > 0 && (
              <span className="absolute top-1.5 right-1.5 flex -space-x-1.5 sm:top-auto sm:right-2 sm:bottom-2">
                {pickers(i).slice(0, 5).map((p) => (
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

/** Power-ups: each allowed one once per game, one per round, used before answering. */
function PowerBar({ round, powers, allowed, solo, phase, onUse }: { round: PublicRound; powers: PowerId[]; allowed: PowerId[]; solo: boolean; phase: string; onUse: (p: PowerId) => void }) {
  const open = phase === 'question' && round.yourChoice === null && !round.yourPower
  const shown = POWER_IDS.filter((id) => allowed.includes(id) && !(solo && POWERS[id].rivals))
  if (!shown.length) return null
  return (
    <div className="-mx-1 flex items-stretch gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:gap-2 sm:overflow-visible" role="group" aria-label="Power-ups" data-testid="power-bar">
      {shown.map((id) => {
        const has = powers.includes(id)
        const active = round.yourPower === id
        return (
          <button
            key={id}
            type="button"
            disabled={!open || !has}
            onClick={() => onUse(id)}
            title={POWERS[id].hint}
            aria-pressed={active}
            data-testid={`power-${id}`}
            aria-label={`${POWERS[id].name}: ${POWERS[id].hint}${has ? '' : ' (used)'}`}
            className={clsx(
              'flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-bold whitespace-nowrap ring-1 transition sm:text-sm',
              active ? 'bg-white text-gray-900 ring-white' : has ? 'bg-white/[0.06] text-white ring-white/10 enabled:hover:bg-white/[0.12] disabled:opacity-60' : 'bg-transparent text-gray-600 line-through ring-white/5 [&_svg]:opacity-40',
            )}
          >
            <PowerIcon id={id} className={clsx('h-4 w-4', active && '!text-gray-900')} /> {POWERS[id].name}
          </button>
        )
      })}
    </div>
  )
}

/** Antakshari's letter (and whose turn it is in a team battle). */
function AntakshariBanner({ round, phase, myTeam }: { round: PublicRound; phase: string; myTeam: string | null }) {
  const { state } = useRoomContext()
  const labels = useTeamLabels(state.settings)
  const turn = round.turn ? { ...TEAMS[round.turn], ...labels[round.turn] } : null
  const other = round.turn ? labels[round.turn === 'a' ? 'b' : 'a'] : null
  const reveal = phase === 'reveal'
  const letter = reveal ? round.nextLetter : round.letter
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 sm:mb-4" data-testid="antakshari-banner">
      <span className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500/15 px-3 py-1.5 text-sm font-bold text-emerald-100 ring-1 ring-emerald-400/30">
        🎤{' '}
        {reveal ? (
          letter ? (
            <>
              Next song starts with <span className="rounded-lg bg-emerald-400 px-2 font-black text-black uppercase">{letter}</span>
            </>
          ) : round.index + 1 < round.total ? (
            'Next: a fresh start'
          ) : (
            'Last song!'
          )
        ) : letter ? (
          <>
            Starts with <span className="rounded-lg bg-emerald-400 px-2 text-lg font-black text-black uppercase" data-testid="antakshari-letter">{letter}</span>
          </>
        ) : (
          'Fresh start — any letter'
        )}
      </span>
      {turn && other && !reveal && (
        <span className={clsx('inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-sm font-bold ring-1 ring-white/10', turn.bg, turn.text)} data-testid="turn-banner">
          {turn.emoji} {turn.name}’s turn
          <span className="font-normal text-gray-300">{myTeam && myTeam !== round.turn ? '· you can steal for ½ points' : `· ${other.name} can steal`}</span>
        </span>
      )}
    </div>
  )
}

function Status({ phase, round, you, answeredCount, activeCount, solo }: { phase: string; round: PublicRound; you: string; answeredCount: number; activeCount: number; solo: boolean }) {
  const question = round.challenge ? CHALLENGE_QUESTION[round.challenge.kind] : round.mode === 'title' ? 'What’s the song?' : round.mode === 'artist' ? 'Who’s the artist?' : 'Ready?'
  const waiting = solo ? null : (
    <span className="mt-1 block text-sm font-normal text-gray-400">
      Waiting for others ({answeredCount}/{activeCount})
    </span>
  )
  if (phase === 'countdown') return <p className="text-lg font-bold text-white">Get ready…</p>
  const power = round.yourPower ? <PowerChip id={round.yourPower} /> : null
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
      <p className="flex flex-col gap-1 text-lg font-extrabold text-white sm:text-xl">
        <span>
          {question}
          {power}
        </span>
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
  const noun = isChallengeMode(round.mode) ? 'Question' : 'Song'
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-gray-950/85 backdrop-blur-md" aria-live="assertive">
      <p className="mb-2 text-sm font-semibold tracking-[0.25em] text-gray-400 uppercase">
        {noun} {round.index + 1} of {round.total}
      </p>
      {round.double && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-sm font-extrabold text-amber-300">
          <Zap className="h-4 w-4" /> FINAL ROUND · DOUBLE POINTS
        </p>
      )}
      <span className="relative flex h-40 w-40 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-fuchsia-500/15" />
        <span key={left} className="animate-pop bg-linear-to-br from-brand-200 via-brand-400 to-rose-400 bg-clip-text text-9xl font-black text-transparent tabular-nums">
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
          {round.index + 1 < round.total ? (isChallengeMode(round.mode) ? 'Next question' : 'Next song') : 'See results'} <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </section>
  )
}

/** A TV is showing the game: the music plays there and this phone is a buzzer. */
function TvHint({ soundHere, onToggle }: { soundHere: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-sky-500/10 px-3 py-2.5 ring-1 ring-sky-400/20" data-testid="tv-hint">
      <Tv className="h-5 w-5 shrink-0 text-sky-300" />
      <p className="min-w-0 flex-1 text-sm text-sky-100">Watch the TV — the music plays there. Tap your answer here.</p>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={soundHere}
        aria-label={soundHere ? 'Mute this phone' : 'Also play the music on this phone'}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        {soundHere ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
    </div>
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
  // With a TV connected, phones are buzzers: the music plays on the TV unless you want it here too.
  const tv = state.displays > 0
  const [soundHere, setSoundHere] = useState(false)

  const looked = useEmojiSong(round)
  useRoundAudio(round, phase, serverNow, looked, tv && !soundHere)
  // Show the looked-up cover and link at the reveal too.
  const shownRound = useMemo<PublicRound>(
    () => (looked && round.reveal && !round.reveal.track.preview ? { ...round, reveal: { ...round.reveal, track: { ...round.reveal.track, artwork: looked.artwork, link: looked.link, preview: looked.preview } } } : round),
    [round, looked],
  )

  const localRound = useMemo<PublicRound>(() => {
    if (round.yourChoice === null && pending && pending.round === round.index && phase === 'question') {
      return { ...round, yourChoice: pending.choice }
    }
    return round
  }, [round, pending, phase])

  useRoundSfx(localRound, phase, now)

  const locked = phase !== 'question' || localRound.yourChoice !== null || round.endsAt <= now

  const answer = (choice: number) => {
    if (locked || round.removed?.includes(choice)) return
    audio.unlock()
    playSfx('pop')
    vibrate(15)
    setPending({ round: round.index, choice })
    send({ t: 'answer', round: round.index, choice })
  }
  const next = () => send({ t: 'next' })
  const activatePower = (power: PowerId) => {
    if (locked) return
    playSfx('pop')
    send({ t: 'power', round: round.index, power })
  }

  // Keyboard shortcuts 1–4 (and Enter for the next song when solo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
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
  const challenge = isChallengeMode(round.mode)
  const noun = challenge ? 'question' : 'song'
  // React at the reveal, or while you wait for others once you've answered.
  const reacting = !state.solo && (phase === 'reveal' || (phase === 'question' && localRound.yourChoice !== null))
  const myPick = round.reveal?.picks[you]
  const outcome = localRound.yourResult
    ? { kind: localRound.yourResult.correct ? ('right' as const) : ('wrong' as const), points: localRound.yourResult.points }
    : myPick && myPick.choice !== null
      ? { kind: myPick.correct ? ('right' as const) : ('wrong' as const), points: myPick.points }
      : null
  const doubleNext = state.settings.doubleFinal && round.total > 1 && round.index + 2 === round.total
  const ranked = rankPlayers(state.players)
  const myRank = ranked.findIndex((p) => p.id === you)
  const antakshari = state.settings.game === 'songs' && state.settings.antakshari

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-28 sm:px-4 lg:pb-10">
      {state.notice && round.index === 0 && (
        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 sm:mb-4">{state.notice}</div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <div className="min-w-0">
          <div className="game-card relative overflow-hidden rounded-3xl border border-white/10 p-3.5 shadow-2xl sm:p-7">
            {shownRound.reveal?.track.artwork && <img src={shownRound.reveal.track.artwork} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-20 blur-3xl" />}
            {phase === 'countdown' && <CountdownOverlay round={round} now={now} />}
            {outcome?.kind === 'right' && <StreakHype streak={me?.streak ?? 0} round={round.index} />}

            <div className="relative">
              <div className="mb-2.5 flex items-center justify-between gap-2 sm:mb-4">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-3">
                  <div className="text-sm text-gray-300 sm:text-base">
                    {challenge ? 'Question' : 'Song'}{' '}
                    <span className="font-extrabold text-white" data-testid="round-number">
                      {round.index + 1}
                    </span>
                    /{round.total}
                  </div>
                  {round.double && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-extrabold text-amber-300 sm:px-2.5 sm:py-1">
                      <Zap className="h-3.5 w-3.5" /> ×2
                    </span>
                  )}
                  {(me?.streak ?? 0) >= 2 && <span className="rounded-full bg-orange-400/15 px-2 py-0.5 text-xs font-extrabold text-orange-300 sm:px-2.5 sm:py-1">🔥 {me!.streak}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm text-gray-300 sm:text-base">
                  {!state.solo && myRank >= 0 && (
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs font-bold text-gray-200" data-testid="my-rank">
                      #{myRank + 1}/{ranked.length}
                    </span>
                  )}
                  <span className="text-lg font-extrabold text-brand-300 tabular-nums sm:text-xl" data-testid="my-score">
                    <AnimatedNumber value={me?.score ?? 0} />
                  </span>
                </div>
              </div>
              <div className="mb-3 sm:mb-5">
                <RoundDots total={round.total} current={round.index} marks={marks} />
              </div>

              {antakshari && <AntakshariBanner round={round} phase={phase} myTeam={me?.team ?? null} />}

              <div className="mb-3 rounded-2xl border border-white/5 bg-black/20 p-2.5 sm:mb-6 sm:p-4" aria-live="polite">
                <div className="flex items-center gap-3 sm:gap-4">
                  {phase === 'question' && <TimerRing progress={progress} seconds={secondsLeft} urgent={secondsLeft <= 3} />}
                  <div className="min-w-0 flex-1">
                    <Status phase={phase} round={localRound} you={you} answeredCount={answeredCount} activeCount={active.length} solo={state.solo} />
                  </div>
                  {phase === 'question' && <Equalizer active={playing} className="h-6 max-sm:hidden" />}
                  {phase === 'reveal' && <NextUp endsAt={state.phaseEndsAt} now={now} last={round.index + 1 >= round.total} double={doubleNext} noun={noun} />}
                </div>
              </div>

              <div className={clsx('flex flex-col gap-3 sm:gap-6', !challenge && !tv && 'xl:flex-row')}>
                {tv && !challenge && !round.reveal ? (
                  <TvHint soundHere={soundHere} onToggle={() => setSoundHere((v) => !v)} />
                ) : (
                  <div className={challenge || tv ? '' : 'xl:w-[40%]'}>
                    {challenge ? <ChallengeStage round={shownRound} now={now} /> : <VinylStage round={round} spinning={playing && phase !== 'countdown'} />}
                  </div>
                )}
                <div key={`${round.index}:${outcome?.kind ?? ''}`} className={clsx('relative min-w-0 flex-1', outcome?.kind === 'wrong' && 'animate-shake')}>
                  {state.settings.powerUps && me && (
                    <div className="mb-2.5 sm:mb-3">
                      <PowerBar round={localRound} powers={me.powers} allowed={state.settings.powers} solo={state.solo} phase={phase} onUse={activatePower} />
                    </div>
                  )}
                  {round.yourNote && phase !== 'countdown' && (
                    <p className="mb-2.5 flex items-center gap-2 rounded-xl bg-yellow-300/10 px-3 py-2 text-sm font-semibold text-yellow-100 ring-1 ring-yellow-300/20 sm:mb-3" data-testid="power-note">
                      {round.yourPower && <PowerIcon id={round.yourPower} className="h-4 w-4" />} {round.yourNote}
                    </p>
                  )}
                  <Choices round={localRound} players={state.players} onAnswer={answer} locked={locked} buzzer={tv} />
                  {outcome?.kind === 'right' && (
                    <span aria-hidden="true" className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 animate-float-up text-5xl font-black text-emerald-300 drop-shadow-[0_4px_20px_rgba(16,185,129,0.6)]">
                      +{outcome.points}
                    </span>
                  )}
                </div>
              </div>

              {reacting && <ReactionBar className="mt-4 border-t border-white/5 pt-4 sm:mt-6 sm:pt-5" />}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:mt-3">
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

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
          {state.teams && <TeamStandings teams={state.teams} you={you} />}
          {state.solo ? <SoloPanel me={me} marks={marks} round={round} onNext={next} phase={phase} /> : <Scoreboard players={state.players} you={you} hostId={state.hostId} phase={phase} />}
        </aside>
      </div>
    </main>
  )
}
