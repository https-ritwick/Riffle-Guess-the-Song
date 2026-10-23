import clsx from 'clsx'
import { ArrowLeft, Ban, LogOut, RotateCcw, Search, StickyNote, Trash2, UserX } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { GENDER_LABELS, type Gender } from '../../shared/account'
import { istDay, type AdminUserDetail, type AdminUserRow, type Page } from '../../shared/admin'
import { useToast } from '../components/Toasts'
import { UserPhoto } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ago, BarList, ChartCard, compact, countryName, flag, pct, StatTile, TimeSeries, when } from './charts'
import { ConfirmDialog, ErrorNote, ExportLink, PageHeader, Pager, Pill, Skeleton, useAdminData } from './lib'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active this week' },
  { id: 'banned', label: 'Banned' },
  { id: 'deleted', label: 'Deleted' },
  { id: 'admins', label: 'Admins' },
]
const SORTS = [
  { id: 'recent', label: 'Newest' },
  { id: 'seen', label: 'Last seen' },
  { id: 'games', label: 'Most games' },
  { id: 'name', label: 'Name' },
]

function profileText(u: Pick<AdminUserRow, 'age' | 'gender'>): string {
  if (u.age === null && !u.gender) return '—'
  return [u.age ?? '?', u.gender ? (GENDER_LABELS[u.gender as Gender] ?? u.gender) : '?'].join(' · ')
}

export function Status({ u }: { u: Pick<AdminUserRow, 'bannedAt' | 'deletedAt' | 'isAdmin'> }) {
  if (u.deletedAt) return <Pill tone="gray">Deleted</Pill>
  if (u.bannedAt) return <Pill tone="red">Banned</Pill>
  if (u.isAdmin) return <Pill tone="brand">Admin</Pill>
  return null
}

export function UsersPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const filter = params.get('filter') ?? 'all'
  const sort = params.get('sort') ?? 'recent'
  const page = Number(params.get('page')) || 1
  const [draft, setDraft] = useState(q)
  const navigate = useNavigate()
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const t = window.setTimeout(() => draft !== q && set({ q: draft }), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const { data, error, loading, reload } = useAdminData<Page<AdminUserRow>>(`/api/admin/users?q=${encodeURIComponent(q)}&filter=${filter}&sort=${sort}&page=${page}`)

  return (
    <>
      <PageHeader title="Users" subtitle={data ? `${compact(data.total)} accounts match` : 'Every Google account that has signed in'}>
        <ExportLink what="users" />
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block lg:w-80">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search name or email…"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-3 pl-9 text-sm text-white outline-none placeholder:text-gray-500 focus:border-brand-400"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => set({ filter: f.id === 'all' ? '' : f.id })}
                aria-pressed={filter === f.id}
                className={clsx('rounded-full px-3 py-1 text-xs font-semibold', filter === f.id ? 'bg-white text-gray-900' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.1]')}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => set({ sort: e.target.value })}
            aria-label="Sort users"
            className="h-8 rounded-lg border border-white/10 bg-[#171020] px-2 text-xs text-gray-200"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#171020]">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr className="border-b border-white/5">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Age · gender</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 text-right font-medium">Games</th>
              <th className="px-4 py-3 text-right font-medium">Groups</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className={clsx(loading && 'opacity-60')}>
            {!data &&
              !error &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-4 py-2">
                    <Skeleton className="h-9" />
                  </td>
                </tr>
              ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                  No users match.
                </td>
              </tr>
            )}
            {data?.rows.map((u) => (
              <tr key={u.id} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]" onClick={() => navigate(`/admin/users/${u.id}`)}>
                <td className="px-4 py-2.5">
                  <Link to={`/admin/users/${u.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <UserPhoto name={u.name} picture={u.picture} size="sm" />
                    <span className="min-w-0">
                      <span className="block max-w-56 truncate font-semibold text-white">{u.name}</span>
                      <span className="block max-w-56 truncate text-xs text-gray-500">{u.email}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-300">{profileText(u)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-300" title={countryName(u.country)}>
                  {flag(u.country)} {u.city ?? (u.country ? countryName(u.country) : '—')}
                </td>
                <td className="px-4 py-2.5 text-right text-white tabular-nums">{u.games}</td>
                <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums">{u.groups}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{ago(u.createdAt)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{ago(u.lastSeen ?? u.lastLogin)}</td>
                <td className="px-4 py-2.5">
                  <Status u={u} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={(p) => set({ page: String(p) })} />}
    </>
  )
}

// ---------------------------------------------------------------------------

type Dialog = 'ban' | 'unban' | 'signout' | 'delete' | 'restore' | 'purge' | 'note' | null

const MODE: Record<string, string> = { party: 'Party', solo: 'Solo', group: 'Group', daily: 'Daily' }
const KIND: Record<string, string> = { songs: 'Songs', dialogue: 'Dialogue Baazi', actor: 'Star Spotting', emoji: 'Emoji Gaana' }

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-100">{children}</dd>
    </div>
  )
}

function ActionButton({ onClick, icon, children, danger }: { onClick: () => void; icon: ReactNode; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold',
        danger ? 'border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20' : 'border-white/10 bg-white/[0.04] text-gray-200 hover:bg-white/[0.08]',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function UserDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: u, error, reload } = useAdminData<AdminUserDetail>(`/api/admin/users/${id}`)
  const [dialog, setDialog] = useState<Dialog>(null)
  const { me } = useAuth()

  const act = async (body: Record<string, unknown>, done: string) => {
    await api(`/api/admin/users/${id}`, { body })
    toast({ title: done, tone: 'success', durationMs: 3000 })
    if (body.action === 'purge') navigate('/admin/users')
    else reload()
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!u) return <Skeleton className="h-96" />

  const accuracy = u.stats.answered ? u.stats.correct / u.stats.answered : 0
  const today = istDay()
  const activityDays = Array.from({ length: 90 }, (_, i) => today - 89 + i)
  const activityMap = new Map(u.activity.map((a) => [a.day, a.value]))

  return (
    <>
      <Link to="/admin/users" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All users
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <UserPhoto name={u.name} picture={u.picture} size="lg" />
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-white">
              {u.name} <Status u={u} />
            </h1>
            <p className="text-sm text-gray-400">{u.email}</p>
            <p className="mt-1 text-xs text-gray-500">
              {flag(u.country)} {[u.city, u.region, u.country ? countryName(u.country) : null].filter(Boolean).join(', ') || 'Location unknown'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={() => setDialog('note')} icon={<StickyNote className="h-3.5 w-3.5" />}>
            Note
          </ActionButton>
          <ActionButton onClick={() => setDialog('signout')} icon={<LogOut className="h-3.5 w-3.5" />}>
            Sign out everywhere
          </ActionButton>
          {u.id === me?.id ? null : u.bannedAt ? (
            <ActionButton onClick={() => setDialog('unban')} icon={<RotateCcw className="h-3.5 w-3.5" />}>
              Unban
            </ActionButton>
          ) : (
            <ActionButton danger onClick={() => setDialog('ban')} icon={<Ban className="h-3.5 w-3.5" />}>
              Ban
            </ActionButton>
          )}
          {u.id === me?.id ? null : u.deletedAt ? (
            <>
              <ActionButton onClick={() => setDialog('restore')} icon={<RotateCcw className="h-3.5 w-3.5" />}>
                Restore
              </ActionButton>
              <ActionButton danger onClick={() => setDialog('purge')} icon={<UserX className="h-3.5 w-3.5" />}>
                Erase for good
              </ActionButton>
            </>
          ) : (
            <ActionButton danger onClick={() => setDialog('delete')} icon={<Trash2 className="h-3.5 w-3.5" />}>
              Delete
            </ActionButton>
          )}
        </div>
      </div>

      {(u.bannedAt || u.deletedAt || u.adminNote) && (
        <div className="mb-4 space-y-2">
          {u.bannedAt && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
              Banned {when(u.bannedAt)}
              {u.banReason ? ` — “${u.banReason}”` : ''}. They can’t sign in or join group games.
            </p>
          )}
          {u.deletedAt && (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-gray-300">
              Deleted {when(u.deletedAt)}. Hidden and signed out; restore it, or erase it for good (privacy requests).
            </p>
          )}
          {u.adminNote && <p className="rounded-xl border border-brand-400/20 bg-brand-400/[0.06] px-4 py-2.5 text-sm whitespace-pre-wrap text-brand-100">📝 {u.adminNote}</p>}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatTile label="Games" value={u.stats.games} hint={`${u.stats.dailyPlays} daily challenges`} />
        <StatTile label="Wins" value={u.stats.wins} hint={u.stats.games ? `${pct(u.stats.wins / u.stats.games)} of games` : '—'} />
        <StatTile label="Accuracy" value={accuracy} format={(n) => pct(n)} hint={`${u.stats.correct} right answers`} />
        <StatTile label="Points" value={u.stats.points} hint="all games" />
        <StatTile label="Best streak" value={u.stats.bestStreak} hint="in a row" />
        <StatTile label="Avg. answer time" value={(u.stats.avgMs ?? 0) / 1000} format={(n) => (n ? `${n.toFixed(1)}s` : '—')} hint="when answering" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Activity" subtitle="Visits and games per day, last 90 days" className="lg:col-span-2">
          <TimeSeries days={activityDays} series={[{ key: 'a', label: 'Activity', values: activityDays.map((d) => activityMap.get(d) ?? 0) }]} height={180} />
        </ChartCard>
        <ChartCard title="Account">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Age · gender">{profileText(u)}</Fact>
            <Fact label="Joined">{when(u.createdAt)}</Fact>
            <Fact label="Last sign-in">{ago(u.lastLogin)}</Fact>
            <Fact label="Last seen">{ago(u.lastSeen)}</Fact>
            <Fact label="Sign-ins">{u.loginCount}</Fact>
            <Fact label="Active sessions">{u.sessions}</Fact>
            <Fact label="Groups">{u.groups}</Fact>
            <Fact label="Account type">{u.googleSub.startsWith('dev:') ? 'Developer (local)' : 'Google'}</Fact>
            <Fact label="User id">
              <code className="text-[11px] break-all text-gray-400">{u.id}</code>
            </Fact>
          </dl>
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Favourite game types">
          <BarList items={u.modes.map((m) => ({ label: KIND[m.label] ?? m.label, value: m.value }))} empty="No games yet." />
        </ChartCard>
        <ChartCard title="Favourite music">
          <BarList items={u.sources.map((m) => ({ label: m.label, value: m.value }))} empty="No games yet." />
        </ChartCard>
        <ChartCard title="Devices">
          <BarList items={u.devices.map((m) => ({ label: m.label, value: m.value }))} empty="No visits recorded." format={(n) => `${n}d`} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Recent games" className="lg:col-span-2">
          {u.recentGames.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No games yet.</p>}
          {u.recentGames.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="pb-2 font-medium">When</th>
                    <th className="pb-2 font-medium">Game</th>
                    <th className="pb-2 text-right font-medium">Rank</th>
                    <th className="pb-2 text-right font-medium">Score</th>
                    <th className="pb-2 text-right font-medium">Right</th>
                  </tr>
                </thead>
                <tbody>
                  {u.recentGames.map((g) => (
                    <tr key={g.id} className="border-t border-white/5">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-400">{when(g.at)}</td>
                      <td className="max-w-0 py-2 pr-3">
                        <p className="truncate text-gray-100">{g.source}</p>
                        <p className="text-xs text-gray-500">
                          {MODE[g.mode] ?? g.mode} · {KIND[g.kind] ?? g.kind}
                        </p>
                      </td>
                      <td className="py-2 text-right text-gray-200 tabular-nums">
                        {g.rank}/{g.players}
                      </td>
                      <td className="py-2 text-right font-semibold text-white tabular-nums">{compact(g.score)}</td>
                      <td className="py-2 text-right text-gray-300 tabular-nums">
                        {g.correct}/{g.rounds}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
        <ChartCard title="Groups">
          {u.groupsList.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Not in any group.</p>}
          <ul className="space-y-2">
            {u.groupsList.map((g) => (
              <li key={g.id}>
                <Link to={`/admin/groups/${g.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]">
                  <span className="truncate text-gray-100">{g.name}</span>
                  <Pill tone={g.role === 'admin' ? 'brand' : 'gray'}>{g.role}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      {dialog === 'ban' && (
        <ConfirmDialog
          title={`Ban ${u.name}?`}
          body="They’ll be signed out everywhere and can’t sign in again until you unban them."
          confirmLabel="Ban user"
          danger
          input={{ label: 'Reason (only admins see this)', placeholder: 'e.g. abusive chat' }}
          onConfirm={(reason) => act({ action: 'ban', reason }, 'User banned')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'unban' && (
        <ConfirmDialog title={`Unban ${u.name}?`} body="They’ll be able to sign in again." confirmLabel="Unban" onConfirm={() => act({ action: 'unban' }, 'User unbanned')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'signout' && (
        <ConfirmDialog
          title="Sign out everywhere?"
          body="Ends every active session for this account. They can sign straight back in."
          confirmLabel="Sign out"
          onConfirm={() => act({ action: 'signout' }, 'Signed out everywhere')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={`Delete ${u.name}?`}
          body="The account is hidden and signed out, and can’t sign in. Its history is kept so you can restore it later."
          confirmLabel="Delete account"
          danger
          onConfirm={() => act({ action: 'delete' }, 'Account deleted')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'restore' && (
        <ConfirmDialog title={`Restore ${u.name}?`} body="The account comes back and can sign in again." confirmLabel="Restore" onConfirm={() => act({ action: 'restore' }, 'Account restored')} onClose={() => setDialog(null)} />
      )}
      {dialog === 'purge' && (
        <ConfirmDialog
          title="Erase this account for good?"
          body={
            <>
              This can’t be undone. The account is removed, their groups are handed to another member (or removed if empty), and their name is replaced with “Deleted player” in game
              history. Use this for privacy deletion requests.
            </>
          }
          confirmLabel="Erase forever"
          danger
          input={{ label: `Type ${u.email} to confirm`, mustEqual: u.email }}
          onConfirm={(confirm) => act({ action: 'purge', confirm }, 'Account erased')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'note' && (
        <ConfirmDialog
          title="Admin note"
          body="Private to admins."
          confirmLabel="Save note"
          input={{ label: 'Note', multiline: true, initial: u.adminNote ?? '' }}
          onConfirm={(note) => act({ action: 'note', note }, 'Note saved')}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
