import { Ban, Gamepad2, Radio, UserPlus } from 'lucide-react'
import { Link } from 'react-router'
import type { Overview } from '../../shared/admin'
import { UserPhoto } from '../components/ui'
import { ago, ChartCard, compact, countryName, DataTable, dayLabel, flag, StatTile, TimeSeries } from './charts'
import { ErrorNote, PageHeader, Pill, RangePicker, Skeleton, useAdminData, useRange } from './lib'

export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    'user.ban': 'Banned a user',
    'user.unban': 'Unbanned a user',
    'user.signout': 'Signed a user out everywhere',
    'user.delete': 'Deleted a user',
    'user.restore': 'Restored a user',
    'user.purge': 'Erased a user for good',
    'user.note': 'Updated a user note',
    'group.rename': 'Renamed a group',
    'group.invite': 'Changed a group invite link',
    'group.guests': 'Changed group guest access',
    'group.remove': 'Removed a group member',
    'group.delete': 'Deleted a group',
    'room.close': 'Closed a room',
    'room.kick': 'Removed a player from a room',
    'daily.remove': 'Removed a daily score',
    'config.update': 'Changed site settings',
    export: 'Exported data',
  }
  return map[action] ?? action
}

export function OverviewPage() {
  const [days] = useRange()
  const { data, error, reload } = useAdminData<Overview>(`/api/admin/overview?days=${days}`)

  return (
    <>
      <PageHeader title="Overview" subtitle={`Riffle at a glance · last ${days === 365 ? 'year' : `${days} days`} (IST)`}>
        <RangePicker />
      </PageHeader>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
          <Skeleton className="col-span-2 h-72 lg:col-span-6" />
        </div>
      )}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label="Visitors" value={data.period.visitors.value} previous={data.period.visitors.previous} spark={data.daily.map((d) => d.visitors)} />
            <StatTile label="Signed-in active" value={data.period.activeUsers.value} previous={data.period.activeUsers.previous} />
            <StatTile label="New accounts" value={data.period.newUsers.value} previous={data.period.newUsers.previous} spark={data.daily.map((d) => d.signups)} />
            <StatTile label="Games played" value={data.period.games.value} previous={data.period.games.previous} spark={data.daily.map((d) => d.games)} />
            <StatTile label="Player seats" value={data.period.players.value} previous={data.period.players.previous} />
            <StatTile label="Rooms created" value={data.period.rooms.value} previous={data.period.rooms.previous} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Daily activity" subtitle="Unique visitors, games and new accounts per day" className="lg:col-span-2">
              <TimeSeries
                days={data.daily.map((d) => d.day)}
                series={[
                  { key: 'visitors', label: 'Visitors', values: data.daily.map((d) => d.visitors) },
                  { key: 'games', label: 'Games', values: data.daily.map((d) => d.games) },
                  { key: 'signups', label: 'New accounts', values: data.daily.map((d) => d.signups) },
                ]}
              />
              <DataTable columns={['Day', 'Visitors', 'Games', 'New accounts']} rows={data.daily.map((d) => [dayLabel(d.day), d.visitors, d.games, d.signups])} />
            </ChartCard>
            <div className="grid gap-4">
              <Link to="/admin/rooms" className="block rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-5 hover:bg-emerald-500/[0.1]">
                <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-emerald-300 uppercase">
                  <Radio className="h-3.5 w-3.5 animate-pulse" /> Live right now
                </p>
                <p className="mt-2 text-4xl font-semibold text-white tabular-nums">{data.live.players}</p>
                <p className="text-sm text-gray-300">
                  {data.live.players === 1 ? 'player' : 'players'} in {data.live.rooms} {data.live.rooms === 1 ? 'room' : 'rooms'}
                </p>
              </Link>
              <div className="rounded-2xl border border-white/[0.07] bg-[#171020] p-5">
                <p className="mb-3 text-xs font-semibold tracking-wide text-gray-400 uppercase">All time</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {[
                    ['Accounts', data.totals.users],
                    ['Browsers seen', data.totals.visitors],
                    ['Games', data.totals.games],
                    ['Groups', data.totals.groups],
                    ['Banned', data.totals.banned],
                    ['Deleted', data.totals.deleted],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <dt className="text-xs text-gray-500">{k}</dt>
                      <dd className="font-semibold text-white tabular-nums">{compact(v as number)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Newest accounts" right={<Link to="/admin/users" className="text-xs font-semibold text-brand-300 hover:text-brand-200">All users →</Link>}>
              {data.recentUsers.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No accounts yet.</p>}
              <ul className="divide-y divide-white/5">
                {data.recentUsers.map((u) => (
                  <li key={u.id}>
                    <Link to={`/admin/users/${u.id}`} className="flex items-center gap-3 py-2.5 hover:bg-white/[0.02]">
                      <UserPhoto name={u.name} picture={u.picture} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{u.name}</span>
                        <span className="block truncate text-xs text-gray-500">{u.email}</span>
                      </span>
                      <span className="text-right text-xs text-gray-400">
                        <span className="block" title={countryName(u.country)}>
                          {flag(u.country)} {u.city ?? ''}
                        </span>
                        <span className="block">{ago(u.createdAt)}</span>
                      </span>
                      {u.bannedAt && <Pill tone="red">Banned</Pill>}
                    </Link>
                  </li>
                ))}
              </ul>
            </ChartCard>
            <ChartCard title="Recent admin actions" right={<Link to="/admin/audit" className="text-xs font-semibold text-brand-300 hover:text-brand-200">Audit log →</Link>}>
              {data.recentActions.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Nothing changed from the console yet.</p>}
              <ul className="space-y-3">
                {data.recentActions.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 rounded-lg bg-white/[0.05] p-1.5 text-gray-300">
                      {a.action.startsWith('user.ban') ? <Ban className="h-3.5 w-3.5" /> : a.action.startsWith('room') ? <Gamepad2 className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-gray-200">{actionLabel(a.action)}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {a.adminEmail} · {ago(a.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </ChartCard>
          </div>
        </div>
      )}
    </>
  )
}
