// Player-made quizzes: browse them, make your own from any songs, and share a link anyone can play.
import clsx from 'clsx'
import { ArrowLeft, Check, Globe, Link2, Loader2, Lock, Pause, Pencil, Play, Plus, Search, Share2, Trash2, User, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BRAND } from '../../shared/brand'
import { parsePlaylistUrl } from '../../shared/playlist'
import type { Track } from '../../shared/protocol'
import { MAX_QUIZ_TRACKS, MIN_QUIZ_TRACKS, QUIZ_EMOJIS, type QuizDetail, type QuizSummary } from '../../shared/quiz'
import { primaryArtist } from '../../shared/text'
import { Shell } from '../components/Shell'
import { useToast } from '../components/Toasts'
import { Button, Card, Cover, Input, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { loadPlaylist, playlistTracks, searchSongs } from '../lib/itunes'
import { loadQuiz, useMyQuizzes, useQuizList } from '../lib/quizzes'
import { trackEvent } from '../lib/track'
import { SignInRequired } from './GroupsPage'

function useTitle(title: string) {
  useEffect(() => {
    const before = document.title
    document.title = `${title} · ${BRAND.name}`
    return () => {
      document.title = before
    }
  }, [title])
}

function QuizCard({ quiz }: { quiz: QuizSummary }) {
  return (
    <Link to={`/q/${quiz.id}`} className="group flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition hover:-translate-y-0.5 hover:border-white/25" data-testid="quiz-card">
      <span className="relative">
        <Cover images={quiz.cover ? [quiz.cover] : []} size="fill" label={quiz.title} />
        <span className="absolute top-1.5 left-1.5 rounded-lg bg-black/70 px-1.5 py-0.5 text-lg leading-none">{quiz.emoji}</span>
        {quiz.visibility === 'unlisted' && (
          <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-gray-200">
            <Lock className="h-3 w-3" /> Link only
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold text-white">{quiz.title}</span>
        <span className="block truncate text-xs text-gray-400">
          {quiz.trackCount} songs · {quiz.plays} {quiz.plays === 1 ? 'play' : 'plays'}
        </span>
        <span className="block truncate text-xs text-gray-500">by {quiz.owner.name}</span>
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------------------

export function QuizzesPage() {
  useTitle('Quizzes')
  const { me } = useAuth()
  const [view, setView] = useState<'popular' | 'new' | 'mine'>('popular')
  const [q, setQ] = useState('')
  const list = useQuizList(view === 'new' ? 'new' : 'popular', q, view !== 'mine')
  const mine = useMyQuizzes(!!me && view === 'mine')
  const quizzes = view === 'mine' ? mine.data : list.data?.quizzes

  return (
    <Shell>
      <main className="mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white sm:text-4xl">🧩 Player-made quizzes</h1>
            <p className="mt-1 text-gray-400">Song quizzes made by the {BRAND.name} community — or build your own in a minute.</p>
          </div>
          <Link to="/quizzes/new" className="inline-flex h-11 items-center gap-2 rounded-xl bg-linear-to-r from-brand-300 via-brand-500 to-rose-500 px-4 font-bold text-black">
            <Plus className="h-4 w-4" /> Make a quiz
          </Link>
        </div>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex gap-1.5">
            {(['popular', 'new', ...(me ? (['mine'] as const) : [])] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={clsx('rounded-full px-4 py-2 text-sm font-semibold ring-1', view === v ? 'bg-white text-gray-900 ring-white' : 'bg-white/[0.04] text-gray-300 ring-white/10 hover:text-white')}
              >
                {v === 'popular' ? '🔥 Popular' : v === 'new' ? '✨ New' : 'My quizzes'}
              </button>
            ))}
          </div>
          {view !== 'mine' && (
            <div className="relative sm:ml-auto sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quizzes…" aria-label="Search quizzes" className="h-11 pl-10" maxLength={60} />
            </div>
          )}
        </div>
        {list.error && view !== 'mine' && <p className="text-sm text-red-300">{list.error}</p>}
        {!quizzes && <Spinner label="Loading quizzes…" />}
        {quizzes?.length === 0 && (
          <Card className="text-center">
            <p className="text-gray-300">{view === 'mine' ? 'You haven’t made a quiz yet.' : q ? 'No quizzes match that search.' : 'No quizzes yet — be the first!'}</p>
            <Link to="/quizzes/new" className="mt-3 inline-block font-semibold text-brand-300">
              Make a quiz →
            </Link>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {quizzes?.map((quiz) => (
            <QuizCard key={quiz.id} quiz={quiz} />
          ))}
        </div>
      </main>
    </Shell>
  )
}

// ---------------------------------------------------------------------------

export function QuizPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [quiz, setQuiz] = useState<QuizDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'solo' | 'party' | null>(null)
  const [copied, setCopied] = useState(false)
  useTitle(quiz?.title ?? 'Quiz')

  useEffect(() => {
    loadQuiz(id).then(setQuiz, (err) => setError(err instanceof Error ? err.message : 'Could not load this quiz.'))
  }, [id])

  const play = async (solo: boolean) => {
    setBusy(solo ? 'solo' : 'party')
    try {
      const { code } = await api<{ code: string }>('/api/rooms', { body: { quiz: id, solo } })
      navigate(`/r/${code}`)
    } catch (err) {
      toast({ title: 'Could not start', body: err instanceof Error ? err.message : undefined, tone: 'error' })
      setBusy(null)
    }
  }
  const url = `${location.origin}/q/${id}`
  const share = async () => {
    trackEvent('challenge_link')
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: quiz?.title, text: `Can you name all ${quiz?.trackCount} songs in my ${BRAND.name} quiz?`, url }).catch(() => undefined)
      return
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (error)
    return (
      <Shell>
        <main className="mx-auto max-w-md px-4 py-16">
          <Card className="text-center">
            <p className="text-lg font-bold text-white">Quiz not found</p>
            <p className="mt-1 text-sm text-gray-400">{error}</p>
            <Link to="/quizzes" className="mt-4 inline-block font-semibold text-brand-300">
              Browse quizzes →
            </Link>
          </Card>
        </main>
      </Shell>
    )
  if (!quiz)
    return (
      <Shell>
        <Spinner label="Loading quiz…" />
      </Shell>
    )

  const artists = [...new Set(quiz.tracks.map((t) => primaryArtist(t.artist)))].slice(0, 6)
  return (
    <Shell>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16">
        <Link to="/quizzes" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> All quizzes
        </Link>
        <Card className="relative overflow-hidden">
          {quiz.cover && <img src={quiz.cover} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-20 blur-3xl" />}
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative mx-auto w-40 shrink-0 sm:mx-0">
              <Cover images={quiz.cover ? [quiz.cover] : []} size="fill" label={quiz.title} className="rounded-2xl" />
              <span className="absolute -right-2 -bottom-2 rounded-2xl bg-gray-950 px-2 py-1 text-3xl ring-2 ring-white/10">{quiz.emoji}</span>
            </div>
            <div className="min-w-0 text-center sm:text-left">
              <p className="text-xs font-bold tracking-[0.2em] text-brand-300 uppercase">Player-made quiz</p>
              <h1 className="mt-1 text-3xl font-black break-words text-white" data-testid="quiz-title">
                {quiz.title}
              </h1>
              {quiz.description && <p className="mt-2 text-gray-300">{quiz.description}</p>}
              <p className="mt-2 text-sm text-gray-400">
                {quiz.trackCount} songs · {quiz.plays} {quiz.plays === 1 ? 'play' : 'plays'} · by {quiz.owner.name}
              </p>
              {artists.length > 0 && <p className="mt-1 text-xs text-gray-500">Featuring {artists.join(', ')}…</p>}
            </div>
          </div>
          <div className="relative mt-6 grid gap-2 sm:grid-cols-2">
            <Button variant="gradient" icon={<Users className="h-4 w-4" />} loading={busy === 'party'} onClick={() => void play(false)} data-testid="quiz-play-party">
              Play with friends
            </Button>
            <Button variant="white" icon={<User className="h-4 w-4" />} loading={busy === 'solo'} onClick={() => void play(true)} data-testid="quiz-play-solo">
              Play solo
            </Button>
          </div>
          <div className="relative mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <button type="button" onClick={() => void share()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5 hover:text-white">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />} {copied ? 'Link copied' : 'Share quiz'}
            </button>
            {quiz.mine && (
              <>
                <Link to={`/quizzes/${quiz.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5 hover:text-white">
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete “${quiz.title}”? This can’t be undone.`)) return
                    await api(`/api/quizzes/${quiz.id}`, { method: 'DELETE' })
                    navigate('/quizzes')
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </>
            )}
          </div>
        </Card>
        <p className="mt-4 text-center text-xs text-gray-500">The song list stays secret until you play — no spoilers.</p>
      </main>
    </Shell>
  )
}

// ---------------------------------------------------------------------------

/** One song in the builder, with a 30-second preview to check it's the right one. */
function SongRow({ track, playing, onPlay, onRemove, onAdd, added }: { track: Track; playing: boolean; onPlay: () => void; onRemove?: () => void; onAdd?: () => void; added?: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-2.5 py-2">
      <button type="button" onClick={onPlay} aria-label={playing ? 'Stop preview' : `Preview ${track.title}`} className="relative shrink-0">
        <Cover images={track.artwork ? [track.artwork] : []} size="sm" label={track.title} />
        <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 text-white">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}</span>
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{track.title}</span>
        <span className="block truncate text-xs text-gray-400">{track.artist}</span>
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          disabled={added}
          aria-label={added ? 'Added' : `Add ${track.title}`}
          className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', added ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white text-gray-900 hover:bg-brand-50')}
        >
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${track.title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-500/10 hover:text-red-300">
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

export function QuizBuilderPage() {
  const { id } = useParams()
  const editing = !!id
  const { me, loading } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState<string>('🎵')
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public')
  const [tracks, setTracks] = useState<Track[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Track[]>([])
  const [searching, setSearching] = useState(false)
  const [link, setLink] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  useTitle(editing ? 'Edit quiz' : 'Make a quiz')

  useEffect(() => {
    if (!id) return
    loadQuiz(id).then(
      (q) => {
        setTitle(q.title)
        setDescription(q.description)
        setEmoji(q.emoji)
        setVisibility(q.visibility)
        setTracks(q.tracks)
      },
      (err) => setError(err instanceof Error ? err.message : 'Could not load this quiz.'),
    )
  }, [id])

  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    let live = true
    const t = window.setTimeout(() => {
      searchSongs(term, 'in', { limit: 20 })
        .then((r) => live && setResults(r))
        .catch(() => live && setResults([]))
        .finally(() => live && setSearching(false))
    }, 350)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query])

  useEffect(() => () => audio.current?.pause(), [])

  const togglePreview = (t: Track) => {
    if (preview === t.id) {
      audio.current?.pause()
      setPreview(null)
      return
    }
    audio.current?.pause()
    audio.current = new Audio(t.preview)
    audio.current.onended = () => setPreview(null)
    void audio.current.play().catch(() => setPreview(null))
    setPreview(t.id)
  }

  const has = (t: Track) => tracks.some((x) => x.id === t.id)
  const add = (t: Track) => setTracks((list) => (list.length >= MAX_QUIZ_TRACKS || list.some((x) => x.id === t.id) ? list : [...list, t]))

  const importPlaylist = async (e: FormEvent) => {
    e.preventDefault()
    const ref = parsePlaylistUrl(link)
    if (!ref) {
      setError('Paste a public Spotify or Apple Music playlist or album link.')
      return
    }
    setImporting(true)
    setError(null)
    try {
      const info = await loadPlaylist(ref)
      const found = await playlistTracks({ kind: 'playlist', provider: info.provider, type: info.type, id: info.id, name: info.name }, 'in')
      setTracks((list) => {
        const ids = new Set(list.map((t) => t.id))
        return [...list, ...found.filter((t) => !ids.has(t.id))].slice(0, MAX_QUIZ_TRACKS)
      })
      setLink('')
      if (!title) setTitle(info.name.slice(0, 60))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import that playlist.')
    } finally {
      setImporting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const body = { title, description, emoji, visibility, tracks }
      if (editing) {
        await api(`/api/quizzes/${id}`, { method: 'PUT', body })
        navigate(`/q/${id}`)
      } else {
        const res = await api<{ id: string }>('/api/quizzes', { body })
        navigate(`/q/${res.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
      setSaving(false)
    }
  }

  if (loading) return <Shell>{<Spinner />}</Shell>
  if (!me)
    return (
      <Shell>
        <SignInRequired title="Make a quiz" body="Sign in with Google to build your own song quiz and share it with anyone." returnTo="/quizzes/new" />
      </Shell>
    )

  const ready = title.trim().length >= 3 && tracks.length >= MIN_QUIZ_TRACKS
  return (
    <Shell>
      <main className="mx-auto w-full max-w-5xl px-4 pb-32">
        <Link to="/quizzes" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Quizzes
        </Link>
        <h1 className="mb-5 text-3xl font-black text-white">{editing ? 'Edit your quiz' : 'Make a quiz'}</h1>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <Card>
              <label htmlFor="quiz-title" className="mb-1.5 block text-sm font-semibold text-gray-200">
                Title
              </label>
              <Input id="quiz-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 60))} placeholder="e.g. 90s Shaadi Bangers" className="mb-4" />
              <label htmlFor="quiz-desc" className="mb-1.5 block text-sm font-semibold text-gray-200">
                Description <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <textarea
                id="quiz-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 240))}
                rows={2}
                placeholder="What’s this quiz about?"
                className="mb-4 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-white outline-none placeholder:text-gray-500 focus:border-brand-400"
              />
              <p className="mb-1.5 text-sm font-semibold text-gray-200">Icon</p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {QUIZ_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    aria-pressed={emoji === e}
                    className={clsx('flex h-10 w-10 items-center justify-center rounded-xl text-xl', emoji === e ? 'bg-brand-400/25 ring-2 ring-brand-400' : 'bg-white/[0.04] hover:bg-white/[0.08]')}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <p className="mb-1.5 text-sm font-semibold text-gray-200">Who can find it</p>
              <div className="grid grid-cols-2 gap-2">
                {(['public', 'unlisted'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    aria-pressed={visibility === v}
                    className={clsx('flex items-start gap-2 rounded-xl border p-3 text-left', visibility === v ? 'border-brand-400 bg-brand-400/10' : 'border-white/10 bg-white/[0.03]')}
                  >
                    {v === 'public' ? <Globe className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" /> : <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-300" />}
                    <span>
                      <span className="block text-sm font-bold text-white">{v === 'public' ? 'Public' : 'Link only'}</span>
                      <span className="block text-xs text-gray-400">{v === 'public' ? 'Listed on the Quizzes page' : 'Only people with the link'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Card>
            <Card>
              <p className="mb-2 text-sm font-semibold text-gray-200">Add songs</p>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a song or artist…" aria-label="Search songs" className="pl-10" maxLength={80} />
                {searching && <Loader2 className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
              </div>
              <ul className="max-h-96 space-y-1.5 overflow-y-auto" data-testid="song-results">
                {results.map((t) => (
                  <SongRow key={t.id} track={t} playing={preview === t.id} onPlay={() => togglePreview(t)} onAdd={() => add(t)} added={has(t)} />
                ))}
              </ul>
              <form onSubmit={importPlaylist} className="mt-4 border-t border-white/5 pt-4">
                <p className="mb-2 text-sm text-gray-400">…or import a public Spotify / Apple Music playlist</p>
                <div className="flex gap-2">
                  <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://open.spotify.com/playlist/…" aria-label="Playlist link" autoComplete="off" />
                  <Button type="submit" variant="dark" className="shrink-0" loading={importing} disabled={!link.trim()}>
                    Import
                  </Button>
                </div>
              </form>
            </Card>
          </div>
          <Card className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-white">Your songs</p>
              <span className={clsx('text-sm tabular-nums', tracks.length >= MIN_QUIZ_TRACKS ? 'text-emerald-300' : 'text-gray-400')} data-testid="quiz-count">
                {tracks.length}/{MAX_QUIZ_TRACKS}
              </span>
            </div>
            {tracks.length === 0 && <p className="rounded-xl bg-white/[0.03] p-4 text-center text-sm text-gray-400">Search for songs and tap + to add them. You need at least {MIN_QUIZ_TRACKS}.</p>}
            <ol className="max-h-[28rem] space-y-1.5 overflow-y-auto">
              {tracks.map((t) => (
                <SongRow key={t.id} track={t} playing={preview === t.id} onPlay={() => togglePreview(t)} onRemove={() => setTracks((list) => list.filter((x) => x.id !== t.id))} />
              ))}
            </ol>
            {tracks.length > 0 && tracks.length < MIN_QUIZ_TRACKS && (
              <p className="mt-3 text-xs text-amber-300">Add {MIN_QUIZ_TRACKS - tracks.length} more to save — players need four look-alike answers each round.</p>
            )}
          </Card>
        </div>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0d0716]/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            {error ? (
              <p role="alert" className="min-w-0 flex-1 text-sm text-red-300">
                {error}
              </p>
            ) : (
              <p className="min-w-0 flex-1 truncate text-sm text-gray-400">
                {emoji} {title || 'Untitled quiz'} · {tracks.length} songs
              </p>
            )}
            <Button variant="gradient" className="shrink-0 px-6" disabled={!ready} loading={saving} onClick={() => void save()} icon={<Check className="h-4 w-4" />} data-testid="quiz-save">
              {editing ? 'Save changes' : 'Publish quiz'}
            </Button>
          </div>
        </div>
      </main>
    </Shell>
  )
}
