import type { PublicPlayer } from '../../shared/protocol'
import type { Reaction } from '../lib/useRoom'

/** Floating emoji reactions sent by players during the reveal. */
export function Reactions({ reactions, players }: { reactions: Reaction[]; players: PublicPlayer[] }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-0">
      {reactions.map((r) => {
        const name = players.find((p) => p.id === r.from)?.name
        const left = 10 + ((r.id * 37) % 80)
        return (
          <div key={r.id} className="absolute bottom-6 flex animate-float-up flex-col items-center" style={{ left: `${left}%` }}>
            <span className="text-4xl">{r.emoji}</span>
            {name && <span className="mt-1 rounded-full bg-black/70 px-2 text-xs text-white">{name}</span>}
          </div>
        )
      })}
    </div>
  )
}
