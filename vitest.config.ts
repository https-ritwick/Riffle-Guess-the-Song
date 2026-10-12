import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so unit tests don't spin up the Workers runtime.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
