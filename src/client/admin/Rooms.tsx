import clsx from 'clsx'
import { ExternalLink, Power, RefreshCw, UserMinus } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AdminRoom } from '../../shared/admin'
import { useToast } from '../components/Toasts'
import { api } from '../lib/api'
import { ago, flag } from './charts'
import { ConfirmDialog, ErrorNote, IconButton, PageHeader, Pill, Skeleton, useAdminData } from './lib'

const PHASE: Record<string, { label: string; tone: 'green' | 'amber' | 'blue' | 'gray' }> = {
  lobby: { label: 'Lobby', tone: 'blue' },
  loading: { label: 'Loading', tone: 'amber' },
  countdown: { label: 'Starting', tone: 'amber' },
  question: { label: 'Playing', tone: 'green' },
  reveal: { label: 'Playing', tone: 'green' },
  results: { label: 'Results', tone: 'gray' },
}
const KIND: Record<string, string> = { songs: '🎵 Songs', dialogue: '🎬 Dialogue', actor: '⭐ Stars', emoji: '😀 Emoji' }

export function RoomsPage() {
  const toast = useToast()
  const { data, error, loading, reload } = useAdminData<{ rooms: AdminRoom[] }>('/api/admin/rooms')
  const [closing, setClosing] = useState<AdminRoom | null>(null)
  const [kicking, setKicking] = useState<{ room: string; id: string; name: string } | null>(null)
  const [onlyLive, setOnlyLive] = useState(true)

  // Live view: refresh every 15 seconds.
  useEffect(() => {
    const t = window.setInterval(reload, 15_000)
    return () => clearInterval(t)
  }, [reload])

  const rooms = (data?.rooms ?? []).filter((r) => !onlyLive || r.players.some((p) => p.connected))
  const online = (data?.rooms ?? []).reduce((a, r) => a + r.players.filter((p) => p.connected).length, 0)

  return (
    <>
      <PageHeader title="Live rooms" subtitle={data ? `${online} players online · rooms from the last 7 hours · refreshes every 15s` : 'Rooms happening right now'}>
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input type="checkbox" checked={onlyLive} onChange={(e) => setOnlyLive(e.target.checked)} className="accent-brand-400" />
          Only rooms with people in them
        </label>
        <IconButton onClick={reload} label="Refresh" loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </IconButton>
      </PageHeader>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}
      {data && rooms.length === 0 && <p className="rounded-2xl border border-white/[0.07] bg-[#171020] p-10 text-center text-gray-400">No one’s playing right now.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((r) => {
          const phase = PHASE[r.phase] ?? { label: r.phase, tone: 'gray' as const }
          const here = r.players.filter((p) => p.connected).length
          return (
            <article key={r.code} className="flex flex-col rounded-2xl border border-white/[0.07] bg-[#171020] p-4">
              <header className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-lg font-bold tracking-widest text-white">{r.code}</span>
                    <Pill tone={phase.tone}>{phase.label}</Pill>
                    {r.round && (
                      <span className="text-xs text-gray-400">
                        round {r.round}/{r.rounds}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {KIND[r.kind] ?? r.kind} · {r.source}
                  </p>
                </div>
                <a href={`/r/${r.code}`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white" aria-label={`Open room ${r.code}`}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </header>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {r.solo && <Pill>Solo</Pill>}
                {r.daily && <Pill tone="brand">Daily #{r.daily}</Pill>}
                {r.group && <Pill tone="blue">Group: {r.group}</Pill>}
                <Pill tone={here ? 'green' : 'gray'}>
                  {here}/{r.players.length} online
                </Pill>
                {r.chats > 0 && <Pill>{r.chats} chat msgs</Pill>}
              </div>
              <ul className="mb-3 flex-1 space-y-1">
                {r.players.slice(0, 10).map((p) => (
                  <li key={p.id} className={clsx('flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm', !p.connected && 'opacity-50')}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', p.connected ? 'bg-emerald-400' : 'bg-gray-600')} />
                      <span className="truncate text-gray-100">{p.name}</span>
                      {p.host && <span className="text-[10px] font-bold text-brand-300 uppercase">host</span>}
                      {p.userId && <span className="text-[10px] text-sky-300">signed in</span>}
                      <span className="text-xs">{flag(p.country)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-gray-400 tabular-nums">{p.score}</span>
                      <button
                        type="button"
                        onClick={() => setKicking({ room: r.code, id: p.id, name: p.name })}
                        aria-label={`Remove ${p.name}`}
                        className="rounded p-1 text-gray-500 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
                {r.players.length > 10 && <li className="px-2 text-xs text-gray-500">+{r.players.length - 10} more</li>}
              </ul>
              <footer className="flex items-center justify-between border-t border-white/5 pt-3 text-xs text-gray-500">
                <span>
                  Created {ago(r.createdAt)} · active {ago(r.lastActive)}
                </span>
                <button type="button" onClick={() => setClosing(r)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-red-300 hover:bg-red-500/10">
                  <Power className="h-3.5 w-3.5" /> Close
                </button>
              </footer>
            </article>
          )
        })}
      </div>
      {closing && (
        <ConfirmDialog
          title={`Close room ${closing.code}?`}
          body="Everyone in it is disconnected and sees your message. The game in progress is recorded as ended."
          confirmLabel="Close room"
          danger
          input={{ label: 'Message to players (optional)', placeholder: 'This room was closed by the Riffle team.' }}
          onConfirm={async (message) => {
            await api(`/api/admin/rooms/${closing.code}`, { body: { action: 'close', message } })
            toast({ title: `Room ${closing.code} closed`, tone: 'success', durationMs: 3000 })
            reload()
          }}
          onClose={() => setClosing(null)}
        />
      )}
      {kicking && (
        <ConfirmDialog
          title={`Remove ${kicking.name}?`}
          body={`They’re removed from room ${kicking.room} (they can rejoin with the code).`}
          confirmLabel="Remove player"
          danger
          onConfirm={async () => {
            await api(`/api/admin/rooms/${kicking.room}`, { body: { action: 'kick', playerId: kicking.id } })
            toast({ title: 'Player removed', tone: 'success', durationMs: 3000 })
            reload()
          }}
          onClose={() => setKicking(null)}
        />
      )}
    </>
  )
}
