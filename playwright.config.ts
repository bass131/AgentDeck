import { defineConfig } from '@playwright/test'

process.env.AGENTDECK_E2E_NO_ENGINE_UPDATE ??= '1'

export default defineConfig({
  testDir: './99_Others/tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']]
})
