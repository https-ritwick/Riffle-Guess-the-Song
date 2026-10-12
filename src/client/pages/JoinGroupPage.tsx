import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { GroupPreview } from '../../shared/account'
import { MemberStack } from '../components/GroupCards'
import { Shell } from '../components/Shell'
import { Button, Card, Spinner } from '../components/ui'
import { SignInButton } from '../components/UserMenu'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { BRAND } from '../../shared/brand'

/** Landing page for a group invite link: /g/:code */
export function JoinGroupPage() {
  const { code = '' } = useParams()
  const { me, loading } = useAuth()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<GroupPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading) return
    api<GroupPreview>(`/api/groups/by-code/${encodeURIComponent(code)}`)
      .then((p) => {
        setPreview(p)
        document.title = `Join ${p.name} · ${BRAND.name}`
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Invalid invite link'))
  }, [code, loading, me])

  const join = async () => {
    setBusy(true)
    try {
      const { id } = await api<{ id: string }>('/api/groups/join', { body: { code } })
      navigate(`/groups/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
      setBusy(false)
    }
  }

  return (
    <Shell banner={false}>
      <main className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
        <Card className="text-center">
          {error ? (
            <>
              <h1 className="mb-2 text-2xl font-bold text-white">Invite link not valid</h1>
              <p className="text-sm text-gray-400">{error}</p>
            </>
          ) : !preview ? (
            <Spinner />
          ) : (
            <>
              <Users className="mx-auto mb-3 h-8 w-8 text-brand-400" />
              <p className="text-sm text-gray-400">You’re invited to join</p>
              <h1 className="mb-3 text-3xl font-extrabold text-white">{preview.name}</h1>
              <div className="mb-6 flex justify-center">
                <MemberStack members={preview.members} total={preview.memberCount} />
              </div>
              {preview.isMember ? (
                <Button variant="gradient" className="w-full" onClick={() => navigate(`/groups/${preview.id}`)}>
                  You’re already in — open group
                </Button>
              ) : me ? (
                <Button variant="gradient" className="w-full" loading={busy} onClick={join}>
                  Join {preview.name}
                </Button>
              ) : (
                <>
                  <p className="mb-4 text-sm text-gray-400">Sign in with Google so the group remembers you.</p>
                  <SignInButton returnTo={`/g/${code}`} />
                </>
              )}
            </>
          )}
        </Card>
      </main>
    </Shell>
  )
}
