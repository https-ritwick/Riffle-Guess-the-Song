import clsx from 'clsx'
import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PublicPlayer } from '../../shared/protocol'
import { QUICK_REACTIONS, REACTIONS } from '../../shared/rules'
import type { Reaction } from '../lib/useRoom'
import { useRoomContext } from './context'

/** Floating emoji reactions sent by players: they wobble up the screen with the sender's name. */
export function Reactions({ reactions, players }: { reactions: Reaction[]; players: PublicPlayer[] }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-0">
      {reactions.map((r) => {
        const name = players.find((p) => p.id === r.from)?.name
        const left = 6 + ((r.id * 37) % 86)
        const size = 2.4 + ((r.id * 13) % 5) * 0.35
        const sway = ((r.id * 7) % 2 ? 1 : -1) * (10 + ((r.id * 11) % 22))
        return (
          <div
            key={r.id}
            className="absolute bottom-8 flex animate-reaction flex-col items-center"
            style={{ left: `${left}%`, '--sway': `${sway}px` } as React.CSSProperties}
          >
            <span className="drop-shadow-[0_6px_14px_rgba(0,0,0,0.55)]" style={{ fontSize: `${size}rem`, lineHeight: 1 }}>
              {r.emoji}
            </span>
            {name && <span className="mt-1 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white ring-1 ring-white/10">{name}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** Send a reaction: the favourites in a row, everything else one tap away. */
export function ReactionBar({ compact, className }: { compact?: boolean; className?: string }) {
  const { send, state } = useRoomContext()
  const [open, setOpen] = useState(false)
  const [burst, setBurst] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  if (state.solo) return null

  const react = (emoji: (typeof REACTIONS)[number]) => {
    send({ t: 'react', emoji })
    setBurst(emoji)
    window.setTimeout(() => setBurst((b) => (b === emoji ? null : b)), 300)
  }
  const quick = compact ? QUICK_REACTIONS.slice(0, 6) : QUICK_REACTIONS

  return (
    <div ref={box} className={clsx('relative flex flex-wrap items-center justify-center gap-1.5', className)} aria-label="Send a reaction" data-testid="reactions">
      {quick.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => react(emoji)}
          aria-label={`React ${emoji}`}
          className={clsx(
            'rounded-full bg-white/[0.06] text-xl ring-1 ring-white/5 transition-transform hover:scale-115 hover:bg-white/[0.12] active:scale-90',
            compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-11 sm:w-11',
            burst === emoji && 'scale-125 bg-brand-400/25',
          )}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close reactions' : 'More reactions'}
        className={clsx(
          'flex items-center justify-center rounded-full text-gray-200 ring-1 transition',
          compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-11 sm:w-11',
          open ? 'bg-brand-400 text-black ring-brand-300' : 'bg-white/[0.06] ring-white/10 hover:bg-white/[0.12]',
        )}
      >
        {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 animate-pop rounded-2xl border border-white/10 bg-[#1a0f27]/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="grid grid-cols-8 gap-1">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                aria-label={`React ${emoji}`}
                className="flex aspect-square items-center justify-center rounded-lg text-xl transition hover:scale-125 hover:bg-white/10 active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
