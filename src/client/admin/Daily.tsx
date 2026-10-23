import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { DailyAdmin } from '../../shared/admin'
import { useToast } from '../components/Toasts'
import { api } from '../lib/api'
import { ChartCard, StatTile, when } from './charts'
import { ConfirmDialog, ErrorNote, PageHeader, Skeleton, useAdminData } from './lib'

const GAME: Record<string, string> = { dialogue: '🎬 Dialogue Baazi', emoji: '😀 Emoji Gaana', actor: '⭐ Star Spotting' }

export function DailyPage() {
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const day = params.get('day')
  const { data, error, reload } = useAdminData<DailyAdmin>(`/api/admin/daily${day ? `?day=${day}` : ''}`)
  const [removing, setRemoving] = useState<DailyAdmin['rows'][number] | null>(null)
  const go = (d: number) => setParams({ day: String(d) }, { replace: true })

  return (
    <>
      <PageHeader title="Daily challenge" subtitle="Aaj Ka Challenge leaderboards — remove junk or abusive entries">
        {data && (
          <div className="inline-flex items-center gap-1">
            <button type="button" onClick={() => go(data.day - 1)} disabled={data.day <= 1} aria-label="Previous day" className="rounded-lg border border-white/10 p-2 text-gray-300 hover:bg-white/5 disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-24 text-center text-sm font-semibold text-white">Daily #{data.day}</span>
            <button type="button" onClick={() => go(data.day + 1)} aria-label="Next day" className="rounded-lg border border-white/10 p-2 text-gray-300 hover:bg-white/5">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </PageHeader>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Skeleton className="h-96" />}
      {data && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Players" value={data.players} hint="finished this challenge" />
            <StatTile label="Game" value={0} format={() => GAME[data.game] ?? data.game} hint="today’s type" />
            <StatTile label="Top score" value={data.rows[0]?.score ?? 0} hint={data.rows[0]?.name ?? '—'} />
            <StatTile label="Avg. score" value={data.rows.length ? Math.round(data.rows.reduce((a, r) => a + r.score, 0) / data.rows.length) : 0} hint="top 100" />
          </div>
          <ChartCard title="Leaderboard" subtitle="Top 100 for this day">
            {data.rows.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No one has finished this challenge.</p>}
            {data.rows.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-left text-xs text-gray-500">
                    <tr>
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Player</th>
                      <th className="pb-2 text-right font-medium">Score</th>
                      <th className="pb-2 text-right font-medium">Right</th>
                      <th className="pb-2 font-medium">Played</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={r.roomCode} className="border-t border-white/5">
                        <td className="py-2 text-gray-500 tabular-nums">{i + 1}</td>
                        <td className="py-2 text-gray-100">
                          {r.userId ? (
                            <Link to={`/admin/users/${r.userId}`} className="hover:underline">
                              {r.name}
                            </Link>
                          ) : (
                            <>
                              {r.name} <span className="text-xs text-gray-500">(guest)</span>
                            </>
                          )}
                        </td>
                        <td className="py-2 text-right font-semibold text-white tabular-nums">{r.score}</td>
                        <td className="py-2 text-right text-gray-300 tabular-nums">
                          {r.correct}/{r.total}
                        </td>
                        <td className="py-2 text-gray-400">{when(r.playedAt)}</td>
                        <td className="py-2 text-right">
                          <button type="button" onClick={() => setRemoving(r)} aria-label={`Remove ${r.name}’s score`} className="rounded p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-300">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ChartCard>
        </>
      )}
      {removing && data && (
        <ConfirmDialog
          title={`Remove ${removing.name}’s score?`}
          body={`${removing.score} points on Daily #${data.day} is taken off the leaderboard.`}
          confirmLabel="Remove score"
          danger
          onConfirm={async () => {
            await api('/api/admin/daily/remove', { body: { day: data.day, roomCode: removing.roomCode } })
            toast({ title: 'Score removed', tone: 'success', durationMs: 3000 })
            reload()
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}
