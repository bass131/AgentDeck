/**
 * subagent-detail-probe.e2e.ts — 서브에이전트 상세(클릭) 현재 렌더 확인 (opt-in 프로브).
 * 인라인 서브에이전트 카드를 클릭 → 풀스크린 상세를 스크린샷으로 캡처(현 상태 진단).
 * opt-in: LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/subagent-detail-probe.e2e.ts
 *
 * userData 격리(A-스프린트 백로그 2): 공용 `isolatedBoot`(--user-data-dir=<tmp> + tmp
 *   워크스페이스 + 온보딩/게이트/WhatsNew 선처리 + 워크스페이스 오픈) 경유 — 이 프로브의
 *   기존 부트 절차와 헬퍼의 시퀀스가 정확히 동형이라 그대로 대체된다(라이브 SDK 인증은 홈
 *   ~/.claude/.credentials.json이므로 격리와 무관하게 유지). 격리 전에는 실 프로필의 stale
 *   sessionId가 복원돼 다른 cwd에서 죽거나 실 대화 히스토리가 캡처에 섞였다.
 */
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
    // echo 미지정 = 라이브 SDK(이 프로브의 목적). AGENTDECK_E2E는 헬퍼가 명시 제거한다.
    const boot = await isolatedBoot({ slug: 'agentdeck-sad', nickname: 'tester' })
    page = boot.page
    teardown = boot.teardown
  })
  test.afterAll(async () => {
    await teardown?.()
  })

  test('서브에이전트 클릭 → 상세 캡처', async () => {
    test.setTimeout(300_000)
    // 부트(온보딩·모달·워크스페이스 오픈)는 isolatedBoot이 끝냈다 — 채팅 화면 확인만.
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
