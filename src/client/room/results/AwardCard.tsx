import clsx from 'clsx'
import { PlayerAvatar } from '../../components/ui'
import type { Award } from './stats'

/** An award styled like a Bollywood film poster. */
export function AwardCard({ award, compact }: { award: Award; compact?: boolean }) {
  const Icon = award.icon
  return (
    <div className={clsx('relative isolate overflow-hidden rounded-2xl bg-linear-to-br text-left shadow-lg ring-1 ring-white/10', award.tone, compact ? 'p-3' : 'p-4')}>
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.25),transparent_55%)]" />
      <Icon className={clsx('absolute -z-10 text-white/15', compact ? '-right-2 -bottom-2 h-14 w-14' : '-right-3 -bottom-3 h-24 w-24')} aria-hidden="true" />
      <p className="text-[10px] font-bold tracking-[0.3em] text-white/70 uppercase">Award</p>
      <p className={clsx('font-black tracking-wide text-white uppercase drop-shadow', compact ? 'text-base leading-tight' : 'text-xl leading-tight')}>{award.title}</p>
      {!compact && <p className="mt-0.5 text-xs text-white/75 italic">{award.line}</p>}
      <div className={clsx('flex items-center gap-2', compact ? 'mt-2' : 'mt-3')}>
        {award.player && <PlayerAvatar avatar={award.player.avatar} photo={award.player.photo} name={award.player.name} size="sm" />}
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{award.who}</span>
          <span className="block truncate text-xs text-white/75">{award.detail}</span>
        </span>
      </div>
    </div>
  )
}
