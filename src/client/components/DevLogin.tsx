import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { Button, Card, Input } from './ui'

/** Local-only sign-in used for development and automated tests (never available in production). */
export function DevLoginDialog({ onClose }: { onClose: () => void }) {
  const { devSignIn } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await devSignIn(name, email)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="dev-login-title">
      <Card className="w-full max-w-sm bg-gray-900">
        <form onSubmit={submit}>
          <h2 id="dev-login-title" className="mb-1 text-xl font-bold text-white">
            Developer sign-in
          </h2>
          <p className="mb-4 text-sm text-gray-400">Local testing only — stands in for Google sign-in on localhost.</p>
          <Input aria-label="Display name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="mb-3" />
          <Input aria-label="Email" placeholder="you@gmail.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3" />
          {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="dark" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="gradient" className="flex-1" loading={busy} disabled={!name.trim() || !email.includes('@')}>
              Sign in
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
