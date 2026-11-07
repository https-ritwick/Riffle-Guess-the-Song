import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinAs, newPlayer } from './helpers'

async function openChat(page: Page) {
  await page.getByTestId('chat-toggle').click()
  await expect(page.getByTestId('chat-panel')).toBeVisible()
}

function lastMine(page: Page) {
  return page.getByTestId('chat-messages').getByTestId('chat-message').last()
}

test('chat works like a WhatsApp group: typing, replies, ticks and message info', async ({ browser }) => {
  const host = await newPlayer(await browser.newContext())
  const guest = await newPlayer(await browser.newContext())
  const code = await createRoom(host.page, 'Asha')
  await guest.page.goto(`/r/${code}`)
  await joinAs(guest.page, 'Bilal')

  await openChat(host.page)
  await openChat(guest.page)

  // Typing shows in the header and as a bubble of dots.
  await guest.page.getByLabel('Message', { exact: true }).pressSequentially('hello every')
  await expect(host.page.getByTestId('chat-subtitle')).toHaveText('Bilal is typing…')
  await expect(host.page.getByTestId('chat-typing')).toBeVisible()
  await guest.page.getByLabel('Message', { exact: true }).pressSequentially('one')
  await guest.page.keyboard.press('Enter')
  await expect(host.page.getByTestId('chat-messages')).toContainText('hello everyone')
  await expect(host.page.getByTestId('chat-typing')).toHaveCount(0)
  await expect(host.page.getByTestId('chat-subtitle')).not.toContainText('typing')

  // Both have the chat open: blue ticks.
  await host.page.getByLabel('Message', { exact: true }).fill('hey Bilal')
  await host.page.keyboard.press('Enter')
  await expect(lastMine(host.page).getByTestId('chat-ticks')).toHaveAttribute('data-state', 'read')

  // Chat closed on the other side: delivered (two grey ticks), read once they open it.
  await guest.page.getByTestId('chat-toggle').click()
  await expect(guest.page.getByTestId('chat-panel')).toBeHidden()
  await host.page.getByLabel('Message', { exact: true }).fill('you there?')
  await host.page.keyboard.press('Enter')
  await expect(lastMine(host.page).getByTestId('chat-ticks')).toHaveAttribute('data-state', 'delivered')
  await openChat(guest.page)
  await expect(guest.page.getByTestId('chat-unread-divider')).toContainText('1 unread message')
  await expect(lastMine(host.page).getByTestId('chat-ticks')).toHaveAttribute('data-state', 'read')

  // Reply to a message (hover → Reply): the reply quotes it on everyone's screen.
  const original = host.page.getByTestId('chat-message').filter({ hasText: 'hello everyone' })
  await original.hover()
  await original.getByRole('button', { name: 'Reply' }).click()
  await expect(host.page.getByTestId('chat-replying')).toContainText('hello everyone')
  await host.page.getByLabel('Message', { exact: true }).fill('welcome!')
  await host.page.keyboard.press('Enter')
  await expect(host.page.getByTestId('chat-replying')).toHaveCount(0)
  const reply = guest.page.getByTestId('chat-message').filter({ hasText: 'welcome!' })
  await expect(reply.getByTestId('chat-quote')).toContainText('You')
  await expect(reply.getByTestId('chat-quote')).toContainText('hello everyone')

  // Message info: who read it.
  await lastMine(host.page).click({ button: 'right' })
  await expect(host.page.getByTestId('chat-selection')).toBeVisible()
  await host.page.getByRole('button', { name: 'Message info' }).click()
  await expect(host.page.getByTestId('chat-info-read')).toContainText('Bilal')
  await host.page.getByRole('button', { name: 'Back to chat' }).click()
  await expect(host.page.getByTestId('chat-info')).toHaveCount(0)

  // Tapping a quote jumps to the original message.
  await reply.getByTestId('chat-quote').click()
  await expect(guest.page.getByTestId('chat-message').filter({ hasText: 'hello everyone' }).first()).toHaveClass(/msg-flash/)

  // Phones: swipe a message to the right to reply to it.
  await guest.page.getByTestId('chat-message').filter({ hasText: 'you there?' }).evaluate((li) => {
    const r = li.getBoundingClientRect()
    const at = (type: string, x: number) =>
      li.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 7, clientX: x, clientY: r.top + r.height / 2 }))
    at('pointerdown', r.left + 60)
    for (let x = 70; x <= 150; x += 10) at('pointermove', r.left + x)
    at('pointerup', r.left + 150)
  })
  await expect(guest.page.getByTestId('chat-replying')).toContainText('you there?')

  // Typing a reply shows on the other screen too.
  await guest.page.getByLabel('Message', { exact: true }).pressSequentially('nice')
  await expect(host.page.getByTestId('chat-typing')).toBeVisible()
  await host.page.getByTestId('chat-panel').screenshot({ path: 'test-screens/chat-host.png' })
  await guest.page.getByTestId('chat-panel').screenshot({ path: 'test-screens/chat-guest.png' })

  expect(host.errors).toEqual([])
  expect(guest.errors).toEqual([])
})
