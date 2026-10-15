import { ArrowRight, Loader2, Users, VolumeX, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ROOM_CODE_RE } from '../../shared/protocol'
import { Shell } from '../components/Shell'
import { useToast } from '../components/Toasts'
import { SignInButton } from '../components/UserMenu'
import { Button, Card, Input, Logo, Spinner } from '../components/ui'
import { player, usePlayer } from '../lib/audio'
import { useAuth } from '../lib/auth'
import { describeSource } from '../lib/source'
import { load } from '../lib/storage'
import { useRoom } from '../lib/useRoom'
import { RoomContext, type RoomContextValue } from '../room/context'
import { GameView } from '../room/GameView'
import { Lobby } from '../room/Lobby'
import { Reactions } from '../room/Reactions'
import { Results } from '../room/Results'
import { RoomHeader } from '../room/RoomHeader'
import { BRAND } from '../../shared/brand'

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-[calc(100dvh-9rem)] items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  )
}

function Message({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <Centered>
      <Card>
        <h2 className="mb-2 text-2xl font-bold text-white">{title}</h2>
        <p className="mb-6 text-sm text-gray-400">{body}</p>
        <div className="space-y-3">
          {action}
          <Button className="w-full" onClick={() => navigate('/')}>
            Back to home
          </Button>
        </div>
      </Card>
    </Centered>
  )
}

function JoinCard({
  code,
  players,
  onJoin,
  error,
  busy,
  group,
  solo,
}: {
  code: string
  players: number
  onJoin: (name: string) => void
  error: { code: string; message: string } | null
  busy: boolean
  group: { id: string; name: string } | null
  solo: boolean
}) {
  const { me, loading } = useAuth()
  const [name, setName] = useState(() => load('name') ?? me?.name.split(' ')[0]?.slice(0, 20) ?? '')
  useEffect(() => {
    if (me && !name) setName(me.name.split(' ')[0]!.slice(0, 20))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me])
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    player.unlock()
    if (name.trim()) onJoin(name.trim())
  }

  return (
    <Centered>
      <Card>
        <form onSubmit={submit} noValidate>
          <p className="mb-4 text-sm text-gray-400">
            {solo ? (
              'Solo game'
            ) : (
              <>
                Joining room <span className="font-mono font-bold tracking-widest text-white">{code}</span>
                {players > 0 && ` · ${players} player${players === 1 ? '' : 's'} here`}
              </>
            )}
          </p>
          {group && (
            <p className="mb-4 flex items-center gap-2 rounded-lg bg-fuchsia-500/10 px-3 py-2 text-sm text-fuchsia-100">
              <Users className="h-4 w-4" /> {group.name} group game
            </p>
          )}
          {group && !me && !loading ? (
            <>
              <h2 className="mb-2 text-2xl font-bold text-white">Sign in to join</h2>
              <p className="mb-6 text-sm text-gray-400">Group games are for signed-in players, so wins land on the right person’s leaderboard.</p>
              <SignInButton returnTo={`/r/${code}`} label="Sign in with Google to join" />
            </>
          ) : (
          <>
          <h2 className="mb-2 text-2xl font-bold text-white">What should we call you?</h2>
          <p className="mb-6 text-sm text-gray-400">{solo ? 'It goes on your results and recap.' : 'This name is shown to everyone in the room.'}</p>
          <label htmlFor="player-name" className="sr-only">
            Your name
          </label>
          <Input
            id="player-name"
            ref={input}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            placeholder="Your name"
            autoComplete="nickname"
            maxLength={20}
            className="mb-3"
          />
          {error && (
            <p role="alert" className="mb-3 text-sm text-red-400">
              {error.message}
            </p>
          )}
          {(error?.code === 'members_only' || error?.code === 'signin_required') && !me ? (
            <SignInButton returnTo={`/r/${code}`} label="Sign in with Google to join" />
          ) : (
            <Button type="submit" variant="gradient" className="w-full" disabled={!name.trim()} loading={busy}>
              Join game <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          </>
          )}
        </form>
      </Card>
    </Centered>
  )
}

function SoundBlockedBanner() {
  const { blocked } = usePlayer()
  if (!blocked) return null
  return (
    <button
      type="button"
      onClick={() => player.unlock()}
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg"
    >
      <VolumeX className="h-4 w-4" /> Tap to turn on sound
    </button>
  )
}

function RoomView({ code }: { code: string }) {
  const room = useRoom(code)
  const { status, state, you, error, send, join, leave, serverNow, reactions, wantsSeat, suggestion } = room
  const [joining, setJoining] = useState(false)
  const toast = useToast()

  // Host: friends can suggest music; one tap applies it.
  useEffect(() => {
    if (!suggestion || !state || state.hostId !== you) return
    const from = state.players.find((p) => p.id === suggestion.from)?.name ?? 'Someone'
    const title = describeSource(suggestion.source).title
    toast({
      title: `${from} suggests ${title}`,
      body: 'Switch the game to this?',
      action: { label: 'Use it', onClick: () => send({ t: 'settings', settings: { source: suggestion.source } }) },
      durationMs: 9000,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion])
  // While songs load, keep showing whichever screen the host started from.
  const lastSettledPhase = useRef<'lobby' | 'results'>('lobby')
  if (state && (state.phase === 'lobby' || state.phase === 'results')) lastSettledPhase.current = state.phase

  useEffect(() => {
    document.title = `Room ${code} · ${BRAND.name}`
  }, [code])

  // Music carries over between screens (reveal → recap); it stops when you leave the room.
  useEffect(() => () => player.stop(), [])

  // Browsers only allow audio after a user gesture; any tap on the page unlocks it.
  useEffect(() => {
    const unlock = () => player.unlock()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])

  useEffect(() => {
    if (you || error) setJoining(false)
  }, [you, error])

  const ctx = useMemo<RoomContextValue | null>(() => {
    if (!state || !you) return null
    return {
      state,
      you,
      me: state.players.find((p) => p.id === you),
      isHost: state.hostId === you,
      send,
      serverNow,
      leave,
    }
  }, [state, you, send, serverNow, leave])

  if (status === 'missing') {
    return <Message title="Room not found" body={`There’s no game with the code ${code}. It may have expired — rooms close after a few hours of inactivity.`} />
  }
  if (status === 'kicked') {
    return <Message title="You were removed" body="The host removed you from this room." />
  }
  if (status === 'replaced') {
    return (
      <Message
        title="Opened in another tab"
        body="You’re playing this game in another tab or window."
        action={
          <Button variant="gradient" className="w-full" onClick={() => location.reload()}>
            Play here instead
          </Button>
        }
      />
    )
  }

  const meStillListed = !!(state && you && state.players.some((p) => p.id === you))

  let content: ReactNode
  if (!state) {
    content = (
      <Centered>
        <Spinner label={status === 'reconnecting' ? 'Connecting to the room…' : 'Joining room…'} />
      </Centered>
    )
  } else if (!ctx || !meStillListed) {
    if (wantsSeat && !error && status !== 'reconnecting' && !ctx) {
      content = (
        <Centered>
          <Spinner label="Rejoining…" />
        </Centered>
      )
    } else {
      content = (
        <JoinCard
          code={code}
          players={state.players.filter((p) => p.connected).length}
          error={error}
          group={state.group}
          solo={state.solo}
          busy={joining}
          onJoin={(name) => {
            setJoining(true)
            join(name)
          }}
        />
      )
    }
  } else {
    const phase = ctx.state.phase === 'loading' ? lastSettledPhase.current : ctx.state.phase
    content = (
      <RoomContext.Provider value={ctx}>
        <RoomHeader />
        {phase === 'lobby' ? (
          <Lobby />
        ) : phase === 'results' ? (
          <Results />
        ) : (
          <GameView />
        )}
        <Reactions reactions={reactions} players={ctx.state.players} />
        <SoundBlockedBanner />
      </RoomContext.Provider>
    )
  }

  return (
    <>
      {status === 'reconnecting' && state && (
        <div role="status" className="fixed top-12 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-500/40 bg-gray-900 px-4 py-2 text-sm text-amber-200 shadow-lg">
          <WifiOff className="h-4 w-4" /> Reconnecting… <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}
      {content}
    </>
  )
}

export function RoomPage() {
  const params = useParams()
  const code = (params.code ?? '').toUpperCase()
  if (!ROOM_CODE_RE.test(code)) {
    return (
      <Shell>
        <Message title="Invalid room link" body="Room codes are 4 letters. Check the link and try again." />
      </Shell>
    )
  }
  return (
    <Shell banner={false} nav={false}>
      <RoomView key={code} code={code} />
    </Shell>
  )
}
