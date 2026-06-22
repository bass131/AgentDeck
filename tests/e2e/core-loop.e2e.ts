/**
 * core-loop.e2e.ts — 핵심 루프 Electron e2e (Playwright _electron).
 *
 * reviewer가 지적한 *유일한 미검 결합부*(agent.run → run-manager → webContents.send)를
 * 실제 Electron 런타임에서 닫는다. 결정론을 위해 echo 백엔드 + env 워크스페이스 사용:
 *   AGENTDECK_E2E=1            → registry가 echo 백엔드(스크립트 이벤트) 반환
 *   AGENTDECK_E2E_WORKSPACE    → 네이티브 폴더 다이얼로그 우회
 *
 * 전제: `npm run build` + `npm run rebuild:native`(better-sqlite3 Electron ABI).
 *   → `npm run test:e2e`가 자동 수행 후 node ABI로 복구.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let page: Page
let workspace: string

test.beforeAll(async () => {
  // e2e 워크스페이스: sample.ts(echo 백엔드의 file_changed/diff 대상)
  workspace = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-'))
  writeFileSync(join(workspace, 'sample.ts'), 'export const sample = 1\nconst value = 2\n')

  app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_WORKSPACE: workspace
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.titlebar', { timeout: 15_000 })
})

test.afterAll(async () => {
  await app?.close()
  if (workspace) rmSync(workspace, { recursive: true, force: true })
})

test('앱이 3-pane 셸을 렌더한다', async () => {
  // F1-b: 투명창 위 플로팅 카드(.win) + 커스텀 타이틀바(컨트롤 버튼)
  await expect(page.locator('.win')).toBeVisible()
  await expect(page.locator('.titlebar')).toBeVisible()
  await expect(page.getByLabel('닫기')).toBeVisible()
  // 중앙 pane은 M2-01에서 대화/코드 탭 구조로 변경됨
  await expect(page.locator('.pane.center .pane-tab', { hasText: '대화' })).toBeVisible()
  await expect(page.locator('.pane.center .pane-tab', { hasText: '코드' })).toBeVisible()
  await expect(page.locator('.pane.right .pane-head')).toHaveText('에이전트 상태')
})

test('폴더 열기 → 트리에 sample.ts가 보인다', async () => {
  await page.getByRole('button', { name: '폴더 열기' }).click()
  await expect(page.locator('.fe-file', { hasText: 'sample.ts' })).toBeVisible()
})

test('대화 전송 → 스트리밍 응답 + 도구카드 + 완료 메시지', async () => {
  const input = page.getByLabel('메시지 입력')
  await input.click()
  await input.fill('hello agent')
  await input.press('Enter')

  // done 후 확정된 assistant 메시지에 echo 응답
  await expect(page.locator('.msg--assistant .msg-content').last()).toContainText('echo: hello agent')
  // 도구 호출 카드 표시
  await expect(page.locator('.conv-tool-cards')).toBeVisible()
})

test('파일변경 인디케이터 + 클릭 시 diff 표시 (agent.run→webContents.send 결합부)', async () => {
  // echo의 file_changed(sample.ts) → 탐색기 인디케이터(탐색기 탭 활성 상태)
  await expect(
    page.locator('.fe-file', { hasText: 'sample.ts' }).locator('.fe-changed-dot')
  ).toBeVisible()

  // 파일 클릭 → diff 탭 자동 전환 → DiffViewer가 파일 내용을 diff로 표시
  await page.locator('.fe-file', { hasText: 'sample.ts' }).click()
  await expect(page.locator('.pane.left')).toContainText('export const sample = 1')
})
