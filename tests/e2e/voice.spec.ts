import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinAs, newPlayer } from './helpers'

// Chrome's fake microphone plays a steady tone, so we can see audio flowing in every direction.
test.use({
  launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['microphone'],
})

/** Keep every RTCPeerConnection the page makes, so the test can read its stats. */
async function watchPeers(page: Page) {
  await page.addInitScript(() => {
    const Native = window.RTCPeerConnection
    const all: RTCPeerConnection[] = []
    ;(window as unknown as { __pcs: RTCPeerConnection[] }).__pcs = all
    window.RTCPeerConnection = class extends Native {
      constructor(config?: RTCConfiguration) {
        super(config)
        all.push(this)
      }
    } as typeof RTCPeerConnection
  })
}

/** Audio bytes received from each live connection. */
async function inbound(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const pcs = (window as unknown as { __pcs: RTCPeerConnection[] }).__pcs.filter((pc) => pc.connectionState === 'connected')
    const out: number[] = []
    for (const pc of pcs) {
      let bytes = 0
      ;(await pc.getStats()).forEach((s) => {
        if (s.type === 'inbound-rtp' && s.kind === 'audio') bytes += s.bytesReceived ?? 0
      })
      out.push(bytes)
    }
    return out
  })
}

test('voice: everyone can talk at the same time', async ({ browser }) => {
  const players = await Promise.all(['Asha', 'Kabir', 'Meera'].map(async () => newPlayer(await browser.newContext({ permissions: ['microphone'] }))))
  for (const p of players) await watchPeers(p.page)
  const code = await createRoom(players[0]!.page, 'Asha')
  for (const [i, name] of [[1, 'Kabir'], [2, 'Meera']] as const) {
    await players[i]!.page.goto(`/r/${code}`)
    await joinAs(players[i]!.page, name)
  }
  // Everyone unmutes at once.
  for (const p of players) await p.page.getByTestId('mic-toggle').click()

  for (const p of players) {
    await expect.poll(async () => (await inbound(p.page)).length, { timeout: 20_000 }).toBe(2)
  }
  // While all three talk, each player keeps receiving audio from both others.
  const before = await Promise.all(players.map((p) => inbound(p.page)))
  await players[0]!.page.waitForTimeout(2000)
  const after = await Promise.all(players.map((p) => inbound(p.page)))
  after.forEach((bytes, i) => bytes.forEach((b, j) => expect(b, `player ${i} from peer ${j}`).toBeGreaterThan(before[i]![j]! + 2000)))
})
