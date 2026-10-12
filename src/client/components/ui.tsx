import clsx from 'clsx'
import { Loader2, Music2 } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'
import { BRAND } from '../../shared/brand'
import { AVATARS } from '../../shared/rules'

export function LogoMark({ className }: { className?: string }) {
  // A record mid-spin with one bright groove: the "riff" you have to name.
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12dcef" />
          <stop offset="0.55" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="#0b0a14" />
      <circle cx="32" cy="32" r="30" fill="none" stroke="url(#logo-g)" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="23.5" fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1.2" />
      <path d="M32 8.5a23.5 23.5 0 0 1 22.3 16" fill="none" stroke="url(#logo-g)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="32" r="12" fill="url(#logo-g)" />
      <path d="M29 26.5v11l8.5-5.5z" fill="#0b0a14" />
    </svg>
  )
}

export function Logo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={size === 'lg' ? 'h-10 w-10' : 'h-7 w-7'} />
      <span className={clsx('font-extrabold tracking-tight text-white', size === 'lg' ? 'text-4xl' : 'text-xl')}>{BRAND.name}</span>
    </span>
  )
}

type Variant = 'white' | 'gradient' | 'dark' | 'danger'

const VARIANTS: Record<Variant, string> = {
  white: 'bg-white text-gray-900 font-semibold text-[15px] hover:bg-gray-100',
  gradient: 'bg-linear-to-r from-brand-500 via-violet-500 to-pink-400 text-black font-bold hover:opacity-90 shadow-lg shadow-violet-500/20',
  dark: 'bg-gray-800 border border-gray-700 text-white font-semibold hover:bg-gray-700',
  danger: 'bg-red-600/90 text-white font-semibold hover:bg-red-600',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  icon?: ReactNode
  size?: 'md' | 'sm'
}

export function Button({ variant = 'white', loading, icon, size = 'md', className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        'relative flex items-center justify-center gap-2 rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-12 px-4' : 'h-9 px-3 text-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={clsx(
        'h-12 w-full rounded-xl border border-gray-700 bg-gray-800/80 px-4 text-white outline-none placeholder:text-gray-500 focus:border-brand-500',
        className,
      )}
    />
  )
})

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-sm', className)}>{children}</div>
}

export function Avatar({ index, size = 'md', dim }: { index: number; size?: 'sm' | 'md' | 'lg'; dim?: boolean }) {
  const a = AVATARS[index % AVATARS.length]!
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full ring-2 ring-black/40',
        size === 'sm' && 'h-7 w-7 text-sm',
        size === 'md' && 'h-10 w-10 text-xl',
        size === 'lg' && 'h-16 w-16 text-3xl',
        dim && 'opacity-40 grayscale',
      )}
      style={{ backgroundColor: a.bg }}
    >
      {a.emoji}
    </span>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-400" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-brand-400" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-white">{children}</h2>
      {right}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Photos, covers

export function PlayerAvatar({
  avatar,
  photo,
  name,
  size = 'md',
  dim,
}: {
  avatar: number
  photo?: string | null
  name?: string
  size?: 'sm' | 'md' | 'lg'
  dim?: boolean
}) {
  if (!photo) return <Avatar index={avatar} size={size} dim={dim} />
  return (
    <img
      src={photo}
      alt={name ? `${name}` : ''}
      referrerPolicy="no-referrer"
      className={clsx(
        'shrink-0 rounded-full object-cover ring-2 ring-black/40',
        size === 'sm' && 'h-7 w-7',
        size === 'md' && 'h-10 w-10',
        size === 'lg' && 'h-16 w-16',
        dim && 'opacity-40 grayscale',
      )}
    />
  )
}

/** Google profile photo, or the person's initial on a colored disc. */
export function UserPhoto({ name, picture, size = 'md' }: { name: string; picture: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const cls = clsx(
    'shrink-0 rounded-full ring-2 ring-gray-900',
    size === 'xs' && 'h-6 w-6 text-[10px]',
    size === 'sm' && 'h-8 w-8 text-xs',
    size === 'md' && 'h-10 w-10 text-sm',
    size === 'lg' && 'h-14 w-14 text-lg',
  )
  if (picture) return <img src={picture} alt="" referrerPolicy="no-referrer" className={clsx(cls, 'object-cover')} />
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span className={clsx(cls, 'inline-flex items-center justify-center font-bold text-white')} style={{ backgroundColor: `hsl(${hue} 55% 42%)` }} aria-hidden="true">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/** Real album art: a single cover, or a 2×2 collage like a playlist cover. */
export function Cover({ images, size = 'md', className, label }: { images: string[]; size?: 'sm' | 'md' | 'lg' | 'xl' | 'fill'; className?: string; label?: string }) {
  const box = clsx(
    'relative shrink-0 overflow-hidden rounded-lg bg-gray-800 shadow-lg',
    size === 'sm' && 'h-12 w-12',
    size === 'md' && 'h-16 w-16',
    size === 'lg' && 'h-24 w-24',
    size === 'xl' && 'h-32 w-32',
    size === 'fill' && 'aspect-square w-full',
    className,
  )
  if (images.length === 0) {
    return (
      <span className={clsx(box, 'flex items-center justify-center bg-linear-to-br from-gray-700 to-gray-900')} aria-label={label}>
        <Music2 className="h-1/3 w-1/3 text-gray-400" />
      </span>
    )
  }
  if (images.length < 4) {
    return <img src={images[0]} alt={label ?? ''} loading="lazy" className={clsx(box, 'object-cover')} />
  }
  return (
    <span className={clsx(box, 'grid grid-cols-2 grid-rows-2')} role="img" aria-label={label}>
      {images.slice(0, 4).map((src) => (
        <img key={src} src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ))}
    </span>
  )
}

export function Toggle({ checked, onChange, disabled, label, hint }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; hint?: string }) {
  return (
    <label className={clsx('flex items-start justify-between gap-4', disabled ? 'cursor-default' : 'cursor-pointer')}>
      <span>
        <span className="block text-sm font-medium text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-default disabled:opacity-70',
          checked ? 'bg-brand-500' : 'bg-gray-700',
        )}
      >
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </label>
  )
}
