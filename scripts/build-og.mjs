// Renders the link-preview image (public/og.png) and home-screen icons with the
// locally installed Edge/Chrome. Run: node scripts/build-og.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const font = readFileSync(fileURLToPath(new URL('../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', import.meta.url))).toString('base64')

const LOGO = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12dcef"/><stop offset="0.55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#f472b6"/></linearGradient></defs>
  <circle cx="32" cy="32" r="30" fill="#0b0a14"/><circle cx="32" cy="32" r="30" fill="none" stroke="url(#g)" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="23.5" fill="none" stroke="#fff" stroke-opacity="0.09" stroke-width="1.2"/><circle cx="32" cy="32" r="19" fill="none" stroke="#fff" stroke-opacity="0.09" stroke-width="1.2"/>
  <path d="M32 8.5a23.5 23.5 0 0 1 22.3 16" fill="none" stroke="url(#g)" stroke-width="3" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="12" fill="url(#g)"/><path d="M29 26.5v11l8.5-5.5z" fill="#0b0a14"/></svg>`

const base = `<style>
  @font-face { font-family: B; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 200 800; }
  * { margin: 0; box-sizing: border-box; }
  body { font-family: B, sans-serif; background: #07060d; color: white; overflow: hidden; }
</style>`

const og = `${base}
<div style="position:relative;width:1200px;height:630px;overflow:hidden;background:#07060d">
  <div style="position:absolute;width:700px;height:700px;left:-200px;top:-250px;border-radius:50%;background:#8b5cf6;opacity:.35;filter:blur(120px)"></div>
  <div style="position:absolute;width:600px;height:600px;right:-150px;bottom:-250px;border-radius:50%;background:#12dcef;opacity:.25;filter:blur(120px)"></div>
  <div style="position:absolute;width:420px;height:420px;right:120px;top:-60px;border-radius:50%;background:#f472b6;opacity:.18;filter:blur(110px)"></div>
  <div style="position:absolute;right:-200px;top:85px;width:560px;height:560px;opacity:.95">${LOGO}</div>
  <div style="position:absolute;left:80px;top:90px;display:flex;align-items:center;gap:22px">
    <div style="width:96px;height:96px">${LOGO}</div>
    <div style="font-size:92px;font-weight:800;letter-spacing:-2px">Riffle</div>
  </div>
  <div style="position:absolute;left:80px;top:250px;width:640px;font-size:64px;font-weight:800;line-height:1.05;background:linear-gradient(90deg,#fff,#cdfbfd 60%,#ddd6fe);-webkit-background-clip:text;color:transparent">Name the song before your friends do.</div>
  <div style="position:absolute;left:80px;top:470px;display:flex;gap:14px;font-size:24px;font-weight:600">
    <span style="padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.08)">🎧 Solo &amp; party</span>
    <span style="padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.08)">✨ Spotify Blend</span>
    <span style="padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.08)">🎬 Bollywood &amp; more</span>
  </div>
</div>`

const icon = (size) => `${base}<div style="width:${size}px;height:${size}px;background:#07060d;display:flex;align-items:center;justify-content:center">
  <div style="width:${Math.round(size * 0.86)}px;height:${Math.round(size * 0.86)}px">${LOGO}</div></div>`

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' })
const shots = [
  ['public/og.png', og, 1200, 630],
  ['public/apple-touch-icon.png', icon(180), 180, 180],
  ['public/icon-512.png', icon(512), 512, 512],
  ['public/icon-192.png', icon(192), 192, 192],
]
for (const [path, html, width, height] of shots) {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path, clip: { x: 0, y: 0, width, height } })
  await page.close()
  console.log('wrote', path)
}
await browser.close()
