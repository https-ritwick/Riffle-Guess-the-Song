import { expect, test } from '@playwright/test'
import { devSignIn } from './helpers'

// The site owner's email is the default admin; locally a developer sign-in with it counts.
const ADMIN = 'ritwickjohari@gmail.com'

test('admin console is hidden from everyone but the admin', async ({ page }) => {
  // Signed out: the API pretends not to exist and the page asks for the owner's account.
  expect((await page.request.get('/api/admin/overview')).status()).toBe(404)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin sign-in' })).toBeVisible()

  await devSignIn(page, 'Someone Else', 'someone@example.com')
  expect((await page.request.get('/api/admin/users')).status()).toBe(404)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible()
})

test('admin sees the dashboard, analytics and can moderate', async ({ page, browser }) => {
  // A player to moderate.
  const troll = `troll${Date.now()}`
  const other = await browser.newPage()
  await devSignIn(other, 'Troll', `${troll}@example.com`)

  await devSignIn(page, 'Owner', ADMIN)
  await page.goto('/')
  await page.getByRole('button', { name: /Owner/ }).click()
  await page.getByTestId('admin-link').click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText('Games played')).toBeVisible()

  for (const tab of ['Audience', 'Geography', 'Games & preferences', 'Songs & questions', 'Retention']) {
    await page.goto('/admin/analytics')
    await page.getByRole('tab', { name: tab }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
  }

  // Ban the troll: their session ends and the ban shows in the audit log.
  await page.goto(`/admin/users?q=${troll}`)
  await page.getByRole('link', { name: /Troll/ }).click()
  await page.getByRole('button', { name: 'Ban', exact: true }).click()
  await page.getByLabel(/Reason/).fill('spam in chat')
  await page.getByRole('button', { name: 'Ban user' }).click()
  await expect(page.getByText(/spam in chat/)).toBeVisible()
  const me = await (await other.request.get('/api/me')).json()
  expect(me.user).toBeNull()

  await page.goto('/admin/audit')
  await expect(page.getByRole('cell', { name: 'Banned a user', exact: true }).first()).toBeVisible()

  // And back again.
  await page.goto(`/admin/users?filter=banned&q=${troll}`)
  await page.getByRole('link', { name: /Troll/ }).click()
  await page.getByRole('button', { name: 'Unban', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Unban', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Ban', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-screens/admin-user.png', fullPage: true })
})

test('terms and privacy pages, with an analytics opt-out', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('footer').getByRole('link', { name: 'Privacy' }).click()
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible()
  const optOut = page.getByTestId('analytics-optout').getByRole('switch')
  await expect(optOut).toHaveAttribute('aria-checked', 'true')
  await optOut.click()
  await expect(optOut).toHaveAttribute('aria-checked', 'false')
  expect(await page.evaluate(() => localStorage.getItem('encore:analytics-off'))).toBe('1')

  await page.getByTestId('footer').getByRole('link', { name: 'Terms' }).click()
  await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible()
})
