import clsx from 'clsx'
import { ArrowRight, ChevronLeft, Disc3, Hash, Headphones, Loader2, PartyPopper, Plus, Smile, Sparkles, Trophy, User, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ROOM_CODE_RE } from '../../shared/protocol'
import { BeatBanner, CareerCard, DailyCard } from '../components/Engage'
import { GroupCard, InviteCard } from '../components/GroupCards'
import { Shell } from '../components/Shell'
import { useToast } from '../components/Toasts'
import { Button, Card, Cover, Input, Logo, SectionTitle } from '../components/ui'
import { SignInButton } from '../components/UserMenu'
import { player } from '../lib/audio'
import { useAuth } from '../lib/auth'
import { FEATURED_WITH_COVERS } from '../lib/covers'
import { useMyGroups } from '../lib/groups'
import { useProgress } from '../lib/progress'
import { GAME_MODES } from '../lib/source'
import { fetchRoomInfo } from '../lib/useRoom'
import { BRAND } from '../../shared/brand'

const LOGIN_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  state: 'Your sign-in expired. Please try again.',
  not_configured: 'Google sign-in is not set up on this server yet.',
  email: 'Your Google account email must be verified.',
}

function MyGroups() {
  const { data, loading, reload } = useMyGroups(true)
  if (loading && !data) return <div className="h-40 animate-pulse rounded-2xl bg-gray-900/60" />
  const groups = data?.groups ?? []
  const invites = data?.invites ?? []
  return (
    <section aria-labelledby="my-groups" className="space-y-4">
      <SectionTitle
        right={
          <Link to="/groups?new=1" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-400 hover:text-brand-300">
            <Plus className="h-4 w-4" /> New group
          </Link>
        }
      >
        <span id="my-groups">Your groups</span>
      </SectionTitle>
      {invites.map((i) => (
        <InviteCard key={i.id} invite={i} onDone={reload} />
      ))}
      {groups.length === 0 ? (
        <Card className="text-center">
          <Users className="mx-auto mb-2 h-8 w-8 text-gray-500" />
          <p className="font-semibold text-white">No groups yet</p>
          <p className="mb-4 text-sm text-gray-400">Save your crew once, then start a game for everyone in one tap.</p>
          <Link to="/groups?new=1" className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-r from-brand-400 to-rose-500 px-4 font-bold text-black">
            <Plus className="h-4 w-4" /> Create a group
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </section>
  )
}

/** The four ways to play, as film-poster cards. */
function ModeShowcase() {
  const samples: Record<string, string> = {
    songs: '♪ ♫ ♪ ♫',
    dialogue: '“Mogambo khush hua!”',
    actor: 'Clue 1 · Hosts KBC…',
    emoji: '🚂🕺🌳☀️',
  }
  return (
    <section aria-labelledby="modes" className="space-y-4">
      <SectionTitle>
        <span id="modes">Four ways to play</span>
      </SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GAME_MODES.map((m, i) => (
          <div key={m.id} className="rise-in glass group relative overflow-hidden rounded-3xl p-5 transition hover:-translate-y-1" style={{ animationDelay: `${i * 0.08}s` }}>
            <div className={`pointer-events-none absolute inset-0 bg-linear-to-br opacity-80 ${m.tone}`} />
            <div className="relative">
              <span className="mb-4 block text-4xl drop-shadow-lg transition-transform group-hover:scale-110 group-hover:-rotate-6" aria-hidden="true">
                {m.emoji}
              </span>
              <p className="text-lg font-black text-white">{m.title}</p>
              <p className="mt-1 text-sm text-gray-300">{m.how}</p>
              <p className="film-strip mt-4 truncate rounded-xl bg-black/40 px-3 py-3 text-center font-serif text-amber-50 italic ring-1 ring-white/10" aria-hidden="true">
                {samples[m.id]}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function Features() {
  const items = [
    { icon: Sparkles, title: 'Bigger Spotify Blends', body: 'Everyone adds their Spotify (up to 300 songs each) and playlists. New songs play first every game — no repeats in the same order.' },
    { icon: Disc3, title: 'Look-alike answers', body: 'Wrong options come from the same singer, movie or era. On Hard, a wrong guess costs 100 points.' },
    { icon: Smile, title: '40 reactions', body: 'Roast your friends live with 🔥, 💀, 🤡, 🖕 and 36 more — floating up everyone’s screen.' },
    { icon: Trophy, title: 'Filmy awards', body: 'Fresh Bollywood-dialogue award names every game, a story-style recap, and group leaderboards.' },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="glass rounded-2xl p-5">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-300 to-rose-500 text-black shadow-lg shadow-rose-500/20">
            <Icon className="h-5 w-5" />
          </span>
          <p className="font-bold text-white">{title}</p>
          <p className="mt-1 text-sm text-gray-400">{body}</p>
        </div>
      ))}
    </div>
  )
}

export function Home() {
  const navigate = useNavigate()
  const toast = useToast()
  const { me, loading: authLoading } = useAuth()
  const progress = useProgress()
  const [params, setParams] = useSearchParams()
  const [step, setStep] = useState<'menu' | 'join'>(params.has('join') ? 'join' : 'menu')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'solo' | 'join' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = `${BRAND.name} — ${BRAND.tagline.replace(/\.$/, '')}`
    if (step === 'join') codeInput.current?.focus()
  }, [step])

  // Shared daily links land on the daily card.
  useEffect(() => {
    if (params.has('daily')) document.getElementById('daily')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [params])

  useEffect(() => {
    const err = params.get('login_error')
    if (err) {
      toast({ title: 'Sign-in failed', body: LOGIN_ERRORS[err] ?? 'Please try again.', tone: 'error' })
      params.delete('login_error')
      setParams(params, { replace: true })
    }
  }, [params, setParams, toast])

  async function createRoom(solo = false) {
    player.unlock()
    setBusy(solo ? 'solo' : 'create')
    setError(null)
    try {
      const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ solo }) })
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string }
      if (!res.ok || !body.code) throw new Error(body.error ?? 'Could not create a room.')
      navigate(`/r/${body.code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a room.')
      setBusy(null)
    }
  }

  async function joinRoom(e: FormEvent) {
    e.preventDefault()
    player.unlock()
    const c = code.trim().toUpperCase()
    if (!ROOM_CODE_RE.test(c)) {
      setError('Room codes are 4 letters, like “KZPT”.')
      return
    }
    setBusy('join')
    setError(null)
    const info = await fetchRoomInfo(c)
    if (!info) {
      setError('Could not reach the server. Check your connection.')
      setBusy(null)
    } else if (!info.exists) {
      setError(`No game found with code ${c}.`)
      setBusy(null)
    } else {
      navigate(`/r/${c}`)
    }
  }

  return (
    <Shell>
      <main className="relative mx-auto w-full max-w-6xl space-y-14 px-4 pt-6 pb-16 sm:pt-12">
        <div className="relative z-10 mx-auto w-full max-w-2xl">
          <BeatBanner params={params} />
          <div className="mb-10 text-center">
            <h1 className="mb-5">
              <Logo />
            </h1>
            <p className="bg-linear-to-r from-white via-brand-100 to-fuchsia-200 bg-clip-text text-4xl leading-tight font-black text-transparent sm:text-5xl">{BRAND.tagline}</p>
            <p className="mx-auto mt-3 max-w-lg text-gray-300">
              Name the song from a few seconds of audio — or switch to <span className="font-semibold text-white">Bollywood dialogues, star clues and emoji songs</span>. Solo, with friends, or with everyone’s Spotify blended together.
            </p>
          </div>

          {step === 'menu' ? (
            <div className="mx-auto max-w-xl space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => createRoom(false)}
                  disabled={!!busy}
                  className="group relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-300 via-brand-500 to-rose-500 p-5 text-left text-black shadow-xl shadow-rose-500/25 transition hover:-translate-y-0.5 hover:shadow-rose-500/40 disabled:opacity-70"
                >
                  <PartyPopper className="mb-6 h-7 w-7" />
                  <span className="block text-xl font-black">Create a game</span>
                  <span className="block text-sm font-medium text-black/70">Party · up to 16 players · share a link</span>
                  {busy === 'create' && <Loader2 className="absolute top-5 right-5 h-5 w-5 animate-spin" />}
                </button>
                <button
                  type="button"
                  onClick={() => createRoom(true)}
                  disabled={!!busy}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:-translate-y-0.5 hover:border-white/25 disabled:opacity-70"
                >
                  <User className="mb-6 h-7 w-7 text-brand-300" />
                  <span className="block text-xl font-black text-white">Play solo</span>
                  <span className="block text-sm text-gray-400">Just you · beat your personal best</span>
                  {busy === 'solo' && <Loader2 className="absolute top-5 right-5 h-5 w-5 animate-spin text-white" />}
                </button>
              </div>
              <Button
                className="w-full"
                variant="dark"
                icon={<Hash className="h-4 w-4" />}
                onClick={() => {
                  setError(null)
                  setStep('join')
                }}
              >
                Join with a code
              </Button>
              {!authLoading && !me && <SignInButton label="Continue with Google" />}
              {error && (
                <p role="alert" className="pt-1 text-center text-sm text-red-400">
                  {error}
                </p>
              )}

              <div className="mt-6 flex gap-3 rounded-xl border border-brand-400/25 bg-brand-500/10 p-4 text-sm text-gray-300">
                <Headphones className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                <p>
                  <span className="font-bold text-white">Free, no account needed for quick games.</span> Everyone plays on their own phone and hears the same clip at
                  the same time. Sign in with Google for groups — group games are for signed-in players.
                </p>
              </div>
            </div>
          ) : (
            <Card className="mx-auto max-w-md">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep('menu')
                }}
                className="mb-6 flex items-center text-sm text-gray-400 transition-colors hover:text-white"
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </button>
              <form onSubmit={joinRoom} noValidate>
                <h2 className="mb-2 text-2xl font-bold text-white">What’s the room code?</h2>
                <p className="mb-6 text-sm text-gray-400">Ask the host for the 4-letter code, or open the link they shared.</p>
                <label htmlFor="room-code" className="sr-only">
                  Room code
                </label>
                <Input
                  id="room-code"
                  ref={codeInput}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
                  placeholder="ABCD"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="mb-3 text-center text-2xl font-bold tracking-[0.5em] uppercase placeholder:tracking-[0.5em]"
                />
                {error && (
                  <p role="alert" className="mb-3 text-sm text-red-400">
                    {error}
                  </p>
                )}
                <Button type="submit" variant="gradient" className="w-full" loading={busy === 'join'} disabled={code.length !== 4}>
                  Join game <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
            </Card>
          )}
        </div>

        <div className={clsx('grid gap-6', progress.games > 0 && 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]')}>
          <DailyCard highlight={params.has('daily')} />
          <CareerCard />
        </div>

        {me && <MyGroups />}

        <ModeShowcase />

        <section aria-labelledby="featured" className="space-y-4">
          <SectionTitle>
            <span id="featured">Popular playlists to play</span>
          </SectionTitle>
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
            {FEATURED_WITH_COVERS.slice(0, 10).map((p) => (
              <div key={p.id} className="w-36 shrink-0 snap-start sm:w-40">
                <Cover images={p.image ? [p.image] : []} size="fill" label={p.name} />
                <p className="mt-2 line-clamp-2 text-sm font-semibold text-white">{p.name}</p>
                <p className="text-xs text-gray-400">{p.owner}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-400">Create a game, open the Playlists tab, and pick one — or paste your own link.</p>
        </section>

        <Features />

        <p className="text-center text-xs text-gray-500">
          Song previews come from Spotify and Apple Music / iTunes public previews. {BRAND.name} isn’t affiliated with Spotify or Apple.
        </p>
      </main>
    </Shell>
  )
}
