import clsx from 'clsx'
import { ArrowLeft, Link2, Link2Off, Pencil, Search, Trash2, UserMinus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { AdminGroupDetail, AdminGroupRow, Page } from '../../shared/admin'
import { useToast } from '../components/Toasts'
import { Toggle, UserPhoto } from '../components/ui'
import { api } from '../lib/api'
import { ago, ChartCard, compact, StatTile, when } from './charts'
import { ConfirmDialog, ErrorNote, PageHeader, Pager, Pill, Skeleton, useAdminData } from './lib'

const SORTS = [
  { id: 'recent', label: 'Newest' },
  { id: 'played', label: 'Last played' },
  { id: 'members', label: 'Most members' },
  { id: 'games', label: 'Most games' },
]

export function GroupsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
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
  const { data, error, loading, reload } = useAdminData<Page<AdminGroupRow>>(`/api/admin/groups?q=${encodeURIComponent(q)}&sort=${sort}&page=${page}`)

  return (
    <>
      <PageHeader title="Groups" subtitle={data ? `${compact(data.total)} groups` : 'Saved friend circles'} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:w-80">
          <span className="sr-only">Search groups</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search group or owner email…"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-3 pl-9 text-sm text-white outline-none placeholder:text-gray-500 focus:border-brand-400"
          />
        </label>
        <select value={sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort groups" className="h-8 rounded-lg border border-white/10 bg-[#171020] px-2 text-xs text-gray-200">
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#171020]">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr className="border-b border-white/5">
              <th className="px-4 py-3 font-medium">Group</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 text-right font-medium">Members</th>
              <th className="px-4 py-3 text-right font-medium">Games</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium">Last played</th>
            </tr>
          </thead>
          <tbody className={clsx(loading && 'opacity-60')}>
            {!data &&
              !error &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={6} className="px-4 py-2">
                    <Skeleton className="h-8" />
                  </td>
                </tr>
              ))}
            {data?.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  No groups match.
                </td>
              </tr>
            )}
            {data?.rows.map((g) => (
              <tr key={g.id} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]" onClick={() => navigate(`/admin/groups/${g.id}`)}>
                <td className="px-4 py-2.5">
                  <Link to={`/admin/groups/${g.id}`} className="flex items-center gap-2 font-semibold text-white" onClick={(e) => e.stopPropagation()}>
                    <Users className="h-4 w-4 text-brand-400" /> {g.name}
                    {!g.inviteEnabled && <Pill tone="gray">invite off</Pill>}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span className="block text-gray-200">{g.ownerName}</span>
                  <span className="block text-xs text-gray-500">{g.ownerEmail}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-white tabular-nums">{g.members}</td>
                <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums">{g.games}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{ago(g.createdAt)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{g.lastPlayed ? ago(g.lastPlayed) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={(p) => set({ page: String(p) })} />}
    </>
  )
}

export function GroupDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { data: g, error, reload } = useAdminData<AdminGroupDetail>(`/api/admin/groups/${id}`)
  const [dialog, setDialog] = useState<'rename' | 'delete' | { remove: string; name: string } | null>(null)

  const act = async (body: Record<string, unknown>, done: string) => {
    await api(`/api/admin/groups/${id}`, { body })
    toast({ title: done, tone: 'success', durationMs: 3000 })
    if (body.action === 'delete') navigate('/admin/groups')
    else reload()
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!g) return <Skeleton className="h-96" />

  return (
    <>
      <Link to="/admin/groups" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> All groups
      </Link>
      <PageHeader title={g.name} subtitle={`Owned by ${g.ownerName} (${g.ownerEmail}) · created ${when(g.createdAt)}`}>
        <button
          type="button"
          onClick={() => setDialog('rename')}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-gray-200 hover:bg-white/[0.08]"
        >
          <Pencil className="h-3.5 w-3.5" /> Rename
        </button>
        <button
          type="button"
          onClick={() => setDialog('delete')}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-200 hover:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete group
        </button>
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Members" value={g.members} hint="of 50 max" />
        <StatTile label="Games" value={g.games} hint="recorded" />
        <StatTile label="Last played" value={0} format={() => (g.lastPlayed ? ago(g.lastPlayed) : '—')} hint={g.lastPlayed ? when(g.lastPlayed) : 'never'} />
        <div className="rounded-2xl border border-white/[0.07] bg-[#171020] p-4">
          <p className="text-xs font-medium text-gray-400">Invite link</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-white">
            {g.inviteEnabled ? <Link2 className="h-4 w-4 text-emerald-400" /> : <Link2Off className="h-4 w-4 text-gray-500" />}
            <code className="text-xs">{g.inviteEnabled ? `/g/${g.inviteCode}` : 'turned off'}</code>
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title={`Members (${g.memberList.length})`} className="lg:col-span-2">
          <ul className="divide-y divide-white/5">
            {g.memberList.map((m) => (
              <li key={m.userId} className="flex items-center gap-3 py-2.5">
                <UserPhoto name={m.name} picture={m.picture} size="sm" />
                <Link to={`/admin/users/${m.userId}`} className="min-w-0 flex-1 hover:underline">
                  <span className="block truncate text-sm font-semibold text-white">{m.name}</span>
                  <span className="block truncate text-xs text-gray-500">{m.email}</span>
                </Link>
                <Pill tone={m.role === 'admin' ? 'brand' : 'gray'}>{m.role}</Pill>
                <span className="hidden text-xs text-gray-500 sm:inline">joined {ago(m.joinedAt)}</span>
                <button type="button" onClick={() => setDialog({ remove: m.userId, name: m.name })} aria-label={`Remove ${m.name}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-500/10 hover:text-red-300">
                  <UserMinus className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </ChartCard>
        <div className="space-y-4">
          <ChartCard title="Access">
            <div className="space-y-3">
              <Toggle checked={g.inviteEnabled} onChange={(v) => void act({ action: 'invite', enabled: v }, v ? 'Invite link on' : 'Invite link off')} label="Invite link" hint="Anyone with the link can join" />
              <Toggle checked={g.allowGuests} onChange={(v) => void act({ action: 'guests', enabled: v }, v ? 'Guests allowed' : 'Members only')} label="Non-members can join games" hint="Signed-in people outside the group" />
            </div>
          </ChartCard>
          <ChartCard title="Recent games">
            {g.recent.length === 0 && <p className="py-4 text-center text-sm text-gray-500">No games yet.</p>}
            <ul className="space-y-2 text-sm">
              {g.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-gray-200">{r.source}</span>
                  <span className="shrink-0 text-xs text-gray-500">
                    {r.players} ppl · {ago(r.at)}
                  </span>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>
      </div>
      {dialog === 'rename' && (
        <ConfirmDialog
          title="Rename group"
          body="Members see the new name straight away."
          confirmLabel="Save"
          input={{ label: 'Group name', initial: g.name }}
          onConfirm={(name) => act({ action: 'rename', name }, 'Group renamed')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={`Delete “${g.name}”?`}
          body="The group, its members list, invites and game history are removed for everyone. This can’t be undone."
          confirmLabel="Delete group"
          danger
          input={{ label: 'Type the group name to confirm', mustEqual: g.name }}
          onConfirm={() => act({ action: 'delete' }, 'Group deleted')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog && typeof dialog === 'object' && (
        <ConfirmDialog
          title={`Remove ${dialog.name}?`}
          body="They leave the group. If they owned it, ownership passes to another admin; an empty group is deleted."
          confirmLabel="Remove"
          danger
          onConfirm={() => act({ action: 'remove', userId: dialog.remove }, 'Member removed')}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
