/**
 * subagent-detail-probe.e2e.ts — 서브에이전트 상세(클릭) 현재 렌더 확인 (opt-in 프로브).
 * 인라인 서브에이전트 카드를 클릭 → 풀스크린 상세를 스크린샷으로 캡처(현 상태 진단).
 * opt-in: LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/subagent-detail-probe.e2e.ts
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const SHOTS = join(process.cwd(), 'artifacts', 'screenshots')

test.describe('서브에이전트 상세 프로브 (LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK')
  let app: ElectronApplication
  let page: Page
  let ws: string

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true })
    ws = mkdtempSync(join(tmpdir(), 'agentdeck-sad-'))
    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: ws, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
  })
  test.afterAll(async () => {
    await app?.close()
    if (ws) rmSync(ws, { recursive: true, force: true })
  })

  test('서브에이전트 클릭 → 상세 캡처', async () => {
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

    const toggle = page.locator('.composer .orch-toggle')
    await toggle.click()
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Use the Task tool to spawn ONE subagent. Tell it to think step by step and then explain in two ' +
      'short sentences what a binary search algorithm is. The subagent should reply with the explanation. ' +
      'After it finishes, summarize its answer in one sentence to me.'
    )
    await input.press('Enter')

    // 최종 결과까지 기다린 뒤(완료 답변이 대화에 보이게) 인라인 카드 클릭 → 상세
    const inline = page.locator('.sa-inline').first()
    await expect(inline).toBeVisible({ timeout: 240_000 })
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText(/binary search/i, { timeout: 240_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await inline.click()

    // 풀스크린 상세 오버레이(대화 컨테이너)가 보일 때까지 대기 후 캡처
    await expect(page.locator('.saf-convo')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(SHOTS, 'subagent-detail-current.png') })
    const body = await page.locator('.saf-convo').first().innerText().catch(() => '(없음)')
    console.log('[sad] 상세 대화 본문:', body.slice(0, 700))
  })
})
