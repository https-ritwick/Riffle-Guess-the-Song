import clsx from 'clsx'
import { Crown, Pause } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { PublicPlayer } from '../../../shared/protocol'
import { PlayerAvatar } from '../../components/ui'
import { player as audio } from '../../lib/audio'
import { AwardCard } from './AwardCard'
import type { Award, RoundStat } from './stats'

// A short story of the game, Spotify-Wrapped style: tap right/left to move,
// hold anywhere to pause, Esc or Skip to close.

export interface Slide {
  key: string
  art?: string
  /** A song to play from its hook while this slide shows. */
  audio?: string
  /** A song to keep playing (without restarting) while this slide shows. */
  carryOn?: string
  /** Backdrop gradient when there's no album art. */
  tone?: string
  ms?: number
  body: ReactNode
}

const SLIDE_MS = 4200
const TAP_MS = 250

export function Recap({ slides, onClose }: { slides: Slide[]; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const downAt = useRef(0)
  const slide = slides[i]!
  const duration = slide.ms ?? SLIDE_MS

  const next = useCallback(() => {
    if (i + 1 < slides.length) setI(i + 1)
    else onClose()
  }, [i, slides.length, onClose])
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), [])

  // Progress for the current slide; holding the screen freezes it.
  useEffect(() => {
    setProgress(0)
    let raf = 0
    let last = performance.now()
    let elapsed = 0
    const tick = (t: number) => {
      const dt = t - last
      last = t
      if (!pausedRef.current) elapsed += dt
      setProgress(Math.min(1, elapsed / duration))
      if (elapsed >= duration) next()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [i, duration, next])

  // Song slides play that song's hook; the others let the music carry on.
  useEffect(() => {
    if (slide.audio) audio.play(slide.audio, 0)
    else if (slide.carryOn) audio.ensurePlaying(slide.carryOn, 0)
  }, [slide.audio, slide.carryOn])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === ' ') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose])

  const hold = (on: boolean) => {
    pausedRef.current = on
    setPaused(on)
  }
  const onDown = () => {
    downAt.current = performance.now()
    hold(true)
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    hold(false)
    if (performance.now() - downAt.current > TAP_MS) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX - rect.left < rect.width / 3) prev()
    else next()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#0d0716] select-none" role="dialog" aria-label="Game recap" data-testid="recap">
      {slide.art ? (
        <img key={slide.key + 'bg'} src={slide.art} alt="" aria-hidden="true" className="rise-in absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl" />
      ) : (
        <div key={slide.key + 'bg'} className={clsx('rise-in absolute inset-0 bg-linear-to-br', slide.tone ?? 'from-fuchsia-800/60 via-[#0d0716] to-amber-900/40')} />
      )}
      <div className="absolute inset-0 bg-linear-to-b from-black/40 via-transparent to-black/80" />
      <div className="vinyl absolute -right-40 -bottom-40 h-96 w-96 animate-[spin_8s_linear_infinite] rounded-full opacity-30" aria-hidden="true" />

      <div className="absolute inset-x-0 top-0 z-20 flex gap-1.5 p-3">
        {slides.map((s, n) => (
          <span key={s.key} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <span className="block h-full bg-white" style={{ width: `${n < i ? 100 : n === i ? progress * 100 : 0}%` }} />
          </span>
        ))}
      </div>
      {paused && (
        <span className="absolute top-7 left-4 z-20 inline-flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white">
          <Pause className="h-3 w-3 fill-white" /> Paused
        </span>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={onClose}
        className="absolute top-6 right-4 z-30 rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"
      >
        Skip
      </button>

      {/* The whole screen is the tap/hold surface. */}
      <div className="absolute inset-0 z-10 cursor-pointer" onPointerDown={onDown} onPointerUp={onUp} onPointerLeave={() => hold(false)} aria-hidden="true" />
      <button type="button" className="sr-only" onClick={prev}>
        Previous
      </button>
      <button type="button" className="sr-only" onClick={next}>
        Next
      </button>

      <div key={slide.key} className="rise-in pointer-events-none relative z-0 w-full max-w-lg px-6 text-center">
        {slide.body}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Slides

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm font-bold tracking-[0.3em] text-brand-300 uppercase">{children}</p>
}

function Dialogue({ children }: { children: ReactNode }) {
  return <p className="mb-5 font-serif text-lg text-amber-100/90 italic">{children}</p>
}

function BigCover({ src }: { src: string }) {
  return src ? (
    <img src={src} alt="" className="mx-auto mb-6 h-56 w-56 rounded-2xl object-cover shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/10 sm:h-64 sm:w-64" />
  ) : (
    <div className="mx-auto mb-6 flex h-56 w-56 items-center justify-center rounded-2xl bg-white/10 text-6xl">🎵</div>
  )
}

function Big({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={clsx('text-4xl font-black text-white sm:text-5xl', className)}>{children}</h2>
}

export interface RecapInput {
  stats: RoundStat[]
  ranked: PublicPlayer[]
  you: string
  me: PublicPlayer | undefined
  solo: boolean
  sourceTitle: string
  myScore: number
  myRight: number
  avgMs: number | null
  best: { best: number; isNew: boolean }
  awards: Award[]
  comeback: { p: PublicPlayer; from: number; to: number } | null
  /** 'song', or 'question' for challenge games. */
  noun?: string
}

/** A challenge round's prompt (dialogue or emojis), shown where a song would show its cover. */
function PromptCard({ r }: { r: RoundStat['r'] }) {
  const c = r.challenge
  if (!c) return <BigCover src={r.track.artwork} />
  if (r.track.artwork) return <BigCover src={r.track.artwork} />
  return (
    <div className="film-strip mx-auto mb-6 flex min-h-40 max-w-sm items-center justify-center rounded-2xl bg-black/40 px-6 py-8 ring-1 ring-white/10">
      {c.kind === 'emoji' ? (
        <span className="text-5xl tracking-widest">{c.prompt}</span>
      ) : c.kind === 'actor' ? (
        <span className="text-6xl">🌟</span>
      ) : (
        <span className="font-serif text-2xl text-amber-50 italic">“{c.prompt}”</span>
      )}
    </div>
  )
}

export function buildSlides(x: RecapInput): Slide[] {
  const { stats, ranked, you, solo } = x
  const noun = x.noun ?? 'song'
  const slides: Slide[] = []
  const covers = [...new Set(stats.map((s) => s.r.track.artwork).filter(Boolean))]
  const last = stats[stats.length - 1]?.r.track

  slides.push({
    key: 'intro',
    art: last?.artwork || covers[0],
    // The game's last song keeps playing straight from its reveal into the recap.
    ...(last ? { carryOn: last.preview } : {}),
    body: (
      <>
        <div className="relative mx-auto mb-8 h-56 w-72">
          {covers.slice(0, 6).map((c, n) => (
            <img
              key={c}
              src={c}
              alt=""
              className="cover-fly absolute top-6 left-1/2 h-40 w-40 rounded-xl object-cover shadow-2xl ring-1 ring-white/10"
              style={
                {
                  marginLeft: `${-80 + (n - 2.5) * 26}px`,
                  animationDelay: `${n * 0.12}s`,
                  '--r': `${(n - 2.5) * 9}deg`,
                  '--fx': `${(n - 2.5) * 60}px`,
                  '--fy': '200px',
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <Eyebrow>That’s a wrap</Eyebrow>
        <Big>
          {stats.length} {noun}s
        </Big>
        <p className="mt-2 text-lg text-gray-300">{x.sourceTitle}</p>
        {!solo && <p className="mt-1 font-serif text-amber-100/90 italic">“Kitne aadmi the?” — {ranked.length}</p>}
      </>
    ),
  })

  if (stats.length > 0) {
    const pct = Math.round((x.myRight / stats.length) * 100)
    slides.push({
      key: 'you',
      tone: 'from-brand-600/50 via-[#0d0716] to-rose-800/50',
      body: (
        <>
          <Eyebrow>Your night</Eyebrow>
          <div className="mx-auto mb-6 flex h-44 w-44 items-center justify-center rounded-full p-2" style={{ background: `conic-gradient(#ffc44d ${pct * 3.6}deg, rgba(255,255,255,0.1) 0)` }}>
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#140b1f]">
              <span className="text-5xl font-black text-white tabular-nums">{pct}%</span>
              <span className="text-xs text-gray-400">accuracy</span>
            </div>
          </div>
          <div className="mx-auto grid max-w-sm grid-cols-3 gap-3">
            {[
              [`${x.myRight}/${stats.length}`, 'right'],
              [`🔥${x.me?.bestStreak ?? 0}`, 'best streak'],
              [x.avgMs !== null ? `${(x.avgMs / 1000).toFixed(1)}s` : '—', 'avg. answer'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-2xl bg-white/10 p-3 backdrop-blur">
                <p className="text-2xl font-extrabold text-white tabular-nums">{v}</p>
                <p className="text-xs text-gray-300">{l}</p>
              </div>
            ))}
          </div>
        </>
      ),
    })
  }

  if (stats.length >= 2) {
    const known = [...stats].sort((a, b) => b.acc - a.acc || (a.fastest?.ms ?? 1e9) - (b.fastest?.ms ?? 1e9))[0]!
    const stumper = [...stats].sort((a, b) => a.acc - b.acc)[0]!
    if (known.right > 0 && !solo) {
      slides.push({
        key: 'known',
        art: known.r.track.artwork,
        audio: known.r.track.preview,
        body: (
          <>
            <Eyebrow>Sabko pata tha</Eyebrow>
            <PromptCard r={known.r} />
            <h2 className="text-3xl font-black text-white">{known.r.track.title}</h2>
            <p className="mt-1 text-lg text-brand-200">{known.r.track.artist}</p>
            <p className="mt-4 text-gray-300">
              {known.right}/{known.players} got it
            </p>
          </>
        ),
      })
    }
    if (stumper !== known || solo) {
      slides.push({
        key: 'stumper',
        art: stumper.r.track.artwork,
        audio: stumper.r.track.preview,
        body: (
          <>
            <Eyebrow>{stumper.right === 0 ? 'Nobody got this one' : 'The stumper'}</Eyebrow>
            <Dialogue>“Yeh kya hua, kaise hua…”</Dialogue>
            <PromptCard r={stumper.r} />
            <h2 className="text-3xl font-black text-white">{stumper.r.track.title}</h2>
            <p className="mt-1 text-lg text-brand-200">{stumper.r.track.artist}</p>
            <p className="mt-4 text-gray-300">{solo ? (noun === 'song' ? 'Remember this hook for next time.' : 'Remember this one for next time.') : `Only ${stumper.right}/${stumper.players} got it`}</p>
          </>
        ),
      })
    }
  }

  const fastest = stats.filter((s) => s.fastest).sort((a, b) => a.fastest!.ms - b.fastest!.ms)[0]
  if (fastest?.fastest) {
    const f = fastest.fastest
    slides.push({
      key: 'fastest',
      tone: 'from-orange-600/60 via-[#0d0716] to-red-900/60',
      body: (
        <>
          <Eyebrow>Fastest finger</Eyebrow>
          <Dialogue>“Dhoom machale!”</Dialogue>
          <div className="mx-auto mb-5 inline-block scale-[2.2] py-8">
            <PlayerAvatar avatar={f.p.avatar} photo={f.p.photo} name={f.p.name} size="lg" />
          </div>
          <h2 className="text-6xl font-black text-white tabular-nums">{(f.ms / 1000).toFixed(2)}s</h2>
          <p className="mt-3 text-lg text-gray-300">
            {f.p.id === you ? 'You' : f.p.name} named <span className="font-semibold text-white">{fastest.r.track.title}</span>
          </p>
        </>
      ),
    })
  }

  if (x.comeback && !solo) {
    const c = x.comeback
    slides.push({
      key: 'comeback',
      tone: 'from-rose-700/60 via-[#0d0716] to-black',
      body: (
        <>
          <Eyebrow>Comeback of the night</Eyebrow>
          <Dialogue>“Haar kar jeetne waale ko Baazigar kehte hain”</Dialogue>
          <div className="mx-auto mb-5 inline-block scale-[2] py-7">
            <PlayerAvatar avatar={c.p.avatar} photo={c.p.photo} name={c.p.name} size="lg" />
          </div>
          <Big>{c.p.id === you ? 'You' : c.p.name}</Big>
          <p className="mt-3 text-2xl font-bold text-rose-200">
            #{c.from} → #{c.to}
          </p>
        </>
      ),
    })
  }

  if (x.awards.length >= 2) {
    slides.push({
      key: 'awards',
      tone: 'from-amber-700/40 via-[#0d0716] to-fuchsia-900/50',
      ms: 5500,
      body: (
        <>
          <Eyebrow>And the Filmfare goes to…</Eyebrow>
          <div className="mx-auto grid max-w-md grid-cols-2 gap-2.5">
            {x.awards.slice(0, 6).map((a, n) => (
              <div key={a.id} className="rise-in" style={{ animationDelay: `${n * 0.15}s` }}>
                <AwardCard award={a} compact />
              </div>
            ))}
          </div>
        </>
      ),
    })
  }

  if (!solo && ranked[0]) {
    const top = [ranked[1], ranked[0], ranked[2]]
    const heights = ['h-20', 'h-28', 'h-14']
    slides.push({
      key: 'winner',
      tone: 'from-amber-600/40 via-[#0d0716] to-fuchsia-900/60',
      ms: 5500,
      body: (
        <>
          <div className="spotlight pointer-events-none absolute -top-48 left-1/2 h-[36rem] w-64 -translate-x-1/2 bg-linear-to-b from-amber-200/40 to-transparent blur-2xl" />
          <Eyebrow>Aur winner hai…</Eyebrow>
          <Big className="mb-8">{ranked[0].id === you ? 'You!' : ranked[0].name}</Big>
          <div className="flex items-end justify-center gap-3">
            {top.map((p, n) =>
              p ? (
                <div key={p.id} className="rise-in flex w-24 flex-col items-center" style={{ animationDelay: `${[0.5, 0.9, 0.2][n]}s` }}>
                  <span className="relative">
                    {n === 1 && <Crown className="absolute -top-5 left-1/2 h-6 w-6 -translate-x-1/2 text-amber-300" />}
                    <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="lg" />
                  </span>
                  <p className="mt-2 w-full truncate font-bold text-white">{p.name}</p>
                  <p className="text-sm text-amber-200 tabular-nums">{p.score.toLocaleString()}</p>
                  <div className={clsx('mt-2 w-full rounded-t-xl bg-linear-to-b from-white/25 to-white/5', heights[n])} />
                </div>
              ) : (
                <div key={n} className="w-24" />
              ),
            )}
          </div>
        </>
      ),
    })
  } else if (solo) {
    slides.push({
      key: 'score',
      tone: 'from-fuchsia-700/60 via-[#0d0716] to-pink-800/50',
      body: (
        <>
          <Eyebrow>{x.best.isNew ? 'New personal best!' : 'Your score'}</Eyebrow>
          {x.best.isNew && <Dialogue>“Mogambo khush hua!”</Dialogue>}
          <h2 className="bg-linear-to-br from-brand-200 via-brand-300 to-rose-300 bg-clip-text text-7xl font-black text-transparent tabular-nums">{x.myScore.toLocaleString()}</h2>
          <p className="mt-4 text-xl text-gray-200">
            {x.myRight}/{stats.length} {noun}s right
          </p>
          {!x.best.isNew && x.best.best > 0 && <p className="mt-2 text-gray-400">Your best: {x.best.best.toLocaleString()}</p>}
        </>
      ),
    })
  }
  return slides
}
