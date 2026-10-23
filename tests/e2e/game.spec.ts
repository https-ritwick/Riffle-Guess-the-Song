import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinAs, newPlayer, playerNames, skipRecap } from './helpers'

async function chooseOption(page: Page, predicate: (text: string) => boolean) {
  const choices = page.getByTestId('choices').locator('button')
  await expect(choices.first()).toBeEnabled()
  const texts = (await choices.allTextContents()).map((t) => t.replace(/^[A-D]/, '').trim())
  const index = texts.findIndex(predicate)
  expect(index, `options were ${texts.join(' | ')}`).toBeGreaterThanOrEqual(0)
  await choices.nth(index).click()
  return texts[index]!
}

test('two friends play a full game in real time', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guest = await newPlayer(await browser.newContext())

  const code = await createRoom(host.page, 'Asha')
  await host.page.screenshot({ path: 'test-screens/lobby-host.png', fullPage: true })

  // Guest opens the shared link.
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Ben')

  // Both lobbies update live.
  await expect.poll(() => playerNames(host.page)).toEqual([expect.stringContaining('Asha'), expect.stringContaining('Ben')])
  await expect.poll(() => playerNames(guest.page)).toHaveLength(2)
  await expect(guest.page.getByText('Waiting for Asha to start')).toBeVisible()

  // Host picks the 80s mix and a short game; the guest sees the settings change.
  await host.page.getByRole('tab', { name: 'Decades' }).click()
  await host.page.getByRole('button', { name: /^80s/ }).click()
  await host.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await host.page.getByRole('group', { name: 'Seconds to guess' }).getByRole('button', { name: '20s' }).click()
  await expect(guest.page.getByTestId('selected-source')).toHaveText('80s')
  await expect(guest.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(guest.page.getByRole('group', { name: 'Seconds to guess' }).getByRole('button', { name: '20s' })).toHaveAttribute('aria-pressed', 'true')
  await guest.page.screenshot({ path: 'test-screens/lobby-guest.png', fullPage: true })

  await host.page.getByTestId('start-game').click()

  for (let round = 1; round <= 5; round++) {
    await expect(host.page.getByTestId('round-number')).toHaveText(String(round))
    await expect(guest.page.getByTestId('round-number')).toHaveText(String(round))

    // Host answers correctly (the playing preview tells us the song), guest answers wrong.
    await expect(host.page.getByTestId('choices').locator('button').first()).toBeEnabled()
    const playing = host.currentSong()
    expect(playing).toBeTruthy()
    await chooseOption(host.page, (t) => t === playing)
    // First right answer earns the bonus.
    await expect(host.page.getByText('⚡ First!')).toBeVisible()
    if (round === 1) await host.page.screenshot({ path: 'test-screens/question-answered.png', fullPage: true })

    // Live scoring: the guest's leaderboard shows the host's answer and points before the guest answers.
    const hostRow = guest.page.getByTestId('scoreboard').locator('li[data-player="Asha"]')
    await expect(hostRow).toContainText('answered in')
    await expect(hostRow).toContainText('+')
    if (round === 1) {
      await expect(guest.page.getByTestId('scoreboard').locator('li').first()).toHaveAttribute('data-player', 'Asha')
      await guest.page.screenshot({ path: 'test-screens/live-scoreboard.png', fullPage: true })
    }
    await chooseOption(guest.page, (t) => t !== playing)

    // Everyone answered -> immediate reveal with the real title on both screens.
    await expect(host.page.getByTestId('reveal-title')).toHaveText(playing!)
    await expect(guest.page.getByTestId('reveal-title')).toHaveText(playing!)
    await expect(host.page.getByText('✅ Correct!')).toBeVisible()
    await expect(guest.page.getByText('❌ Wrong answer')).toBeVisible()
    // Hard (the default) charges for wrong guesses (double on the final song).
    await expect(guest.page.getByText('❌ Wrong answer')).toContainText(/−[12]00/)
    if (round === 1) {
      await host.page.screenshot({ path: 'test-screens/reveal-host.png', fullPage: true })
      await guest.page.screenshot({ path: 'test-screens/reveal-guest.png', fullPage: true })
    }
  }

  // Results: host wins with a positive score, guest scores 0.
  await expect(host.page.getByRole('heading', { name: 'Game Complete! 🎉' })).toBeVisible({ timeout: 20_000 })
  await expect(guest.page.getByRole('heading', { name: 'Game Complete! 🎉' })).toBeVisible()
  await expect(host.page.getByTestId('recap')).toBeVisible()
  await host.page.screenshot({ path: 'test-screens/results-recap.png' })
  await skipRecap(host.page)
  await skipRecap(guest.page)
  const hostScore = Number((await host.page.getByTestId('final-score').textContent())!.replace(/,/g, ''))
  expect(hostScore).toBeGreaterThanOrEqual(5 * 500)
  await expect(guest.page.getByTestId('final-score')).toHaveText('0')
  await expect(host.page.getByTestId('standings').locator('li').first()).toContainText('Asha')
  // Award names change every game; the winners and what they won for don't.
  await expect(host.page.getByTestId('awards')).toContainText(/Asha\s*\d\.\d\ds on /)
  expect(await host.page.getByTestId('awards').locator('li').count()).toBeGreaterThanOrEqual(3)
  await expect(host.page.getByTestId('footer')).toContainText('Made with')
  await expect(guest.page.getByText('You got 0/5 songs right.')).toBeVisible()
  await host.page.screenshot({ path: 'test-screens/results-host.png', fullPage: true })

  // Play again restarts for everybody with fresh scores.
  await host.page.getByTestId('play-again').click()
  await expect(guest.page.getByTestId('round-number')).toHaveText('1')
  await expect(guest.page.getByTestId('my-score')).toHaveText('0')

  // Host ends early, then goes back to the lobby; guest follows.
  host.page.once('dialog', (d) => d.accept())
  await host.page.getByRole('button', { name: 'End game' }).click()
  await expect(guest.page.getByRole('heading', { name: 'Game Complete! 🎉' })).toBeVisible()
  await skipRecap(host.page)
  await host.page.getByTestId('change-music').click()
  await expect(guest.page.getByTestId('player-list')).toBeVisible()
  await expect(host.page.getByTestId('start-game')).toBeVisible()

  expect(host.errors).toEqual([])
  expect(guest.errors).toEqual([])
})

test('time runs out when nobody answers', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  await createRoom(host.page, 'Solo')
  await host.page.getByRole('tab', { name: 'Top Charts' }).click()
  await host.page.getByRole('button', { name: /^Top Songs/ }).click()
  await host.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await host.page.getByRole('group', { name: 'Seconds to guess' }).getByRole('button', { name: '10s' }).click()
  await host.page.getByTestId('start-game').click()

  await expect(host.page.getByText('What’s the song?')).toBeVisible({ timeout: 10_000 })
  await expect(host.page.getByText('⏰ Time’s up!')).toBeVisible({ timeout: 15_000 })
  await expect(host.page.getByTestId('reveal-title')).toContainText('Chart Song')
  // The reveal counts down to the next song, which starts on its own with no 3-2-1 in between.
  await expect(host.page.getByTestId('next-up')).toContainText('Next song')
  await expect(host.page.getByTestId('round-number')).toHaveText('2', { timeout: 15_000 })
  await expect(host.page.getByText('Get ready…')).toHaveCount(0)
  await expect(host.page.getByText('What’s the song?')).toBeVisible()
})

test('host can pick an artist and the game uses their songs', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  await createRoom(host.page, 'Dee')
  await host.page.getByRole('tab', { name: 'Artist' }).click()
  await host.page.getByLabel('Search for an artist').fill('Fixture')
  await host.page.getByRole('button', { name: /Fixture Band 2/ }).click()
  await expect(host.page.getByText('Fixture Band 2').first()).toBeVisible()
  await host.page.getByTestId('start-game').click()
  await expect(host.page.getByTestId('round-number')).toHaveText('1')
  await expect(host.page.getByTestId('choices')).toContainText('Lookup Track')
})

test('free-text search source works', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  await createRoom(host.page, 'Eve')
  await host.page.getByRole('tab', { name: 'Search' }).click()
  await host.page.getByLabel('Song search').fill('road trip')
  await host.page.getByRole('button', { name: 'Use', exact: true }).click()
  await expect(host.page.getByText('“road trip”').first()).toBeVisible()
  await host.page.getByTestId('start-game').click()
  // The fake search only returns 4 songs, so the game is shortened and says so.
  await expect(host.page.getByText(/Only 4 different songs were found/)).toBeVisible()
  await expect(host.page.getByTestId('choices')).toContainText('road trip Hit')
})
