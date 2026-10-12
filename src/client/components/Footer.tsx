import { Mail } from 'lucide-react'
import { BRAND } from '../../shared/brand'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="0.6" fill="currentColor" />
    </svg>
  )
}

const LINK = 'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white'

export function Footer() {
  return (
    <footer className="relative z-10 mx-auto w-full max-w-6xl px-4 pt-6 pb-8" data-testid="footer">
      <div className="flex flex-col items-center gap-3 border-t border-white/5 pt-6 text-sm sm:flex-row sm:justify-between">
        <p className="text-center text-gray-400 sm:text-left">
          Made with <span className="text-pink-400" aria-label="love">❤️</span> by <span className="font-semibold text-white">{BRAND.author}</span>
          <span className="block text-xs text-gray-500 sm:inline sm:before:content-['_·_']">
            Feedback? Mail{' '}
            <a href={`mailto:${BRAND.email}?subject=${encodeURIComponent(`${BRAND.name} feedback`)}`} className="text-gray-300 underline-offset-2 hover:text-white hover:underline">
              {BRAND.email}
            </a>
          </span>
        </p>
        <nav aria-label="Social links" className="flex items-center gap-1">
          <a href={`mailto:${BRAND.email}`} className={LINK} aria-label="Email">
            <Mail className="h-4 w-4" />
          </a>
          <a href={BRAND.github} target="_blank" rel="noreferrer noopener" className={LINK}>
            <GitHubIcon className="h-4 w-4" /> GitHub
          </a>
          <a href={BRAND.instagram} target="_blank" rel="noreferrer noopener" className={LINK}>
            <InstagramIcon className="h-4 w-4" /> @ritwickzzz
          </a>
        </nav>
      </div>
    </footer>
  )
}
