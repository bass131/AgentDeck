import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('실 Agent SDK 라이브 검증 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 검증 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-live-'))
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-live-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace
      }
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

  test('실 SDK 에이전트 실행 → 모델 응답이 대화에 스트리밍된다', async () => {
    test.setTimeout(200_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const TOKEN = 'LIVE_SDK_OK'
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(`Reply with exactly the token ${TOKEN} and nothing else. Do not use any tools.`)
    await input.press('Enter')

    await expect(page.locator('.msg.ai-msg .content').last()).toContainText(TOKEN, {
      timeout: 180_000
    })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'live-sdk-run.png') })

    const gaugeText = await page
      .locator('.ctx-strip, .context-strip, [class*="ctx"], [class*="gauge"]')
      .first()
      .innerText()
      .catch(() => '')
    console.log('[live-sdk] gauge text:', JSON.stringify(gaugeText))
  })
})
