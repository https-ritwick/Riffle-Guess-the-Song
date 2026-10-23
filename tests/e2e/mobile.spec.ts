import { devices, expect, test, type Page } from '@playwright/test'
import { createRoom, joinAs, newPlayer, skipRecap } from './helpers'

const PHONE = devices['Pixel 7']

/**
 * Nothing on a phone screen may stick out past its edges: no sideways scrolling, and no
 * cards cut off by the page's clipping. Content inside sideways-scrolling strips is fine.
 */
async function fitsPhone(page: Page, where: string) {
  const problem = await page.evaluate(() => {
    const win = window.innerWidth
    if (document.documentElement.scrollWidth > win) return `page is ${document.documentElement.scrollWidth}px wide`
    const scrolls = (el: Element | null): boolean => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        const o = getComputedStyle(e).overflowX
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return true
      }
      return false
    }
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect()
      if (r.width && (r.right > win + 1 || r.left < -1) && !scrolls(el.parentElement) && getComputedStyle(el).position !== 'fixed') {
        return `<${el.tagName.toLowerCase()} class="${el.className.toString().slice(0, 90)}"> spans ${Math.round(r.left)}–${Math.round(r.right)}px`
      }
    }
    return null
  })
  expect(problem, `${where}: ${problem} on a ${PHONE.viewport.width}px phone`).toBeNull()
}

test('phone: a party game is comfortable to play on a phone', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext({ ...PHONE }))
  const guest = await newPlayer(await browser.newContext({ ...PHONE }))

  await host.page.goto('/')
  await fitsPhone(host.page, 'home')
  await host.page.screenshot({ path: 'test-screens/phone-home.png', fullPage: true })

  const code = await createRoom(host.page, 'Asha')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Kabir')
  await fitsPhone(host.page, 'lobby (host)')
  await fitsPhone(guest.page, 'lobby (guest)')
  await host.page.screenshot({ path: 'test-screens/phone-lobby-host.png', fullPage: true })
  await guest.page.screenshot({ path: 'test-screens/phone-lobby-guest.png', fullPage: true })

  await host.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await host.page.getByTestId('start-game').click()

  for (let round = 1; round <= 5; round++) {
    for (const p of [host, guest]) {
      await expect(p.page.getByTestId('round-number')).toHaveText(String(round))
      const choices = p.page.getByTestId('choices').locator('button')
      await expect(choices.first()).toBeEnabled()
      if (round === 1 && p === host) {
        await fitsPhone(p.page, 'question')
        // The answers must be reachable without scrolling.
        const box = await choices.nth(3).boundingBox()
        expect(box!.y + box!.height, 'fourth answer is below the fold').toBeLessThanOrEqual(PHONE.viewport.height)
        await p.page.screenshot({ path: 'test-screens/phone-question.png' })
      }
      await choices.nth(round % 4).click()
    }
    await expect(host.page.getByTestId('reveal-title')).toBeVisible()
    if (round === 1) {
      await fitsPhone(host.page, 'reveal')
      await host.page.screenshot({ path: 'test-screens/phone-reveal.png' })
    }
  }

  await expect(host.page.getByTestId('recap')).toBeVisible({ timeout: 30_000 })
  await host.page.screenshot({ path: 'test-screens/phone-recap.png' })
  await skipRecap(host.page)
  await fitsPhone(host.page, 'results')
  await host.page.screenshot({ path: 'test-screens/phone-results.png', fullPage: true })

  await host.page.getByTestId('chat-dock').getByRole('button').last().click()
  await expect(host.page.getByTestId('chat-panel')).toBeVisible()
  await fitsPhone(host.page, 'chat')
  await host.page.screenshot({ path: 'test-screens/phone-chat.png' })
})
