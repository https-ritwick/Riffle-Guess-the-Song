import clsx from 'clsx'
import { Megaphone, Save, ToggleLeft, Wrench } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Banner, Features, Maintenance, SiteConfig } from '../../shared/admin'
import { useToast } from '../components/Toasts'
import { Toggle } from '../components/ui'
import { api } from '../lib/api'
import { ChartCard } from './charts'
import { ErrorNote, PageHeader, Skeleton, useAdminData } from './lib'

const FEATURES: { key: keyof Features; label: string; hint: string }[] = [
  { key: 'chat', label: 'Room chat', hint: 'Text chat and stickers in rooms' },
  { key: 'voice', label: 'Voice channel', hint: 'Peer-to-peer voice in rooms' },
  { key: 'ai', label: 'AI questions & award names', hint: 'Gemini-written challenge questions (curated bank still works)' },
  { key: 'spotify', label: 'Spotify connect', hint: 'Connecting Spotify for Blend games' },
  { key: 'groups', label: 'Creating groups', hint: 'Existing groups keep working' },
  { key: 'daily', label: 'Daily challenge', hint: 'Aaj Ka Challenge card and new daily rooms' },
]

function SaveButton({ busy, dirty, onClick }: { busy: boolean; dirty: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty || busy}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-gray-900 hover:bg-brand-50 disabled:opacity-40"
    >
      <Save className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Save'}
    </button>
  )
}

export function SettingsPage() {
  const toast = useToast()
  const { data, error, reload } = useAdminData<SiteConfig>('/api/admin/config')
  const [banner, setBanner] = useState<Banner | null>(null)
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null)
  const [features, setFeatures] = useState<Features | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!data) return
    setBanner(data.banner)
    setMaintenance(data.maintenance)
    setFeatures(data.features)
  }, [data])

  const save = async (part: keyof SiteConfig, value: unknown) => {
    setBusy(part)
    try {
      await api('/api/admin/config', { method: 'PUT', body: { [part]: value } })
      toast({ title: 'Saved', body: 'Live for everyone within about 20 seconds.', tone: 'success', durationMs: 3500 })
      reload()
    } catch (err) {
      toast({ title: 'Could not save', body: err instanceof Error ? err.message : undefined, tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  if (error) return <ErrorNote error={error} onRetry={reload} />
  if (!data || !banner || !maintenance || !features) return <Skeleton className="h-96" />

  const bannerDirty = JSON.stringify(banner) !== JSON.stringify(data.banner)
  const maintenanceDirty = JSON.stringify(maintenance) !== JSON.stringify(data.maintenance)
  const featuresDirty = JSON.stringify(features) !== JSON.stringify(data.features)

  return (
    <>
      <PageHeader title="Site settings" subtitle="Change what everyone sees — no deploy needed" />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Announcement banner"
          subtitle="The strip across the top of every page"
          right={
            <SaveButton
              busy={busy === 'banner'}
              dirty={bannerDirty}
              // A new version brings the banner back for people who dismissed the old one.
              onClick={() => void save('banner', { ...banner, version: banner.text !== data.banner.text ? String(Date.now()) : banner.version })}
            />
          }
        >
          <div className="space-y-4">
            <Toggle checked={banner.enabled} onChange={(v) => setBanner({ ...banner, enabled: v })} label="Show the banner" />
            <label className="block text-xs font-semibold text-gray-400">
              Message
              <textarea
                value={banner.text}
                onChange={(e) => setBanner({ ...banner, text: e.target.value.slice(0, 240) })}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.05] p-3 text-sm text-white outline-none focus:border-brand-400"
              />
              <span className="mt-1 block text-right font-normal text-gray-500">{banner.text.length}/240</span>
            </label>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-400">Style</p>
              <div className="flex gap-2">
                {(['brand', 'info', 'warning'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBanner({ ...banner, tone: t })}
                    aria-pressed={banner.tone === t}
                    className={clsx(
                      'h-8 flex-1 rounded-lg text-xs font-bold text-black capitalize ring-offset-2 ring-offset-[#171020]',
                      t === 'brand' && 'bg-linear-to-r from-brand-300 via-brand-500 to-rose-500',
                      t === 'info' && 'bg-sky-500',
                      t === 'warning' && 'bg-amber-400',
                      banner.tone === t && 'ring-2 ring-white',
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                <Megaphone className="h-3.5 w-3.5" /> Preview
              </p>
              <div
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-center text-sm font-semibold text-black',
                  banner.tone === 'brand' && 'bg-linear-to-r from-brand-300 via-brand-500 to-rose-500',
                  banner.tone === 'info' && 'bg-sky-500',
                  banner.tone === 'warning' && 'bg-amber-400',
                  !banner.enabled && 'opacity-40',
                )}
              >
                {banner.text || '…'}
              </div>
            </div>
          </div>
        </ChartCard>

        <div className="space-y-4">
          <ChartCard title="Maintenance mode" subtitle="Pauses new rooms for everyone except admins" right={<SaveButton busy={busy === 'maintenance'} dirty={maintenanceDirty} onClick={() => void save('maintenance', maintenance)} />}>
            <div className="space-y-4">
              <Toggle checked={maintenance.enabled} onChange={(v) => setMaintenance({ ...maintenance, enabled: v })} label="Maintenance on" hint="Games already running carry on" />
              <label className="block text-xs font-semibold text-gray-400">
                Message shown to players
                <input
                  value={maintenance.message}
                  onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value.slice(0, 240) })}
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-white outline-none focus:border-brand-400"
                />
              </label>
              {data.maintenance.enabled && (
                <p className="flex items-center gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                  <Wrench className="h-3.5 w-3.5" /> Maintenance is ON right now.
                </p>
              )}
            </div>
          </ChartCard>

          <ChartCard title="Features" subtitle="Switch parts of Riffle off without a deploy" right={<SaveButton busy={busy === 'features'} dirty={featuresDirty} onClick={() => void save('features', features)} />}>
            <div className="space-y-3">
              {FEATURES.map((f) => (
                <Toggle key={f.key} checked={features[f.key]} onChange={(v) => setFeatures({ ...features, [f.key]: v })} label={f.label} hint={f.hint} />
              ))}
            </div>
            <p className="mt-4 flex items-start gap-1.5 text-xs text-gray-500">
              <ToggleLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Chat, voice and AI switches apply to rooms as players (re)connect.
            </p>
          </ChartCard>
        </div>
      </div>
    </>
  )
}
