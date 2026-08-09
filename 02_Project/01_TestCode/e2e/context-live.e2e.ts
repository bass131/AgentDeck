import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('Phase 1 맥락 복구 실 SDK (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-ctx-'))
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-ctx-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: 'tester' })
    await openWorkspace(page, { waitForTree: false })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('턴1에서 알려준 코드워드를 턴2가 기억한다 (resume 맥락 복구)', async () => {
    test.setTimeout(300_000)

    await expect(page.locator('.pane.chat')).toBeVisible()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const input = page.getByLabel('메시지 입력')

    await input.click()
    await input.fill('Remember this codeword: BANANA42. Acknowledge in one short sentence. Do not use any tools.')
    await input.press('Enter')
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText(/BANANA42|got it|acknowledg/i, { timeout: 120_000 })
    await page.waitForTimeout(1500)

    await input.click()
    await input.fill('What was the codeword I just told you? Reply with only the codeword. Do not use any tools.')
    await input.press('Enter')

    await settleTurn(page, { timeoutMs: 120_000 })

    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('BANANA42', { timeout: 10_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'context-live-recall.png') })
    const body = await page.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    console.log('[context-live] 턴2 응답:', body.slice(0, 200))
  })
})
