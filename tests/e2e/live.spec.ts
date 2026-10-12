// Smoke test against the REAL iTunes catalog and audio CDN (no mocks).
// Skipped by default; run with:  LIVE=1 npx playwright test live
import { expect, test } from '@playwright/test'
import { createRoom } from './helpers'

test.skip(!process.env.LIVE, 'set LIVE=1 to hit the real iTunes API')

for (const [tab, tile] of [
  ['Desi', 'Bollywood Hits'],
  ['Decades', '80s'],
  ['Top Charts', 'Top Songs'],
] as const) {
  test(`real songs load and play: ${tile}`, async ({ page }) => {
    const audio: number[] = []
    page.on('response', (res) => {
      if (res.url().startsWith('https://audio-ssl.itunes.apple.com/')) audio.push(res.status())
    })
    await createRoom(page, 'Live')
    await page.getByRole('tab', { name: tab }).click()
    await page.getByRole('button', { name: new RegExp(`^${tile}`) }).click()
    await page.getByTestId('start-game').click()

    await expect(page.getByTestId('round-number')).toHaveText('1', { timeout: 30_000 })
    await expect(page.getByTestId('choices').locator('button').first()).toBeEnabled({ timeout: 10_000 })
    const options = await page.getByTestId('choices').locator('button').allTextContents()
    expect(new Set(options).size).toBe(4)
    await expect(page.getByTestId('sound')).toHaveAttribute('data-playing', 'true', { timeout: 10_000 })
    expect(audio.some((s) => s === 200 || s === 206)).toBe(true)

    await page.getByTestId('choices').locator('button').first().click()
    await expect(page.getByTestId('reveal-title')).not.toBeEmpty()
    await page.screenshot({ path: `test-screens/live-${tile.replace(/\W+/g, '-').toLowerCase()}.png`, fullPage: true })
  })
}
