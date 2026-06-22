import { defineConfig } from '@playwright/test'

// Electron e2e 전용 설정. 브라우저 바이너리 불필요(Electron이 Chromium 내장).
// vitest와 분리: vitest=tests/**/*.test.ts(x)(node), playwright=tests/e2e/*.e2e.ts(electron).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']]
})
