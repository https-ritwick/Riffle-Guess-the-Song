// Team battle standings (names from the host or the admin), used in the game, the results and on the TV.
import clsx from 'clsx'
import { Crown } from 'lucide-react'
import { TEAMS, type TeamStanding } from '../../shared/modes'
import { useTeamLabels } from '../lib/teams'
import { useRoomContext } from './context'
import { AnimatedNumber } from './Scoreboard'

export function TeamStandings({ teams, big, you }: { teams: TeamStanding[]; big?: boolean; you?: string | null }) {
  const labels = useTeamLabels(useRoomContext().state.settings)
  const top = Math.max(1, ...teams.map((t) => t.score))
  const leader = teams[0] && teams[1] && teams[0].score > teams[1].score ? teams[0].id : null
  return (
    <section aria-label="Team scores" className={clsx('rounded-3xl border border-white/10 bg-white/[0.035]', big ? 'p-6' : 'p-3.5')} data-testid="team-standings">
      <div className="space-y-2.5">
        {teams.map((t) => {
          const team = { ...TEAMS[t.id], ...labels[t.id] }
          return (
            <div key={t.id}>
              <div className={clsx('mb-1 flex items-baseline justify-between gap-2', big ? 'text-3xl' : 'text-sm')}>
                <span className={clsx('flex items-center gap-1.5 font-extrabold', team.text)}>
                  {team.emoji} {team.name}
                  {leader === t.id && <Crown className={clsx('text-amber-300', big ? 'h-7 w-7' : 'h-4 w-4')} />}
                  <span className={clsx('font-normal text-gray-500', big ? 'text-lg' : 'text-xs')}>· {t.members}</span>
                </span>
                <span className="font-black text-white tabular-nums">
                  <AnimatedNumber value={t.score} />
                </span>
              </div>
              <div className={clsx('overflow-hidden rounded-full bg-white/[0.06]', big ? 'h-4' : 'h-2')}>
                <div className={clsx('h-full rounded-full transition-[width] duration-700', team.bar)} style={{ width: `${Math.max(2, (t.score / top) * 100)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
      {!big && you !== undefined && <p className="mt-2 text-[11px] text-gray-500">Average points per player</p>}
    </section>
  )
}

/** Results: which team won. */
export function TeamResult({ teams, myTeam }: { teams: TeamStanding[]; myTeam: string | null }) {
  const labels = useTeamLabels(useRoomContext().state.settings)
  const [a, b] = teams
  if (!a || !b) return null
  const tie = a.score === b.score
  const winner = { ...TEAMS[a.id], ...labels[a.id] }
  return (
    <section className={clsx('relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-6', !tie && winner.bg)} data-testid="team-result">
      <p className="text-xs font-bold tracking-[0.25em] text-gray-300 uppercase">Team battle</p>
      <h3 className="mt-1 text-3xl font-black text-white">
        {tie ? '🤝 It’s a tie!' : `${winner.emoji} ${winner.name} wins!`}
        {!tie && myTeam && <span className="ml-2 text-lg font-bold text-gray-300">{myTeam === a.id ? '— that’s you!' : '— better luck next time'}</span>}
      </h3>
      <div className="mt-4">
        <TeamStandings teams={teams} />
      </div>
    </section>
  )
}
