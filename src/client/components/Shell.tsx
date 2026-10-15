import clsx from 'clsx'
import { Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../lib/auth'
import { load, save } from '../lib/storage'
import { Footer } from './Footer'
import { LogoMark } from './ui'
import { UserMenu } from './UserMenu'
import { BRAND } from '../../shared/brand'

export function TopNav() {
  const { me } = useAuth()
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4">
      <Link to="/" className="flex items-center gap-2" aria-label={`${BRAND.name} home`}>
        <LogoMark className="h-8 w-8" />
        <span className="bg-linear-to-r from-white to-brand-200 bg-clip-text text-xl font-extrabold tracking-tight text-transparent">{BRAND.name}</span>
      </Link>
      <nav className="flex items-center gap-2">
        {me && (
          <Link to="/groups" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white">
            <Users className="h-4 w-4" /> Groups
          </Link>
        )}
        <UserMenu />
      </nav>
    </header>
  )
}

/** Page chrome: a plum night sky with drifting marigold/magenta light, a row of marquee bulbs and an announcement bar. */
export function Shell({ children, banner = true, nav = true }: { children: ReactNode; banner?: boolean; nav?: boolean }) {
  const [showBanner, setShowBanner] = useState(() => banner && load('banner-dismissed') !== '6')

  return (
    <div className="relative min-h-dvh overflow-clip bg-night">
      <div aria-hidden="true" className="aurora pointer-events-none absolute -top-56 left-1/2 h-[30rem] w-[60rem] -translate-x-1/2 rounded-full bg-rose-600/15 blur-3xl" />
      <div aria-hidden="true" className="aurora pointer-events-none absolute top-1/3 -left-40 h-[26rem] w-[26rem] rounded-full bg-brand-500/12 blur-3xl [animation-delay:-6s]" />
      <div aria-hidden="true" className="aurora pointer-events-none absolute -right-40 bottom-0 h-[26rem] w-[26rem] rounded-full bg-fuchsia-600/12 blur-3xl [animation-delay:-11s]" />
      <div aria-hidden="true" className="film-grain pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="marquee-bulbs pointer-events-none absolute inset-x-0 top-0 h-2.5" />
      {showBanner && (
        <div className="fixed top-0 right-0 left-0 z-30 flex items-center gap-2 bg-linear-to-r from-brand-300 via-brand-500 to-rose-500 py-1.5 pr-2 pl-4 text-sm font-semibold text-black">
          <p className="flex-1 text-center">
            New: <span className="font-extrabold">📅 Aaj Ka Challenge</span> — same 5 questions for everyone daily, plus levels, streaks, badges and Story-ready result posters.
          </p>
          <button
            type="button"
            aria-label="Dismiss"
            className="rounded p-1 hover:bg-black/10"
            onClick={() => {
              save('banner-dismissed', '6')
              setShowBanner(false)
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className={clsx('relative flex min-h-dvh flex-col', showBanner && 'pt-9')}>
        {nav && <TopNav />}
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
    </div>
  )
}
