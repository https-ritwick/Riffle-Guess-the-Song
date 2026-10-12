import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinAs, newPlayer, skipRecap } from './helpers'

async function answer(page: Page, playing: string | null, correct = true) {
  const choices = page.getByTestId('choices').locator('button')
  await expect(choices.first()).toBeEnabled()
  const texts = (await choices.allTextContents()).map((t) => t.replace(/^\d/, '').trim())
  const i = texts.findIndex((t) => (correct ? t === playing : t !== playing))
  expect(i, `options: ${texts.join(' | ')}, playing: ${playing}`).toBeGreaterThanOrEqual(0)
  await choices.nth(i).click()
}

test('solo: play alone, skip ahead, see the recap and a private room', async ({ browser }) => {
  const me = await newPlayer(await browser.newContext())
  await me.page.goto('/')
  await me.page.getByRole('button', { name: /Play solo/ }).click()
  await me.page.waitForURL(/\/r\/[A-Z]{4}$/)
  await expect(me.page.getByText('Solo game')).toBeVisible()
  await joinAs(me.page, 'Lone')
  await expect(me.page.getByText('Solo run')).toBeVisible()
  await expect(me.page.getByTestId('player-list')).toHaveCount(0)

  // Nobody else can join a solo room.
  const other = await newPlayer(await browser.newContext())
  await other.page.goto(me.page.url())
  await other.page.getByLabel('Your name').fill('Crasher')
  await other.page.getByRole('button', { name: 'Join game' }).click()
  await expect(other.page.getByRole('alert')).toContainText('solo game')

  await me.page.getByRole('button', { name: /^Hard/ }).click()
  await me.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await me.page.getByTestId('start-game').click()

  for (let round = 1; round <= 5; round++) {
    await expect(me.page.getByTestId('round-number')).toHaveText(String(round))
    await expect(me.page.getByTestId('choices').locator('button').first()).toBeEnabled()
    if (round === 1) {
      await me.page.screenshot({ path: 'test-screens/solo-question.png', fullPage: true })
    }
    await answer(me.page, me.currentSong(), round !== 3)
    await expect(me.page.getByTestId('reveal-title')).toBeVisible()
    await expect(me.page.getByTestId('next-up')).toBeVisible()
    if (round === 1) await me.page.screenshot({ path: 'test-screens/solo-reveal.png', fullPage: true })
    // Solo players don't wait for the reveal timer.
    await me.page.getByTestId('next-song').click()
  }

  await expect(me.page.getByTestId('recap')).toBeVisible({ timeout: 15_000 })
  await me.page.screenshot({ path: 'test-screens/solo-recap.png' })
  await skipRecap(me.page)
  await expect(me.page.getByRole('heading', { name: 'Game Complete! 🎉' })).toBeVisible()
  await expect(me.page.getByText('You got 4/5 songs right.')).toBeVisible()
  await expect(me.page.getByText('New personal best!')).toBeVisible()
  await expect(me.page.getByTestId('standings')).toHaveCount(0)
  await me.page.screenshot({ path: 'test-screens/solo-results.png', fullPage: true })
  expect(me.errors).toEqual([])
})

test('blend: players add their music, reveals show whose song it was', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guest = await newPlayer(await browser.newContext())
  const code = await createRoom(host.page, 'Mix')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Jo')

  // The guest adds a playlist to the Blend (guests can contribute even though they can't pick the music).
  await guest.page.getByRole('tab', { name: /Blend/ }).click()
  await guest.page.getByRole('button', { name: 'Add a playlist link' }).click()
  await guest.page.getByLabel('Playlist link for the Blend').fill('https://open.spotify.com/playlist/4Y3NZDQJePGNtIXx28M6uG')
  await guest.page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(guest.page.getByText('12 songs in the Blend')).toBeVisible()

  // The host sees the contribution and plays the Blend.
  await host.page.getByRole('tab', { name: /Blend/ }).click()
  await expect(host.page.getByTestId('blend-list')).toContainText('Jo')
  await host.page.getByTestId('use-blend').click()
  await expect(host.page.getByTestId('selected-source')).toHaveText('Blend')
  await expect(guest.page.getByTestId('selected-source')).toHaveText('Blend')
  await host.page.screenshot({ path: 'test-screens/blend-lobby.png', fullPage: true })

  await host.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await host.page.getByTestId('start-game').click()
  await expect(host.page.getByTestId('round-number')).toHaveText('1')
  await expect(host.page.getByTestId('choices')).toContainText('Item Song')
  await answer(host.page, host.currentSong())
  await answer(guest.page, guest.currentSong(), false)
  await expect(host.page.getByText('From Jo’s music')).toBeVisible()
  await host.page.screenshot({ path: 'test-screens/blend-reveal.png', fullPage: true })
})
