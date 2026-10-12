import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BRAND } from '../../shared/brand'

/** Shows a friendly reload screen instead of a blank page if rendering ever crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#07060d] p-6 text-center text-white">
        <div className="max-w-sm">
          <p className="mb-2 text-5xl">🎬</p>
          <h1 className="mb-2 text-2xl font-black">“Picture abhi baaki hai…”</h1>
          <p className="mb-6 text-gray-400">Something went wrong on this screen. Reloading usually fixes it, and you’ll keep your seat in the game.</p>
          <button type="button" onClick={() => location.reload()} className="h-12 w-full rounded-xl bg-white font-semibold text-gray-900 hover:bg-gray-100">
            Reload {BRAND.name}
          </button>
          <a href={`mailto:${BRAND.email}?subject=${encodeURIComponent(`${BRAND.name} bug`)}&body=${encodeURIComponent(String(this.state.error?.message ?? ''))}`} className="mt-4 inline-block text-sm text-gray-400 underline-offset-2 hover:text-white hover:underline">
            Report this bug
          </a>
        </div>
      </div>
    )
  }
}
