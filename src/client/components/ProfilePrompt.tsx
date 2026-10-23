// Age and gender, asked once right after the first sign-in (and editable later from the account menu).
import clsx from 'clsx'
import { LogOut, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { GENDER_LABELS, GENDERS, MIN_AGE, type Gender } from '../../shared/account'
import { BRAND } from '../../shared/brand'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Button, Input } from './ui'

export function ProfileDialog({ onClose }: { onClose?: () => void }) {
  const { me, refresh, signOut } = useAuth()
  const [age, setAge] = useState(me?.age ? String(me.age) : '')
  const [gender, setGender] = useState<Gender | null>(me?.gender ?? null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const first = !onClose

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(age)
    if (!age || !Number.isInteger(n)) return setError('Enter your age in whole years.')
    if (n < MIN_AGE) return setError(`Sorry — ${BRAND.name} is for players aged ${MIN_AGE} and up.`)
    if (!gender) return setError('Pick one of the options (“Prefer not to say” is fine).')
    setBusy(true)
    setError(null)
    try {
      await api('/api/me/profile', { body: { age: n, gender } })
      await refresh()
      onClose?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="profile-title" data-testid="profile-dialog">
      <form onSubmit={submit} noValidate className="w-full max-w-md animate-pop rounded-3xl border border-white/10 bg-[#1a0f27] p-6 shadow-2xl">
        <Sparkles className="mb-3 h-7 w-7 text-brand-400" />
        <h2 id="profile-title" className="text-2xl font-bold text-white">
          {first ? `Welcome to ${BRAND.name}${me ? `, ${me.name.split(' ')[0]}` : ''}!` : 'Your profile'}
        </h2>
        <p className="mt-1 mb-5 text-sm text-gray-400">
          {first ? 'One quick step: tell us your age and gender.' : 'Update your age or gender.'} We use them to keep {BRAND.name} age-appropriate and to understand who plays — they’re never shown to other
          players.
        </p>

        <label htmlFor="profile-age" className="mb-1.5 block text-sm font-semibold text-gray-200">
          Age
        </label>
        <Input
          id="profile-age"
          type="number"
          inputMode="numeric"
          min={MIN_AGE}
          max={110}
          value={age}
          onChange={(e) => setAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
          placeholder="e.g. 24"
          className="mb-4"
          autoFocus
        />

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-sm font-semibold text-gray-200">Gender</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GENDERS.map((g) => (
              <label
                key={g}
                className={clsx(
                  'flex h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-400',
                  gender === g ? 'border-brand-400 bg-brand-400/15 text-white' : 'border-white/10 bg-white/[0.04] text-gray-300 hover:bg-white/[0.08]',
                  g === 'undisclosed' && 'col-span-2 sm:col-span-1',
                )}
              >
                <input type="radio" name="gender" value={g} checked={gender === g} onChange={() => setGender(g)} className="sr-only" />
                {GENDER_LABELS[g]}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <Button type="submit" variant="gradient" className="w-full" loading={busy}>
          {first ? 'Continue' : 'Save'}
        </Button>
        <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
          <Link to="/privacy#collect" className="hover:text-gray-300 hover:underline" onClick={onClose}>
            How we use this
          </Link>
          {first ? (
            <button type="button" onClick={() => void signOut()} className="inline-flex items-center gap-1 hover:text-gray-300">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          ) : (
            <button type="button" onClick={onClose} className="hover:text-gray-300">
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/** Signed-in players who haven't told us their age and gender yet are asked before anything else (the legal pages stay readable). */
export function ProfileGate() {
  const { me } = useAuth()
  const { pathname } = useLocation()
  if (!me || (me.age !== null && me.gender !== null)) return null
  if (pathname === '/privacy' || pathname === '/terms') return null
  return <ProfileDialog />
}
