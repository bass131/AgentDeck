import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'
const SHOTS = join(process.cwd(), 'artifacts', 'screenshots')

test.describe('UltraCode 버튼 실사용 시연 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true })
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-uc-'))
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-uc-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' }
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

  test('OFF→ON→전송→지속 토글 ON 유지 + 인라인 서브에이전트 + 결과', async () => {
    test.setTimeout(300_000)

    await expect(page.locator('.pane.chat')).toBeVisible()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()

    await expect(toggle).toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-1-on-default.png') })

    await toggle.click()
    await expect(toggle).not.toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-2-off.png') })
    await toggle.click()
    await expect(toggle).toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-2b-on-again.png') })
    await page.screenshot({ path: join(SHOTS, 'ultracode-2-on-full.png') })

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Use the Task tool to spawn TWO subagents in parallel. Tell subagent 1 to reply with exactly ALPHA. ' +
      'Tell subagent 2 to reply with exactly BRAVO. Neither should use tools or write files. ' +
      'After both finish, reply to me with their two words joined by a hyphen: ALPHA-BRAVO.'
    )
    await input.press('Enter')

    await expect(toggle).toHaveClass(/orch-on/)
    await page.screenshot({ path: join(SHOTS, 'ultracode-3-sent-persistent-on.png') })

    await expect(page.locator('.sa-inline').first()).toBeVisible({ timeout: 240_000 })
    await page.screenshot({ path: join(SHOTS, 'ultracode-3b-inline-subagents.png') })

    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('ALPHA', { timeout: 240_000 })
    await expect(lastMsg).toContainText('BRAVO', { timeout: 10_000 })
    await page.screenshot({ path: join(SHOTS, 'ultracode-4-result.png') })

    console.log('[ultracode-demo] 스크린샷 →', SHOTS)
  })
})
