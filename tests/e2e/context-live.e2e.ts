/**
 * context-live.e2e.ts — Phase 1 맥락 복구 실 SDK 검증 (opt-in: LIVE_SDK=1).
 *
 * 실제 빌드 앱의 전 경로(renderer sendMessage → agentRun → backend resume → SDK → session
 * 이벤트 → renderer 저장 → 다음 턴 resumeSessionId)로 **턴 간 맥락이 실제로 유지되는지** 검증.
 * 프로브(resume-probe.mjs)는 raw SDK였고, 이건 앱 전 배선의 end-to-end 확인.
 *
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/context-live.e2e.ts
 *
 * 검증: 턴1 "코드워드 BANANA42 기억" → 턴2 "코드워드 뭐였지?" → 응답에 BANANA42 포함(회상).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('Phase 1 맥락 복구 실 SDK (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string

  test.beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-ctx-'))
    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  test('턴1에서 알려준 코드워드를 턴2가 기억한다 (resume 맥락 복구)', async () => {
    test.setTimeout(300_000)

    const nick = page.locator('#nickname')
    if (await nick.isVisible().catch(() => false)) {
      await nick.fill('tester')
      await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    await expect(page.locator('.pane.chat')).toBeVisible()
    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) await pickFolder.click()

    const input = page.getByLabel('메시지 입력')

    // 턴1: 코드워드 알려주기
    await input.click()
    await input.fill('Remember this codeword: BANANA42. Acknowledge in one short sentence. Do not use any tools.')
    await input.press('Enter')
    // 턴1 완료 대기(어시스턴트 응답 도착 + idle)
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText(/BANANA42|got it|acknowledg/i, { timeout: 120_000 })
    await page.waitForTimeout(1500)

    // 턴2: 코드워드 묻기 (resume으로 맥락 복구되어야 기억)
    await input.click()
    await input.fill('What was the codeword I just told you? Reply with only the codeword. Do not use any tools.')
    await input.press('Enter')

    // 턴2 응답에 BANANA42 포함 → 맥락 유지 실증
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('BANANA42', { timeout: 120_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'context-live-recall.png') })
    const body = await page.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    console.log('[context-live] 턴2 응답:', body.slice(0, 200))
  })
})
