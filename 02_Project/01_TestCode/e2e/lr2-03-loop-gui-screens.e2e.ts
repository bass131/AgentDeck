import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const SCREENS = process.env.LR2_03_SCREENS === '1'
const SHOT_DIR = join(process.cwd(), '01_Phases', '04_LR2-loop-replmode', 'ScreenShot')
const SHOT_DIR_P06 = join(process.cwd(), '01_Phases', '06_LR3-loop-ux', 'ScreenShot')

test.describe('LR2-03 loop GUI 스크린샷 (opt-in: LR2_03_SCREENS=1)', () => {
  test.skip(!SCREENS, '스크린샷 하네스 — LR2_03_SCREENS=1로 명시 실행')
  test.describe.configure({ retries: 2 })

  test('mock(Echo): 팔레트 · /goal 카드', async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    const { page, teardown } = await isolatedBoot({ echo: true, slug: 'agentdeck-lr203' })
    try {
      const input = page.getByLabel('메시지 입력')

      await input.click()
      await input.fill('/')
      await expect(page.getByText('목표를 정하고 자율적으로 추진', { exact: false })).toBeVisible()
      await page.screenshot({ path: join(SHOT_DIR, '01-palette-slash.png') })
      await input.fill('/goal')
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(SHOT_DIR, '02-palette-goal.png') })

      await input.fill('/goal 리팩토링 마무리하기')
      await input.press('Enter')
      await expect(page.locator('.cmd-result-card')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.cmd-result-card--done')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.cmd-result-title')).toContainText('턴')
      await page.screenshot({ path: join(SHOT_DIR, '03-goal-card-done.png') })
    } finally {
      await teardown()
    }
  })

  test('mock(Echo): LR3-06 금색 REPL · 전체박스 gloss · goal 배너', async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR_P06, { recursive: true })
    const { page, teardown } = await isolatedBoot({ echo: true, slug: 'agentdeck-lr306' })
    try {
      const input = page.getByLabel('메시지 입력')
      const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })

      await expect(replToggle).toBeVisible()
      if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()

      await page.locator('.pane.chat').getByRole('button', { name: 'UltraCode 모드 토글' }).click()
      await expect(page.locator('.orch-toggle.orch-on')).toBeVisible()
      await expect(replToggle).toHaveClass(/repl-lit/)
      await expect(page.locator('.conversation.loop-active')).toHaveCount(0)
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-repl-gold-lit.png') })

      await page.locator('.pane.chat').getByRole('button', { name: 'UltraCode 모드 토글' }).click()
      await expect(page.locator('.orch-toggle.orch-on')).toHaveCount(0)

      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(300)

      await input.click()
      await input.fill('/goal 리팩토링 마무리하기')
      await input.press('Enter')
      await expect(page.locator('.conversation.loop-active')).toBeVisible({ timeout: 5_000 })
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-loop-gloss-fullbox.png') })
      await expect(page.locator('.loop-indicator.loop-goal')).toBeVisible({ timeout: 2_000 })
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-goal-banner.png') })

      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(300)
      await input.click()
      await input.fill('/loop 1m 상태 점검')
      await input.press('Enter')
      await expect(page.locator('.loop-indicator.loop-sdk')).toBeVisible({ timeout: 10_000 })
      await page.locator('.loop-sdk-stop').click()
      await expect(page.locator('.loop-indicator.loop-stopped')).toBeVisible({ timeout: 5_000 })
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-stopped-banner.png') })
    } finally {
      await teardown()
    }
  })
})
