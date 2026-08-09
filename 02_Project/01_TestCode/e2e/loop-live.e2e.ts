import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('/loop 실 SDK 경로 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')
  test.describe.configure({ retries: 2 })

  let page: Page
  let teardown: (() => Promise<void>) | undefined

  test.beforeAll(async () => {
    const booted = await isolatedBoot({ slug: 'agentdeck-loop' })
    page = booted.page
    teardown = booted.teardown
  })

  test.afterAll(async () => {
    await teardown?.()
  })

  test('REPL ON /loop 1m → SDK 크론 배너 등장 + 정지 버튼으로 반복 중단', async () => {
    test.setTimeout(300_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    await page.getByRole('button', { name: /새 대화/ }).click()
    await page.waitForTimeout(500)

    page.on('console', (msg) => {
      if (msg.text().startsWith('[loop-live]')) console.log(msg.text())
    })
    await page.evaluate(() => {
      const api = (window as unknown as { api: { onAgentEvent: (cb: (p: { runId: string; event: Record<string, unknown> }) => void) => void } }).api
      api.onAgentEvent((p) => {
        const e = p.event
        const brief = e.type === 'text' ? JSON.stringify(String(e.delta ?? '').slice(0, 30)) : JSON.stringify(e).slice(0, 140)
        console.log(`[loop-live] run=${p.runId.slice(0, 8)} ${String(e.type)} ${brief}`)
      })
    })

    const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
    await expect(replToggle).toBeVisible()
    if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('/loop 1m Reply with exactly TICK and nothing else.')
    await input.press('Enter')

    await expect(page.locator('.loop-indicator.loop-sdk')).toBeVisible({ timeout: 180_000 })
    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'loop-live-sdk-banner.png') })

    await page.locator('.loop-indicator .loop-sdk-stop').click()
    await expect(page.locator('.loop-indicator.loop-sdk')).toBeHidden({ timeout: 30_000 })
  })
})
