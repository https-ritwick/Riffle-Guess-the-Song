import { expect, test } from '@playwright/test'
import { devSignIn } from './helpers'

test('players can delete their own account from the account menu', async ({ page, browser, baseURL }) => {
  const stamp = Date.now()
  const email = `leaver${stamp}@example.com`
  await devSignIn(page, 'Leaving Player', email)

  // A group they run, with another member who should inherit it.
  const created = await page.request.post('/api/groups', { data: { name: `Leavers ${stamp}` } })
  expect(created.ok()).toBe(true)
  const { id: groupId } = await created.json()
  const group = await (await page.request.get(`/api/groups/${groupId}`)).json()
  const friend = await browser.newPage({ baseURL })
  await devSignIn(friend, 'Staying Friend', `stayer${stamp}@example.com`)
  expect((await friend.request.post('/api/groups/join', { data: { code: group.inviteCode } })).ok()).toBe(true)

  await page.goto('/')
  await page.getByRole('button', { name: /Leaving Player/ }).click()
  await page.getByTestId('delete-account').click()
  const dialog = page.getByTestId('delete-account-dialog')
  await expect(dialog.getByRole('heading', { name: 'Delete your account?' })).toBeVisible()
  await expect(dialog).toContainText(email)

  // Cancelling keeps the account.
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  expect((await (await page.request.get('/api/me')).json()).user?.email).toBe(email)

  // The delete button stays disabled until the confirmation word is typed.
  await page.getByRole('button', { name: /Leaving Player/ }).click()
  await page.getByTestId('delete-account').click()
  const confirm = dialog.getByRole('button', { name: 'Delete account' })
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/to confirm/).fill('delet')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/to confirm/).fill('delete')
  await confirm.click()

  await expect(page.getByText('Account deleted')).toBeVisible()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect((await (await page.request.get('/api/me')).json()).user).toBeNull()

  // The friend now runs the group, and the leaver is gone from it.
  const after = await (await friend.request.get(`/api/groups/${groupId}`)).json()
  expect(after.role).toBe('admin')
  expect(after.members.map((m: { name: string }) => m.name)).toEqual(['Staying Friend'])

  // Signing in again starts a brand-new account (asked for age and gender again).
  expect((await page.request.post('/api/auth/dev-login', { data: { name: 'Leaving Player', email } })).ok()).toBe(true)
  const fresh = (await (await page.request.get('/api/me')).json()).user
  expect(fresh).toMatchObject({ email, age: null, gender: null })
  await friend.close()
})

test('the delete endpoint needs a same-origin, signed-in, confirmed request', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const post = (data: unknown, headers: Record<string, string> = { Origin: origin }) => page.request.post('/api/me/delete', { data, headers })

  expect((await post({ confirm: 'DELETE' })).status()).toBe(401)
  await devSignIn(page, 'Careful Player', `careful${Date.now()}@example.com`)
  // No Origin header (not from one of our pages) and a cross-site Origin are both refused.
  expect((await post({ confirm: 'DELETE' }, {})).status()).toBe(403)
  expect((await post({ confirm: 'DELETE' }, { Origin: 'https://evil.example' })).status()).toBe(403)
  expect((await page.request.get('/api/me/delete')).status()).toBe(405)
  const wrong = await post({ confirm: 'yes' })
  expect(wrong.status()).toBe(400)
  expect((await wrong.json()).error).toMatch(/Type DELETE/)
  // None of that touched the account.
  expect((await (await page.request.get('/api/me')).json()).user).not.toBeNull()

  const ok = await post({ confirm: 'DELETE' })
  expect(ok.status()).toBe(200)
  expect(ok.headers()['set-cookie']).toMatch(/encore_session=;.*Max-Age=0/)
  expect((await (await page.request.get('/api/me')).json()).user).toBeNull()
})

test('public account-deletion page explains the steps and is linked from the privacy policy', async ({ page }) => {
  await page.goto('/privacy')
  await page.getByRole('link', { name: 'how to delete your account' }).click()
  await expect(page).toHaveURL(/\/delete-account$/)
  await expect(page.getByRole('heading', { name: 'Delete your account', level: 1 })).toBeVisible()
  for (const heading of ['Delete in the app', 'Ask us by email', 'What gets deleted', 'What’s kept, and for how long']) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
  }
  await expect(page.getByRole('link', { name: 'ritwickjohari@gmail.com' }).first()).toBeVisible()
  // Signed out: offers sign-in that comes back here. Signed in: deletes from the page itself.
  await expect(page.getByTestId('delete-account-panel').getByRole('button', { name: /Sign in to delete|Developer sign-in/ })).toBeVisible()
  await devSignIn(page, 'Page Player', `page${Date.now()}@example.com`)
  await page.reload()
  await page.getByTestId('delete-account-panel').getByRole('button', { name: 'Delete my account' }).click()
  await expect(page.getByTestId('delete-account-dialog')).toBeVisible()
})
