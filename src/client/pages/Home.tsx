import { ArrowRight, ChevronLeft, Disc3, Hash, Headphones, Loader2, PartyPopper, Plus, Sparkles, Trophy, User, Users, Zap } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ROOM_CODE_RE } from '../../shared/protocol'
import { GroupCard, InviteCard } from '../components/GroupCards'
import { Shell } from '../components/Shell'
import { useToast } from '../components/Toasts'
import { Button, Card, Cover, Input, Logo, SectionTitle } from '../components/ui'
import { SignInButton } from '../components/UserMenu'
import { player } from '../lib/audio'
import { useAuth } from '../lib/auth'
import { FEATURED_WITH_COVERS } from '../lib/covers'
import { useMyGroups } from '../lib/groups'
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
          <Link to="/groups?new=1" className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-r from-brand-500 to-violet-500 px-4 font-bold text-black">
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

function Features() {
  const items = [
    { icon: Sparkles, title: 'Spotify Blend', body: 'Everyone connects Spotify (or drops a playlist). Songs are mixed fairly and each reveal shows whose track it was.' },
    { icon: Disc3, title: 'Look-alike answers', body: 'Wrong options come from the same singer, movie or era, with album art to match. On Hard, a wrong guess costs 100 points.' },
    { icon: Zap, title: 'Race the room', body: 'Faster right answers score more, the first right answer earns a ⚡ bonus, and the leaderboard re-ranks live.' },
    { icon: Trophy, title: 'Recaps & groups', body: 'A story-style recap after every game, a shareable result grid, and saved groups with all-time leaderboards.' },
  ]
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <Icon className="mb-3 h-6 w-6 text-brand-400" />
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
          <div className="mb-10 text-center">
            <h1 className="mb-5">
              <Logo />
            </h1>
            <p className="bg-linear-to-r from-white via-brand-100 to-violet-200 bg-clip-text text-4xl leading-tight font-black text-transparent sm:text-5xl">{BRAND.tagline}</p>
            <p className="mx-auto mt-3 max-w-lg text-gray-400">A few seconds of audio, four look-alike answers, one winner. Play solo, with friends, or with everyone’s Spotify blended together.</p>
          </div>

          {step === 'menu' ? (
            <div className="mx-auto max-w-xl space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => createRoom(false)}
                  disabled={!!busy}
                  className="group relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-500 via-violet-500 to-pink-500 p-5 text-left text-black shadow-xl shadow-violet-500/20 transition hover:-translate-y-0.5 disabled:opacity-70"
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

              <div className="mt-6 flex gap-3 rounded-xl border border-teal-500/30 bg-teal-950/40 p-4 text-sm text-gray-300">
                <Headphones className="mt-0.5 h-5 w-5 shrink-0 text-teal-400" />
                <p>
                  <span className="font-bold text-white">Free, no account needed to play.</span> Everyone plays on their own phone and hears the same clip at
                  the same time. Sign in with Google to save groups and stats.
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

        {me && <MyGroups />}

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
