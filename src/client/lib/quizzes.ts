import { useEffect, useState } from 'react'
import type { Source } from '../../shared/protocol'
import type { QuizDetail, QuizSummary } from '../../shared/quiz'
import { api } from './api'

export function quizAsSource(q: Pick<QuizSummary, 'id' | 'title' | 'trackCount' | 'cover'>): Extract<Source, { kind: 'quiz' }> {
  return { kind: 'quiz', id: q.id, name: q.title, count: q.trackCount, ...(q.cover ? { image: q.cover } : {}) }
}

export async function loadQuiz(id: string): Promise<QuizDetail> {
  return api<QuizDetail>(`/api/quizzes/${id}`)
}

/** Public quizzes (popular or newest), optionally filtered by a search. */
export function useQuizList(sort: 'popular' | 'new', q = '', enabled = true) {
  const [data, setData] = useState<{ quizzes: QuizSummary[]; more: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      api<{ quizzes: QuizSummary[]; more: boolean }>(`/api/quizzes?sort=${sort}&q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then(setData)
        .catch((err) => !(err instanceof DOMException) && setError(err instanceof Error ? err.message : 'Could not load quizzes'))
    }, q ? 300 : 0)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [sort, q, enabled])
  return { data, error }
}

export function useMyQuizzes(enabled: boolean) {
  const [data, setData] = useState<QuizSummary[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let live = true
    api<{ quizzes: QuizSummary[] }>('/api/quizzes/mine')
      .then((d) => live && setData(d.quizzes))
      .catch(() => live && setData([]))
    return () => {
      live = false
    }
  }, [enabled, tick])
  return { data, reload: () => setTick((n) => n + 1) }
}
