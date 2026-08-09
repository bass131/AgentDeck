import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const LIVE = process.env.LIVE_SDK === '1'
const SHOTS = join(process.cwd(), 'artifacts', 'screenshots')

test.describe('서브에이전트 상세 프로브 (LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK')
  let page: Page
  let teardown: (() => Promise<void>) | undefined

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true })
    const boot = await isolatedBoot({ slug: 'agentdeck-sad', nickname: 'tester' })
    page = boot.page
    teardown = boot.teardown
  })
  test.afterAll(async () => {
    await teardown?.()
  })

  test('서브에이전트 클릭 → 상세 캡처', async () => {
    test.setTimeout(300_000)
    await expect(page.locator('.pane.chat')).toBeVisible()

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

    const inline = page.locator('.sa-inline').first()
    await expect(inline).toBeVisible({ timeout: 240_000 })
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText(/binary search/i, { timeout: 240_000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await inline.click()

    await expect(page.locator('.saf-convo')).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(SHOTS, 'subagent-detail-current.png') })
    const body = await page.locator('.saf-convo').first().innerText().catch(() => '(없음)')
    console.log('[sad] 상세 대화 본문:', body.slice(0, 700))
  })
})
