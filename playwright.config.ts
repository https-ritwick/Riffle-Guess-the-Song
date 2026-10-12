import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const REMOTE = process.env.PW_BASE_URL

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    // Uses the locally installed Microsoft Edge / Chrome instead of downloading a browser.
    channel: process.env.PW_CHANNEL ?? 'msedge',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL ?? 'msedge' } }],
  // Set PW_BASE_URL to test a deployed copy instead of a local build.
  webServer: REMOTE ? undefined : {
    // Production build served by the Workers runtime (static assets + Durable Objects).
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
