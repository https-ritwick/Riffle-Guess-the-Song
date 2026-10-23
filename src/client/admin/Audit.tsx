import { useState } from 'react'
import { Link } from 'react-router'
import type { AuditRow, Page } from '../../shared/admin'
import { when } from './charts'
import { ErrorNote, PageHeader, Pager, Skeleton, useAdminData } from './lib'
import { actionLabel } from './Overview'

function target(a: AuditRow) {
  if (!a.targetId) return '—'
  if (a.targetType === 'user') return <Link to={`/admin/users/${a.targetId}`} className="text-brand-300 hover:underline">user</Link>
  if (a.targetType === 'group') return <Link to={`/admin/groups/${a.targetId}`} className="text-brand-300 hover:underline">group</Link>
  return `${a.targetType ?? ''} ${a.targetId}`
}

export function AuditPage() {
  const [page, setPage] = useState(1)
  const { data, error, reload } = useAdminData<Page<AuditRow>>(`/api/admin/audit?page=${page}`)
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change made from this console, newest first" />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Skeleton className="h-96" />}
      {data && (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07] bg-[#171020]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    Nothing yet.
                  </td>
                </tr>
              )}
              {data.rows.map((a) => (
                <tr key={a.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-400">{when(a.createdAt)}</td>
                  <td className="px-4 py-2.5 text-gray-300">{a.adminEmail}</td>
                  <td className="px-4 py-2.5 text-white">{actionLabel(a.action)}</td>
                  <td className="px-4 py-2.5 text-gray-300">{target(a)}</td>
                  <td className="max-w-md px-4 py-2.5">
                    <code className="line-clamp-2 text-xs break-all text-gray-500">{a.detail ?? ''}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={data.page} total={data.total} pageSize={data.pageSize} onPage={setPage} />}
    </>
  )
}
