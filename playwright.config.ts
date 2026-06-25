import { defineConfig } from '@playwright/test'

// e2e 결정성: 새 SDK 버전 알림 팝업(EngineUpdateNotice)을 기본 억제한다.
// Playwright의 electron.launch는 env를 *치환*하고 모든 하네스가 `...process.env`를
// spread하므로, 여기서 한 번 세팅하면 전 하네스가 상속한다(main ENGINE_CHECK_UPDATE
// 핸들러가 이 값을 truthy 검사 → 단락). 팝업 비동기 등장이 다른 e2e의 클릭을 모달로
// 가로채던 비결정성을 제거. 팝업 자체를 검증하는 engine-update.e2e.ts만 launch env에서
// ''로 override해 되살린다. (외부에서 이미 지정됐으면 존중 — '??='.)
process.env.AGENTDECK_E2E_NO_ENGINE_UPDATE ??= '1'

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
