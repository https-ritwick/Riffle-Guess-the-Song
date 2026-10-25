// Big-screen mode: open /tv/CODE on a TV, laptop or projector. It shows the room
// and plays the music; everyone answers on their phone like a buzzer.
import clsx from 'clsx'
import { Crown, Maximize, Tv, Volume2 } from 'lucide-react'
import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { BRAND } from '../../shared/brand'
import { CHALLENGE_QUESTION } from '../../shared/challenges'
import { TEAM_IDS, TEAMS } from '../../shared/modes'
import type { PublicPlayer, PublicRound, PublicState } from '../../shared/protocol'
import { LogoMark, PlayerAvatar, Spinner } from '../components/ui'
import { player as audio, usePlayer } from '../lib/audio'
import { describeGame, difficultyLabel } from '../lib/source'
import { useNow } from '../lib/useNow'
import { useRoom } from '../lib/useRoom'
import { RoomContext, type RoomContextValue } from '../room/context'
import { ChallengeStage, Equalizer, isChallengeMode, OPTION_STYLES, useEmojiSong, useRoundAudio, VinylStage } from '../room/GameView'
import { AnimatedNumber, rankPlayers } from '../room/Scoreboard'
import { TeamStandings } from '../room/Teams'
import { useTeamLabels } from '../lib/teams'

function JoinQr({ code, size = 8 }: { code: string; size?: number }) {
  const url = `${location.origin}/r/${code}`
  const src = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    return qr.createDataURL(size, 2)
  }, [url, size])
  return <img src={src} alt={`QR code to join room ${code}`} className="h-full w-full rounded-2xl bg-white p-2 [image-rendering:pixelated]" />
}

function TopBar({ state }: { state: PublicState }) {
  const host = location.host.replace(/^www\./, '')
  return (
    <header className="flex items-center justify-between gap-6 px-8 py-5">
      <div className="flex items-center gap-3">
        <LogoMark className="h-10 w-10" />
        <span className="text-2xl font-extrabold text-white">{BRAND.name}</span>
      </div>
      <p className="text-xl text-gray-300">
        Join at <span className="font-bold text-white">{host}</span> · code{' '}
        <span className="rounded-xl bg-white/10 px-3 py-1 font-mono text-3xl font-black tracking-[0.25em] text-white" data-testid="tv-code">
          {state.code}
        </span>
      </p>
    </header>
  )
}

function Lobby({ state }: { state: PublicState }) {
  const labels = useTeamLabels(state.settings)
  const game = describeGame(state.settings)
  const players = state.players.filter((p) => p.connected)
  const host = state.players.find((p) => p.id === state.hostId)
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-10 px-10 pb-10">
      <div className="flex flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.04] p-10 text-center">
        <p className="text-2xl font-semibold text-gray-300">Scan to join on your phone</p>
        <div className="my-6 h-72 w-72">
          <JoinQr code={state.code} />
        </div>
        <p className="text-xl text-gray-400">or open {location.host} and enter</p>
        <p className="mt-2 font-mono text-8xl font-black tracking-[0.3em] text-white">{state.code}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
          <p className="text-lg font-semibold tracking-[0.2em] text-brand-300 uppercase">Tonight’s game</p>
          <p className="mt-2 text-5xl font-black text-white">
            {game.emoji} {game.title}
          </p>
          <p className="mt-2 text-2xl text-gray-300">{game.subtitle}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-lg">
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-white">{state.settings.rounds} rounds</span>
            <span className="rounded-full bg-white/10 px-4 py-1.5 text-white">{difficultyLabel(state.settings.difficulty)}</span>
            {state.settings.powerUps && <span className="rounded-full bg-brand-400/20 px-4 py-1.5 text-brand-100">⚡ Power-ups</span>}
            {state.settings.teams && <span className="rounded-full bg-white/10 px-4 py-1.5 text-white">⚔️ Team battle</span>}
          </div>
        </div>
        <div className="min-h-0 flex-1 rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
          <p className="mb-5 text-2xl font-bold text-white">
            {players.length} {players.length === 1 ? 'player' : 'players'} in
          </p>
          {state.settings.teams ? (
            <div className="grid grid-cols-2 gap-6">
              {TEAM_IDS.map((t) => (
                <div key={t} className={clsx('rounded-3xl p-5 ring-1', TEAMS[t].tile)}>
                  <p className={clsx('mb-4 text-3xl font-black', TEAMS[t].text)}>
                    {labels[t].emoji} {labels[t].name}
                  </p>
                  <PlayerGrid players={players.filter((p) => p.team === t)} />
                </div>
              ))}
            </div>
          ) : (
            <PlayerGrid players={players} />
          )}
          {players.length === 0 && <p className="text-xl text-gray-400">Waiting for players…</p>}
        </div>
        <p className="text-center text-2xl text-gray-300">{host ? `Waiting for ${host.name} to start the game…` : 'Waiting for the host…'}</p>
      </div>
    </div>
  )
}

function PlayerGrid({ players }: { players: PublicPlayer[] }) {
  return (
    <ul className="flex flex-wrap gap-5">
      {players.map((p) => (
        <li key={p.id} className="flex w-24 animate-pop flex-col items-center gap-2">
          <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="lg" />
          <span className="w-full truncate text-center text-lg font-semibold text-white">{p.name}</span>
        </li>
      ))}
    </ul>
  )
}

function TimerBar({ round, now, phase }: { round: PublicRound; now: number; phase: string }) {
  const total = round.endsAt - round.startsAt
  const left = phase === 'question' ? Math.max(0, round.endsAt - now) : 0
  const pct = phase === 'question' ? (left / total) * 100 : phase === 'countdown' ? 100 : 0
  return (
    <div className="flex items-center gap-5">
      <div className="h-5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={clsx('h-full rounded-full transition-[width] duration-100 ease-linear', left < 4000 ? 'bg-red-400' : 'bg-linear-to-r from-brand-300 to-rose-500')} style={{ width: `${pct}%` }} />
      </div>
      <span className={clsx('w-20 text-right text-5xl font-black tabular-nums', left < 4000 && phase === 'question' ? 'text-red-300' : 'text-white')}>{phase === 'question' ? Math.ceil(left / 1000) : ''}</span>
    </div>
  )
}

function TvChoices({ round, players }: { round: PublicRound; players: PublicPlayer[] }) {
  const reveal = round.reveal
  return (
    <div className="grid grid-cols-2 gap-5">
      {[0, 1, 2, 3].map((i) => {
        const style = OPTION_STYLES[i]!
        const text = round.options?.[i]
        const right = reveal && reveal.correct === i
        const pickers = reveal ? players.filter((p) => reveal.picks[p.id]?.choice === i) : []
        return (
          <div
            key={i}
            className={clsx(
              'relative flex min-h-32 items-center gap-5 rounded-3xl border-2 bg-linear-to-br to-transparent p-5 transition-all duration-500',
              style.buzz,
              reveal ? (right ? 'scale-[1.02] border-emerald-300 bg-emerald-500/25 shadow-[0_0_60px_-10px] shadow-emerald-400' : 'border-white/5 opacity-40') : 'border-white/10',
            )}
          >
            <span className={clsx('flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-4xl font-black', style.badge)}>{style.letter}</span>
            <span className="min-w-0 flex-1 text-3xl leading-tight font-bold text-white">{text ?? '…'}</span>
            {pickers.length > 0 && (
              <span className="absolute right-4 bottom-3 flex -space-x-2">
                {pickers.slice(0, 8).map((p) => (
                  <PlayerAvatar key={p.id} avatar={p.avatar} photo={p.photo} name={p.name} size="md" />
                ))}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Leaders({ state }: { state: PublicState }) {
  const ranked = rankPlayers(state.players).slice(0, 6)
  return (
    <ol className="space-y-3">
      {ranked.map((p, i) => (
        <li key={p.id} className="flex items-center gap-4 rounded-2xl bg-white/[0.05] px-4 py-3">
          <span className={clsx('w-8 text-center text-2xl font-black', i === 0 ? 'text-amber-300' : 'text-gray-400')}>{i + 1}</span>
          <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="md" />
          <span className="min-w-0 flex-1 truncate text-2xl font-semibold text-white">{p.name}</span>
          {p.roundPoints !== null && state.phase === 'reveal' && (
            <span className={clsx('rounded-lg px-2 py-0.5 text-lg font-bold', p.roundPoints > 0 ? 'bg-brand-500/20 text-brand-200' : 'bg-white/10 text-gray-300')}>
              {p.roundPoints > 0 ? `+${p.roundPoints}` : p.roundPoints < 0 ? `−${-p.roundPoints}` : '✗'}
            </span>
          )}
          <span className="w-28 text-right text-2xl font-black text-white tabular-nums">
            <AnimatedNumber value={p.score} />
          </span>
        </li>
      ))}
    </ol>
  )
}

function Game({ state, serverNow }: { state: PublicState; serverNow: () => number }) {
  const labels = useTeamLabels(state.settings)
  const round = state.round!
  const phase = state.phase
  const now = useNow(serverNow, 100)
  const { playing } = usePlayer()
  const looked = useEmojiSong(round)
  useRoundAudio(round, phase, serverNow, looked)
  const challenge = isChallengeMode(round.mode)
  const answered = state.players.filter((p) => p.connected && p.answered)
  const question = round.challenge ? CHALLENGE_QUESTION[round.challenge.kind] : round.mode === 'artist' ? 'Who’s the artist?' : 'What’s the song?'
  const antakshari = state.settings.game === 'songs' && state.settings.antakshari
  const letter = phase === 'reveal' ? round.nextLetter : round.letter

  if (phase === 'countdown') {
    const left = Math.max(1, Math.ceil((round.startsAt - now) / 1000))
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <p className="text-3xl font-semibold tracking-[0.3em] text-gray-300 uppercase">
          {challenge ? 'Question' : 'Song'} {round.index + 1} of {round.total}
        </p>
        {antakshari && round.letter && (
          <p className="text-4xl font-bold text-emerald-200">
            🎤 Starts with <span className="rounded-2xl bg-emerald-400 px-4 font-black text-black uppercase">{round.letter}</span>
          </p>
        )}
        {round.double && <p className="rounded-full bg-amber-400/20 px-6 py-2 text-3xl font-black text-amber-300">FINAL ROUND · DOUBLE POINTS</p>}
        <span key={left} className="animate-pop bg-linear-to-br from-brand-200 via-brand-400 to-rose-400 bg-clip-text text-[14rem] leading-none font-black text-transparent">
          {left}
        </span>
      </div>
    )
  }

  return (
    <div className="grid flex-1 grid-cols-[minmax(0,1fr)_26rem] gap-8 px-10 pb-10">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex items-center gap-6">
          <p className="text-3xl text-gray-300">
            {challenge ? 'Question' : 'Song'} <span className="font-black text-white">{round.index + 1}</span>/{round.total}
          </p>
          {antakshari && (
            <p className="rounded-2xl bg-emerald-500/15 px-4 py-2 text-2xl font-bold text-emerald-100" data-testid="tv-letter">
              🎤 {phase === 'reveal' ? (letter ? <>Next starts with <b className="uppercase">{letter}</b></> : 'Fresh start next') : letter ? <>Starts with <b className="text-3xl uppercase">{letter}</b></> : 'Fresh start'}
            </p>
          )}
          {round.turn && phase !== 'reveal' && (
            <p className={clsx('rounded-2xl px-4 py-2 text-2xl font-bold', TEAMS[round.turn].bg, TEAMS[round.turn].text)}>
              {labels[round.turn].emoji} {labels[round.turn].name}’s turn
            </p>
          )}
          <div className="ml-auto">{phase === 'question' && <Equalizer active={playing} className="h-8" />}</div>
        </div>
        <TimerBar round={round} now={now} phase={phase} />
        <p className="text-5xl font-black text-white">{phase === 'reveal' ? 'The answer…' : question}</p>
        <div className="[&_h3]:!text-4xl [&_p]:text-xl">{challenge ? <ChallengeStage round={round} now={now} /> : <VinylStage round={round} spinning={playing} />}</div>
        <TvChoices round={round} players={state.players} />
      </div>
      <aside className="flex flex-col gap-6">
        {state.teams && <TeamStandings teams={state.teams} big />}
        {phase === 'question' ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="mb-4 text-2xl font-bold text-white">
              Answered {answered.length}/{state.players.filter((p) => p.connected).length}
            </p>
            <div className="flex flex-wrap gap-3">
              {answered.map((p) => (
                <span key={p.id} className="animate-pop">
                  <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="lg" />
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
            <p className="mb-4 text-2xl font-bold text-white">Leaderboard</p>
            <Leaders state={state} />
          </div>
        )}
      </aside>
    </div>
  )
}

function Results({ state }: { state: PublicState }) {
  const labels = useTeamLabels(state.settings)
  const ranked = rankPlayers(state.players)
  const podium = [ranked[1], ranked[0], ranked[2]]
  return (
    <div className="flex flex-1 flex-col items-center gap-8 px-10 pb-10">
      <p className="text-6xl font-black text-white">Game complete! 🎉</p>
      {state.teams && state.teams[0] && (
        <p className={clsx('rounded-3xl px-8 py-4 text-5xl font-black', TEAMS[state.teams[0].id].bg, TEAMS[state.teams[0].id].text)}>
          {state.teams[1] && state.teams[0].score === state.teams[1].score ? '🤝 It’s a tie!' : `${labels[state.teams[0].id].emoji} ${labels[state.teams[0].id].name} wins!`}
        </p>
      )}
      <div className="flex items-end justify-center gap-8">
        {podium.map((p, i) =>
          p ? (
            <div key={p.id} className="flex w-56 flex-col items-center gap-3">
              {i === 1 && <Crown className="h-14 w-14 text-amber-300" />}
              <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="lg" />
              <p className="w-full truncate text-center text-3xl font-bold text-white">{p.name}</p>
              <p className="text-2xl font-black text-brand-200 tabular-nums">{p.score.toLocaleString()}</p>
              <div className={clsx('w-full rounded-t-3xl bg-linear-to-b from-white/20 to-white/5', i === 1 ? 'h-48' : i === 0 ? 'h-32' : 'h-24')}>
                <p className="pt-4 text-center text-5xl font-black text-white">{i === 1 ? 1 : i === 0 ? 2 : 3}</p>
              </div>
            </div>
          ) : (
            <div key={i} className="w-56" />
          ),
        )}
      </div>
      <p className="text-2xl text-gray-400">The host can start another game from their phone.</p>
    </div>
  )
}

export default function TvPage() {
  const { code = '' } = useParams()
  const upper = code.toUpperCase()
  const room = useRoom(upper, { display: true })
  const [ready, setReady] = useState(false)
  const { state, status, send, serverNow } = room

  useEffect(() => {
    document.title = `TV · Room ${upper} · ${BRAND.name}`
  }, [upper])
  useEffect(() => () => audio.stop(), [])

  const ctx = useMemo<RoomContextValue | null>(
    () => (state ? { state, you: '', me: undefined, isHost: false, send, serverNow, leave: () => undefined } : null),
    [state, send, serverNow],
  )

  if (status === 'missing') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-night text-center">
        <div>
          <Tv className="mx-auto mb-4 h-14 w-14 text-gray-500" />
          <p className="text-4xl font-bold text-white">Room {upper} isn’t open</p>
          <p className="mt-2 text-xl text-gray-400">Start a game on your phone, then open its TV link.</p>
        </div>
      </main>
    )
  }
  if (!state || !ctx) {
    return (
      <main className="min-h-dvh bg-night pt-40">
        <Spinner label="Connecting to the room…" />
      </main>
    )
  }

  const inGame = ['countdown', 'question', 'reveal'].includes(state.phase) && state.round

  return (
    <RoomContext.Provider value={ctx}>
      <main className="relative flex min-h-dvh flex-col overflow-hidden bg-night text-white" data-testid="tv-screen">
        <div aria-hidden="true" className="aurora pointer-events-none absolute -top-56 left-1/2 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-rose-600/15 blur-3xl" />
        <div className="relative flex flex-1 flex-col">
          <TopBar state={state} />
          {inGame ? <Game state={state} serverNow={serverNow} /> : state.phase === 'results' ? <Results state={state} /> : state.phase === 'loading' ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner label="Getting the music ready…" />
            </div>
          ) : (
            <Lobby state={state} />
          )}
        </div>
        {!ready && (
          <button
            type="button"
            onClick={() => {
              audio.unlock()
              setReady(true)
              void document.documentElement.requestFullscreen?.().catch(() => undefined)
            }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/80 backdrop-blur"
            data-testid="tv-start"
          >
            <span className="flex h-28 w-28 items-center justify-center rounded-full bg-linear-to-br from-brand-300 to-rose-500 text-black">
              <Volume2 className="h-14 w-14" />
            </span>
            <span className="text-4xl font-black text-white">Tap to turn on the TV screen</span>
            <span className="flex items-center gap-2 text-xl text-gray-300">
              <Maximize className="h-5 w-5" /> Goes full screen and lets the music play here
            </span>
          </button>
        )}
      </main>
    </RoomContext.Provider>
  )
}
