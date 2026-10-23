import clsx from 'clsx'
import { ChevronDown, Loader2, LogIn, LogOut, ShieldCheck, Unlink, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { BRAND } from '../../shared/brand'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/track'
import { connectSpotify, disconnectSpotify, useSpotify } from '../lib/spotify'
import { SpotifyIcon } from './SpotifyIcon'
import { useToast } from './Toasts'
import { DevLoginDialog } from './DevLogin'
import { UserPhoto } from './ui'

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

/** "Continue with Google" — white button in the reference's sign-in style. */
export function SignInButton({ returnTo, className, label = 'Continue with Google' }: { returnTo?: string; className?: string; label?: string }) {
  const { signIn, config } = useAuth()
  const [devOpen, setDevOpen] = useState(false)
  if (!config.google && !config.dev) {
    return (
      <p className={clsx('rounded-xl border border-gray-800 bg-gray-900/60 p-3 text-center text-sm text-gray-400', className)}>
        Google sign-in hasn’t been set up on this server yet.
      </p>
    )
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          trackEvent('sign_in_click')
          if (config.google) signIn(returnTo)
          else setDevOpen(true)
        }}
        className={clsx('flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-[15px] font-semibold text-gray-900 hover:bg-gray-100', className)}
      >
        <GoogleIcon className="h-5 w-5" />
        {config.google ? label : 'Developer sign-in (local)'}
      </button>
      <p className="mt-2 text-center text-[11px] text-gray-500">
        By continuing you agree to the{' '}
        <Link to="/terms" className="underline-offset-2 hover:text-gray-300 hover:underline">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline-offset-2 hover:text-gray-300 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
      {devOpen && <DevLoginDialog onClose={() => setDevOpen(false)} />}
    </>
  )
}

/** Spotify connection for this browser: who's connected, with a one-tap disconnect. */
function SpotifyMenuSection({ onDone }: { onDone: () => void }) {
  const { config, me, refresh } = useSpotify()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  if (!me || (!me.connected && !config.enabled)) return null
  return (
    <div className="border-b border-gray-800 px-4 py-3" data-testid="spotify-account">
      <p className="mb-2 text-[11px] font-bold tracking-wider text-gray-500 uppercase">Spotify</p>
      {me.connected ? (
        <div className="flex items-center gap-2.5">
          {me.image ? <img src={me.image} alt="" className="h-8 w-8 rounded-full object-cover" /> : <SpotifyIcon className="h-8 w-8" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{me.name}</span>
            <span className="block text-xs text-gray-400">{me.tracks.length} top tracks saved</span>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await disconnectSpotify()
                await refresh()
                toast({ title: 'Spotify disconnected', body: `Your saved top tracks were deleted from ${BRAND.name}.`, tone: 'success', durationMs: 3500 })
                onDone()
              } catch {
                toast({ title: 'Could not disconnect', body: 'Please try again.', tone: 'error' })
              } finally {
                setBusy(false)
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/10"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Disconnect
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => connectSpotify(location.pathname)} className="flex w-full items-center gap-2 text-sm font-semibold text-gray-200 hover:text-white">
          <SpotifyIcon className="h-5 w-5" /> Connect Spotify
        </button>
      )}
    </div>
  )
}

export function UserMenu() {
  const { me, loading, signOut, signIn, config } = useAuth()
  const [open, setOpen] = useState(false)
  const [devOpen, setDevOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  if (loading) return <span className="h-9 w-9 animate-pulse rounded-full bg-gray-800" />

  if (!me) {
    if (!config.google && !config.dev) return null
    return (
      <>
        <button
          type="button"
          onClick={() => (config.google ? signIn() : setDevOpen(true))}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100"
        >
          <LogIn className="h-4 w-4" /> Sign in
        </button>
        {devOpen && <DevLoginDialog onClose={() => setDevOpen(false)} />}
      </>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-gray-700 bg-gray-900/80 py-1 pr-2 pl-1 hover:border-gray-500"
      >
        <UserPhoto name={me.name} picture={me.picture} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-semibold text-white sm:inline">{me.name}</span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-72 animate-pop overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
          <div className="border-b border-gray-800 px-4 py-3">
            <p className="truncate font-semibold text-white">{me.name}</p>
            <p className="truncate text-xs text-gray-400">{me.email}</p>
          </div>
          <SpotifyMenuSection onDone={() => setOpen(false)} />
          <Link role="menuitem" to="/groups" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-800">
            <Users className="h-4 w-4" /> My groups
          </Link>
          {me.admin && (
            <Link role="menuitem" to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2.5 text-sm text-brand-200 hover:bg-gray-800" data-testid="admin-link">
              <ShieldCheck className="h-4 w-4" /> Admin console
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              setOpen(false)
              await signOut()
              navigate('/')
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-gray-800"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
