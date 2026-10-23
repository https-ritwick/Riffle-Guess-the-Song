// Types and request schemas for accounts and groups (REST API under /api).
import { z } from 'zod'
import type { Phase, Settings } from './protocol'

export interface Me {
  id: string
  name: string
  email: string
  picture: string | null
  /** Allowed into the admin console. */
  admin?: boolean
}

export interface AuthConfig {
  google: boolean
  dev: boolean
}

export interface LiveGame {
  code: string
  phase: Phase
  players: number
}

export interface MemberPreview {
  name: string
  picture: string | null
}

export interface GroupSummary {
  id: string
  name: string
  role: 'admin' | 'member'
  memberCount: number
  members: MemberPreview[]
  live: LiveGame | null
}

export interface PendingInvite {
  id: string
  groupId: string
  groupName: string
  invitedBy: string
  createdAt: number
}

export interface GroupMember {
  userId: string
  name: string
  email: string
  picture: string | null
  role: 'admin' | 'member'
  joinedAt: number
  isOwner: boolean
}

export interface LeaderboardRow {
  userId: string
  name: string
  picture: string | null
  games: number
  wins: number
  points: number
  correct: number
}

export interface GameRecord {
  id: string
  playedAt: number
  sourceTitle: string
  rounds: number
  players: { name: string; userId: string | null; score: number; correct: number; rank: number }[]
}

export interface GroupDetail {
  id: string
  name: string
  role: 'admin' | 'member'
  ownerId: string
  inviteCode: string | null
  inviteEnabled: boolean
  allowGuests: boolean
  members: GroupMember[]
  invites: { id: string; email: string; createdAt: number }[]
  live: LiveGame | null
  leaderboard: LeaderboardRow[]
  recent: GameRecord[]
  settings: Settings | null
}

export interface GroupPreview {
  id: string
  name: string
  memberCount: number
  members: MemberPreview[]
  isMember: boolean
}

export const GroupNameSchema = z.string().trim().min(1, 'Give your group a name').max(40)

export const CreateGroupSchema = z.object({ name: GroupNameSchema })

export const UpdateGroupSchema = z
  .object({
    name: GroupNameSchema.optional(),
    allowGuests: z.boolean().optional(),
    inviteEnabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const InviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(254),
})

export const RoleSchema = z.object({ role: z.enum(['admin', 'member']) })

export const JoinGroupSchema = z.object({ code: z.string().regex(/^[A-Za-z0-9]{6,16}$/) })

export const DevLoginSchema = z.object({
  name: z.string().trim().min(1).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
})
