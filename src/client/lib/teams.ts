import { useMemo } from 'react'
import { TEAM_IDS, type TeamId, type TeamLabel } from '../../shared/modes'
import type { Settings } from '../../shared/protocol'
import { useSite } from './site'

/** The two teams' names and emoji: the host's names for this room, else the admin's defaults. */
export function useTeamLabels(settings?: Pick<Settings, 'teamNames'> | null): Record<TeamId, TeamLabel> {
  const site = useSite()
  const a = settings?.teamNames?.a
  const b = settings?.teamNames?.b
  return useMemo(() => {
    const names: Partial<Record<TeamId, string>> = { a, b }
    return Object.fromEntries(TEAM_IDS.map((id) => [id, { name: names[id] || site.teams[id].name, emoji: site.teams[id].emoji }])) as Record<TeamId, TeamLabel>
  }, [a, b, site.teams])
}
