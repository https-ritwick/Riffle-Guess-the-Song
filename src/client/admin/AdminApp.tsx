// The admin console: a separate, lazily-loaded app under /admin for the site owner.
import clsx from 'clsx'
import { Activity, ArrowLeft, BarChart3, CalendarDays, Gamepad2, History, LayoutDashboard, Settings, ShieldCheck, Users, UsersRound } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router'
import { Card, LogoMark, Spinner, UserPhoto } from '../components/ui'
import { SignInButton } from '../components/UserMenu'
import { useAuth } from '../lib/auth'
import { AnalyticsPage } from './Analytics'
import { AuditPage } from './Audit'
import { DailyPage } from './Daily'
import { GroupDetailPage, GroupsPage } from './Groups'
import { OverviewPage } from './Overview'
import { RoomsPage } from './Rooms'
import { SettingsPage } from './Settings'
import { UserDetailPage, UsersPage } from './Users'

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/groups', label: 'Groups', icon: UsersRound },
  { to: '/admin/rooms', label: 'Live rooms', icon: Gamepad2 },
  { to: '/admin/daily', label: 'Daily challenge', icon: CalendarDays },
  { to: '/admin/settings', label: 'Site settings', icon: Settings },
  { to: '/admin/audit', label: 'Audit log', icon: History },
]

function Gate({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth()
  if (loading)
    return (
      <div className="min-h-dvh bg-night pt-24">
        <Spinner label="Checking your access…" />
      </div>
    )
  if (!me || !me.admin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-night px-4">
        <Card className="w-full max-w-sm text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-brand-400" />
          <h1 className="mb-2 text-xl font-bold text-white">{me ? 'No access' : 'Admin sign-in'}</h1>
          <p className="mb-5 text-sm text-gray-400">
            {me ? `${me.email} isn’t an admin account. Sign in with the site owner’s Google account.` : 'Sign in with the site owner’s Google account to open the console.'}
          </p>
          {!me && <SignInButton returnTo="/admin" />}
          <a href="/" className="mt-4 inline-block text-sm text-gray-400 hover:text-white">
            Back to Riffle
          </a>
        </Card>
      </main>
    )
  }
  return <>{children}</>
}

function Sidebar() {
  const { me } = useAuth()
  const { search } = useLocation()
  // Keep the chosen time range when moving between pages.
  const days = new URLSearchParams(search).get('days')
  const keep = days ? `?days=${days}` : ''
  return (
    <aside className="border-b border-white/[0.06] bg-[#120a1c] lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-b-0">
      <div className="flex items-center justify-between gap-2 px-4 py-4 lg:px-5">
        <a href="/" className="flex items-center gap-2" aria-label="Riffle home">
          <LogoMark className="h-7 w-7" />
          <span className="font-extrabold tracking-tight text-white">Riffle</span>
          <span className="rounded-md bg-brand-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-brand-200 uppercase">Admin</span>
        </a>
        <a href="/" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white lg:hidden">
          <ArrowLeft className="h-3.5 w-3.5" /> Site
        </a>
      </div>
      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={`${n.to}${keep}`}
            end={n.end}
            className={({ isActive }) =>
              clsx(
                'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition',
                isActive ? 'bg-white/[0.08] text-white' : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200',
              )
            }
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      {me && (
        <div className="hidden border-t border-white/[0.06] p-4 lg:block">
          <div className="flex items-center gap-2.5">
            <UserPhoto name={me.name} picture={me.picture} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{me.name}</p>
              <p className="truncate text-xs text-gray-500">{me.email}</p>
            </div>
          </div>
          <a href="/" className="mt-3 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the game
          </a>
        </div>
      )}
    </aside>
  )
}

export default function AdminApp() {
  useEffect(() => {
    const before = document.title
    document.title = 'Admin · Riffle'
    return () => {
      document.title = before
    }
  }, [])
  return (
    <Gate>
      <div className="min-h-dvh bg-[#0d0716] text-white">
        <Sidebar />
        <main className="px-4 py-6 sm:px-6 lg:ml-60 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-7xl">
            <Routes>
              <Route index element={<OverviewPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="analytics/:tab" element={<AnalyticsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="users/:id" element={<UserDetailPage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="groups/:id" element={<GroupDetailPage />} />
              <Route path="rooms" element={<RoomsPage />} />
              <Route path="daily" element={<DailyPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="audit" element={<AuditPage />} />
              <Route
                path="*"
                element={
                  <p className="flex items-center gap-2 text-gray-400">
                    <Activity className="h-4 w-4" /> Nothing here.
                  </p>
                }
              />
            </Routes>
          </div>
        </main>
      </div>
    </Gate>
  )
}
