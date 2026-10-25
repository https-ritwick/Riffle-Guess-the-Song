import { expect, test, type Page } from '@playwright/test'
import { createRoom, devSignIn, joinAs, newPlayer, skipRecap } from './helpers'

async function startFive(host: Page) {
  await host.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await host.getByTestId('start-game').click()
}

test('power-ups and team battle', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guest = await newPlayer(await browser.newContext())
  const code = await createRoom(host.page, 'Asha')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Kabir')

  await host.page.getByRole('switch', { name: /Power-ups/ }).click()
  await host.page.getByRole('switch', { name: /Team battle/ }).click()
  // Two players are dealt into two teams.
  await expect(host.page.getByTestId('team-a').getByText(/Asha|Kabir/)).toHaveCount(1)
  await expect(host.page.getByTestId('team-b').getByText(/Asha|Kabir/)).toHaveCount(1)
  // Switching sides, then back.
  const guestTeam = (await guest.page.getByTestId('team-a').getByText('Kabir').count()) ? 'a' : 'b'
  await guest.page.getByTestId(`join-team-${guestTeam === 'a' ? 'b' : 'a'}`).click()
  await expect(host.page.getByTestId(`team-${guestTeam === 'a' ? 'b' : 'a'}`).getByText('Kabir')).toBeVisible()
  await host.page.getByTestId('shuffle-teams').click()
  await expect(host.page.getByTestId('team-a').getByText(/Asha|Kabir/)).toHaveCount(1)

  // The host renames a team; everyone sees the new name.
  await host.page.getByTestId('rename-team-a').click()
  await host.page.getByTestId('team-name-input-a').fill('Rockstars')
  await host.page.getByTestId('team-name-input-a').press('Enter')
  await expect(guest.page.getByTestId('team-name-a')).toContainText('Rockstars')

  // All seven power-ups are offered; the host can switch one off.
  await expect(host.page.getByTestId('power-picker').locator('button')).toHaveCount(7)
  await host.page.getByTestId('pick-power-peek').click()
  await expect(host.page.getByTestId('pick-power-peek')).toHaveAttribute('aria-pressed', 'false')

  await startFive(host.page)
  const options = async () => (await host.page.getByTestId('choices').locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))).map((l) => l.replace(/^[A-D]: /, ''))
  const finishRound = async (round: number) => {
    await guest.page.getByTestId('choices').locator('button').first().click()
    await expect(host.page.getByTestId('reveal-title')).toBeVisible()
    await expect(host.page.getByTestId('round-number')).toHaveText(String(round + 1), { timeout: 20_000 })
  }

  // Round 1: a 50-50 takes two wrong answers away. Crowd peek was switched off.
  await expect(host.page.getByTestId('choices').locator('button').first()).toBeEnabled()
  await expect(host.page.getByTestId('power-peek')).toHaveCount(0)
  await host.page.getByTestId('power-fifty').click()
  await expect(host.page.getByTestId('choices').locator('button[aria-label$="(removed)"]')).toHaveCount(2)
  await expect(host.page.getByTestId('power-fifty')).toHaveAttribute('aria-pressed', 'true')
  await host.page.getByTestId('choices').locator('button:not([disabled])').first().click()
  await finishRound(1)

  // Round 2: the 50-50 is used up; a Hint shows the first letter.
  await expect(host.page.getByTestId('power-fifty')).toBeDisabled()
  await host.page.getByTestId('power-hint').click()
  await expect(host.page.getByTestId('power-note')).toContainText('Hint: starts with')
  await host.page.getByTestId('choices').locator('button').first().click()
  await finishRound(2)

  // Round 3: Second chance — a wrong first pick only takes that option away.
  await expect(host.page.getByTestId('choices').locator('button').first()).toBeEnabled()
  await host.page.getByTestId('power-retry').click()
  const playing = host.currentSong()
  const texts = await options()
  await host.page.getByTestId('choices').locator('button').nth(texts.findIndex((t) => t !== playing)).click()
  await expect(host.page.getByTestId('power-note')).toContainText('second chance')
  await expect(host.page.getByTestId('choices').locator('button[aria-label$="(removed)"]')).toHaveCount(1)
  await host.page.getByTestId('choices').locator('button').nth(texts.indexOf(playing!)).click()
  await expect(host.page.getByTestId('team-standings')).toBeVisible()
  await guest.page.getByTestId('choices').locator('button').first().click()
  await expect(host.page.getByTestId('reveal-title')).toBeVisible()

  host.page.once('dialog', (d) => void d.accept())
  await host.page.getByRole('button', { name: 'End game' }).click()
  // The recap ("That's a wrap") has a team battle slide.
  await expect(host.page.getByTestId('recap')).toBeVisible()
  for (let i = 0; i < 12 && !(await host.page.getByTestId('recap-team').count()); i++) await host.page.keyboard.press('ArrowRight')
  await expect(host.page.getByTestId('recap-team')).toBeVisible()
  await expect(host.page.getByTestId('recap')).toContainText(/wins!|tie/)
  await host.page.keyboard.press('Space')
  await host.page.keyboard.press('ArrowLeft')
  await host.page.mouse.move(640, 360)
  await host.page.mouse.down()
  await host.page.waitForTimeout(1500)
  await host.page.screenshot({ path: 'test-screens/recap-team.png' })
  await host.page.mouse.up()
  await skipRecap(host.page)
  await expect(host.page.getByTestId('winner-line')).toContainText(/wins!|tied/)
  await expect(host.page.getByTestId('team-result')).toContainText(/wins!|tie/)
  await host.page.screenshot({ path: 'test-screens/teams-results.png', fullPage: true })
})

test('TV mode: the big screen shows the game and phones become buzzers', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const tv = await newPlayer(await browser.newContext({ viewport: { width: 1920, height: 1080 } }))
  const code = await createRoom(host.page, 'Asha')

  await tv.page.goto(`/tv/${code}`)
  await tv.page.getByTestId('tv-start').click()
  await expect(tv.page.getByTestId('tv-code')).toHaveText(code)
  await expect(host.page.getByTestId('tv-connected')).toBeVisible()
  await tv.page.screenshot({ path: 'test-screens/tv-lobby.png' })

  await startFive(host.page)
  await expect(host.page.getByTestId('tv-hint')).toBeVisible()
  await expect(tv.page.getByText('What’s the song?')).toBeVisible({ timeout: 15_000 })
  await tv.page.screenshot({ path: 'test-screens/tv-question.png' })
  await host.page.getByTestId('choices').locator('button').first().click()
  await expect(tv.page.getByText('Leaderboard')).toBeVisible({ timeout: 15_000 })
  await tv.page.screenshot({ path: 'test-screens/tv-reveal.png' })
})

test('Antakshari: the letter banner shows each round', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  await createRoom(host.page, 'Asha')
  await host.page.getByTestId('mode-antakshari').click()
  await expect(host.page.getByText('Gaana shuru karo!')).toBeVisible()
  await host.page.getByTestId('start-game').click()
  await expect(host.page.getByTestId('antakshari-banner')).toBeVisible({ timeout: 20_000 })
  await expect(host.page.getByTestId('choices').locator('button').first()).toBeEnabled()
  // Every option starts with the same letter, so the letter never gives the answer away.
  const labels = await host.page.getByTestId('choices').locator('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
  const options = labels.map((l) => l.replace(/^[A-D]: /, '').trim()[0]?.toLowerCase())
  expect(new Set(options).size).toBe(1)
})

test('player-made quiz: build, share and play', async ({ browser }) => {
  const maker = await newPlayer(await browser.newContext())
  await devSignIn(maker.page, 'Quiz Maker', `maker${Date.now()}@example.com`)
  await maker.page.goto('/quizzes/new')
  await maker.page.getByLabel('Title').fill('Test Item Bangers')
  await maker.page.getByLabel('Playlist link').fill('https://open.spotify.com/playlist/4Y3NZDQJePGNtIXx28M6uG')
  await maker.page.getByRole('button', { name: 'Import' }).click()
  await expect(maker.page.getByTestId('quiz-count')).toHaveText('12/50')
  await maker.page.getByTestId('quiz-save').click()
  await expect(maker.page.getByTestId('quiz-title')).toHaveText('Test Item Bangers')
  const quizUrl = maker.page.url()

  // Anyone with the link can play it.
  const player = await newPlayer(await browser.newContext())
  await player.page.goto(quizUrl)
  await player.page.getByTestId('quiz-play-solo').click()
  await player.page.waitForURL(/\/r\/[A-Z]{4}$/)
  await joinAs(player.page, 'Fan')
  await expect(player.page.getByTestId('selected-source')).toHaveText('Test Item Bangers')
  await player.page.getByTestId('start-game').click()
  await expect(player.page.getByTestId('choices')).toContainText('Item Song', { timeout: 20_000 })

  // It's listed on the Quizzes page too.
  await player.page.goto('/quizzes?sort=new')
  await player.page.getByRole('button', { name: '✨ New' }).click()
  await expect(player.page.getByTestId('quiz-card').filter({ hasText: 'Test Item Bangers' }).first()).toBeVisible()
})
