/**
 * loop-context-live.e2e.ts — 앱 레벨 /loop 틱이 resume으로 맥락을 잇는지 실 SDK 검증 (LIVE_SDK=1).
 *
 * 긴 주기 설계 결론의 핵심 전제 검증: "타이머 + resume = 매 틱 맥락 이어짐"(Phase 1 + ADR-022).
 * 루프 프롬프트가 "지금까지 내가 이 질문을 몇 번 했는지 세서 그 숫자만 답하라"이면 —
 *   맥락이 이어지면 답이 1 → 2 → 3 (증가), 안 이어지면 매번 1.
 *
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/loop-context-live.e2e.ts
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('앱 레벨 /loop 맥락 연속(resume) 실 SDK (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string

  test.beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-loopctx-'))
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

  test('루프 틱이 맥락을 이어 카운터가 증가한다 (1→2→3)', async () => {
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
    await input.click()
    // 맥락 의존 프롬프트: 이전 대화를 보고 카운트
    await input.fill('/loop 8s Count how many times I have asked you this exact question in our conversation so far, including now. Reply with ONLY that integer and nothing else. Do not use any tools.')
    await input.press('Enter')

    // 3틱(user 버블 3개)까지 대기
    await expect.poll(async () => page.locator('.msg.user').count(), { timeout: 200_000, intervals: [2000] }).toBeGreaterThanOrEqual(3)

    // 정지
    await page.locator('.loop-indicator .loop-stop').click().catch(() => {})
    await page.waitForTimeout(1000)

    // assistant 응답들 수집 — 맥락 이어지면 증가(최댓값 ≥ 2)
    const aiTexts = await page.locator('.msg.ai-msg .content').allInnerTexts()
    const nums = aiTexts.map((t) => {
      const m = t.match(/\d+/)
      return m ? parseInt(m[0], 10) : 0
    }).filter((n) => n > 0)
    console.log('[loop-ctx] assistant 카운터들:', nums)
    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'loop-context-live.png') })

    // 맥락이 이어지면 카운터가 증가 → 최댓값이 2 이상(이어지지 않으면 전부 1)
    expect(Math.max(...nums)).toBeGreaterThanOrEqual(2)
  })
})
