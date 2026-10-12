import clsx from 'clsx'
import { Check, Link2, ListMusic, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { BlendEntry, PublicPlayer, Source } from '../../shared/protocol'
import { useToast } from '../components/Toasts'
import { SpotifyIcon } from '../components/SpotifyIcon'
import { Button, Input, PlayerAvatar } from '../components/ui'
import { MusicError } from '../lib/itunes'
import { connectSpotify, disconnectSpotify, playlistBlendTracks, SPOTIFY_ERRORS, spotifyBlendTracks, useSpotify } from '../lib/spotify'
import { useRoomContext } from './context'

/** Overlapping player circles inside a glowing two-tone orb, like a Spotify Blend cover. */
export function BlendOrb({ players, size = 'md' }: { players: PublicPlayer[]; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-28 w-28' : size === 'md' ? 'h-16 w-16' : 'h-12 w-12'
  const shown = players.slice(0, 4)
  return (
    <span className={clsx('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl', box)} aria-hidden="true">
      <span className="absolute inset-0 bg-linear-to-br from-emerald-400 via-violet-500 to-pink-500" />
      <span className="blend-blob absolute -top-1/4 -left-1/4 h-3/4 w-3/4 rounded-full bg-cyan-300/70 blur-xl" />
      <span className="blend-blob absolute -right-1/4 -bottom-1/4 h-3/4 w-3/4 rounded-full bg-fuchsia-400/70 blur-xl [animation-delay:-3s]" />
      {shown.length > 0 ? (
        <span className="relative flex -space-x-2">
          {shown.map((p) => (
            <span key={p.id} className="rounded-full ring-2 ring-white/70">
              <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size={size === 'lg' ? 'md' : 'sm'} />
            </span>
          ))}
        </span>
      ) : (
        <Sparkles className="relative h-1/3 w-1/3 text-white" />
      )}
    </span>
  )
}

function viaLabel(e: BlendEntry): string {
  return e.via === 'spotify' ? `Spotify · ${e.label}` : e.label
}

/** After returning from Spotify's sign-in, add the listener's top tracks once. */
function useSpotifyReturn(addSpotify: () => Promise<void>) {
  const toast = useToast()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    const params = new URLSearchParams(location.search)
    const ok = params.get('spotify') === 'connected'
    const err = params.get('spotify_error')
    if (!ok && !err) return
    done.current = true
    params.delete('spotify')
    params.delete('spotify_error')
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''))
    if (err) toast({ title: 'Spotify not connected', body: SPOTIFY_ERRORS[err] ?? 'Please try again.', tone: 'error', durationMs: 9000 })
    else void addSpotify()
  }, [addSpotify, toast])
}

/**
 * The Blend: every player can add their Spotify top tracks or a playlist. The host
 * plays everyone's music mixed together, and each reveal shows whose song it was.
 */
export function BlendPanel({ current, readOnly, onPick }: { current: Source; readOnly: boolean; onPick: (s: Source) => void }) {
  const { state, you, send } = useRoomContext()
  const toast = useToast()
  const { config, me, refresh } = useSpotify()
  const [busy, setBusy] = useState<'spotify' | 'playlist' | null>(null)
  const [showLink, setShowLink] = useState(false)
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mine = state.blend.find((b) => b.playerId === you)
  const entries = state.blend.filter((b) => state.players.some((p) => p.id === b.playerId))
  const contributors = entries.map((e) => state.players.find((p) => p.id === e.playerId)!).filter(Boolean)
  const total = entries.reduce((n, e) => n + e.count, 0)
  const selected = current.kind === 'blend'

  const addSpotify = async () => {
    setError(null)
    setBusy('spotify')
    try {
      const fresh = me?.connected ? me : await fetch('/api/spotify/me').then((r) => r.json())
      if (!fresh?.connected) {
        connectSpotify(location.pathname)
        return
      }
      const tracks = await spotifyBlendTracks(fresh)
      send({ t: 'blend', via: 'spotify', label: fresh.name, ...(fresh.image ? { image: fresh.image } : {}), tracks })
      toast({ title: 'Added to the Blend', body: `${tracks.length} of your top tracks are in.`, tone: 'success', durationMs: 3500 })
    } catch (err) {
      setError(err instanceof MusicError ? err.message : 'Could not read your Spotify right now.')
    } finally {
      setBusy(null)
    }
  }
  useSpotifyReturn(addSpotify)

  const addPlaylist = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy('playlist')
    try {
      const { name, image, tracks } = await playlistBlendTracks(link, state.settings.region)
      send({ t: 'blend', via: 'playlist', label: name, ...(image ? { image } : {}), tracks })
      setLink('')
      setShowLink(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that playlist.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5" data-testid="blend-panel">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-linear-to-br from-emerald-500/15 via-violet-600/15 to-pink-500/15 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <BlendOrb players={contributors} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.2em] text-emerald-300 uppercase">Blend</p>
            <h3 className="text-2xl font-extrabold text-white">Everyone’s music, one game</h3>
            <p className="mt-1 text-sm text-gray-300">
              Each player adds their Spotify top tracks or a playlist. Songs are mixed fairly, and every reveal shows <span className="font-semibold text-white">whose song it was</span>.
            </p>
            <p className="mt-2 text-sm text-gray-400">
              {entries.length === 0 ? 'No music added yet.' : `${entries.length} player${entries.length === 1 ? '' : 's'} · ${total} songs in the mix`}
            </p>
          </div>
          <Button
            variant={selected ? 'dark' : 'gradient'}
            className="shrink-0"
            disabled={selected || (!readOnly && total < 4)}
            icon={selected ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            onClick={() => onPick({ kind: 'blend' })}
            data-testid="use-blend"
          >
            {selected ? 'Blend selected' : readOnly ? 'Suggest Blend' : total < 4 ? 'Add songs first' : 'Play the Blend'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
        <p className="mb-3 text-sm font-semibold text-white">Your music</p>
        {mine ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-3 py-2.5 ring-1 ring-emerald-400/30">
            {mine.via === 'spotify' ? <SpotifyIcon className="h-6 w-6" /> : <ListMusic className="h-6 w-6 text-emerald-300" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{viaLabel(mine)}</span>
              <span className="block text-xs text-emerald-200/80">{mine.count} songs in the Blend</span>
            </span>
            {mine.via === 'spotify' && (
              <button type="button" onClick={addSpotify} disabled={!!busy} className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Refresh my songs" title="Shuffle in different songs">
                {busy === 'spotify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
            )}
            <button type="button" onClick={() => send({ t: 'unblend' })} className="rounded-lg p-2 text-gray-300 hover:bg-white/10 hover:text-white" aria-label="Remove my music">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {config.enabled && (
              <button
                type="button"
                onClick={addSpotify}
                disabled={!!busy}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1db954] px-4 font-bold text-black transition hover:brightness-110 disabled:opacity-60"
              >
                {busy === 'spotify' ? <Loader2 className="h-5 w-5 animate-spin" /> : <SpotifyIcon className="h-5 w-5 [&_circle]:fill-black [&_path]:fill-[#1db954]" />}
                {me?.connected ? `Add my Spotify (${me.name})` : 'Connect Spotify'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowLink((v) => !v)}
              className={clsx(
                'flex h-12 items-center justify-center gap-2 rounded-xl border px-4 font-semibold transition',
                showLink ? 'border-gray-500 bg-gray-800 text-white' : 'border-gray-700 bg-gray-900 text-gray-200 hover:border-gray-500',
                !config.enabled && 'sm:col-span-2',
              )}
            >
              <Link2 className="h-4 w-4" /> Add a playlist link
            </button>
          </div>
        )}
        {showLink && !mine && (
          <form onSubmit={addPlaylist} className="mt-3 flex gap-2">
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://open.spotify.com/playlist/…" aria-label="Playlist link for the Blend" autoComplete="off" />
            <Button type="submit" variant="gradient" className="shrink-0 px-5" loading={busy === 'playlist'} disabled={!link.trim()}>
              Add
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {me?.connected && !mine && (
          <button
            type="button"
            className="mt-3 text-xs text-gray-500 underline-offset-2 hover:text-gray-300 hover:underline"
            onClick={async () => {
              await disconnectSpotify()
              await refresh()
            }}
          >
            Not {me.name}? Disconnect Spotify
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="blend-list">
          {entries.map((e) => {
            const p = state.players.find((x) => x.id === e.playerId)!
            return (
              <li key={e.playerId} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2">
                <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{p.name}</span>
                  <span className="block truncate text-xs text-gray-400">{viaLabel(e)}</span>
                </span>
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-bold text-gray-300 tabular-nums">{e.count}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
