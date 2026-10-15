import clsx from 'clsx'
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface ToastInput {
  title: string
  body?: string
  tone?: 'info' | 'success' | 'error'
  action?: { label: string; onClick: () => void }
  durationMs?: number
}

interface Toast extends ToastInput {
  id: number
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (t: ToastInput) => {
      const id = Date.now() + Math.random()
      setToasts((list) => [...list.slice(-3), { ...t, id }])
      window.setTimeout(() => dismiss(id), t.durationMs ?? 5000)
    },
    [dismiss],
  )
  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 left-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              'pointer-events-auto flex w-full animate-pop items-start gap-3 rounded-xl border bg-gray-900/95 p-4 shadow-2xl backdrop-blur',
              t.tone === 'error' ? 'border-red-500/40' : t.tone === 'success' ? 'border-brand-500/40' : 'border-gray-700',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">{t.title}</p>
              {t.body && <p className="mt-0.5 text-sm text-gray-400">{t.body}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.onClick()
                    dismiss(t.id)
                  }}
                  className="mt-2 rounded-lg bg-linear-to-r from-brand-400 to-rose-500 px-3 py-1.5 text-sm font-bold text-black"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-1 text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
