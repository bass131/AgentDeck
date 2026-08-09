import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'

const RUN = process.env.LIVE_SDK === '1' && process.env.P04L === '1'
const SHOT_DIR = join(process.cwd(), '01_Phases', '06_LR3-loop-ux', 'ScreenShot')

test.describe('LR3 P04: 자연어 → ScheduleWakeup → 배너 (LIVE_SDK=1 P04L=1)', () => {
  test.skip(!RUN, '라이브 검증 — LIVE_SDK=1 P04L=1로 명시 실행')

  test('자연어 루프 요청 → self-paced 배너 표시 → 정지', async () => {
    test.setTimeout(420_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    const { page, teardown } = await isolatedBoot({ slug: 'lr3p04l' })
    try {
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)
      const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
      if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()

      const input = page.getByLabel('메시지 입력')
      await input.click()
      await input.fill("이 작업을 주기적으로 반복해줘: 'PING'이라고만 답하기. 내가 멈추라고 할 때까지.")
      await input.press('Enter')

      const banner = page.locator('.loop-indicator.loop-sdk')
      const permCard = page.locator(PERM_CARD)
      const deadline = Date.now() + 240_000
      while (Date.now() < deadline) {
        if (await banner.isVisible().catch(() => false)) break
        if (await permCard.isVisible().catch(() => false)) {
          await permCard.locator(permChoiceSelector('allow')).click().catch(() => {})
          console.log('[P04-L] perm-card → 허용(버튼 클릭)')
        }
        await page.waitForTimeout(1000)
      }
      await expect(banner).toBeVisible({ timeout: 5_000 })
      console.log('[P04-L] ✅ self-paced 루프 배너 표시:', await banner.innerText().catch(() => ''))
      await page.screenshot({ path: join(SHOT_DIR, 'p04-wakeup-banner.png') })

      await page.locator('.loop-sdk-stop').click()
      await expect(banner).toBeHidden({ timeout: 30_000 })
      console.log('[P04-L] ✅ 정지 후 배너 소멸')
      await page.screenshot({ path: join(SHOT_DIR, 'p04-wakeup-stopped.png') })
    } finally {
      await teardown()
    }
  })
})
