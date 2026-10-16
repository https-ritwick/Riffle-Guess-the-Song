// Generates src/shared/covers.json: real album artwork for every preset tile and
// featured playlist. Run with `npm run covers` (paced to respect iTunes rate limits).
// Only tiles without artwork are fetched; pass --all to rebuild every one.
// Requires Node 22.6+ (imports the TypeScript catalog directly).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { FEATURED_PLAYLISTS, PRESETS } from '../src/shared/catalog.ts'

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const big = (u) => (u ? u.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/, '/300x300bb.jpg') : null)

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: UA })
    if (res.ok) return res.json()
    console.warn(`HTTP ${res.status} ${url} — backing off`)
    await sleep(30_000)
  }
  return null
}

const file = new URL('../src/shared/covers.json', import.meta.url)
const previous = !process.argv.includes('--all') && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { presets: {}, playlists: {} }
const out = { presets: {}, playlists: {} }
const save = () => writeFileSync(file, JSON.stringify(out, null, 2) + '\n')

for (const p of PRESETS) {
  if (previous.presets[p.id]?.length) {
    out.presets[p.id] = previous.presets[p.id]
    continue
  }
  const country = p.country ?? 'in'
  const covers = []
  if (p.kind === 'chart') {
    const j = await getJson(`https://itunes.apple.com/${country}/rss/topsongs/limit=12${p.genre ? `/genre=${p.genre}` : ''}/json`)
    const entries = j?.feed?.entry ?? []
    for (const e of Array.isArray(entries) ? entries : [entries]) {
      const img = big(e['im:image']?.at(-1)?.label)
      if (img && !covers.includes(img)) covers.push(img)
      if (covers.length === 4) break
    }
    await sleep(3200)
  } else {
    for (const term of (p.artists ?? p.terms ?? []).slice(0, 6)) {
      if (covers.length === 4) break
      const params = new URLSearchParams({ term, country, media: 'music', entity: 'song', limit: '3' })
      if (p.artists) params.set('attribute', 'artistTerm')
      const j = await getJson(`https://itunes.apple.com/search?${params}`)
      const img = big(j?.results?.find((r) => r.artworkUrl100)?.artworkUrl100)
      if (img && !covers.includes(img)) covers.push(img)
      await sleep(3200)
    }
  }
  out.presets[p.id] = covers
  console.log(p.id, covers.length)
  // Keep progress if the run is interrupted (the final write drops removed tiles).
  writeFileSync(file, JSON.stringify({ presets: { ...previous.presets, ...out.presets }, playlists: previous.playlists }, null, 2) + '\n')
}

for (const f of FEATURED_PLAYLISTS) {
  const key = `${f.provider}:${f.id}`
  if (previous.playlists[key]) {
    out.playlists[key] = previous.playlists[key]
    continue
  }
  let cover = null
  if (f.provider === 'spotify') {
    const html = await (await fetch(`https://open.spotify.com/embed/${f.type}/${f.id}`, { headers: UA })).text()
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
    const entity = m ? JSON.parse(m[1]).props?.pageProps?.state?.data?.entity : null
    cover = entity?.coverArt?.sources?.find((s) => s.url)?.url ?? null
  } else {
    const html = await (await fetch(`https://music.apple.com/${f.country ?? 'us'}/${f.type}/x/${f.id}`, { headers: UA })).text()
    const m = html.match(/<meta property="og:image" content="([^"]+)"/)
    cover = m ? m[1] : null
  }
  out.playlists[key] = cover
  console.log(f.name, cover ? 'ok' : 'missing')
  await sleep(500)
}

save()
console.log('wrote src/shared/covers.json')
