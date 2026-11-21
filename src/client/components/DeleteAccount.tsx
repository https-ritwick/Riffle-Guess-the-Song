// "Delete account": a clear, typed confirmation before a signed-in player's account is erased.
import { AlertTriangle } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { DELETE_CONFIRM_WORD, isDeleteConfirmation } from '../../shared/account'
import { BRAND } from '../../shared/brand'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from './Toasts'
import { Button, Input } from './ui'

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { me, refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = isDeleteConfirmation(confirm)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!ready) return setError(`Type ${DELETE_CONFIRM_WORD} to confirm.`)
    setBusy(true)
    setError(null)
    try {
      await api('/api/me/delete', { body: { confirm } })
      await refresh()
      toast({ title: 'Account deleted', body: `Your ${BRAND.name} account and its data have been erased. You’ve been signed out.`, tone: 'success', durationMs: 6000 })
      onClose()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-title" data-testid="delete-account-dialog">
      <form onSubmit={submit} noValidate className="max-h-[calc(100dvh-2rem)] w-full max-w-md animate-pop overflow-y-auto rounded-3xl border border-white/10 bg-panel p-6 shadow-2xl">
        <AlertTriangle className="mb-3 h-7 w-7 text-red-400" />
        <h2 id="delete-title" className="text-2xl font-bold text-white">
          Delete your account?
        </h2>
        {me && <p className="mt-1 truncate text-sm text-gray-400">{me.email}</p>}
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-gray-300 marker:text-red-400">
          <li>Your profile (name, email, photo, age and gender) and sign-ins on every device are erased.</li>
          <li>Quizzes you made are deleted. You leave your groups — another member takes over any you run, and groups with no one left are deleted.</li>
          <li>Past game results and leaderboard scores stay, but show “Deleted player” instead of your name.</li>
        </ul>
        <p className="mt-3 text-sm font-semibold text-red-300">This can’t be undone.</p>

        <label htmlFor="delete-confirm" className="mt-5 mb-1.5 block text-sm font-semibold text-gray-200">
          Type <span className="font-mono text-white">{DELETE_CONFIRM_WORD}</span> to confirm
        </label>
        <Input
          id="delete-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.slice(0, 40))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={DELETE_CONFIRM_WORD}
          autoFocus
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button type="button" variant="dark" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={busy} disabled={!ready}>
            Delete account
          </Button>
        </div>
        <p className="mt-4 text-center text-xs text-gray-500">
          <Link to="/delete-account" className="hover:text-gray-300 hover:underline" onClick={onClose}>
            What gets deleted and what’s kept
          </Link>
        </p>
      </form>
    </div>
  )
}
