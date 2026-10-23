import clsx from 'clsx'
import { Check, Link2, Loader2, Search, Send, Shuffle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { PLAYLIST_CATEGORIES, PRESET_GROUPS, PRESETS, type PlaylistCategory, type Preset, type PresetGroup } from '../../shared/catalog'
import type { PlaylistInfo, Source } from '../../shared/protocol'
import { parsePlaylistUrl } from '../../shared/playlist'
import { Button, Cover, Input } from '../components/ui'
import { FEATURED_WITH_COVERS, presetImages, sourceImages } from '../lib/covers'
import { loadPlaylist, searchArtists, type ArtistHit } from '../lib/itunes'
import { useAuth } from '../lib/auth'
import { quizAsSource, useMyQuizzes, useQuizList } from '../lib/quizzes'
import { Link } from 'react-router'
import { describeSource } from '../lib/source'
import { BlendOrb, BlendPanel } from './Blend'
import { useRoomContext } from './context'

type Tab = PresetGroup | 'blend' | 'playlists' | 'quizzes' | 'artist' | 'search'

const TABS: { id: Tab; label: string }[] = [
  { id: 'blend', label: '✨ Blend' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'quizzes', label: '🧩 Quizzes' },
  ...PRESET_GROUPS,
  { id: 'artist', label: 'Artist' },
  { id: 'search', label: 'Search' },
]

const SEARCH_IDEAS = ['Arijit Singh', 'Coke Studio', '90s rock', 'Anime openings', 'Taylor Swift', 'Lo-fi', 'Ilaiyaraaja', 'Afrobeats']

function initialTab(source: Source): Tab {
  // Coming back from Spotify's sign-in: land on the Blend so the songs get added.
  if (/[?&]spotify(_error)?=/.test(location.search)) return 'blend'
  if (source.kind === 'blend') return 'blend'
  if (source.kind === 'artist') return 'artist'
  if (source.kind === 'search') return 'search'
  if (source.kind === 'playlist') return 'playlists'
  if (source.kind === 'quiz') return 'quizzes'
  return PRESETS.find((p) => p.id === source.id)?.group ?? 'charts'
}

function sameSource(a: Source, b: Source): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'preset' && b.kind === 'preset') return a.id === b.id
  if (a.kind === 'artist' && b.kind === 'artist') return a.id === b.id
  if (a.kind === 'search' && b.kind === 'search') return a.query.toLowerCase() === b.query.toLowerCase()
  if (a.kind === 'playlist' && b.kind === 'playlist') return a.provider === b.provider && a.id === b.id
  if (a.kind === 'blend' && b.kind === 'blend') return true
  if (a.kind === 'quiz' && b.kind === 'quiz') return a.id === b.id
  return false
}

/** Tile used for presets and featured playlists. */
function Tile({
  images,
  title,
  subtitle,
  selected,
  readOnly,
  onPick,
  badge,
}: {
  images: string[]
  title: string
  subtitle: string
  selected: boolean
  readOnly: boolean
  onPick: () => void
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={clsx(
        'group flex min-w-0 flex-col gap-2 rounded-xl border p-2 text-left transition-colors sm:gap-3 sm:p-3',
        selected ? 'border-brand-500 bg-brand-500/10 ring-1 ring-brand-500/40' : 'border-gray-800 bg-gray-900/60 hover:border-gray-600 hover:bg-gray-800/60',
      )}
    >
      <span className="relative">
        <Cover images={images} size="fill" label={title} />
        {badge && <span className="absolute top-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">{badge}</span>}
        {selected && (
          <span className="absolute right-1.5 bottom-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-black shadow-lg">
            <Check className="h-4 w-4" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold leading-tight text-white sm:text-base">{title}</span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-gray-400">{subtitle}</span>
      </span>
      <span className={clsx('mt-auto text-sm font-medium max-sm:hidden', selected ? 'text-brand-400' : 'text-brand-400/80 group-hover:text-brand-400')}>
        {selected ? 'Selected' : readOnly ? (
          <span className="inline-flex items-center gap-1">
            <Send className="h-3.5 w-3.5" /> Suggest
          </span>
        ) : (
          '→ Pick'
        )}
      </span>
    </button>
  )
}

/** Phones show this many tiles per list until "Show all" is tapped. */
const PHONE_TILES = 6

function ShowAll({ total, open, onOpen }: { total: number; open: boolean; onOpen: () => void }) {
  if (open || total <= PHONE_TILES) return null
  return (
    <button type="button" onClick={onOpen} className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-sm font-semibold text-gray-200 sm:hidden">
      Show all {total}
    </button>
  )
}

function PresetGrid({ group, current, readOnly, onPick }: { group: PresetGroup; current: Source; readOnly: boolean; onPick: (s: Source) => void }) {
  const [all, setAll] = useState(false)
  const presets = PRESETS.filter((p) => p.group === group)
  return (
    <>
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
      {presets.map((p: Preset, i) => {
        const source: Source = { kind: 'preset', id: p.id }
        return (
          <div key={p.id} className={clsx('contents', !all && i >= PHONE_TILES && !sameSource(current, source) && 'max-sm:hidden')}>
          <Tile
            key={p.id}
            images={presetImages(p.id)}
            title={p.name}
            subtitle={p.blurb}
            badge={p.kind === 'chart' ? 'Live chart' : undefined}
            selected={sameSource(current, source)}
            readOnly={readOnly}
            onPick={() => onPick(source)}
          />
          </div>
        )
      })}
    </div>
    <ShowAll total={presets.length} open={all} onOpen={() => setAll(true)} />
    </>
  )
}

function PlaylistTab({ current, readOnly, onPick }: { current: Source; readOnly: boolean; onPick: (s: Source) => void }) {
  const { state } = useRoomContext()
  const [link, setLink] = useState('')
  const [info, setInfo] = useState<PlaylistInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [all, setAll] = useState(false)
  const [category, setCategory] = useState<PlaylistCategory>(
    () => (current.kind === 'playlist' && FEATURED_WITH_COVERS.find((p) => p.provider === current.provider && p.id === current.id)?.category) || 'desi',
  )

  const lookup = async (e: FormEvent) => {
    e.preventDefault()
    const ref = parsePlaylistUrl(link)
    setInfo(null)
    if (!ref) {
      setError('Paste a public Spotify or Apple Music playlist or album link (open.spotify.com/… or music.apple.com/…).')
      return
    }
    setError(null)
    setLoading(true)
    try {
      setInfo(await loadPlaylist({ ...ref, country: ref.country }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that playlist.')
    } finally {
      setLoading(false)
    }
  }

  const playable = info ? (info.provider === 'spotify' ? info.tracks.filter((t) => t.preview).length : info.tracks.length) : 0
  const infoSource: Source | null = info
    ? {
        kind: 'playlist',
        provider: info.provider,
        type: info.type,
        id: info.id,
        ...(info.country ? { country: info.country as 'in' } : {}),
        name: info.name,
        ...(info.owner ? { owner: info.owner } : {}),
        ...(info.image ? { image: info.image } : {}),
        count: playable,
      }
    : null

  return (
    <div className="space-y-6">
      <form onSubmit={lookup}>
        <label htmlFor="playlist-link" className="mb-2 block text-sm text-gray-300">
          Paste any <span className="font-semibold text-white">public</span> Spotify or Apple Music playlist or album link
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input id="playlist-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://open.spotify.com/playlist/…" className="pl-10" autoComplete="off" />
          </div>
          <Button type="submit" variant="gradient" className="shrink-0 px-5" loading={loading} disabled={!link.trim()}>
            Load
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
      </form>

      {info && infoSource && (
        <div className="flex animate-pop items-center gap-4 rounded-xl border border-gray-700 bg-gray-800/40 p-4" data-testid="playlist-preview">
          <Cover images={info.image ? [info.image] : []} size="lg" label={info.name} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
              {info.provider === 'spotify' ? 'Spotify' : 'Apple Music'} {info.type}
            </p>
            <p className="truncate text-lg font-bold text-white">{info.name}</p>
            <p className="truncate text-sm text-gray-400">
              {info.owner && `${info.owner} · `}
              {playable} playable song{playable === 1 ? '' : 's'}
            </p>
            {info.tracks.slice(0, 3).length > 0 && (
              <p className="mt-1 truncate text-xs text-gray-500">{info.tracks.slice(0, 3).map((t) => t.title).join(' · ')}…</p>
            )}
          </div>
          <Button variant={sameSource(current, infoSource) ? 'dark' : 'gradient'} size="sm" className="shrink-0" disabled={playable < 4} onClick={() => onPick(infoSource)}>
            {sameSource(current, infoSource) ? 'Selected' : readOnly ? 'Suggest' : 'Use'}
          </Button>
        </div>
      )}

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="mr-1 text-sm font-semibold text-gray-300">Popular playlists</p>
          <div className="-mx-1 flex w-full gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:w-auto sm:flex-wrap sm:overflow-visible" role="tablist" aria-label="Playlist categories">
            {PLAYLIST_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={category === c.id}
                onClick={() => {
                  setCategory(c.id)
                  setAll(false)
                }}
                className={clsx(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-colors',
                  category === c.id ? 'bg-brand-400 text-black ring-brand-300' : 'bg-gray-900 text-gray-300 ring-gray-700 hover:text-white',
                )}
              >
                {c.label} <span className="opacity-60">{FEATURED_WITH_COVERS.filter((p) => p.category === c.id).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
          {FEATURED_WITH_COVERS.filter((p) => p.category === category).map((p, i) => {
            const source: Source = {
              kind: 'playlist',
              provider: p.provider,
              type: p.type,
              id: p.id,
              ...(p.country ? { country: p.country } : {}),
              name: p.name,
              owner: p.owner,
              ...(p.image ? { image: p.image } : {}),
            }
            return (
              <div key={p.id} className={clsx('contents', !all && i >= PHONE_TILES && !sameSource(current, source) && 'max-sm:hidden')}>
              <Tile
                images={p.image ? [p.image] : presetImages('bollywood-hits')}
                title={p.name}
                subtitle={`${p.provider === 'spotify' ? 'Spotify' : 'Apple Music'} · ${p.owner}`}
                selected={sameSource(current, source)}
                readOnly={readOnly}
                onPick={() => onPick(source)}
              />
              </div>
            )
          })}
        </div>
        <ShowAll total={FEATURED_WITH_COVERS.filter((p) => p.category === category).length} open={all} onOpen={() => setAll(true)} />
      </div>
      {state.settings.source.kind === 'playlist' && <p className="text-xs text-gray-500">Tip: songs without a preview on the streaming service are skipped automatically.</p>}
    </div>
  )
}

/** Quizzes players made on ${BRAND_NAME}: popular ones, newest ones and your own. */
function QuizzesTab({ current, readOnly, onPick }: { current: Source; readOnly: boolean; onPick: (s: Source) => void }) {
  const { me } = useAuth()
  const [view, setView] = useState<'popular' | 'new' | 'mine'>('popular')
  const [q, setQ] = useState('')
  const list = useQuizList(view === 'new' ? 'new' : 'popular', q, view !== 'mine')
  const mine = useMyQuizzes(!!me && view === 'mine')
  const quizzes = view === 'mine' ? mine.data : list.data?.quizzes
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['popular', 'new', ...(me ? (['mine'] as const) : [])] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={clsx('rounded-full px-3 py-1 text-xs font-semibold ring-1', view === v ? 'bg-brand-400 text-black ring-brand-300' : 'bg-gray-900 text-gray-300 ring-gray-700 hover:text-white')}
          >
            {v === 'popular' ? '🔥 Popular' : v === 'new' ? '✨ New' : 'Mine'}
          </button>
        ))}
        <Link to="/quizzes/new" className="ml-auto text-xs font-semibold text-brand-300 hover:text-brand-200" target="_blank">
          + Make a quiz
        </Link>
      </div>
      {view !== 'mine' && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quizzes…" aria-label="Search quizzes" className="pl-10" maxLength={60} />
        </div>
      )}
      {!quizzes && <p className="py-4 text-center text-sm text-gray-500">Loading quizzes…</p>}
      {quizzes?.length === 0 && (
        <p className="rounded-xl bg-white/[0.03] p-4 text-center text-sm text-gray-400">
          {view === 'mine' ? 'You haven’t made a quiz yet.' : 'No quizzes found.'}{' '}
          <Link to="/quizzes/new" className="font-semibold text-brand-300" target="_blank">
            Make one →
          </Link>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {quizzes?.map((quiz) => {
          const source = quizAsSource(quiz)
          return (
            <Tile
              key={quiz.id}
              images={quiz.cover ? [quiz.cover] : []}
              title={`${quiz.emoji} ${quiz.title}`}
              subtitle={`${quiz.trackCount} songs · by ${quiz.owner.name} · ${quiz.plays} plays`}
              selected={sameSource(current, source)}
              readOnly={readOnly}
              onPick={() => onPick(source)}
            />
          )
        })}
      </div>
    </div>
  )
}

function ArtistSearch({ current, readOnly, onPick }: { current: Source; readOnly: boolean; onPick: (s: Source) => void }) {
  const { state } = useRoomContext()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ArtistHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchArtists(q, state.settings.region)
        if (!cancelled) {
          setHits(found)
          setError(found.length ? null : 'No artists found.')
        }
      } catch {
        if (!cancelled) setError('Search failed. Try again in a moment.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, state.settings.region])

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for an artist…" aria-label="Search for an artist" className="pl-10" maxLength={80} />
        {loading && <Loader2 className="absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />}
      </div>
      {error && <p className="mt-3 text-sm text-gray-400">{error}</p>}
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {hits.map((a) => {
          const source: Source = { kind: 'artist', id: a.id, name: a.name, ...(a.genre ? { genre: a.genre } : {}), ...(a.image ? { image: a.image } : {}) }
          const selected = sameSource(current, source)
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPick(source)}
                className={clsx(
                  'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                  selected ? 'border-brand-500 bg-brand-500/10' : 'border-gray-800 bg-gray-900/60 hover:border-gray-600',
                )}
              >
                <Cover images={a.image ? [a.image] : []} size="sm" label={a.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{a.name}</span>
                  {a.genre && <span className="block text-xs text-gray-400">{a.genre}</span>}
                </span>
                {selected ? <Check className="h-5 w-5 text-brand-400" /> : <span className="text-sm text-brand-400">{readOnly ? 'Suggest' : '→ Pick'}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FreeSearch({ current, readOnly, onPick }: { current: Source; readOnly: boolean; onPick: (s: Source) => void }) {
  const [query, setQuery] = useState(current.kind === 'search' ? current.query : '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (query.trim().length >= 2) onPick({ kind: 'search', query: query.trim() })
  }
  return (
    <form onSubmit={submit}>
      <p className="mb-3 text-sm text-gray-400">Type anything — a mood, a movie, a band, a language. We’ll build the quiz from matching songs.</p>
      <div className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Shah Rukh Khan movie songs" aria-label="Song search" maxLength={80} />
        <Button type="submit" variant="gradient" className="shrink-0 px-5" disabled={query.trim().length < 2}>
          {readOnly ? 'Suggest' : 'Use'}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {SEARCH_IDEAS.map((idea) => (
          <button
            key={idea}
            type="button"
            onClick={() => {
              setQuery(idea)
              onPick({ kind: 'search', query: idea })
            }}
            className={clsx(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              current.kind === 'search' && current.query === idea ? 'border-brand-500 text-brand-400' : 'border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white',
            )}
          >
            {idea}
          </button>
        ))}
      </div>
    </form>
  )
}

/**
 * Everyone can browse the music options; the host picks, other players can
 * suggest a choice to the host.
 */
export function SourcePicker({ onSuggested }: { onSuggested?: (s: Source) => void }) {
  const { state, send, isHost } = useRoomContext()
  const source = state.settings.source
  const readOnly = !isHost
  const [tab, setTab] = useState<Tab>(() => initialTab(source))

  const pick = (next: Source) => {
    if (readOnly) {
      if (sameSource(next, source)) return
      send({ t: 'suggest', source: next })
      onSuggested?.(next)
      return
    }
    send({ t: 'settings', settings: { source: next } })
  }
  const randomPreset = () => {
    const options = PRESETS.filter((p) => !(source.kind === 'preset' && source.id === p.id))
    const p = options[Math.floor(Math.random() * options.length)]!
    setTab(p.group)
    pick({ kind: 'preset', id: p.id })
  }

  return (
    <div>
      <div className="mb-4 -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="tablist" aria-label="Music categories">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
              tab === t.id ? 'border-gray-500 bg-gray-700 text-white' : 'border-gray-700 bg-gray-900 text-gray-300 hover:text-white',
            )}
          >
            {t.label}
          </button>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={randomPreset}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-linear-to-r from-brand-400 to-rose-500 px-4 py-2 text-sm font-bold text-black hover:opacity-90"
          >
            <Shuffle className="h-4 w-4" /> Random
          </button>
        )}
      </div>

      {tab === 'blend' ? (
        <BlendPanel current={source} readOnly={readOnly} onPick={pick} />
      ) : tab === 'playlists' ? (
        <PlaylistTab current={source} readOnly={readOnly} onPick={pick} />
      ) : tab === 'quizzes' ? (
        <QuizzesTab current={source} readOnly={readOnly} onPick={pick} />
      ) : tab === 'artist' ? (
        <ArtistSearch current={source} readOnly={readOnly} onPick={pick} />
      ) : tab === 'search' ? (
        <FreeSearch current={source} readOnly={readOnly} onPick={pick} />
      ) : (
        <PresetGrid group={tab} current={source} readOnly={readOnly} onPick={pick} />
      )}
    </div>
  )
}

/** Compact card showing the currently selected music. */
export function SelectedSource({ source, size = 'md' }: { source: Source; size?: 'md' | 'lg' }) {
  const { state } = useRoomContext()
  const d = describeSource(source)
  const contributors = state.blend.map((b) => state.players.find((p) => p.id === b.playerId)).filter((p) => !!p)
  return (
    <div className="flex items-center gap-4">
      {source.kind === 'blend' ? (
        <span className={size === 'lg' ? '[&>span]:h-24 [&>span]:w-24' : ''}>
          <BlendOrb players={contributors} size="md" />
        </span>
      ) : (
        <Cover images={sourceImages(source)} size={size === 'lg' ? 'lg' : 'md'} label={d.title} />
      )}
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-gray-400 uppercase">{d.subtitle}</p>
        <p className="truncate text-xl font-bold text-white" data-testid="selected-source">
          {d.title}
        </p>
        {source.kind === 'playlist' && source.owner && <p className="truncate text-sm text-gray-400">by {source.owner}</p>}
        {source.kind === 'blend' && (
          <p className="truncate text-sm text-gray-400">
            {contributors.length ? `${contributors.map((p) => p.name).join(', ')} · ${state.blend.reduce((n, b) => n + b.count, 0)} songs` : 'Waiting for players to add music'}
          </p>
        )}
      </div>
    </div>
  )
}
