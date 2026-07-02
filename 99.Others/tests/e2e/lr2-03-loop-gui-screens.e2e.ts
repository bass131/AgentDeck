/**
 * lr2-03-loop-gui-screens.e2e.ts — LR2-03 loop GUI 육안 검토용 스크린샷 하네스.
 *
 * 목적: ui-visual(버킷 b) — 기능은 단위 테스트로 검증 완료, 시각·미감은 영호 육안.
 * 이 스펙은 아침 검토용 스크린샷을 01.Phases/LR2-loop-replmode/ScreenShot/에 생성한다.
 *
 *   LR2_03_SCREENS=1 npx playwright test 99.Others/tests/e2e/lr2-03-loop-gui-screens.e2e.ts
 *
 * LR3-03 갱신: 앱 타이머 /loop 배너(구 04-loop-banner-app.png)는 앱 타이머 /loop 자체가
 * 폐기(영호 확정 "토큰 맥싱")되어 캡처 대상에서 제거됐다. SDK 크론 배너 라이브 샷은
 * loop-live.e2e.ts로 승격·통합됨(중복 방지 — LIVE_SDK=1 블록 이관).
 *
 * 캡처:
 *   01-palette-slash.png   — 슬래시 팔레트('/'): goal·loop 노출
 *   02-palette-goal.png    — '/goal' 필터
 *   03-goal-card-done.png  — /goal 진행 카드(mock 완주: 완료 title + 턴수 + 목표 sub)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SCREENS = process.env.LR2_03_SCREENS === '1'
const SHOT_DIR = join(process.cwd(), '01.Phases', 'LR2-loop-replmode', 'ScreenShot')

async function bootToChat(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.titlebar', { timeout: 20_000 })
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('tester')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
  }
  await page.keyboard.press('Escape').catch(() => {})
  await expect(page.locator('.pane.chat')).toBeVisible()
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) await pickFolder.click()
  return page
}

test.describe('LR2-03 loop GUI 스크린샷 (opt-in: LR2_03_SCREENS=1)', () => {
  test.skip(!SCREENS, '스크린샷 하네스 — LR2_03_SCREENS=1로 명시 실행')

  test('mock(Echo): 팔레트 · /goal 카드', async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    const workspace = mkdtempSync(join(tmpdir(), 'agentdeck-lr203-'))
    const app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E: '1',
        AGENTDECK_E2E_WORKSPACE: workspace,
        AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
      },
    })
    try {
      const page = await bootToChat(app)
      const input = page.getByLabel('메시지 입력')

      // ── 01/02: 슬래시 팔레트 — goal·loop 노출 ────────────────────────────
      await input.click()
      await input.fill('/')
      await expect(page.getByText('목표를 정하고 자율적으로 추진', { exact: false })).toBeVisible()
      await page.screenshot({ path: join(SHOT_DIR, '01-palette-slash.png') })
      await input.fill('/goal')
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(SHOT_DIR, '02-palette-goal.png') })

      // ── 03: /goal 진행 카드 (Echo 완주: 완료 title + 1턴 + 목표 sub) ──────
      await input.fill('/goal 리팩토링 마무리하기')
      await input.press('Enter')
      await expect(page.locator('.cmd-result-card')).toBeVisible({ timeout: 10_000 })
      // Echo done 후 완료 카드(목표 반복을 마쳤어요 · 1턴)
      await expect(page.locator('.cmd-result-card--done')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.cmd-result-title')).toContainText('턴')
      await page.screenshot({ path: join(SHOT_DIR, '03-goal-card-done.png') })
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
