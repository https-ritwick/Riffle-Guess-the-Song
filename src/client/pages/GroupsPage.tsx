import { Plus, Users } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { GroupCard, InviteCard } from '../components/GroupCards'
import { Shell } from '../components/Shell'
import { Button, Card, Input, SectionTitle, Spinner } from '../components/ui'
import { SignInButton } from '../components/UserMenu'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useMyGroups } from '../lib/groups'
import { BRAND } from '../../shared/brand'

export function SignInRequired({ title, body, returnTo }: { title: string; body: string; returnTo?: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16">
      <Card className="w-full text-center">
        <Users className="mx-auto mb-3 h-8 w-8 text-brand-400" />
        <h1 className="mb-2 text-2xl font-bold text-white">{title}</h1>
        <p className="mb-6 text-sm text-gray-400">{body}</p>
        <SignInButton returnTo={returnTo} />
      </Card>
    </main>
  )
}

function CreateGroupForm({ onCancel }: { onCancel?: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { id } = await api<{ id: string }>('/api/groups', { body: { name } })
      navigate(`/groups/${id}?created=1`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group')
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <h2 className="mb-1 text-xl font-bold text-white">Create a group</h2>
        <p className="mb-4 text-sm text-gray-400">Name your crew — college gang, family, office team… You’ll be its admin.</p>
        <label htmlFor="group-name" className="sr-only">
          Group name
        </label>
        <Input id="group-name" autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="e.g. Hostel Block C" className="mb-3" />
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="dark" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" variant="gradient" className="flex-1" loading={busy} disabled={!name.trim()}>
            Create group
          </Button>
        </div>
      </form>
    </Card>
  )
}

export function GroupsPage() {
  const { me, loading } = useAuth()
  const [params, setParams] = useSearchParams()
  const creating = params.has('new')
  const { data, loading: groupsLoading, reload } = useMyGroups(!!me)

  useEffect(() => {
    document.title = `Groups · ${BRAND.name}`
  }, [])

  if (loading) {
    return (
      <Shell banner={false}>
        <Spinner />
      </Shell>
    )
  }
  if (!me) {
    return (
      <Shell banner={false}>
        <SignInRequired title="Groups" body="Sign in with Google to create a group, invite friends and keep score across game nights." returnTo="/groups" />
      </Shell>
    )
  }

  const groups = data?.groups ?? []
  return (
    <Shell banner={false}>
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16">
        <SectionTitle
          right={
            !creating && (
              <Button size="sm" variant="gradient" icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
                New group
              </Button>
            )
          }
        >
          <span className="text-2xl font-bold">Your groups</span>
        </SectionTitle>

        {creating && (
          <div className="max-w-md">
            <CreateGroupForm onCancel={groups.length ? () => setParams({}) : undefined} />
          </div>
        )}

        {(data?.invites ?? []).map((i) => (
          <InviteCard key={i.id} invite={i} onDone={reload} />
        ))}

        {groupsLoading && !data ? (
          <Spinner />
        ) : groups.length === 0 && !creating ? (
          <Card className="max-w-md">
            <p className="mb-4 text-gray-300">You’re not in any groups yet.</p>
            <Button variant="gradient" icon={<Plus className="h-4 w-4" />} onClick={() => setParams({ new: '1' })}>
              Create your first group
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </main>
    </Shell>
  )
}
