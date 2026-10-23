import { LogOut, Volume2, VolumeX } from 'lucide-react'
import { useNavigate } from 'react-router'
import { LogoMark } from '../components/ui'
import { UserMenu } from '../components/UserMenu'
import { player, usePlayer } from '../lib/audio'
import { useRoomContext } from './context'
import { BRAND } from '../../shared/brand'

export function SoundControl() {
  const { volume, muted, playing } = usePlayer()
  const silent = muted || volume === 0
  return (
    <div className="flex items-center gap-2" data-testid="sound" data-playing={playing}>
      <button
        type="button"
        onClick={() => {
          player.unlock()
          player.toggleMute()
        }}
        aria-label={silent ? 'Unmute' : 'Mute'}
        className="rounded-lg p-2 text-gray-300 hover:bg-gray-800 hover:text-white"
      >
        {silent ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => {
          player.unlock()
          player.setVolume(Number(e.target.value))
        }}
        aria-label="Volume"
        className="hidden w-24 accent-brand-500 sm:block"
      />
    </div>
  )
}

export function RoomHeader() {
  const { state, leave } = useRoomContext()
  const navigate = useNavigate()

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-4">
      <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2" aria-label={`${BRAND.name} home`}>
        <LogoMark className="h-8 w-8" />
        <span className="hidden text-xl font-extrabold tracking-tight sm:inline">{BRAND.name}</span>
      </button>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="rounded-lg border border-gray-700/60 bg-gray-800/60 px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-white" title="Room code">
          {state.code}
        </span>
        <SoundControl />
        <span className="hidden md:block">
          <UserMenu />
        </span>
        <button
          type="button"
          onClick={() => {
            if (state.phase !== 'lobby' && state.phase !== 'results' && !confirm('Leave the game in progress?')) return
            leave()
            navigate('/')
          }}
          className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </header>
  )
}
