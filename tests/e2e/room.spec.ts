import { expect, test } from '@playwright/test'
import { createRoom, joinAs, newPlayer, playerNames } from './helpers'

test('home page: join validation and unknown rooms', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Create a game' })).toBeVisible()
  await page.screenshot({ path: 'test-screens/home.png', fullPage: true })

  await page.getByRole('button', { name: 'Join with a code' }).click()
  await expect(page.getByRole('heading', { name: 'What’s the room code?' })).toBeVisible()
  const join = page.getByRole('button', { name: 'Join game' })
  await expect(join).toBeDisabled()
  await page.getByLabel('Room code').fill('zz1q')
  await expect(page.getByLabel('Room code')).toHaveValue('ZZQ')
  await page.getByLabel('Room code').fill('QQQQ')
  await join.click()
  await expect(page.getByRole('alert')).toHaveText('No game found with code QQQQ.')
  await page.screenshot({ path: 'test-screens/home-join.png', fullPage: true })

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('button', { name: 'Create a game' })).toBeVisible()

  await page.goto('/r/WXYZ')
  await expect(page.getByRole('heading', { name: 'Room not found' })).toBeVisible()
  await page.goto('/r/12')
  await expect(page.getByRole('heading', { name: 'Invalid room link' })).toBeVisible()
})

test('refreshing keeps your seat; second tab takes it over', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guestContext = await browser.newContext()
  const guest = await newPlayer(guestContext)
  const code = await createRoom(host.page, 'Host')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Kiran')
  await expect.poll(() => playerNames(host.page)).toHaveLength(2)

  // Reload: rejoins automatically as the same player, no duplicate.
  await guest.page.reload()
  await expect(guest.page.getByTestId('player-list')).toBeVisible()
  await expect.poll(() => playerNames(host.page)).toHaveLength(2)
  await expect(guest.page.getByText('(you)')).toBeVisible()

  // Same browser profile, new tab: the new tab takes the seat, the old one is told.
  const second = await guestContext.newPage()
  await second.goto(`/r/${code}`)
  await expect(second.getByTestId('player-list')).toBeVisible()
  await expect(guest.page.getByRole('heading', { name: 'Opened in another tab' })).toBeVisible()
  await expect.poll(() => playerNames(host.page)).toHaveLength(2)
})

test('host can remove a player', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guest = await newPlayer(await browser.newContext())
  const code = await createRoom(host.page, 'Boss')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Troll')
  await expect.poll(() => playerNames(host.page)).toHaveLength(2)

  host.page.once('dialog', (d) => d.accept())
  await host.page.getByRole('button', { name: 'Remove Troll' }).click()
  await expect(guest.page.getByRole('heading', { name: 'You were removed' })).toBeVisible()
  await expect.poll(() => playerNames(host.page)).toHaveLength(1)
})

test('guests cannot change anything, and host role passes on when the host leaves', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guest = await newPlayer(await browser.newContext())
  const code = await createRoom(host.page, 'Leaver')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Stayer')

  await expect(guest.page.getByTestId('start-game')).toHaveCount(0)
  await expect(guest.page.getByRole('group', { name: 'Songs' }).getByRole('button').first()).toBeDisabled()
  // Guests can browse the categories, but picking one only suggests it.
  await guest.page.getByRole('tab', { name: 'Decades' }).click()
  await guest.page.getByRole('button', { name: /^70s/ }).click()
  await expect(guest.page.getByTestId('selected-source')).toHaveText('Bollywood Hits')

  // Host's connection drops; after the grace period the guest becomes host.
  await host.page.context().close()
  await expect(guest.page.getByTestId('start-game')).toBeVisible({ timeout: 30_000 })
  await expect(guest.page.getByTestId('player-list').locator('li', { hasText: 'Stayer' })).toContainText('Host')
})

test('lobby and game fit a phone screen', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const host = await newPlayer(context)
  await createRoom(host.page, 'Phone')
  const overflow = () => host.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(await overflow()).toBeLessThanOrEqual(0)
  await host.page.screenshot({ path: 'test-screens/mobile-lobby.png', fullPage: true })

  await host.page.getByTestId('start-game').click()
  await expect(host.page.getByTestId('choices').locator('button').first()).toBeEnabled({ timeout: 15_000 })
  expect(await overflow()).toBeLessThanOrEqual(0)
  await host.page.screenshot({ path: 'test-screens/mobile-question.png', fullPage: true })
})
