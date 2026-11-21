// Captures the screenshots listed in public/manifest.webmanifest (also usable as Play
// Store phone screenshots: 1080×1920, 9:16). Defaults to the live site so real quizzes show;
// point BASE at a local server to capture unreleased UI:
//   node scripts/build-screenshots.mjs                         (live site)
//   BASE=http://localhost:4173 node scripts/build-screenshots.mjs   (after npx vite preview)
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'https://riffle.musicquiz.workers.dev'
const shots = [
  // [file, route, viewport, pixel ratio, scroll offset in CSS px]
  ['public/screenshots/home-phone.png', '/', { width: 360, height: 640 }, 3, 0],
  ['public/screenshots/modes-phone.png', '/', { width: 360, height: 640 }, 3, 560],
  ['public/screenshots/home-wide.png', '/', { width: 1280, height: 720 }, 1.5, 0],
]

mkdirSync('public/screenshots', { recursive: true })
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' })
for (const [path, route, viewport, deviceScaleFactor, scrollY] of shots) {
  const page = await browser.newPage({ viewport, deviceScaleFactor, colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto(BASE + route, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  // Hide the "New:" announcement bar so the screenshots stay evergreen.
  await page.getByRole('button', { name: 'Dismiss' }).first().click({ timeout: 2000 }).catch(() => {})
  await page.evaluate((y) => window.scrollTo(0, y), scrollY)
  await page.waitForTimeout(2000)
  await page.screenshot({ path })
  await page.close()
  console.log('wrote', path)
}
await browser.close()
