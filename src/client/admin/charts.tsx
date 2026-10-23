// Small SVG chart kit for the admin console: thin marks, recessive axes, a
// crosshair/tooltip on every plot. Colours are a CVD-checked categorical set
// (validated against the dark card surface) used in fixed order.
import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dayStart } from '../../shared/admin'

export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'] as const
/** Surface colour of a chart card, used for the 2px gaps and rings between marks. */
const SURFACE = '#171020'
const GRID = 'rgba(255,255,255,0.07)'
const AXIS_TEXT = '#8f8a9b'

// ---------------------------------------------------------------------------
// Formatting

export function compact(n: number): string {
  if (!Number.isFinite(n)) return '–'
  const abs = Math.abs(n)
  if (abs >= 1e7) return `${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`
  if (abs >= 1e5) return `${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
const dayFmtLong = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
export const dayLabel = (day: number) => dayFmt.format(dayStart(day))
export const dayLabelLong = (day: number) => dayFmtLong.format(dayStart(day))

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
export const when = (ms: number | null | undefined) => (ms ? dateTimeFmt.format(ms) : '—')

export function ago(ms: number | null | undefined): string {
  if (!ms) return 'never'
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`
  return dayFmt.format(ms)
}

/** Flag emoji for an ISO country code. */
export function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return '🌐'
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const regionNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
export function countryName(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return 'Unknown'
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

/** Clean axis ticks for counts: 0 up to a round top in 1/2/2.5/5×10ⁿ steps (whole numbers only). */
function axis(max: number): { top: number; ticks: number[] } {
  const raw = Math.max(1, max) / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= raw && Number.isInteger(v)) ?? 10 * pow)
  const top = Math.max(step, Math.ceil(max / step) * step)
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) }
}

// ---------------------------------------------------------------------------
// Layout helpers

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(600)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export function ChartCard({ title, subtitle, right, children, className }: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('min-w-0 rounded-2xl border border-white/[0.07] bg-[#171020] p-4 sm:p-5', className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  )
}

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} aria-hidden="true" />
          {i.label}
          {i.value && <span className="text-gray-500">{i.value}</span>}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), width - 180)
  return (
    <div
      className="pointer-events-none absolute z-10 w-[170px] rounded-xl border border-white/10 bg-[#241935]/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
      style={{ left: x + 192 > width ? x - 182 : left, top: Math.max(0, y - 10) }}
      role="status"
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat tile

export function StatTile({
  label,
  value,
  previous,
  format = compact,
  hint,
  spark,
  upIsGood = true,
}: {
  label: string
  value: number
  previous?: number | null
  format?: (n: number) => string
  hint?: string
  spark?: number[]
  upIsGood?: boolean
}) {
  const delta = previous != null && previous > 0 ? (value - previous) / previous : null
  if (previous === 0 && value > 0 && !hint) hint = 'up from 0 in the previous period'
  const direction = delta === null || Math.abs(delta) < 0.005 ? 0 : delta > 0 ? 1 : -1
  const good = direction === 0 ? null : (direction > 0) === upIsGood
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-[#171020] p-4">
      <p className="truncate text-xs font-medium text-gray-400">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold tracking-tight text-white tabular-nums">{format(value)}</p>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
        {delta !== null ? (
          <>
            <span className={clsx('inline-flex items-center gap-0.5 font-semibold', good === null ? 'text-gray-300' : good ? 'text-emerald-400' : 'text-rose-400')}>
              {direction > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : direction < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              {pct(Math.abs(delta))}
            </span>
            <span>vs previous period</span>
          </>
        ) : (
          (hint ?? <span>&nbsp;</span>)
        )}
      </p>
    </div>
  )
}

export function Sparkline({ values, color = SERIES[0] }: { values: number[]; color?: string }) {
  const w = 72
  const h = 24
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke="#6b6478" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={pts.at(-1)!.split(',')[1]} r="2.5" fill={color} />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Time series (lines; a single series gets a soft area wash)

export interface Series {
  key: string
  label: string
  values: number[]
  color?: string
}

const PAD = { top: 8, right: 8, bottom: 22, left: 34 }

function xTicks(n: number, width: number): number[] {
  const count = Math.max(2, Math.min(n, Math.floor(width / 80)))
  if (n <= 1) return [0]
  return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)))
}

export function TimeSeries({ days, series, height = 220, format = compact }: { days: number[]; series: Series[]; height?: number; format?: (n: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }))
  const { top: max, ticks } = axis(Math.max(0, ...colored.flatMap((s) => s.values)))
  const iw = Math.max(10, width - PAD.left - PAD.right)
  const ih = height - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (days.length <= 1 ? iw / 2 : (i / (days.length - 1)) * iw)
  const y = (v: number) => PAD.top + ih - (v / max) * ih
  const single = colored.length === 1

  return (
    <div ref={ref} className="relative">
      {!single && <Legend items={colored.map((s) => ({ label: s.label, color: s.color }))} />}
      <svg width={width} height={height} role="img" aria-label={`${colored.map((s) => s.label).join(', ')} by day`} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + iw} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
              {compact(t)}
            </text>
          </g>
        ))}
        {xTicks(days.length, iw).map((i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'} fontSize="10" fill={AXIS_TEXT}>
            {dayLabel(days[i]!)}
          </text>
        ))}
        {colored.map((s) => {
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
          return (
            <g key={s.key}>
              {single && <path d={`${d}L${x(s.values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.color} opacity="0.1" />}
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="rgba(255,255,255,0.25)" />
            {colored.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r="4" fill={s.color} stroke={SURFACE} strokeWidth="2" />
            ))}
          </g>
        )}
        <rect
          x={PAD.left}
          y={0}
          width={iw}
          height={height}
          fill="transparent"
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            const i = Math.round(((e.clientX - box.left) / box.width) * (days.length - 1))
            setHover(Math.max(0, Math.min(days.length - 1, i)))
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} y={PAD.top} width={width}>
          <p className="mb-1 font-semibold text-white">{dayLabelLong(days[hover]!)}</p>
          {colored.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-2 text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-white tabular-nums">{format(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stacked columns by day

function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

export function StackedColumns({ days, series, height = 220 }: { days: number[]; series: Series[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const colored = series.map((s, i) => ({ ...s, color: s.color ?? SERIES[i % SERIES.length]! }))
  const totals = days.map((_, i) => colored.reduce((a, s) => a + (s.values[i] ?? 0), 0))
  const { top: max, ticks } = axis(Math.max(0, ...totals))
  const iw = Math.max(10, width - PAD.left - PAD.right)
  const ih = height - PAD.top - PAD.bottom
  const band = iw / Math.max(1, days.length)
  const bw = Math.max(2, Math.min(24, band - 2))
  const y = (v: number) => PAD.top + ih - (v / max) * ih

  return (
    <div ref={ref} className="relative">
      <Legend items={colored.map((s) => ({ label: s.label, color: s.color }))} />
      <svg width={width} height={height} role="img" aria-label={`${colored.map((s) => s.label).join(', ')} stacked by day`} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={PAD.left + iw} y1={y(t)} y2={y(t)} stroke={GRID} />
            <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill={AXIS_TEXT}>
              {compact(t)}
            </text>
          </g>
        ))}
        {days.map((day, i) => {
          const cx = PAD.left + band * i + (band - bw) / 2
          let acc = 0
          const segs = colored.filter((s) => (s.values[i] ?? 0) > 0)
          return (
            <g key={day} opacity={hover === null || hover === i ? 1 : 0.55}>
              {segs.map((s, j) => {
                const v = s.values[i] ?? 0
                const y0 = y(acc)
                acc += v
                const y1 = y(acc)
                // 2px gap of card surface between stacked segments.
                const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0))
                const top = y1
                return j === segs.length - 1 ? (
                  <path key={s.key} d={topRounded(cx, top, bw, h, 4)} fill={s.color} />
                ) : (
                  <rect key={s.key} x={cx} y={top} width={bw} height={h} fill={s.color} />
                )
              })}
            </g>
          )
        })}
        {xTicks(days.length, iw).map((i) => (
          <text key={i} x={PAD.left + band * i + band / 2} y={height - 6} textAnchor="middle" fontSize="10" fill={AXIS_TEXT}>
            {dayLabel(days[i]!)}
          </text>
        ))}
        <rect
          x={PAD.left}
          y={0}
          width={iw}
          height={height}
          fill="transparent"
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            setHover(Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - box.left) / box.width) * days.length))))
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <Tooltip x={PAD.left + band * hover + band / 2} y={y(totals[hover] ?? 0)} width={width}>
          <p className="mb-1 font-semibold text-white">
            {dayLabelLong(days[hover]!)} · {compact(totals[hover] ?? 0)}
          </p>
          {colored.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-2 text-gray-300">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-white tabular-nums">{compact(s.values[hover] ?? 0)}</span>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ranked bar list

export interface BarItem {
  label: ReactNode
  value: number
  extra?: string
  key?: string
  onClick?: () => void
}

export function BarList({ items, format = compact, color = SERIES[0], empty = 'No data yet', max: maxRows = 10, extraLabel }: { items: BarItem[]; format?: (n: number) => string; color?: string; empty?: string; max?: number; extraLabel?: string }) {
  const [all, setAll] = useState(false)
  if (!items.length) return <p className="py-6 text-center text-sm text-gray-500">{empty}</p>
  const top = Math.max(1, ...items.map((i) => i.value))
  const total = items.reduce((a, i) => a + i.value, 0)
  const shown = all ? items : items.slice(0, maxRows)
  return (
    <div>
      {extraLabel && <p className="mb-1 text-right text-[10px] tracking-wide text-gray-500 uppercase">{extraLabel}</p>}
      <ul className="space-y-2.5">
        {shown.map((item, i) => {
          const body = (
            <>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-gray-200">{item.label}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-white">{format(item.value)}</span>
                  <span className="ml-1.5 text-xs text-gray-500">{total ? pct(item.value / total) : ''}</span>
                  {item.extra && <span className="ml-2 inline-block min-w-10 text-right text-xs text-gray-400">{item.extra}</span>}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05]">
                <div className="h-1.5 rounded-full" style={{ width: `${Math.max(1.5, (item.value / top) * 100)}%`, background: color }} />
              </div>
            </>
          )
          return (
            <li key={item.key ?? i}>
              {item.onClick ? (
                <button type="button" onClick={item.onClick} className="block w-full rounded-lg text-left hover:bg-white/[0.03]">
                  {body}
                </button>
              ) : (
                body
              )}
            </li>
          )
        })}
      </ul>
      {items.length > maxRows && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-xs font-semibold text-brand-300 hover:text-brand-200">
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Share of a whole (100% bar with a 2px gap between parts)

export function ShareBar({ items }: { items: { label: string; value: number }[] }) {
  const total = items.reduce((a, i) => a + i.value, 0)
  if (!total) return <p className="py-6 text-center text-sm text-gray-500">No data yet</p>
  const parts = items.slice(0, 7)
  return (
    <div>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${pct(p.value / total)}`).join(', ')}>
        {parts.map((p, i) => (
          <div key={p.label} title={`${p.label}: ${compact(p.value)} (${pct(p.value / total)})`} style={{ width: `${(p.value / total) * 100}%`, background: SERIES[i] }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center justify-between gap-2 text-gray-300">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i] }} />
              <span className="truncate">{p.label}</span>
            </span>
            <span className="font-semibold text-white tabular-nums">{pct(p.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weekday × hour heatmap (one hue, light→strong)

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Heatmap({ grid, unit }: { grid: number[][]; unit: string }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)
  const max = Math.max(1, ...grid.flat())
  const peak = useMemo(() => {
    let best = { d: 0, h: 0, v: -1 }
    grid.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { d, h, v })))
    return best
  }, [grid])
  const label = (d: number, h: number) => `${DAYS[d]} ${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] gap-[2px]" style={{ gridTemplateColumns: '32px repeat(24, minmax(0, 1fr))' }}>
          {grid.map((row, d) => (
            <div key={d} className="contents">
              <span className="pr-1 text-right text-[10px] leading-5 text-gray-500">{DAYS[d]}</span>
              {row.map((v, h) => (
                <span
                  key={h}
                  className="h-5 rounded-[3px]"
                  style={{ background: v ? `rgba(255, 174, 31, ${0.12 + 0.88 * (v / max)})` : 'rgba(255,255,255,0.04)' }}
                  onMouseEnter={() => setHover({ d, h })}
                  onMouseLeave={() => setHover(null)}
                  title={`${label(d, h)} IST: ${v} ${unit}`}
                />
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[9px] text-gray-500">
              {h % 3 === 0 ? h : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
        <span>
          {hover ? (
            <>
              <span className="text-white">{label(hover.d, hover.h)}</span> · {grid[hover.d]![hover.h]} {unit}
            </>
          ) : peak.v > 0 ? (
            <>
              Busiest: <span className="text-white">{label(peak.d, peak.h)}</span> IST
            </>
          ) : (
            'No activity yet'
          )}
        </span>
        <span className="flex items-center gap-1.5">
          Less
          <span className="h-2.5 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, rgba(255,174,31,0.12), rgba(255,174,31,1))' }} />
          More
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Retention cohorts

export function CohortGrid({ cohorts, unit }: { cohorts: { week: number; size: number; weeks: number[] }[]; unit: string }) {
  const maxWeeks = Math.max(1, ...cohorts.map((c) => c.weeks.length))
  if (!cohorts.some((c) => c.size > 0)) return <p className="py-6 text-center text-sm text-gray-500">Not enough data yet — cohorts fill in week by week.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-[2px] text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 py-1 text-left font-medium">Week of</th>
            <th className="px-2 py-1 text-right font-medium">{unit}</th>
            {Array.from({ length: maxWeeks }, (_, i) => (
              <th key={i} className="px-1 py-1 text-center font-medium">
                {i === 0 ? 'W0' : `+${i}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week}>
              <td className="px-2 py-1.5 whitespace-nowrap text-gray-300">{dayLabel(c.week * 7 - 3)}</td>
              <td className="px-2 py-1.5 text-right font-semibold text-white tabular-nums">{c.size}</td>
              {Array.from({ length: maxWeeks }, (_, i) => {
                const v = c.weeks[i]
                return (
                  <td
                    key={i}
                    className="rounded-[4px] px-1 py-1.5 text-center tabular-nums"
                    style={{ background: v === undefined ? 'transparent' : `rgba(57, 135, 229, ${0.08 + 0.85 * v})`, color: v !== undefined && v > 0.45 ? '#fff' : '#c3c2b7' }}
                  >
                    {v === undefined ? '' : c.size ? pct(v) : '–'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Accessible fallback: the numbers behind a chart. */
export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs text-gray-400">
      <summary className="cursor-pointer select-none hover:text-gray-200">View as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/5">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#1d1428] text-gray-400">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-1.5 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-white/5 text-gray-300">
                {r.map((cell, j) => (
                  <td key={j} className="px-3 py-1 tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
