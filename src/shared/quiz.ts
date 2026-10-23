// Player-made quizzes (REST API under /api/quizzes).
import { z } from 'zod'
import { TrackSchema, type Track } from './protocol'

export const MIN_QUIZ_TRACKS = 5
export const MAX_QUIZ_TRACKS = 50
/** Quizzes one account can keep. */
export const MAX_QUIZZES_PER_USER = 50

export const QUIZ_EMOJIS = ['🎵', '💃', '🎬', '❤️', '💔', '🔥', '🎉', '🌧️', '🚗', '🕺', '🎸', '🥁', '🎤', '👑', '🌙', '🪔'] as const

export const QuizInputSchema = z.object({
  title: z.string().trim().min(3, 'Give your quiz a title (3+ letters)').max(60),
  description: z.string().trim().max(240).default(''),
  emoji: z.string().min(1).max(8).default('🎵'),
  visibility: z.enum(['public', 'unlisted']),
  tracks: z
    .array(TrackSchema)
    .min(MIN_QUIZ_TRACKS, `Add at least ${MIN_QUIZ_TRACKS} songs`)
    .max(MAX_QUIZ_TRACKS, `A quiz can have up to ${MAX_QUIZ_TRACKS} songs`),
})
export type QuizInput = z.infer<typeof QuizInputSchema>

export interface QuizSummary {
  id: string
  title: string
  description: string
  emoji: string
  cover: string | null
  trackCount: number
  plays: number
  visibility: 'public' | 'unlisted'
  owner: { name: string; picture: string | null }
  createdAt: number
  mine: boolean
}

export interface QuizDetail extends QuizSummary {
  tracks: Track[]
}

export interface AdminQuizRow extends QuizSummary {
  ownerId: string
  ownerEmail: string
  removedAt: number | null
  removedReason: string | null
}
