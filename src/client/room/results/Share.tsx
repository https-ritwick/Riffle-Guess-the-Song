import clsx from 'clsx'
import { Check, Copy, Download, Link2, Loader2, Share2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BRAND } from '../../../shared/brand'
import { useToast } from '../../components/Toasts'

// Result sharing: a story-sized poster (Instagram Story / WhatsApp Status), a square
// post, WhatsApp and X links, copyable text and a "beat my score" challenge link.

export interface ShareData {
  modeEmoji: string
  modeTitle: string
  name: string
  score: number
  correct: number
  total: number
  /** 1-based; null when solo. */
  rank: number | null
  players: number
  grid: ('right' | 'wrong' | 'miss')[]
  levelTitle: string
  levelEmoji: string
  award: { title: string; who: string } | null
  daily: number | null
  dailyRank: { rank: number; of: number } | null
  covers: string[]
  /** Link that opens Riffle with "beat X's score" (or the daily challenge). */
  challengeUrl: string
}

type Format = 'story' | 'post'
const SIZES: Record<Format, [number, number]> = { story: [1080, 1920], post: [1080, 1080] }
const FONT = '"Bricolage Grotesque Variable", system-ui, sans-serif'
const SQUARE: Record<ShareData['grid'][number], string> = { right: '🟩', wrong: '🟥', miss: '⬛' }

export function shareText(d: ShareData): string {
  const grid = d.grid.map((g) => SQUARE[g]).join('')
  const head = d.daily ? `${BRAND.name} Daily #${d.daily} ${d.modeEmoji}` : `${BRAND.name} ${d.modeEmoji} ${d.modeTitle}`
  const place = d.dailyRank ? ` · #${d.dailyRank.rank} of ${d.dailyRank.of} today` : d.rank && d.players > 1 ? ` · #${d.rank} of ${d.players}` : ''
  return `${head}\n${d.score.toLocaleString('en-IN')} pts · ${d.correct}/${d.total}${place}\n${grid}\n${d.daily ? 'Play today’s challenge' : 'Beat me'} 👉 ${d.challengeUrl}`
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = window.setTimeout(() => resolve(null), 3500)
    img.onload = () => {
      clearTimeout(t)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(t)
      resolve(null)
    }
    img.src = src
  })
}

/** Draw centred text, shrinking the font until it fits the card. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, weight: number, size: number, maxWidth: number) {
  let s = size
  ctx.font = `${weight} ${s}px ${FONT}`
  while (s > 18 && ctx.measureText(text).width > maxWidth) {
    s -= 2
    ctx.font = `${weight} ${s}px ${FONT}`
  }
  ctx.fillText(text, x, y)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Draw the result poster. Album art is used when its CDN allows it; otherwise it's skipped. */
async function drawCard(d: ShareData, format: Format): Promise<Blob> {
  const [W, H] = SIZES[format]
  const story = format === 'story'
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  await Promise.all([document.fonts.load(`800 120px ${FONT}`), document.fonts.load(`600 40px ${FONT}`)]).catch(() => undefined)

  // Night sky with marigold and magenta light.
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#24102f')
  bg.addColorStop(1, '#0d0716')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(W * 0.1, H * 0.08, W * 0.9, 'rgba(255,174,31,0.35)')
  glow(W * 0.95, H * 0.85, W * 0.9, 'rgba(232,51,109,0.38)')
  // Marquee bulbs along the top and bottom.
  for (let x = 20; x < W; x += 44) {
    for (const y of [22, H - 22]) {
      ctx.fillStyle = 'rgba(255,214,140,0.9)'
      ctx.beginPath()
      ctx.arc(x, y, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const gold = ctx.createLinearGradient(0, 0, W, 0)
  gold.addColorStop(0, '#ffdb8a')
  gold.addColorStop(0.5, '#ff9f1c')
  gold.addColorStop(1, '#ff4f7b')

  let y = story ? 150 : 110
  ctx.textAlign = 'center'
  ctx.fillStyle = gold
  ctx.font = `800 ${story ? 84 : 64}px ${FONT}`
  ctx.fillText(BRAND.name, W / 2, y)
  y += story ? 80 : 60

  // Mode pill.
  const pill = d.daily ? `Daily #${d.daily}  ·  ${d.modeEmoji} ${d.modeTitle}` : `${d.modeEmoji}  ${d.modeTitle}`
  ctx.font = `700 ${story ? 42 : 34}px ${FONT}`
  const pw = Math.min(W - 120, ctx.measureText(pill).width + 70)
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  roundRect(ctx, (W - pw) / 2, y - (story ? 52 : 44), pw, story ? 74 : 62, 40)
  ctx.fill()
  ctx.fillStyle = '#fff'
  fitText(ctx, pill, W / 2, y, 700, story ? 42 : 34, W - 160)
  y += story ? 70 : 40

  // A fan of this game's album covers (story only).
  if (story) {
    const imgs = (await Promise.all(d.covers.slice(0, 5).map(loadImage))).filter((i): i is HTMLImageElement => !!i)
    if (imgs.length) {
      const size = 300
      const cx = W / 2
      const top = y + 40
      imgs.forEach((img, i) => {
        const offset = i - (imgs.length - 1) / 2
        ctx.save()
        ctx.translate(cx + offset * 150, top + size / 2 + Math.abs(offset) * 30)
        ctx.rotate((offset * 9 * Math.PI) / 180)
        ctx.shadowColor = 'rgba(0,0,0,0.6)'
        ctx.shadowBlur = 40
        roundRect(ctx, -size / 2, -size / 2, size, size, 28)
        ctx.clip()
        ctx.drawImage(img, -size / 2, -size / 2, size, size)
        ctx.restore()
      })
      y = top + size + 140
    } else {
      ctx.font = `200px ${FONT}`
      ctx.fillText(d.modeEmoji, W / 2, y + 260)
      y += 400
    }
  }

  // The score.
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = `600 ${story ? 40 : 34}px ${FONT}`
  fitText(ctx, `${d.name} scored`, W / 2, y, 600, story ? 40 : 34, W - 160)
  y += story ? 170 : 140
  ctx.fillStyle = gold
  ctx.font = `800 ${story ? 190 : 160}px ${FONT}`
  ctx.fillText(d.score.toLocaleString('en-IN'), W / 2, y)
  y += story ? 80 : 66
  ctx.fillStyle = '#fff'
  ctx.font = `700 ${story ? 48 : 40}px ${FONT}`
  const place = d.dailyRank ? `  ·  #${d.dailyRank.rank} of ${d.dailyRank.of} today` : d.rank && d.players > 1 ? `  ·  #${d.rank} of ${d.players}` : ''
  ctx.fillText(`${d.correct}/${d.total} right${place}`, W / 2, y)
  y += story ? 90 : 70

  // Wordle-style squares.
  const sq = story ? 64 : 52
  const gap = 14
  const gw = d.grid.length * sq + (d.grid.length - 1) * gap
  d.grid.forEach((g, i) => {
    ctx.fillStyle = g === 'right' ? '#22c55e' : g === 'wrong' ? '#ef4444' : 'rgba(255,255,255,0.18)'
    roundRect(ctx, (W - gw) / 2 + i * (sq + gap), y - sq + 10, sq, sq, 14)
    ctx.fill()
  })
  y += story ? 110 : 80

  // Award and level.
  ctx.font = `700 ${story ? 40 : 32}px ${FONT}`
  if (d.award) {
    ctx.fillStyle = '#ffdb8a'
    fitText(ctx, `🏆 ${d.award.title}`, W / 2, y, 700, story ? 40 : 32, W - 160)
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    ctx.font = `600 ${story ? 34 : 28}px ${FONT}`
    ctx.fillText(`awarded to ${d.award.who}`, W / 2, y + (story ? 50 : 40))
    y += story ? 120 : 90
  }
  if (story) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.font = `700 40px ${FONT}`
    ctx.fillText(`${d.levelEmoji} ${d.levelTitle}`, W / 2, y)
  }

  // Call to action.
  const cta = d.daily ? 'Same questions for everyone today. Your turn?' : 'Think you can beat that?'
  ctx.fillStyle = '#fff'
  fitText(ctx, cta, W / 2, H - (story ? 190 : 120), 800, story ? 50 : 40, W - 140)
  ctx.fillStyle = gold
  ctx.font = `700 ${story ? 40 : 32}px ${FONT}`
  ctx.fillText(location.host, W / 2, H - (story ? 120 : 68))

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'))
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function ShareSheet({ data, onClose }: { data: ShareData; onClose: () => void }) {
  const toast = useToast()
  const [format, setFormat] = useState<Format>('story')
  const [images, setImages] = useState<Partial<Record<Format, { blob: Blob; url: string }>>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const text = useMemo(() => shareText(data), [data])
  const image = images[format]

  useEffect(() => {
    if (images[format]) return
    let cancelled = false
    drawCard(data, format)
      .then((blob) => !cancelled && setImages((m) => ({ ...m, [format]: { blob, url: URL.createObjectURL(blob) } })))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [format, data, images])
  // Free the preview images when the sheet closes.
  const urls = useRef<string[]>([])
  useEffect(() => {
    urls.current = Object.values(images).map((i) => i!.url)
  }, [images])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])

  const fileName = `riffle-${data.daily ? `daily-${data.daily}` : 'result'}-${format}.png`

  /** Hand the poster to the phone's share sheet (Instagram, WhatsApp…), or save it. */
  const shareImage = async (where: string, want: Format) => {
    const img = images[want] ?? { blob: await drawCard(data, want), url: '' }
    const file = new File([img.blob], `riffle-${want}.png`, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text })
        return
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
    }
    download(img.blob, fileName)
    toast({ title: 'Poster saved', body: `Open ${where} and pick the image from your gallery. Your result text is copied too.`, tone: 'success', durationMs: 6000 })
    await navigator.clipboard?.writeText(text).catch(() => undefined)
  }

  const copy = async (what: 'text' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'text' ? text : data.challengeUrl)
      setCopied(what)
      window.setTimeout(() => setCopied(null), 1800)
    } catch {
      window.prompt('Copy this', what === 'text' ? text : data.challengeUrl)
    }
  }

  const targets: { id: string; label: string; sub: string; tone: string; icon: string; onClick: () => void }[] = [
    { id: 'ig', label: 'Instagram Story', sub: 'Story poster', tone: 'from-[#f58529] via-[#dd2a7b] to-[#8134af]', icon: '📸', onClick: () => void shareImage('Instagram → Your story', 'story') },
    { id: 'wa-status', label: 'WhatsApp Status', sub: 'Story poster', tone: 'from-[#25d366] to-[#128c7e]', icon: '🟢', onClick: () => void shareImage('WhatsApp → Status', 'story') },
    {
      id: 'wa',
      label: 'WhatsApp chat',
      sub: 'Send to a friend or group',
      tone: 'from-[#25d366] to-[#075e54]',
      icon: '💬',
      onClick: () => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'),
    },
    { id: 'post', label: 'Post / feed', sub: 'Square image', tone: 'from-brand-400 to-rose-500', icon: '🖼️', onClick: () => void shareImage('Instagram, Facebook or X', 'post') },
    {
      id: 'x',
      label: 'X (Twitter)',
      sub: 'Post your grid',
      tone: 'from-zinc-600 to-black',
      icon: '𝕏',
      onClick: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener'),
    },
    {
      id: 'more',
      label: 'More apps',
      sub: 'Telegram, Snapchat…',
      tone: 'from-sky-500 to-indigo-600',
      icon: '📤',
      onClick: () => {
        if (typeof navigator.share === 'function') void navigator.share({ text }).catch(() => undefined)
        else void copy('text')
      },
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" role="dialog" aria-label="Share your result" data-testid="share-sheet" onClick={onClose}>
      <div
        className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#170b22] p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-white">Share your result</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <div>
            <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
              {(['story', 'post'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  aria-pressed={format === f}
                  className={clsx('h-8 rounded-lg text-sm font-semibold', format === f ? 'bg-white text-gray-900' : 'text-gray-300 hover:text-white')}
                >
                  {f === 'story' ? 'Story 9:16' : 'Post 1:1'}
                </button>
              ))}
            </div>
            <div className={clsx('mx-auto flex w-full max-w-60 items-center justify-center overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10', format === 'story' ? 'aspect-[9/16]' : 'aspect-square')}>
              {image ? <img src={image.url} alt="Your result poster" className="h-full w-full object-contain" /> : <Loader2 className="h-6 w-6 animate-spin text-brand-300" />}
            </div>
            <button
              type="button"
              disabled={!image}
              onClick={() => image && download(image.blob, fileName)}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.06] text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Download image
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={t.onClick}
                  data-testid={`share-${t.id}`}
                  className="group flex items-center gap-3 rounded-2xl bg-white/[0.04] p-2.5 text-left ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-white/[0.08]"
                >
                  <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-lg font-black text-white shadow-lg', t.tone)}>{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-white">{t.label}</span>
                    <span className="block truncate text-xs text-gray-400">{t.sub}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/10">
              <pre className="font-sans text-sm whitespace-pre-wrap text-gray-200">{text}</pre>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => copy('text')} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/[0.08] text-sm font-semibold text-white hover:bg-white/[0.14]">
                  {copied === 'text' ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />} Copy text
                </button>
                <button type="button" onClick={() => copy('link')} className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white/[0.08] text-sm font-semibold text-white hover:bg-white/[0.14]">
                  {copied === 'link' ? <Check className="h-4 w-4 text-emerald-300" /> : <Link2 className="h-4 w-4" />} {data.daily ? 'Copy daily link' : 'Copy challenge link'}
                </button>
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-gray-400">
              <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              On your phone, Instagram Story and WhatsApp Status open your share sheet with the poster ready. On a computer the poster is downloaded instead.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
