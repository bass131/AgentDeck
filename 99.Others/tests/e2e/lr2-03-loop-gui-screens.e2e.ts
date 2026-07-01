/**
 * lr2-03-loop-gui-screens.e2e.ts — LR2-03 loop GUI 육안 검토용 스크린샷 하네스.
 *
 * 목적: ui-visual(버킷 b) — 기능은 단위 테스트로 검증 완료, 시각·미감은 영호 육안.
 * 이 스펙은 아침 검토용 스크린샷을 01.Phases/LR2-loop-replmode/ScreenShot/에 생성한다.
 *
 *   LR2_03_SCREENS=1 npx playwright test 99.Others/tests/e2e/lr2-03-loop-gui-screens.e2e.ts
 *   (+ LIVE_SDK=1 이면 SDK 크론 배너 라이브 샷도 시도)
 *
 * 캡처:
 *   01-palette-slash.png   — 슬래시 팔레트('/'): goal·loop 노출
 *   02-palette-goal.png    — '/goal' 필터
 *   03-goal-card-done.png  — /goal 진행 카드(mock 완주: 완료 title + 턴수 + 목표 sub)
 *   04-loop-banner-app.png — 앱 타이머 /loop 통합 배너(running)
 *   05-loop-banner-sdk.png — SDK 크론 배너 (LIVE_SDK=1 한정)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SCREENS = process.env.LR2_03_SCREENS === '1'
const LIVE = process.env.LIVE_SDK === '1'
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

  test('mock(Echo): 팔레트 · /goal 카드 · 앱 /loop 배너', async () => {
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

      // ── 04: 앱 타이머 /loop 통합 배너(running) ───────────────────────────
      await input.click()
      await input.fill('/loop 30s 상태 점검 보고')
      await input.press('Enter')
      await expect(page.locator('.loop-indicator')).toBeVisible({ timeout: 10_000 })
      await page.screenshot({ path: join(SHOT_DIR, '04-loop-banner-app.png') })
      await page.locator('.loop-indicator .loop-stop').click()
      await expect(page.locator('.loop-indicator')).toBeHidden({ timeout: 10_000 })
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  test('LIVE(실 SDK): REPL ON /loop → SDK 크론 배너 (opt-in: LIVE_SDK=1)', async () => {
    test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')
    test.setTimeout(300_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    const workspace = mkdtempSync(join(tmpdir(), 'agentdeck-lr203live-'))
    const app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace,
        AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
      },
    })
    try {
      const page = await bootToChat(app)

      // 격리: 직전 e2e 런들의 대화가 lastActiveId로 복원되면 stale sessionId resume이
      // 다른 cwd에서 "No conversation found with session ID"로 죽는다(실측) — 새 대화로 시작.
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)

      // REPL ON (단일채팅 컴포저 토글 — PanelPicker 중복 aria-label 방지 스코프)
      const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
      await expect(replToggle).toBeVisible()
      if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()

      // SDK 네이티브 /loop → CronCreate → loops 이벤트 → 통합 배너 sdk 변형.
      // 실측(2026-07-03): interval 없는 /loop은 ScheduleWakeup(self-paced) 경로라
      // CronCreate가 안 떠 CronTracker에 미포착 — 명시 interval로 크론 모드 강제.
      const input = page.getByLabel('메시지 입력')
      await input.click()
      await input.fill('/loop 1m Reply with exactly OK and nothing else. Do not use any tools.')
      await input.press('Enter')

      await expect(page.locator('.loop-indicator.loop-sdk')).toBeVisible({ timeout: 180_000 })
      await page.screenshot({ path: join(SHOT_DIR, '05-loop-banner-sdk.png') })
      console.log('[lr2-03] SDK 크론 배너 캡처 완료')

      // 정지(세션 abort → 크론 사멸) — 반복 과금 방지
      await page.locator('.loop-indicator .loop-sdk-stop').click()
      await expect(page.locator('.loop-indicator.loop-sdk')).toBeHidden({ timeout: 30_000 })
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
