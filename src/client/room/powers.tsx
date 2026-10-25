// Power-up icons (drawn icons, not emoji) shared by the lobby and the game.
import clsx from 'clsx'
import { Coins, Eye, HandCoins, Lightbulb, RotateCcw, Scissors, ShieldCheck, type LucideIcon } from 'lucide-react'
import { POWERS, type PowerId } from '../../shared/modes'

export const POWER_ICONS: Record<PowerId, LucideIcon> = {
  fifty: Scissors,
  double: Coins,
  shield: ShieldCheck,
  hint: Lightbulb,
  retry: RotateCcw,
  rob: HandCoins,
  peek: Eye,
}

/** Each power-up has its own colour so it's recognisable at a glance. */
export const POWER_TONES: Record<PowerId, string> = {
  fifty: 'text-sky-300',
  double: 'text-amber-300',
  shield: 'text-emerald-300',
  hint: 'text-yellow-200',
  retry: 'text-fuchsia-300',
  rob: 'text-rose-300',
  peek: 'text-violet-300',
}

export function PowerIcon({ id, className }: { id: PowerId; className?: string }) {
  const Icon = POWER_ICONS[id]
  return <Icon className={clsx('shrink-0', POWER_TONES[id], className)} aria-hidden="true" />
}

/** A small "power in use" chip. */
export function PowerChip({ id }: { id: PowerId }) {
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 align-middle text-xs font-extrabold text-white">
      <PowerIcon id={id} className="h-3.5 w-3.5" /> {POWERS[id].name}
    </span>
  )
}
