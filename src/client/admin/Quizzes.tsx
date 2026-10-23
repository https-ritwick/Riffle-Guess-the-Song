import clsx from 'clsx'
import { EyeOff, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Page } from '../../shared/admin'
import type { AdminQuizRow } from '../../shared/quiz'
import { useToast } from '../components/Toasts'
import { Cover } from '../components/ui'
import { api } from '../lib/api'
import { ago, compact } from './charts'
import { ConfirmDialog, ErrorNote, PageHeader, Pager, Pill, Skeleton, useAdminData } from './lib'

export function QuizzesAdminPage() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'live' | 'removed'>('live')
  const [page, setPage] = useState(1)
  const { data, error, reload } = useAdminData<Page<AdminQuizRow>>(`/api/admin/quizzes?q=${encodeURIComponent(q)}&filter=${filter}&page=${page}`)
  const [dialog, setDialog] = useState<{ quiz: AdminQuizRow; action: 'remove' | 'restore' | 'delete' } | null>(null)

  const act = async (quiz: AdminQuizRow, body: Record<string, unknown>, done: string) => {
    await api(`/api/admin/quizzes/${quiz.id}`, { body })
    toast({ title: done, tone: 'success', durationMs: 3000 })
    reload()
  }

  return (
    <>
      <PageHeader title="Quizzes" subtitle={data ? `${compact(data.total)} ${filter === 'live' ? 'live' : 'taken down'} player-made quizzes` : 'Player-made quizzes'} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:w-80">
          <span className="sr-only">Search quizzes</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(1)
            }}
            placeholder="Search title or maker’s email…"
            className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] pr-3 pl-9 text-sm text-white outline-none placeholder:text-gray-500 focus:border-brand-400"
          />
        </label>
        <div className="flex gap-1">
          {(['live', 'removed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f)
                setPage(1)
              }}
              aria-pressed={filter === f}
              className={clsx('rounded-full px-3 py-1 text-xs font-semibold', filter === f ? 'bg-white text-gray-900' : 'bg-white/[0.05] text-gray-300 hover:bg-white/[0.1]')}
            >
              {f === 'live' ? 'Live' : 'Taken down'}
            </button>
          ))}
        </div>
      </div>
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Skeleton className="h-96" />}
      {data && (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#171020]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 font-medium">Quiz</th>
                <th className="px-4 py-3 font-medium">Maker</th>
                <th className="px-4 py-3 text-right font-medium">Songs</th>
                <th className="px-4 py-3 text-right font-medium">Plays</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    No quizzes here.
                  </td>
                </tr>
              )}
              {data.rows.map((quiz) => (
                <tr key={quiz.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5">
                    <a href={`/q/${quiz.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:underline">
                      <Cover images={quiz.cover ? [quiz.cover] : []} size="sm" label={quiz.title} />
                      <span className="min-w-0">
                        <span className="block max-w-64 truncate font-semibold text-white">
                          {quiz.emoji} {quiz.title}
                        </span>
                        <span className="flex gap-1">
                          {quiz.visibility === 'unlisted' && <Pill>Link only</Pill>}
                          {quiz.removedAt && <Pill tone="red">Taken down{quiz.removedReason ? `: ${quiz.removedReason}` : ''}</Pill>}
                        </span>
                      </span>
                    </a>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block text-gray-200">{quiz.owner.name}</span>
                    <span className="block text-xs text-gray-500">{quiz.ownerEmail}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-300 tabular-nums">{quiz.trackCount}</td>
                  <td className="px-4 py-2.5 text-right text-white tabular-nums">{quiz.plays}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{ago(quiz.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {quiz.removedAt ? (
                      <button type="button" onClick={() => setDialog({ quiz, action: 'restore' })} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10 hover:text-white" aria-label={`Restore ${quiz.title}`}>
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => setDialog({ quiz, action: 'remove' })} className="rounded-lg p-1.5 text-gray-400 hover:bg-amber-500/10 hover:text-amber-300" aria-label={`Take down ${quiz.title}`}>
                        <EyeOff className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => setDialog({ quiz, action: 'delete' })} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-500/10 hover:text-red-300" aria-label={`Delete ${quiz.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
      {dialog?.action === 'remove' && (
        <ConfirmDialog
          title={`Take down “${dialog.quiz.title}”?`}
          body="It disappears from the Quizzes page and its link stops working. You can restore it later."
          confirmLabel="Take down"
          danger
          input={{ label: 'Reason (only admins see this)', placeholder: 'e.g. offensive title' }}
          onConfirm={(reason) => act(dialog.quiz, { action: 'remove', reason }, 'Quiz taken down')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.action === 'restore' && (
        <ConfirmDialog title={`Restore “${dialog.quiz.title}”?`} body="It goes live again." confirmLabel="Restore" onConfirm={() => act(dialog.quiz, { action: 'restore' }, 'Quiz restored')} onClose={() => setDialog(null)} />
      )}
      {dialog?.action === 'delete' && (
        <ConfirmDialog
          title={`Delete “${dialog.quiz.title}” for good?`}
          body="This can’t be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => act(dialog.quiz, { action: 'delete' }, 'Quiz deleted')}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  )
}
