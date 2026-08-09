import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates } from './helpers/bootGates'

let app: ElectronApplication
let page: Page
let workspace: string
let userDataDir: string

test.beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-'))
  writeFileSync(join(workspace, 'sample.ts'), 'export const sample = 1\nconst value = 2\n')
  userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-e2e-udd-'))

  app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_WORKSPACE: workspace
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await passBootGates(page, { nickname: 'core-loop', engineNoticeTimeoutMs: 3_000 })
})

test.afterAll(async () => {
  await app?.close()
  if (workspace) rmSync(workspace, { recursive: true, force: true })
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
})

test('앱이 3-pane 셸을 렌더한다', async () => {
  await expect(page.locator('.win')).toBeVisible()
  await expect(page.locator('.titlebar')).toBeVisible()
  await expect(page.getByLabel('닫기')).toBeVisible()
  await expect(page.locator('.pane.explorer')).toBeVisible()
  await expect(page.locator('.pane.chat')).toBeVisible()
  await expect(page.locator('.pane.agent .ag-head')).toContainText('에이전트')
})

test('폴더 열기 → 트리에 sample.ts가 보인다', async () => {
  await page.getByRole('button', { name: '폴더 선택' }).click()
  await expect(page.locator('.fe-file', { hasText: 'sample.ts' })).toBeVisible()
})

test('대화 전송 → 스트리밍 응답 + 도구카드 + 완료 메시지', async () => {
  const input = page.getByLabel('메시지 입력')
  await input.click()
  await input.fill('hello agent')
  await input.press('Enter')

  await expect(page.locator('.msg.ai-msg .content').last()).toContainText('echo: hello agent')
  await expect(page.locator('.toollog')).toBeVisible()
})

test('파일변경 인디케이터 + 클릭 시 모달 표시 (agent.run→webContents.send 결합부)', async () => {
  await expect(page.locator('.fe-file.chg-edit', { hasText: 'sample.ts' })).toBeVisible()

  await page.locator('.fe-file', { hasText: 'sample.ts' }).click()
  await expect(page.locator('.fv-overlay')).toBeVisible()
  await expect(page.locator('.fv-overlay .diff-head .dpath')).toContainText('sample.ts')
  await expect(page.locator('.pane.explorer')).toBeVisible()
  await expect(page.locator('.pane.chat')).toBeVisible()

  await page.locator('.fv-overlay .dclose[aria-label="닫기"]').click()
  await expect(page.locator('.fv-overlay')).toHaveCount(0)
  await expect(page.locator('.pane.chat')).toBeVisible()
})
