import clsx from 'clsx'
import { ArrowLeftRight, Check, Copy, Crown, Pencil, ExternalLink, Flame, Gauge, Headphones, Loader2, Lock, Play, QrCode, Share2, Shuffle, Sparkles, Sprout, Tv, UserX, Users, WifiOff } from 'lucide-react'
import qrcode from 'qrcode-generator'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { GUESS_SECONDS_OPTIONS, REGIONS, ROUND_OPTIONS } from '../../shared/catalog'
import type { Difficulty, Settings } from '../../shared/protocol'
import { MAX_PLAYERS } from '../../shared/rules'
import { POWER_IDS, POWERS, TEAM_IDS, TEAMS, type PowerId, type TeamId } from '../../shared/modes'
import { useTeamLabels } from '../lib/teams'
import { PowerIcon } from './powers'
import { useToast } from '../components/Toasts'
import { Button, Card, PlayerAvatar, SectionTitle, Toggle } from '../components/ui'
import { player as audio } from '../lib/audio'
import { ANTAKSHARI_MODE, describeSource, DIFFICULTY_HINTS, difficultyLabel, GAME_MODES, gameMode } from '../lib/source'
import { useRoomContext } from './context'
import { ReactionBar } from './Reactions'
import { SelectedSource, SourcePicker } from './SourcePicker'
import { useStartGame } from './useStartGame'
import { BRAND } from '../../shared/brand'

function inviteUrl(code: string) {
  return `${location.origin}/r/${code}`
}

function InviteCard() {
  const { state } = useRoomContext()
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const url = inviteUrl(state.code)

  const qrSrc = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    return qr.createDataURL(5, 2)
  }, [url])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  return (
    <Card>
      <SectionTitle>Invite friends</SectionTitle>
      <p className="text-sm text-gray-400">Room code</p>
      <p className="mb-3 font-mono text-4xl font-extrabold tracking-[0.3em] text-white sm:mb-4" data-testid="room-code">
        {state.code}
      </p>
      <div className="mb-3 hidden truncate rounded-xl border border-gray-700 bg-gray-800/80 px-3 py-2.5 text-sm text-gray-300 sm:block" title={url}>
        {url}
      </div>
      <div className="flex gap-2">
        <Button variant="dark" size="sm" className="flex-1" icon={copied ? <Check className="h-4 w-4 text-brand-400" /> : <Copy className="h-4 w-4" />} onClick={copy}>
          {copied ? 'Copied!' : 'Copy link'}
        </Button>
        {typeof navigator.share === 'function' && (
          <Button
            variant="dark"
            size="sm"
            icon={<Share2 className="h-4 w-4" />}
            onClick={() => navigator.share({ title: `Join my ${BRAND.name} game`, text: `Guess the song with me! Room code ${state.code}`, url }).catch(() => undefined)}
            aria-label="Share link"
          />
        )}
        <Button variant="dark" size="sm" icon={<QrCode className="h-4 w-4" />} onClick={() => setShowQr((v) => !v)} aria-label="Show QR code" aria-pressed={showQr} />
      </div>
      {showQr && (
        <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
          <img src={qrSrc} alt={`QR code to join room ${state.code}`} className="h-44 w-44 [image-rendering:pixelated]" />
        </div>
      )}
    </Card>
  )
}

/** Team battles: who's on which team. Tap a team to switch; the host can rename teams, move anyone or shuffle. */
function TeamsCard() {
  const { state, you, isHost, send, speaking } = useRoomContext()
  const me = state.players.find((p) => p.id === you)
  const labels = useTeamLabels(state.settings)
  const [editing, setEditing] = useState<TeamId | null>(null)
  const [draft, setDraft] = useState('')
  const rename = (t: TeamId, name: string) => {
    const clean = name.trim().slice(0, 24)
    if (clean) send({ t: 'settings', settings: { teamNames: { a: labels.a.name, b: labels.b.name, [t]: clean } } })
    setEditing(null)
  }
  return (
    <Card>
      <SectionTitle
        right={
          isHost && (
            <button type="button" onClick={() => send({ t: 'shuffleTeams' })} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-300 hover:bg-white/10" data-testid="shuffle-teams">
              <Shuffle className="h-3.5 w-3.5" /> Shuffle
            </button>
          )
        }
      >
        Teams
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2.5" data-testid="teams">
        {TEAM_IDS.map((t) => {
          const team = { ...TEAMS[t], ...labels[t] }
          const members = state.players.filter((p) => p.team === t)
          return (
            <div key={t} className={clsx('rounded-2xl p-2.5 ring-1', team.tile)} data-testid={`team-${t}`}>
{editing === t ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    rename(t, draft)
                  }}
                  className="mb-2"
                >
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, 24))}
                    onBlur={() => rename(t, draft)}
                    aria-label={`Name for ${team.name}`}
                    className="h-8 w-full rounded-lg border border-white/20 bg-black/30 px-2 text-sm font-bold text-white outline-none focus:border-brand-400"
                    data-testid={`team-name-input-${t}`}
                  />
                </form>
              ) : (
                <p className={clsx('mb-2 flex items-center gap-1 text-sm font-extrabold', team.text)}>
                  <span className="min-w-0 truncate" data-testid={`team-name-${t}`}>
                    {team.emoji} {team.name}
                  </span>
                  {isHost && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(team.name)
                        setEditing(t)
                      }}
                      aria-label={`Rename ${team.name}`}
                      className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-white/10 hover:text-white"
                      data-testid={`rename-team-${t}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </p>
              )}
              <ul className="space-y-1.5">
                {members.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} size="sm" dim={!p.connected} speaking={!!speaking?.has(p.id)} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                      {p.name}
                      {p.id === you && <span className="font-normal text-gray-400"> (you)</span>}
                    </span>
                    {isHost && p.id !== you && (
                      <button
                        type="button"
                        onClick={() => send({ t: 'team', team: t === 'a' ? 'b' : 'a', playerId: p.id })}
                        aria-label={`Move ${p.name} to ${labels[t === 'a' ? 'b' : 'a'].name}`}
                        className="rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
                {members.length === 0 && <li className="text-xs text-gray-400">Nobody yet</li>}
              </ul>
              {me && me.team !== t && (
                <button type="button" onClick={() => send({ t: 'team', team: t })} className="mt-2 w-full rounded-lg bg-white/10 py-1.5 text-xs font-bold text-white hover:bg-white/20" data-testid={`join-team-${t}`}>
                  Join {team.name}
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-gray-400">The team with the best average score per player wins, so uneven teams are fair.</p>
    </Card>
  )
}

/** Big-screen mode: open the game on a TV or laptop; phones become buzzers. */
function TvCard() {
  const { state } = useRoomContext()
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}/tv/${state.code}`
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-10 -bottom-12 h-36 w-36 rounded-full bg-sky-500/15 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
          <Tv className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white">Play on a TV</p>
          <p className="text-xs text-gray-400">
            {state.displays > 0 ? (
              <span className="font-semibold text-emerald-300" data-testid="tv-connected">📺 TV connected — phones are buzzers now.</span>
            ) : (
              <>Open this on a TV, laptop or projector: questions and music play there, phones become buzzers.</>
            )}
          </p>
        </div>
      </div>
      <div className="relative mt-3 flex gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/[0.1]" data-testid="tv-link">
          <ExternalLink className="h-4 w-4" /> Open TV screen
        </a>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(url).catch(() => undefined)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1800)
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/[0.1]"
          aria-label="Copy TV link"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="relative mt-2 truncate text-[11px] text-gray-500">{url.replace(/^https?:\/\//, '')}</p>
    </Card>
  )
}

/** How Antakshari works, shown above the music picker. */
function AntakshariCard() {
  return (
    <Card className="relative overflow-hidden">
      <div className={clsx('pointer-events-none absolute inset-0 bg-linear-to-br opacity-70', ANTAKSHARI_MODE.tone)} />
      <div className="relative">
        <p className="text-xs font-bold tracking-[0.25em] text-emerald-200 uppercase">Antakshari</p>
        <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">🎤 Gaana shuru karo!</h2>
        <p className="mt-2 text-sm text-gray-200 sm:text-base">{ANTAKSHARI_MODE.how}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold" aria-hidden="true">
          {['Tum Hi Ho', 'Hawayein', 'Naina', 'Nagada'].map((t, i, a) => (
            <span key={t} className="inline-flex items-center gap-2">
              <span className="rounded-xl bg-black/40 px-3 py-1.5 text-white ring-1 ring-white/10">
                <span className="text-emerald-300">{t[0]}</span>
                {t.slice(1)}
              </span>
              {i < a.length - 1 && <span className="text-emerald-300">→</span>}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-300">Pick big music below (a Bollywood mix or a long playlist) so the chain can keep going.</p>
      </div>
    </Card>
  )
}

function PlayersCard() {
  const { state, you, isHost, send, speaking } = useRoomContext()
  const online = state.players.filter((p) => p.connected).length
  return (
    <Card>
      <SectionTitle right={<span className="text-sm text-gray-400">{online}/{MAX_PLAYERS}</span>}>Players</SectionTitle>
      <ul className="space-y-2" data-testid="player-list">
        {state.players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2">
            <PlayerAvatar avatar={p.avatar} photo={p.photo} name={p.name} dim={!p.connected} speaking={!!speaking?.has(p.id)} />
            <span className={clsx('min-w-0 flex-1 truncate font-semibold', p.connected ? 'text-white' : 'text-gray-500')}>
              {p.name}
              {p.id === you && <span className="ml-1.5 text-sm font-normal text-gray-400">(you)</span>}
            </span>
            {!p.connected && <WifiOff className="h-4 w-4 text-gray-500" aria-label="offline" />}
            {p.id === state.hostId && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300">
                <Crown className="h-3.5 w-3.5" /> Host
              </span>
            )}
            {isHost && p.id !== you && (
              <span className="flex">
                {p.connected && (
                  <button
                    type="button"
                    onClick={() => confirm(`Make ${p.name} the host?`) && send({ t: 'makeHost', playerId: p.id })}
                    aria-label={`Make ${p.name} the host`}
                    title="Make host"
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-700 hover:text-amber-300"
                  >
                    <Crown className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => confirm(`Remove ${p.name} from the room?`) && send({ t: 'kick', playerId: p.id })}
                  aria-label={`Remove ${p.name}`}
                  title="Remove"
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-700 hover:text-red-400"
                >
                  <UserX className="h-4 w-4" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {state.players.length < 2 ? (
        <p className="mt-3 text-sm text-gray-400">Share the link — or start now and play solo.</p>
      ) : (
        <div className="mt-4 border-t border-white/5 pt-3">
          <ReactionBar compact />
        </div>
      )}
    </Card>
  )
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  format,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: readonly T[]
  format?: (v: T) => ReactNode
  onChange: (v: T) => void
  disabled: boolean
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-300">{label}</legend>
      <div className="grid gap-1 rounded-xl border border-gray-700 bg-gray-800/60 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            disabled={disabled}
            aria-pressed={o === value}
            onClick={() => onChange(o)}
            className={clsx(
              'h-9 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default',
              o === value ? 'bg-white text-gray-900' : 'text-gray-300 enabled:hover:bg-gray-700 enabled:hover:text-white',
            )}
          >
            {format ? format(o) : String(o)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function HostOnlyNote({ what }: { what: string }) {
  const { state } = useRoomContext()
  const host = state.players.find((p) => p.id === state.hostId)
  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg bg-gray-800/50 px-3 py-2 text-sm text-gray-400">
      <Lock className="h-4 w-4 shrink-0" /> Only {host?.name ?? 'the host'} can change {what}.
    </p>
  )
}

const DIFFICULTIES: { id: Difficulty; icon: typeof Sprout; tone: string }[] = [
  { id: 'easy', icon: Sprout, tone: 'from-emerald-400/25 ring-emerald-400/60' },
  { id: 'medium', icon: Gauge, tone: 'from-fuchsia-400/25 ring-fuchsia-400/60' },
  { id: 'hard', icon: Flame, tone: 'from-pink-500/30 ring-pink-400/70' },
]

function DifficultyPicker({ value, onChange, disabled }: { value: Difficulty; onChange: (d: Difficulty) => void; disabled: boolean }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-300">Difficulty</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {DIFFICULTIES.map(({ id, icon: Icon, tone }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={clsx(
              'flex items-start gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-default',
              value === id ? `border-transparent bg-linear-to-br to-transparent ring-2 ${tone}` : 'border-gray-700 bg-gray-800/40 enabled:hover:border-gray-500',
            )}
          >
            <Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', value === id ? 'text-white' : 'text-gray-400')} />
            <span>
              <span className="block font-bold text-white">{difficultyLabel(id)}</span>
              <span className="block text-xs leading-snug text-gray-400">{DIFFICULTY_HINTS[id]}</span>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function SettingsCard() {
  const { state, isHost, send } = useRoomContext()
  const s = state.settings
  const labels = useTeamLabels(s)
  const togglePower = (id: PowerId) => update({ powers: s.powers.includes(id) ? s.powers.filter((p) => p !== id) : [...s.powers, id] })
  const update = (patch: Partial<Settings>) => send({ t: 'settings', settings: patch })
  const songs = s.game === 'songs'

  return (
    <Card>
      <SectionTitle>Game settings</SectionTitle>
      {!isHost && <HostOnlyNote what="the settings" />}
      <div className="mb-5">
        <DifficultyPicker value={s.difficulty} onChange={(difficulty) => update({ difficulty })} disabled={!isHost} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Segmented label={songs ? 'Songs' : 'Questions'} value={s.rounds} options={ROUND_OPTIONS} onChange={(rounds) => update({ rounds })} disabled={!isHost} />
        <Segmented label="Seconds to guess" value={s.guessSeconds} options={GUESS_SECONDS_OPTIONS} format={(v) => `${v}s`} onChange={(guessSeconds) => update({ guessSeconds })} disabled={!isHost} />
        {songs && !s.antakshari && (
        <Segmented
          label="Guess the"
          value={s.answerType}
          options={['title', 'artist', 'mixed'] as const}
          format={(v) => (v === 'title' ? 'Song' : v === 'artist' ? 'Artist' : 'Mix')}
          onChange={(answerType) => update({ answerType })}
          disabled={!isHost}
        />
        )}
        {songs && (
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-300">Music store region</span>
          <select
            value={s.region}
            disabled={!isHost}
            onChange={(e) => update({ region: e.target.value as Settings['region'] })}
            className="h-11 w-full rounded-xl border border-gray-700 bg-gray-800/80 px-3 text-white outline-none focus:border-brand-500 disabled:opacity-80"
          >
            {REGIONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        )}
      </div>
      <div className="mt-6 grid gap-4 border-t border-gray-800 pt-5 sm:grid-cols-3">
        <Toggle label="Live scoring" hint="Points land the moment you answer" checked={s.liveScoring} disabled={!isHost} onChange={(liveScoring) => update({ liveScoring })} />
        {songs && (
          <Toggle
            label="Random clip start"
            hint="Skip past the opening hook"
            checked={s.clipStart === 'random'}
            disabled={!isHost}
            onChange={(v) => update({ clipStart: v ? 'random' : 'start' })}
          />
        )}
        <Toggle label="Double final round" hint={songs ? 'Last song scores ×2' : 'Last question scores ×2'} checked={s.doubleFinal} disabled={!isHost} onChange={(doubleFinal) => update({ doubleFinal })} />
      </div>
      <div className="mt-5 grid gap-4 border-t border-gray-800 pt-5 sm:grid-cols-2">
        <Toggle
          label="⚡ Power-ups"
          hint="Everyone gets each power-up you pick below, once per game"
          checked={s.powerUps}
          disabled={!isHost}
          onChange={(powerUps) => update({ powerUps })}
        />
        {!state.solo && (
          <Toggle
            label="⚔️ Team battle"
            hint={s.antakshari && songs ? `${labels.a.name} vs ${labels.b.name} take turns; the other side can steal for half points` : `${labels.a.name} vs ${labels.b.name} — the best average score wins`}
            checked={s.teams}
            disabled={!isHost}
            onChange={(teams) => update({ teams })}
          />
        )}
      </div>
      {s.powerUps && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-gray-300">Power-ups in this match</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="power-picker">
            {POWER_IDS.map((id) => {
              const on = s.powers.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!isHost || (on && s.powers.length === 1)}
                  onClick={() => togglePower(id)}
                  aria-pressed={on}
                  data-testid={`pick-power-${id}`}
                  className={clsx(
                    'flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition disabled:cursor-default',
                    on ? 'border-white/25 bg-white/[0.07]' : 'border-white/5 bg-transparent opacity-50 enabled:hover:opacity-80',
                  )}
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/30">
                    <PowerIcon id={id} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">
                      {POWERS[id].name}
                      {POWERS[id].rivals && <span className="ml-1.5 text-[10px] font-semibold text-gray-400 uppercase">multiplayer</span>}
                    </span>
                    <span className="block text-xs leading-snug text-gray-400">{POWERS[id].hint}</span>
                  </span>
                  {on && <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-300" />}
                </button>
              )
            })}
          </div>
          {s.powers.includes('double') && (
            <div className="mt-4 border-t border-gray-800 pt-4" data-testid="final-double">
              <Toggle
                label="Double power-up in the final round"
                hint={s.doubleFinal ? `Lets Double turn the ×2 final ${songs ? 'song' : 'question'} into ×4` : `Lets players use Double on the last ${songs ? 'song' : 'question'}`}
                checked={s.finalDouble}
                disabled={!isHost}
                onChange={(finalDouble) => update({ finalDouble })}
              />
            </div>
          )}
        </fieldset>
      )}
    </Card>
  )
}

function StartBar() {
  const { state, isHost } = useRoomContext()
  const { start, busy } = useStartGame()
  const host = state.players.find((p) => p.id === state.hostId)

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-800 bg-black/90 p-4 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
      {isHost ? (
        <Button
          variant="gradient"
          className="w-full text-lg"
          loading={busy}
          icon={<Play className="h-5 w-5 fill-current" />}
          onClick={() => {
            audio.unlock()
            void start()
          }}
          data-testid="start-game"
        >
          {busy ? (state.settings.game === 'songs' ? 'Loading songs…' : 'Setting the stage…') : 'Start game'}
        </Button>
      ) : (
        <div className="flex h-12 items-center justify-center gap-2 rounded-xl border border-gray-800 bg-gray-900/80 text-gray-300">
          {state.phase === 'loading' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-brand-400" /> {state.settings.game === 'songs' ? 'Loading songs…' : 'Setting the stage…'}
            </>
          ) : (
            <>Waiting for {host?.name ?? 'the host'} to start…</>
          )}
        </div>
      )}
    </div>
  )
}

/** Solo rooms: no invites or player list, just you and the music. */
function SoloCard() {
  const { me, state } = useRoomContext()
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        {me && <PlayerAvatar avatar={me.avatar} photo={me.photo} name={me.name} size="lg" />}
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-brand-300 uppercase">Solo run</p>
          <p className="text-xl font-extrabold text-white">{me?.name ?? 'You'}</p>
        </div>
      </div>
      <ul className="relative mt-4 space-y-2 text-sm text-gray-300">
        <li className="flex gap-2">
          <Headphones className="h-4 w-4 shrink-0 text-brand-300" />{' '}
          {state.daily ? 'Answer fast — your score goes on today’s leaderboard.' : 'Pick any game, then beat your personal best.'}
        </li>
        <li className="flex gap-2">
          <Play className="h-4 w-4 shrink-0 text-brand-300" /> Skip ahead after each reveal with <kbd className="rounded bg-gray-800 px-1">Enter</kbd>.
        </li>
      </ul>
      <Link to="/" className="relative mt-4 inline-block text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200">
        Want company? Start a party game →
      </Link>
    </Card>
  )
}

const SAMPLES: Record<string, { label: string; body: string }[]> = {
  dialogue: [
    { label: 'Dialogue', body: '“Kitne aadmi the?”' },
    { label: 'Dialogue', body: '“Bade bade deshon mein…”' },
  ],
  actor: [
    { label: 'Clue 1', body: 'Was turned down by All India Radio for his voice…' },
    { label: 'Who said it?', body: '“Mogambo khush hua!”' },
  ],
  emoji: [
    { label: 'Song', body: '🚂🕺🌳☀️' },
    { label: 'Song', body: '📅➡️🤷❓' },
  ],
}

/** Daily challenge rooms: same five questions for everyone today, one attempt. */
function DailyIntro() {
  const { state } = useRoomContext()
  const mode = gameMode(state.settings.game)
  return (
    <Card className="relative overflow-hidden">
      <div className={clsx('pointer-events-none absolute inset-0 bg-linear-to-br opacity-80', mode.tone)} />
      <div className="relative">
        <p className="text-xs font-bold tracking-[0.25em] text-brand-200 uppercase">Aaj Ka Challenge · #{state.daily}</p>
        <h2 className="mt-1 text-3xl font-black text-white">
          {mode.emoji} {mode.title}
        </h2>
        <p className="mt-2 text-gray-200">{mode.how}</p>
        <ul className="mt-4 grid gap-2 text-sm text-gray-200 sm:grid-cols-3">
          <li className="rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/10">🎯 {state.settings.rounds} questions, same for everyone</li>
          <li className="rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/10">⏱️ {state.settings.guessSeconds}s each — faster scores more</li>
          <li className="rounded-xl bg-black/30 px-3 py-2 ring-1 ring-white/10">🏆 One attempt on today’s leaderboard</li>
        </ul>
      </div>
    </Card>
  )
}

/** What are we playing tonight: songs, or one of the Bollywood challenges. */
function GamePicker() {
  const { state, isHost, send } = useRoomContext()
  const current = state.settings.game
  const antakshari = current === 'songs' && state.settings.antakshari
  const modes = [...GAME_MODES.slice(0, 1), { ...ANTAKSHARI_MODE, id: 'antakshari' as const }, ...GAME_MODES.slice(1)]
  return (
    <Card>
      <SectionTitle right={!isHost && <span className="text-xs text-gray-500">Host picks</span>}>What are we playing?</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5" role="radiogroup" aria-label="Game">
        {modes.map((m) => {
          const on = m.id === 'antakshari' ? antakshari : m.id === 'songs' ? current === 'songs' && !antakshari : m.id === current
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!isHost}
              onClick={() =>
                send({
                  t: 'settings',
                  settings: m.id === 'antakshari' ? { game: 'songs', antakshari: true, answerType: 'title' } : { game: m.id, antakshari: false },
                })
              }
              data-testid={`mode-${m.id}`}
              className={clsx(
                'group relative flex flex-col items-start overflow-hidden rounded-2xl border p-3.5 text-left transition-all disabled:cursor-default',
                on ? 'ring-marquee border-transparent bg-white/[0.07] shadow-lg shadow-rose-500/10' : 'border-white/10 bg-white/[0.02] enabled:hover:-translate-y-0.5 enabled:hover:border-white/25',
              )}
            >
              <span className={clsx('pointer-events-none absolute inset-0 bg-linear-to-br transition-opacity', m.tone, on ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} />
              <span className="relative mb-2 text-2xl drop-shadow-lg transition-transform group-hover:scale-110 sm:mb-3 sm:text-3xl" aria-hidden="true">
                {m.emoji}
              </span>
              <span className="relative block font-extrabold text-white">{m.title}</span>
              <span className="relative block text-xs leading-snug text-gray-300">{m.tagline}</span>
              {on && (
                <span className="absolute top-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-400 text-black">
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Card>
  )
}

/** Challenge games need no music: explain the round and show a taste of it. */
function ChallengeCard() {
  const { state } = useRoomContext()
  const mode = gameMode(state.settings.game)
  return (
    <Card className="relative overflow-hidden">
      <div className={clsx('pointer-events-none absolute inset-0 bg-linear-to-br opacity-70', mode.tone)} />
      <div className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] sm:items-center">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] text-brand-200 uppercase">Bollywood challenge</p>
          <h2 className="mt-1 text-3xl font-black text-white">
            {mode.emoji} {mode.title}
          </h2>
          <p className="mt-2 text-gray-200">{mode.how}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-xs font-semibold text-gray-200 ring-1 ring-white/10">
            <Sparkles className="h-3.5 w-3.5 text-brand-300" />
            {state.ai ? 'Fresh AI-written questions every game, mixed with all-time classics' : 'Hand-picked classics — no repeats until you’ve seen them all'}
          </p>
        </div>
        <div className="space-y-2" aria-hidden="true">
          {(SAMPLES[mode.id] ?? []).map((x, i) => (
            <div key={i} className="film-strip rounded-xl bg-black/50 px-4 py-4 ring-1 ring-white/10" style={{ transform: `rotate(${i ? 1.5 : -1.5}deg)` }}>
              <p className="text-[10px] font-bold tracking-[0.25em] text-gray-400 uppercase">{x.label}</p>
              <p className="mt-1 font-serif text-lg text-amber-50 italic">{x.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

export function Lobby() {
  const { state, isHost } = useRoomContext()
  const toast = useToast()
  useEffect(() => audio.stop(), [])

  return (
    <main className="mx-auto w-full max-w-6xl px-3 pb-28 sm:px-4 lg:pb-10">
      {state.group && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-3 text-sm text-fuchsia-100">
          <Users className="h-4 w-4 shrink-0" />
          <span>
            Group game for <span className="font-bold">{state.group.name}</span> — results are saved to the group’s leaderboard.
          </span>
          <Link to={`/groups/${state.group.id}`} className="ml-auto shrink-0 font-semibold text-fuchsia-200 underline-offset-2 hover:underline">
            Group page
          </Link>
        </div>
      )}
      {state.notice && (
        <div role="alert" className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {state.notice}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-2 min-w-0 space-y-4 sm:space-y-6 lg:order-1">
          {state.daily ? (
            <DailyIntro />
          ) : (
          <>
          <GamePicker />
          {state.settings.game === 'songs' && state.settings.antakshari && <AntakshariCard />}
          {state.settings.game === 'songs' ? (
            <Card>
              <SectionTitle>{isHost ? 'Choose the music' : 'Music'}</SectionTitle>
              <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <SelectedSource source={state.settings.source} size="lg" />
              </div>
              {!isHost && (
                <p className="mb-4 flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-gray-400">
                  <Lock className="h-4 w-4 shrink-0" /> Only the host can change the music — tap anything below to suggest it.
                </p>
              )}
              <SourcePicker onSuggested={(s) => toast({ title: 'Suggestion sent', body: `Asked the host to play ${describeSource(s).title}.`, tone: 'success', durationMs: 3000 })} />
            </Card>
          ) : (
            <ChallengeCard />
          )}
          </>
          )}
          {!state.daily && <SettingsCard />}
        </div>
        <aside className="order-1 min-w-0 space-y-4 sm:space-y-6 lg:order-2">
          {state.solo ? (
            <SoloCard />
          ) : (
            <>
              <InviteCard />
              {state.settings.teams ? <TeamsCard /> : <PlayersCard />}
              <TvCard />
            </>
          )}
          <StartBar />
        </aside>
      </div>
    </main>
  )
}
