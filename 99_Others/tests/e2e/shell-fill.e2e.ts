/**
 * shell-fill.e2e.ts — .win 카드가 OS 창(뷰포트)을 가득 채우는지 가드.
 *
 * 사용자 결정(2026-06-25): 16px 플로팅 inset 제거 → 보이는 화면 = 실제 창 크기.
 * inset 이 재도입되면 .win 의 bounding rect 가 뷰포트보다 작아져 이 단언이 실패한다.
 *
 * userData 격리(A-스프린트 백로그 2): 공용 `isolatedBoot`(--user-data-dir=<tmp>) 경유.
 *   이 스펙은 워크스페이스 내용·세션에 무관한 레이아웃 단언 하나뿐이라 헬퍼의 표준
 *   부트 시퀀스(온보딩 → 게이트 → WhatsNew → 채팅 화면)를 그대로 태우면 충분하다.
 *   격리 전에는 개발자 실 프로필로 부팅해 복원된 창 상태(최대화 여부 등)에 노출됐다.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isolatedBoot } from './helpers/isolatedBoot'

let page: Page
let teardown: (() => Promise<void>) | undefined

test.beforeAll(async () => {
  const boot = await isolatedBoot({ slug: 'agentdeck-shellfill', nickname: 'fill테스트' })
  page = boot.page
  teardown = boot.teardown
  await page.waitForSelector('.win', { timeout: 15_000 })
})
test.afterAll(async () => { await teardown?.() })

test('.win 카드가 뷰포트를 가득 채운다(inset 0)', async () => {
  const m = await page.evaluate(() => {
    const win = document.querySelector('.win')!.getBoundingClientRect()
    return { winW: win.width, winH: win.height, vw: window.innerWidth, vh: window.innerHeight, left: win.left, top: win.top }
  })
  // 카드 좌상단이 뷰포트 원점, 크기가 뷰포트와 동일(둥근 모서리는 bounding rect 불변).
  expect(m.left).toBe(0)
  expect(m.top).toBe(0)
  expect(Math.round(m.winW)).toBe(m.vw)
  expect(Math.round(m.winH)).toBe(m.vh)
})
