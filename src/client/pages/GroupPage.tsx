import clsx from 'clsx'
import { Check, Copy, Crown, LogOut, Mail, Medal, Play, QrCode, Radio, RefreshCw, Shield, ShieldOff, Trash2, UserMinus, X } from 'lucide-react'
import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { GroupDetail, GroupMember } from '../../shared/account'
import { LiveBadge, MemberStack, usePlayGroup } from '../components/GroupCards'
import { Shell } from '../components/Shell'
import { useToast } from '../components/Toasts'
import { Button, Card, Input, SectionTitle, Spinner, Toggle, UserPhoto } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useGroup } from '../lib/groups'
import { describeGame } from '../lib/source'
import { SignInRequired } from './GroupsPage'
import { BRAND } from '../../shared/brand'

function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(ts).toLocaleDateString()
}

function useAction(reload: () => Promise<void>) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key)
    try {
      await fn()
      if (success) toast({ title: success, tone: 'success' })
      await reload()
    } catch (err) {
      toast({ title: 'Something went wrong', body: err instanceof Error ? err.message : undefined, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }
  return { run, busy }
}

function InvitePanel({ group, reload }: { group: GroupDetail; reload: () => Promise<void> }) {
  const { run, busy } = useAction(reload)
  const [email, setEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const isAdmin = group.role === 'admin'
  const link = group.inviteCode ? `${location.origin}/g/${group.inviteCode}` : null
  const qr = useMemo(() => {
    if (!link) return null
    const q = qrcode(0, 'M')
    q.addData(link)
    q.make()
    return q.createDataURL(5, 2)
  }, [link])

  const invite = (e: FormEvent) => {
    e.preventDefault()
    void run('invite', () => api(`/api/groups/${group.id}/invites`, { body: { email } }), `Invitation saved for ${email}`).then(() => setEmail(''))
  }

  return (
    <Card>
      <SectionTitle>Invite friends</SectionTitle>
      {link && (group.inviteEnabled || isAdmin) ? (
        <>
          <p className="mb-2 text-sm text-gray-400">Anyone with this link can join after signing in with Google.</p>
          <div className={clsx('mb-3 truncate rounded-xl border border-gray-700 bg-gray-800/80 px-3 py-2.5 text-sm', group.inviteEnabled ? 'text-gray-300' : 'text-gray-500 line-through')} title={link}>
            {link}
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="dark"
              disabled={!group.inviteEnabled}
              icon={copied ? <Check className="h-4 w-4 text-brand-400" /> : <Copy className="h-4 w-4" />}
              onClick={async () => {
                await navigator.clipboard.writeText(link).catch(() => window.prompt('Copy this link', link))
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1800)
              }}
            >
              {copied ? 'Copied!' : 'Copy invite link'}
            </Button>
            {typeof navigator.share === 'function' && (
              <Button size="sm" variant="dark" disabled={!group.inviteEnabled} onClick={() => navigator.share({ title: `Join ${group.name} on ${BRAND.name}`, url: link }).catch(() => undefined)}>
                Share
              </Button>
            )}
            <Button size="sm" variant="dark" icon={<QrCode className="h-4 w-4" />} aria-label="Show QR code" onClick={() => setShowQr((v) => !v)} />
            {isAdmin && (
              <Button
                size="sm"
                variant="dark"
                icon={<RefreshCw className="h-4 w-4" />}
                loading={busy === 'reset'}
                onClick={() => confirm('Make a new link? The old one will stop working.') && run('reset', () => api(`/api/groups/${group.id}/invite-code`, { body: {} }), 'New invite link created')}
              >
                New link
              </Button>
            )}
          </div>
          {showQr && qr && (
            <div className="mb-4 flex justify-center rounded-xl bg-white p-3">
              <img src={qr} alt="QR code for the invite link" className="h-44 w-44 [image-rendering:pixelated]" />
            </div>
          )}
          {isAdmin && (
            <div className="mb-5">
              <Toggle
                label="Invite link enabled"
                hint="Turn off to stop new people joining with the link."
                checked={group.inviteEnabled}
                onChange={(v) => run('link', () => api(`/api/groups/${group.id}`, { method: 'PATCH', body: { inviteEnabled: v } }))}
              />
            </div>
          )}
        </>
      ) : (
        <p className="mb-4 text-sm text-gray-400">The admin has turned off the invite link.</p>
      )}

      {isAdmin && (
        <>
          <form onSubmit={invite} className="mb-3">
            <label htmlFor="invite-email" className="mb-2 block text-sm font-medium text-gray-300">
              Invite by Gmail address
            </label>
            <div className="flex gap-2">
              <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@gmail.com" />
              <Button type="submit" variant="gradient" className="shrink-0 px-4" icon={<Mail className="h-4 w-4" />} loading={busy === 'invite'} disabled={!email.includes('@')}>
                Invite
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-500">They’ll see the invitation the next time they sign in with that Google account.</p>
          </form>
          {group.invites.length > 0 && (
            <ul className="space-y-2">
              {group.invites.map((i) => (
                <li key={i.id} className="flex items-center gap-2 rounded-lg bg-gray-800/40 px-3 py-2 text-sm">
                  <Mail className="h-4 w-4 text-gray-500" />
                  <span className="min-w-0 flex-1 truncate text-gray-300">{i.email}</span>
                  <span className="text-xs text-gray-500">pending</span>
                  <button
                    type="button"
                    aria-label={`Cancel invitation for ${i.email}`}
                    onClick={() => run(`rm-${i.id}`, () => api(`/api/groups/${group.id}/invites/${i.id}`, { method: 'DELETE' }))}
                    className="rounded p-1 text-gray-500 hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

function MembersPanel({ group, reload, myId }: { group: GroupDetail; reload: () => Promise<void>; myId: string }) {
  const { run, busy } = useAction(reload)
  const navigate = useNavigate()
  const isAdmin = group.role === 'admin'

  const row = (m: GroupMember) => (
    <li key={m.userId} className="flex items-center gap-3 rounded-xl bg-gray-800/40 px-3 py-2">
      <UserPhoto name={m.name} picture={m.picture} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">
          {m.name}
          {m.userId === myId && <span className="ml-1.5 text-sm font-normal text-gray-400">(you)</span>}
        </p>
        {m.email && <p className="truncate text-xs text-gray-500">{m.email}</p>}
      </div>
      {m.isOwner && <Crown className="h-4 w-4 text-amber-300" aria-label="Creator" />}
      {m.role === 'admin' && <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-xs font-semibold text-brand-300">Admin</span>}
      {isAdmin && m.userId !== myId && (
        <div className="flex">
          <button
            type="button"
            aria-label={m.role === 'admin' ? `Remove admin from ${m.name}` : `Make ${m.name} an admin`}
            title={m.role === 'admin' ? 'Remove admin' : 'Make admin'}
            disabled={busy !== null}
            onClick={() => run(`role-${m.userId}`, () => api(`/api/groups/${group.id}/members/${m.userId}`, { method: 'PATCH', body: { role: m.role === 'admin' ? 'member' : 'admin' } }))}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            {m.role === 'admin' ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label={`Remove ${m.name} from the group`}
            disabled={busy !== null}
            onClick={() =>
              confirm(`Remove ${m.name} from ${group.name}?`) && run(`rm-${m.userId}`, () => api(`/api/groups/${group.id}/members/${m.userId}`, { method: 'DELETE' }), `${m.name} removed`)
            }
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-700 hover:text-red-400"
          >
            <UserMinus className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  )

  return (
    <Card>
      <SectionTitle right={<span className="text-sm text-gray-400">{group.members.length}</span>}>Members</SectionTitle>
      <ul className="space-y-2" data-testid="group-members">
        {group.members.map(row)}
      </ul>
      <button
        type="button"
        onClick={async () => {
          if (!confirm(`Leave ${group.name}?`)) return
          await run('leave', () => api(`/api/groups/${group.id}/members/${myId}`, { method: 'DELETE' }))
          navigate('/groups')
        }}
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-400"
      >
        <LogOut className="h-4 w-4" /> Leave group
      </button>
    </Card>
  )
}

function Leaderboard({ group }: { group: GroupDetail }) {
  return (
    <Card>
      <SectionTitle>All-time leaderboard</SectionTitle>
      {group.leaderboard.length === 0 ? (
        <p className="text-sm text-gray-400">Play your first game to start the leaderboard.</p>
      ) : (
        <ol className="space-y-2" data-testid="group-leaderboard">
          {group.leaderboard.map((r, i) => (
            <li key={r.userId} className="flex items-center gap-3 rounded-xl bg-gray-800/40 px-3 py-2">
              <span className={clsx('w-6 text-center font-bold', i === 0 ? 'text-amber-300' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500')}>
                {i < 3 ? <Medal className="mx-auto h-5 w-5" /> : i + 1}
              </span>
              <UserPhoto name={r.name} picture={r.picture} size="sm" />
              <span className="min-w-0 flex-1 truncate font-semibold text-white">{r.name}</span>
              <span className="text-xs text-gray-400">
                {r.wins} win{r.wins === 1 ? '' : 's'} · {r.games} game{r.games === 1 ? '' : 's'}
              </span>
              <span className="w-20 text-right font-bold text-brand-400 tabular-nums">{r.points.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function RecentGames({ group }: { group: GroupDetail }) {
  if (group.recent.length === 0) return null
  return (
    <Card>
      <SectionTitle>Recent games</SectionTitle>
      <ul className="space-y-3">
        {group.recent.map((g) => {
          const winner = g.players[0]
          return (
            <li key={g.id} className="rounded-xl bg-gray-800/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate font-semibold text-white">{g.sourceTitle}</p>
                <span className="shrink-0 text-xs text-gray-500">{timeAgo(g.playedAt)}</span>
              </div>
              <p className="text-sm text-gray-400">
                {winner && (
                  <>
                    🏆 <span className="text-white">{winner.name}</span> won with {winner.score.toLocaleString()} ·{' '}
                  </>
                )}
                {g.rounds} songs · {g.players.length} players
              </p>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function AdminSettings({ group, reload }: { group: GroupDetail; reload: () => Promise<void> }) {
  const { run, busy } = useAction(reload)
  const navigate = useNavigate()
  const [name, setName] = useState(group.name)
  useEffect(() => setName(group.name), [group.name])

  return (
    <Card>
      <SectionTitle>Group settings</SectionTitle>
      <form
        className="mb-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void run('rename', () => api(`/api/groups/${group.id}`, { method: 'PATCH', body: { name } }), 'Group renamed')
        }}
      >
        <Input aria-label="Group name" value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} />
        <Button type="submit" variant="dark" className="shrink-0" loading={busy === 'rename'} disabled={!name.trim() || name.trim() === group.name}>
          Rename
        </Button>
      </form>
      <Toggle
        label="Let non-members join group games"
        hint="Everyone has to sign in to join a group game. When this is off, only members of this group can join."
        checked={group.allowGuests}
        onChange={(v) => run('guests', () => api(`/api/groups/${group.id}`, { method: 'PATCH', body: { allowGuests: v } }))}
      />
      <button
        type="button"
        onClick={async () => {
          if (!confirm(`Delete ${group.name} for everyone? Its history will be lost.`)) return
          await run('delete', () => api(`/api/groups/${group.id}`, { method: 'DELETE' }))
          navigate('/groups')
        }}
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300"
      >
        <Trash2 className="h-4 w-4" /> Delete group
      </button>
    </Card>
  )
}

export function GroupPage() {
  const { id = '' } = useParams()
  const { me, loading } = useAuth()
  const [params] = useSearchParams()
  const { data: group, error, reload } = useGroup(id, !!me)
  const { play, busy } = usePlayGroup()

  useEffect(() => {
    if (group) document.title = `${group.name} · ${BRAND.name}`
  }, [group])

  if (loading) {
    return (
      <Shell banner={false}>
        <Spinner />
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell banner={false}>
        <SignInRequired title="Sign in to see this group" body="Groups are private to their members." returnTo={`/groups/${id}`} />
      </Shell>
    )
  }
  if (!group) {
    return (
      <Shell banner={false}>
        {error ? (
          <main className="mx-auto max-w-md px-4 py-16">
            <Card>
              <h1 className="mb-2 text-2xl font-bold text-white">Group not found</h1>
              <p className="mb-4 text-sm text-gray-400">It may have been deleted, or you’re no longer a member.</p>
              <Link to="/groups" className="font-semibold text-brand-400">
                ← Your groups
              </Link>
            </Card>
          </main>
        ) : (
          <Spinner />
        )}
      </Shell>
    )
  }

  const settingsDesc = group.settings ? describeGame(group.settings) : null

  return (
    <Shell banner={false}>
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16">
        <Link to="/groups" className="text-sm text-gray-400 hover:text-white">
          ← Groups
        </Link>

        <section className="relative overflow-hidden rounded-2xl border border-gray-800 bg-linear-to-br from-gray-900 via-gray-900 to-fuchsia-950/40 p-6 sm:p-8">
          {params.has('created') && (
            <p className="mb-4 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-brand-100">
              🎉 Group created! Invite friends with the link below, then start a game whenever you’re together.
            </p>
          )}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-wide text-gray-400 uppercase">{group.role === 'admin' ? 'You’re an admin' : 'Group'}</p>
              <h1 className="truncate text-3xl font-extrabold text-white sm:text-4xl" data-testid="group-name">
                {group.name}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <MemberStack members={group.members} total={group.members.length} />
                {group.live && <LiveBadge players={group.live.players} />}
              </div>
              {settingsDesc && <p className="mt-3 text-sm text-gray-400">Last played: {settingsDesc.title}</p>}
            </div>
            <Button
              variant="gradient"
              className="px-6 text-lg sm:w-auto"
              loading={busy === group.id}
              icon={group.live ? <Radio className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
              onClick={() => play(group.id)}
              data-testid="group-play"
            >
              {group.live ? 'Join live game' : 'Start a game'}
            </Button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Leaderboard group={group} />
            <RecentGames group={group} />
          </div>
          <div className="space-y-6">
            <MembersPanel group={group} reload={reload} myId={me.id} />
            <InvitePanel group={group} reload={reload} />
            {group.role === 'admin' && <AdminSettings group={group} reload={reload} />}
          </div>
        </div>
      </main>
    </Shell>
  )
}
