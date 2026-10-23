import { expect, test, type Page } from '@playwright/test'
import { createRoom, devSignIn, joinAs, newPlayer, playerNames, skipRecap } from './helpers'

async function answerCorrectly(page: Page, playing: string | null) {
  const choices = page.getByTestId('choices').locator('button')
  await expect(choices.first()).toBeEnabled()
  const texts = (await choices.allTextContents()).map((t) => t.replace(/^[A-D]/, '').trim())
  const i = texts.findIndex((t) => t === playing)
  expect(i, `options: ${texts.join(' | ')}, playing: ${playing}`).toBeGreaterThanOrEqual(0)
  await choices.nth(i).click()
}

test('host plays a pasted Spotify playlist', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  await createRoom(host.page, 'DJ')
  await host.page.getByRole('tab', { name: 'Playlists' }).click()
  await host.page.getByLabel(/Paste any public Spotify/).fill('https://open.spotify.com/playlist/4Y3NZDQJePGNtIXx28M6uG?si=x')
  await host.page.getByRole('button', { name: 'Load', exact: true }).click()
  const preview = host.page.getByTestId('playlist-preview')
  await expect(preview).toContainText('Test Item Songs')
  await expect(preview).toContainText('12 playable songs')
  await preview.getByRole('button', { name: 'Use' }).click()
  await expect(host.page.getByTestId('selected-source')).toHaveText('Test Item Songs')
  await host.page.screenshot({ path: 'test-screens/playlist-lobby.png', fullPage: true })

  await host.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await host.page.getByTestId('start-game').click()
  await expect(host.page.getByTestId('round-number')).toHaveText('1')
  await expect(host.page.getByTestId('choices')).toContainText('Item Song')
  await answerCorrectly(host.page, host.currentSong())
  await expect(host.page.getByText('✅ Correct!')).toBeVisible()
  await host.page.screenshot({ path: 'test-screens/playlist-reveal.png', fullPage: true })
})

test('guests see every option read-only and can suggest music to the host', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guest = await newPlayer(await browser.newContext())
  const code = await createRoom(host.page, 'Host')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Ben')

  // Guest can browse all tabs and settings but not change them.
  await guest.page.getByRole('tab', { name: 'Decades' }).click()
  await expect(guest.page.getByText('Only the host can change the music')).toBeVisible()
  await expect(guest.page.getByRole('switch', { name: 'Live scoring' })).toBeDisabled()
  await guest.page.screenshot({ path: 'test-screens/guest-lobby.png', fullPage: true })

  // Tapping a tile sends a suggestion; the host applies it with one tap.
  await guest.page.getByRole('button', { name: /^90s/ }).click()
  await expect(guest.page.getByText('Suggestion sent')).toBeVisible()
  await expect(host.page.getByText('Ben suggests 90s')).toBeVisible()
  await host.page.getByRole('button', { name: 'Use it' }).click()
  await expect(host.page.getByTestId('selected-source')).toHaveText('90s')
  await expect(guest.page.getByTestId('selected-source')).toHaveText('90s')

  // Host hands the host role to the guest.
  host.page.once('dialog', (d) => d.accept())
  await host.page.getByRole('button', { name: 'Make Ben the host' }).click()
  await expect(guest.page.getByTestId('start-game')).toBeVisible()
  await expect(host.page.getByTestId('start-game')).toHaveCount(0)
})

test('groups: create, invite by link and email, manage roles, play a members-only game, keep history', async ({ browser }) => {
  test.skip(!!process.env.PW_BASE_URL, 'needs the local-only developer sign-in')
  const alice = await newPlayer(await browser.newContext())
  const bob = await newPlayer(await browser.newContext())
  const carol = await newPlayer(await browser.newContext())
  const stranger = await newPlayer(await browser.newContext())
  const suffix = Date.now().toString(36)
  await devSignIn(alice.page, 'Alice Admin', `alice.${suffix}@gmail.com`)
  await devSignIn(bob.page, 'Bob Builder', `bob.${suffix}@gmail.com`)
  await devSignIn(carol.page, 'Carol Singer', `carol.${suffix}@gmail.com`)

  // Alice creates the group.
  await alice.page.goto('/groups?new=1')
  await alice.page.getByLabel('Group name').fill('Hostel Crew')
  await alice.page.getByRole('button', { name: 'Create group' }).click()
  await expect(alice.page.getByTestId('group-name')).toHaveText('Hostel Crew')

  // Bob joins with the invite link.
  const link = (await alice.page.locator('div[title*="/g/"]').getAttribute('title'))!
  expect(link).toMatch(/\/g\/[A-Za-z0-9]+$/)
  await bob.page.goto(new URL(link).pathname)
  await bob.page.getByRole('button', { name: 'Join Hostel Crew' }).click()
  await expect(bob.page.getByTestId('group-name')).toHaveText('Hostel Crew')

  // Alice sees Bob, makes him an admin, and invites Carol by email.
  await alice.page.reload()
  const members = alice.page.getByTestId('group-members')
  await expect(members).toContainText('Bob Builder')
  await alice.page.getByRole('button', { name: 'Make Bob Builder an admin' }).click()
  await expect(members.locator('li', { hasText: 'Bob Builder' })).toContainText('Admin')
  await alice.page.getByLabel('Invite by Gmail address').fill(`carol.${suffix}@gmail.com`)
  await alice.page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(alice.page.getByText(`carol.${suffix}@gmail.com`, { exact: true })).toBeVisible()
  await alice.page.screenshot({ path: 'test-screens/group-page.png', fullPage: true })

  // Carol sees the invitation on her home page and accepts it.
  await carol.page.goto('/')
  await expect(carol.page.getByText('invited you to')).toBeVisible()
  await carol.page.getByRole('button', { name: 'Accept' }).click()
  await expect(carol.page.getByTestId('group-name')).toHaveText('Hostel Crew')

  // Alice starts a game for the group and is the host.
  await alice.page.getByTestId('group-play').click()
  await alice.page.waitForURL(/\/r\/[A-Z]{4}$/)
  await expect(alice.page.getByLabel('Your name')).toHaveValue('Alice')
  await alice.page.getByRole('button', { name: 'Join game' }).click()
  await expect(alice.page.getByTestId('start-game')).toBeVisible()
  const roomPath = new URL(alice.page.url()).pathname

  // Bob's group page goes live and he jumps in.
  await bob.page.goto(bob.page.url())
  await expect(bob.page.getByTestId('group-play')).toHaveText(/Join live game/, { timeout: 15_000 })
  await bob.page.getByTestId('group-play').click()
  await bob.page.waitForURL(/\/r\/[A-Z]{4}$/)
  await joinAs(bob.page, 'Bob')
  await expect.poll(() => playerNames(alice.page)).toHaveLength(2)

  // Group games are for signed-in players: a stranger is asked to sign in before anything else.
  await stranger.page.goto(roomPath)
  await expect(stranger.page.getByRole('heading', { name: 'Sign in to join' })).toBeVisible()
  await expect(stranger.page.getByLabel('Your name')).toHaveCount(0)

  // Play one round, end the game, and the result lands on the group leaderboard.
  await alice.page.getByRole('group', { name: 'Songs' }).getByRole('button', { name: '5', exact: true }).click()
  await alice.page.getByTestId('start-game').click()
  await answerCorrectly(alice.page, await (async () => {
    await expect(alice.page.getByTestId('choices').locator('button').first()).toBeEnabled()
    return alice.currentSong()
  })())
  await bob.page.getByTestId('choices').locator('button').first().click()
  await expect(alice.page.getByTestId('reveal-title')).toBeVisible()
  alice.page.once('dialog', (d) => d.accept())
  await alice.page.getByRole('button', { name: 'End game' }).click()
  await expect(alice.page.getByText('Saved to Hostel Crew’s leaderboard')).toBeVisible()
  await skipRecap(alice.page)
  await alice.page.getByText('Saved to Hostel Crew’s leaderboard').click()
  await expect(alice.page.getByTestId('group-leaderboard')).toContainText('Alice Admin')
  await expect(alice.page.getByTestId('group-leaderboard')).toContainText('Bob Builder')
  await expect(alice.page.getByTestId('group-leaderboard').locator('li').first()).toContainText('Alice Admin')
})
