import clsx from 'clsx'
import { Link, useNavigate, useParams } from 'react-router'
import type { AudienceReport, ContentReport, GamesReport, GeoReport, ItemRow, Ranked, RetentionReport } from '../../shared/admin'
import { UserPhoto } from '../components/ui'
import { BarList, ChartCard, CohortGrid, compact, countryName, DataTable, dayLabel, flag, Heatmap, pct, SERIES, ShareBar, StackedColumns, StatTile, TimeSeries } from './charts'
import { ErrorNote, ExportLink, PageHeader, RangePicker, Skeleton, useAdminData, useRange } from './lib'
import { useState } from 'react'

const TABS = [
  { id: 'audience', label: 'Audience' },
  { id: 'geo', label: 'Geography' },
  { id: 'games', label: 'Games & preferences' },
  { id: 'content', label: 'Songs & questions' },
  { id: 'retention', label: 'Retention' },
] as const
type Tab = (typeof TABS)[number]['id']

const toBars = (items: Ranked[], extra?: (r: Ranked) => string | undefined) => items.map((r) => ({ label: r.label, value: r.value, extra: extra?.(r) }))

function Loading() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-80 lg:col-span-2" />
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  )
}

export function AnalyticsPage() {
  const params = useParams()
  const navigate = useNavigate()
  const [days] = useRange()
  const tab: Tab = (TABS.find((t) => t.id === params.tab)?.id ?? 'audience') as Tab

  return (
    <>
      <PageHeader title="Analytics" subtitle="Who plays, from where, what they love — all first-party, cookie-free, times in IST">
        {tab !== 'content' && <RangePicker />}
        <ExportLink what={tab === 'content' ? 'songs' : tab === 'games' ? 'games' : 'visits'} days={days} />
      </PageHeader>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-white/[0.06]" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => navigate(`/admin/analytics/${t.id}?days=${days}`)}
            className={clsx('-mb-px shrink-0 border-b-2 px-3 pb-2.5 text-sm font-semibold whitespace-nowrap', tab === t.id ? 'border-brand-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-200')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'audience' && <Audience days={days} />}
      {tab === 'geo' && <Geography days={days} />}
      {tab === 'games' && <Games days={days} />}
      {tab === 'content' && <Content />}
      {tab === 'retention' && <Retention days={days} />}
    </>
  )
}

// ---------------------------------------------------------------------------

function Audience({ days }: { days: number }) {
  const { data, error, reload } = useAdminData<AudienceReport>(`/api/admin/analytics/audience?days=${days}`)
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!data) return <Loading />
  const d = data.visitorsByDay
  const totalViews = d.reduce((a, x) => a + x.views, 0)
  const newVisitors = d.reduce((a, x) => a + x.newVisitors, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Avg. daily visitors" value={data.stickiness.dau} hint="per day in this range" />
        <StatTile label="Weekly visitors" value={data.stickiness.wau} hint="last 7 days" />
        <StatTile label="Monthly visitors" value={data.stickiness.mau} hint="last 30 days" />
        <StatTile label="Stickiness" value={data.stickiness.mau ? data.stickiness.dau / data.stickiness.mau : 0} format={(n) => pct(n)} hint="daily ÷ monthly visitors" />
        <StatTile label="Returning visits" value={data.returningShare} format={(n) => pct(n)} hint="visits by people seen before" />
        <StatTile label="Page views" value={totalViews} hint={`${compact(newVisitors)} first-time visitors`} />
      </div>
      <ChartCard title="Visitors per day" subtitle="Unique browsers, first-time browsers and signed-in visitors">
        <TimeSeries
          days={d.map((x) => x.day)}
          series={[
            { key: 'v', label: 'Visitors', values: d.map((x) => x.visitors) },
            { key: 'n', label: 'First-time', values: d.map((x) => x.newVisitors) },
            { key: 's', label: 'Signed in', values: d.map((x) => x.signedIn) },
          ]}
        />
        <DataTable columns={['Day', 'Visitors', 'First-time', 'Signed in', 'Page views']} rows={d.map((x) => [dayLabel(x.day), x.visitors, x.newVisitors, x.signedIn, x.views])} />
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Devices">
          <ShareBar items={data.devices} />
        </ChartCard>
        <ChartCard title="Operating systems">
          <ShareBar items={data.os} />
        </ChartCard>
        <ChartCard title="Browsers">
          <ShareBar items={data.browsers} />
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Where visitors come from" subtitle="Referring site of the first page in a visit">
          <BarList items={toBars(data.referrers)} />
        </ChartCard>
        <ChartCard title="Top pages">
          <BarList items={toBars(data.pages)} />
        </ChartCard>
      </div>
      <ChartCard title="When people visit" subtitle="Visits by weekday and hour (IST)">
        <Heatmap grid={data.hours} unit="visits" />
      </ChartCard>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Geography({ days }: { days: number }) {
  const { data, error, reload } = useAdminData<GeoReport>(`/api/admin/analytics/geo?days=${days}`)
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!data) return <Loading />
  const known = data.countries.filter((c) => c.code !== '??')
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Countries" value={known.length} hint="with at least one visitor or player" />
        <StatTile label="Top country" value={known[0]?.value ?? 0} hint={known[0] ? `${flag(known[0].code)} ${countryName(known[0].code)} visitors` : '—'} />
        <StatTile label="Regions / states" value={data.regions.length} hint="in the top list" />
        <StatTile label="Cities" value={data.cities.length} hint="in the top list" />
      </div>
      <ChartCard title="Countries" subtitle="Unique visitors · player seats and games played from each country">
        {data.countries.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No visits recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="pb-2 font-medium">Country</th>
                  <th className="pb-2 font-medium">Visitors</th>
                  <th className="pb-2 text-right font-medium">Player seats</th>
                  <th className="pb-2 text-right font-medium">Games</th>
                </tr>
              </thead>
              <tbody>
                {data.countries.map((c) => {
                  const top = Math.max(1, ...data.countries.map((x) => x.value))
                  return (
                    <tr key={c.code} className="border-t border-white/5">
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-200">
                        <span className="mr-2">{flag(c.code)}</span>
                        {countryName(c.code)}
                      </td>
                      <td className="w-1/2 py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-white/[0.05]">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(1.5, (c.value / top) * 100)}%`, background: SERIES[0] }} />
                          </div>
                          <span className="w-12 text-right font-semibold text-white tabular-nums">{compact(c.value)}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-gray-300 tabular-nums">{compact(c.players)}</td>
                      <td className="py-2 text-right text-gray-300 tabular-nums">{compact(c.games)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top regions & states">
          <BarList items={data.regions.map((r) => ({ label: `${flag(r.country)} ${r.label}`, value: r.value }))} />
        </ChartCard>
        <ChartCard title="Top cities">
          <BarList items={data.cities.map((r) => ({ label: `${flag(r.country)} ${r.label}`, value: r.value }))} />
        </ChartCard>
      </div>
      <ChartCard title="What each country plays" subtitle="Game modes chosen by players in the top countries (share of player seats)">
        {data.countryModes.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No games yet.</p>}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {data.countryModes.map((c) => (
            <div key={c.code}>
              <p className="mb-2 text-sm font-semibold text-white">
                {flag(c.code)} {countryName(c.code)}
              </p>
              <ShareBar items={c.modes} />
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Games({ days }: { days: number }) {
  const { data, error, reload } = useAdminData<GamesReport>(`/api/admin/analytics/games?days=${days}`)
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!data) return <Loading />
  const g = data.gamesByDay
  const total = data.social.total
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Games" value={total} hint="in this range" />
        <StatTile label="Finished" value={data.completion} format={(n) => pct(n)} hint="played every round" />
        <StatTile label="Avg. players" value={data.avgPlayers} format={(n) => n.toFixed(1)} hint="per game" />
        <StatTile label="Avg. accuracy" value={data.avgAccuracy} format={(n) => pct(n)} hint="right answers" />
        <StatTile label="Avg. length" value={data.avgMinutes} format={(n) => `${n.toFixed(1)} min`} hint="start to finish" />
        <StatTile label="Used voice" value={total ? data.social.voiceGames / total : 0} format={(n) => pct(n)} hint={`chat in ${total ? pct(data.social.chatGames / total) : '0%'} of games`} />
      </div>
      <ChartCard title="Games per day by type">
        <StackedColumns
          days={g.map((x) => x.day)}
          series={[
            { key: 'songs', label: 'Songs', values: g.map((x) => x.songs) },
            { key: 'dialogue', label: 'Dialogue Baazi', values: g.map((x) => x.dialogue) },
            { key: 'actor', label: 'Star Spotting', values: g.map((x) => x.actor) },
            { key: 'emoji', label: 'Emoji Gaana', values: g.map((x) => x.emoji) },
          ]}
        />
        <DataTable columns={['Day', 'Songs', 'Dialogue', 'Star', 'Emoji']} rows={g.map((x) => [dayLabel(x.day), x.songs, x.dialogue, x.actor, x.emoji])} />
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="How people play" subtitle="Avg. players per game on the right">
          <BarList items={toBars(data.modes, (r) => (r.extra != null ? `${r.extra.toFixed(1)} ppl` : undefined))} />
        </ChartCard>
        <ChartCard title="Game types" subtitle="Accuracy on the right">
          <BarList items={toBars(data.kinds, (r) => (r.extra != null ? `${Math.round(r.extra)}%` : undefined))} />
        </ChartCard>
        <ChartCard title="Music sources">
          <BarList items={toBars(data.sources)} />
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Favourite preset mixes" subtitle="Games · total player seats on the right">
          <BarList items={toBars(data.presets, (r) => (r.extra != null ? `${compact(r.extra)} seats` : undefined))} />
        </ChartCard>
        <ChartCard title="Group size">
          <BarList items={toBars(data.playerCounts)} max={8} />
        </ChartCard>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Difficulty">
          <ShareBar items={data.difficulty} />
        </ChartCard>
        <ChartCard title="Rounds">
          <ShareBar items={data.rounds} />
        </ChartCard>
        <ChartCard title="Answer time">
          <ShareBar items={data.guessSeconds} />
        </ChartCard>
        <ChartCard title="Answer type">
          <ShareBar items={data.answerTypes} />
        </ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Music region setting" subtitle="Which chart region hosts pick">
          <BarList items={toBars(data.regions)} />
        </ChartCard>
        <ChartCard title="Feature use" subtitle="Shares, posters, invites and more" className="lg:col-span-2">
          <BarList items={data.features.map((f) => ({ label: f.label.replace(/_/g, ' '), value: f.value }))} empty="No feature events yet." />
        </ChartCard>
      </div>
      <ChartCard title="When games are played" subtitle="Games started by weekday and hour (IST)">
        <Heatmap grid={data.hours} unit="games" />
      </ChartCard>
    </div>
  )
}

// ---------------------------------------------------------------------------

const KIND_FILTERS = [
  { id: '', label: 'Everything' },
  { id: 'song', label: 'Songs' },
  { id: 'dialogue', label: 'Dialogues' },
  { id: 'actor', label: 'Stars' },
  { id: 'emoji', label: 'Emoji' },
  { id: 'quote', label: 'Quotes' },
]

function ItemTable({ rows, empty }: { rows: ItemRow[]; empty: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-gray-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="text-left text-xs text-gray-500">
          <tr>
            <th className="pb-2 font-medium">Item</th>
            <th className="pb-2 text-right font-medium">Plays</th>
            <th className="pb-2 text-right font-medium">Accuracy</th>
            <th className="pb-2 text-right font-medium">Avg. time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/5">
              <td className="max-w-0 py-2 pr-3">
                <p className="truncate text-gray-100">{r.title}</p>
                <p className="truncate text-xs text-gray-500">{r.subtitle}</p>
              </td>
              <td className="py-2 text-right font-semibold text-white tabular-nums">{compact(r.plays)}</td>
              <td className="py-2 text-right tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-gray-300">
                  <span className="inline-block h-1.5 w-10 rounded-full bg-white/[0.06]">
                    <span className="block h-1.5 rounded-full" style={{ width: `${r.accuracy * 100}%`, background: SERIES[2] }} />
                  </span>
                  {pct(r.accuracy)}
                </span>
              </td>
              <td className="py-2 text-right text-gray-400 tabular-nums">{r.avgSeconds ? `${r.avgSeconds.toFixed(1)}s` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Content() {
  const [kind, setKind] = useState('')
  const { data, error, reload } = useAdminData<ContentReport>(`/api/admin/analytics/content${kind ? `?kind=${kind}` : ''}`)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">All-time stats for every song and question played.</p>
        <div className="flex flex-wrap gap-1">
          {KIND_FILTERS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              className={clsx('rounded-full px-3 py-1 text-xs font-semibold', kind === k.id ? 'bg-white text-gray-900' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.1]')}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && (
        <>
          {!kind && data.kinds.length > 0 && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {data.kinds.map((k) => (
                <StatTile key={k.kind} label={`${k.kind === 'song' ? 'Songs' : k.kind.charAt(0).toUpperCase() + k.kind.slice(1)} played`} value={k.plays} hint={`${pct(k.accuracy)} answered right`} />
              ))}
            </div>
          )}
          <ChartCard title="Most played">
            <ItemTable rows={data.mostPlayed} empty="Nothing played yet." />
          </ChartCard>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Hardest" subtitle="Lowest accuracy (at least 5 answers)">
              <ItemTable rows={data.hardest} empty="Needs a few more answers." />
            </ChartCard>
            <ChartCard title="Easiest" subtitle="Highest accuracy (at least 5 answers)">
              <ItemTable rows={data.easiest} empty="Needs a few more answers." />
            </ChartCard>
          </div>
          {(!kind || kind === 'song') && (
            <ChartCard title="Most played artists" subtitle="Song rounds · accuracy on the right">
              <BarList items={toBars(data.artists, (r) => (r.extra != null ? `${Math.round(r.extra)}%` : undefined))} />
            </ChartCard>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Retention({ days }: { days: number }) {
  const { data, error, reload } = useAdminData<RetentionReport>(`/api/admin/analytics/retention?days=${days}`)
  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!data) return <Loading />
  return (
    <div className="space-y-4">
      <ChartCard title="Visitor retention" subtitle="Browsers grouped by the week of their first visit, and the share who came back in later weeks">
        <CohortGrid cohorts={data.cohorts} unit="Visitors" />
      </ChartCard>
      <ChartCard title="Account retention" subtitle="Accounts grouped by sign-up week, and the share active in later weeks">
        <CohortGrid cohorts={data.userCohorts} unit="Sign-ups" />
      </ChartCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Most active players" subtitle="Signed-in players in this range">
          {data.topPlayers.length === 0 && <p className="py-6 text-center text-sm text-gray-500">No signed-in games yet.</p>}
          <ol className="divide-y divide-white/5">
            {data.topPlayers.map((p, i) => (
              <li key={p.userId}>
                <Link to={`/admin/users/${p.userId}`} className="flex items-center gap-3 py-2 hover:bg-white/[0.02]">
                  <span className="w-5 text-right text-xs text-gray-500 tabular-nums">{i + 1}</span>
                  <UserPhoto name={p.name} picture={p.picture} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-100">{p.name}</span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    <span className="font-semibold text-white">{p.games}</span> games · {p.wins} wins · {pct(p.accuracy)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </ChartCard>
        <ChartCard title="Daily challenge" subtitle="Players and average score per day">
          {data.dailyChallenge.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">No daily challenge scores yet.</p>
          ) : (
            <TimeSeries
              days={data.dailyChallenge.map((d) => d.day)}
              series={[{ key: 'p', label: 'Players', values: data.dailyChallenge.map((d) => d.players) }]}
            />
          )}
        </ChartCard>
      </div>
    </div>
  )
}
