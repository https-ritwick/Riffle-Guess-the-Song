import clsx from 'clsx'
import { Download, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { RANGES } from '../../shared/admin'
import { api, ApiError } from '../lib/api'

export function useAdminData<T>(path: string | null): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!path) return
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    api<T>(path, { signal: ctrl.signal })
      .then((d) => setData(d))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof ApiError ? err.message : 'Could not load this.')
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false)
      })
    return () => ctrl.abort()
  }, [path, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}

/** The analytics period, kept in the URL (?days=30) so links and reloads keep it. */
export function useRange(): [number, (d: number) => void] {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('days'))
  const days = (RANGES as readonly number[]).includes(raw) ? raw : 30
  const set = (d: number) => {
    const next = new URLSearchParams(params)
    next.set('days', String(d))
    setParams(next, { replace: true })
  }
  return [days, set]
}

export function RangePicker() {
  const [days, setDays] = useRange()
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-0.5" role="group" aria-label="Time range">
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => setDays(d)}
          aria-pressed={days === d}
          className={clsx('rounded-lg px-3 py-1.5 text-xs font-semibold transition', days === d ? 'bg-white text-gray-900' : 'text-gray-300 hover:text-white')}
        >
          {d === 365 ? '1y' : `${d}d`}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function IconButton({ onClick, label, children, loading }: { onClick: () => void; label: string; children: ReactNode; loading?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-gray-200 hover:bg-white/[0.08]"
    >
      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  )
}

export function ExportLink({ what, days }: { what: string; days?: number }) {
  return (
    <a
      href={`/api/admin/export/${what}.csv${days ? `?days=${days}` : ''}`}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-semibold text-gray-200 hover:bg-white/[0.08]"
      download
    >
      <Download className="h-3.5 w-3.5" /> {what} CSV
    </a>
  )
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
      {error}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-3 font-semibold underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-2xl bg-white/[0.04]', className)} />
}

export function Pill({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'brand'; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        tone === 'gray' && 'bg-white/[0.06] text-gray-300',
        tone === 'green' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'red' && 'bg-red-500/15 text-red-300',
        tone === 'amber' && 'bg-amber-500/15 text-amber-300',
        tone === 'blue' && 'bg-sky-500/15 text-sky-300',
        tone === 'brand' && 'bg-brand-400/15 text-brand-200',
      )}
    >
      {children}
    </span>
  )
}

export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
      </span>
      <span className="flex gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-lg border border-white/10 px-3 py-1.5 font-semibold text-gray-200 disabled:opacity-40">
          Previous
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-lg border border-white/10 px-3 py-1.5 font-semibold text-gray-200 disabled:opacity-40">
          Next
        </button>
      </span>
    </div>
  )
}

/** A small "are you sure?" dialog for destructive actions, optionally asking for a reason or a typed confirmation. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  input,
  onConfirm,
  onClose,
}: {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  input?: { label: string; placeholder?: string; mustEqual?: string; multiline?: boolean; initial?: string }
  onConfirm: (value: string) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(input?.initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked = !!input?.mustEqual && value.trim().toLowerCase() !== input.mustEqual.toLowerCase()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <form
        className="w-full max-w-md animate-pop rounded-2xl border border-white/10 bg-[#1d1428] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault()
          if (blocked) return
          setBusy(true)
          setError(null)
          try {
            await onConfirm(value)
            onClose()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'That didn’t work.')
            setBusy(false)
          }
        }}
      >
        <h2 className="mb-2 text-lg font-bold text-white">{title}</h2>
        <div className="mb-4 text-sm text-gray-300">{body}</div>
        {input && (
          <label className="mb-4 block text-xs font-semibold text-gray-400">
            {input.label}
            {input.multiline ? (
              <textarea
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
                placeholder={input.placeholder}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm text-white outline-none focus:border-brand-400"
              />
            ) : (
              <input
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={input.placeholder}
                className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none focus:border-brand-400"
              />
            )}
          </label>
        )}
        {error && (
          <p className="mb-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-xl px-4 text-sm font-semibold text-gray-300 hover:bg-white/5">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || blocked}
            className={clsx('h-10 rounded-xl px-4 text-sm font-bold disabled:opacity-50', danger ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-white text-gray-900 hover:bg-brand-50')}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
