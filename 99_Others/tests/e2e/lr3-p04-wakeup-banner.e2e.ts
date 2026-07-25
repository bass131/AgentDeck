/**
 * lr3-p04-wakeup-banner.e2e.ts — LR3 P04 라이브 검증 (opt-in: LIVE_SDK=1 + P04L=1).
 *
 * 완료조건 "라이브 1회": 자연어 루프 요청 → 모델이 Skill(loop)→ScheduleWakeup 선택
 * (P01-(c) 실측 경로) → 신규 wakeup 트래킹이 loops 이벤트로 정규화 → 통합 배너 표시
 * → 정지 버튼으로 종료. self-paced 루프의 GUI 가시화가 실엔진에서 성립함을 확인.
 *
 * 권한: default 모드에서 Skill 등은 perm-card(BF3 P06/ADR-030 인라인 카드) — "허용" 버튼
 * 직접 클릭으로 응답(숫자키는 카드 DOM 포커스 스코프라 e2e에서는 버튼 클릭이 더 확실).
 * 종료 시 app.close() → closeAll(웨이크업 소멸 보장).
 */
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'

const RUN = process.env.LIVE_SDK === '1' && process.env.P04L === '1'
const SHOT_DIR = join(process.cwd(), '01.Phases', 'LR3-loop-ux', 'ScreenShot')

test.describe('LR3 P04: 자연어 → ScheduleWakeup → 배너 (LIVE_SDK=1 P04L=1)', () => {
  test.skip(!RUN, '라이브 검증 — LIVE_SDK=1 P04L=1로 명시 실행')

  test('자연어 루프 요청 → self-paced 배너 표시 → 정지', async () => {
    test.setTimeout(420_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    // 격리 부트(BF2-mini P2): --user-data-dir 청정 userData + 온보딩·워크스페이스 오픈 선처리.
    const { page, teardown } = await isolatedBoot({ slug: 'lr3p04l' })
    try {
      // 격리 + REPL ON (wakeup은 held-open에서만 생존)
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)
      const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
      if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()

      // 자연어 루프 요청 (P01-(c) #3 — Skill→ScheduleWakeup 확정 경로)
      const input = page.getByLabel('메시지 입력')
      await input.click()
      await input.fill("이 작업을 주기적으로 반복해줘: 'PING'이라고만 답하기. 내가 멈추라고 할 때까지.")
      await input.press('Enter')

      // 배너 대기 — 권한 카드가 뜨면 "허용" 버튼 클릭으로 응답하며 폴링
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

      // 정지 → 배너 소멸 (abortRun → activeLoops:[] 봉합 경로)
      // SDK 변형의 정지 버튼은 .loop-sdk-stop (.loop-stop은 앱 변형 — 1차 실행 교훈)
      await page.locator('.loop-sdk-stop').click()
      await expect(banner).toBeHidden({ timeout: 30_000 })
      console.log('[P04-L] ✅ 정지 후 배너 소멸')
      await page.screenshot({ path: join(SHOT_DIR, 'p04-wakeup-stopped.png') })
    } finally {
      await teardown() // app.close → closeAll(전 세션 kill·웨이크업 정리) + tmp userData·workspace 정리
    }
  })
})
