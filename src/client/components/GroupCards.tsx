import { Check, Play, Radio, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { GroupSummary, MemberPreview, PendingInvite } from '../../shared/account'
import { api } from '../lib/api'
import { player } from '../lib/audio'
import { useToast } from './Toasts'
import { Button, UserPhoto } from './ui'

export function MemberStack({ members, total, size = 'sm' }: { members: MemberPreview[]; total: number; size?: 'xs' | 'sm' }) {
  return (
    <span className="flex items-center">
      <span className="flex -space-x-2">
        {members.slice(0, 5).map((m, i) => (
          <UserPhoto key={i} name={m.name} picture={m.picture} size={size} />
        ))}
      </span>
      {total > 5 && <span className="ml-2 text-xs text-gray-400">+{total - 5}</span>}
    </span>
  )
}

export function LiveBadge({ players }: { players: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-bold text-red-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      LIVE · {players} playing
    </span>
  )
}

/** Start the group's game (or jump into the one already running). */
export function usePlayGroup() {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const play = async (groupId: string) => {
    player.unlock()
    setBusy(groupId)
    try {
      const { code } = await api<{ code: string }>(`/api/groups/${groupId}/play`, { body: {} })
      navigate(`/r/${code}`)
    } catch (err) {
      toast({ title: 'Could not start the game', body: err instanceof Error ? err.message : undefined, tone: 'error' })
      setBusy(null)
    }
  }
  return { play, busy }
}

export function GroupCard({ group }: { group: GroupSummary }) {
  const { play, busy } = usePlayGroup()
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-5 transition-colors hover:border-gray-700">
      <div className="flex items-start justify-between gap-3">
        <Link to={`/groups/${group.id}`} className="min-w-0">
          <p className="truncate text-lg font-bold text-white hover:underline">{group.name}</p>
          <p className="text-sm text-gray-400">
            {group.memberCount} member{group.memberCount === 1 ? '' : 's'}
            {group.role === 'admin' && ' · Admin'}
          </p>
        </Link>
        {group.live && <LiveBadge players={group.live.players} />}
      </div>
      <MemberStack members={group.members} total={group.memberCount} />
      <div className="mt-auto flex gap-2">
        <Button
          variant="gradient"
          size="sm"
          className="flex-1"
          loading={busy === group.id}
          icon={group.live ? <Radio className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
          onClick={() => play(group.id)}
        >
          {group.live ? 'Join live game' : 'Start a game'}
        </Button>
        <Link to={`/groups/${group.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-700 bg-gray-800 px-3 text-sm font-semibold text-white hover:bg-gray-700">
          <Users className="h-4 w-4" /> Manage
        </Link>
      </div>
    </div>
  )
}

export function InviteCard({ invite, onDone }: { invite: PendingInvite; onDone: () => void }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const act = async (action: 'accept' | 'decline') => {
    setBusy(action)
    try {
      await api(`/api/invites/${invite.id}/${action}`, { body: {} })
      if (action === 'accept') {
        toast({ title: `You joined ${invite.groupName}`, tone: 'success' })
        navigate(`/groups/${invite.groupId}`)
      }
      onDone()
    } catch (err) {
      toast({ title: 'Something went wrong', body: err instanceof Error ? err.message : undefined, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-white">
          {invite.invitedBy} invited you to <span className="text-brand-400">{invite.groupName}</span>
        </p>
        <p className="text-sm text-gray-400">Join to play together and keep score across games.</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="dark" icon={<X className="h-4 w-4" />} loading={busy === 'decline'} onClick={() => act('decline')}>
          Decline
        </Button>
        <Button size="sm" variant="gradient" icon={<Check className="h-4 w-4" />} loading={busy === 'accept'} onClick={() => act('accept')}>
          Accept
        </Button>
      </div>
    </div>
  )
}
