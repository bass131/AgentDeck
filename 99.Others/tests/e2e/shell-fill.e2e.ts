/**
 * shell-fill.e2e.ts — .win 카드가 OS 창(뷰포트)을 가득 채우는지 가드.
 *
 * 사용자 결정(2026-06-25): 16px 플로팅 inset 제거 → 보이는 화면 = 실제 창 크기.
 * inset 이 재도입되면 .win 의 bounding rect 가 뷰포트보다 작아져 이 단언이 실패한다.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { join } from 'node:path'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  app = await electron.launch({ args: [join(process.cwd(), 'out', 'main', 'index.js')], env: { ...process.env } })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.win', { timeout: 15_000 })
})
test.afterAll(async () => { await app?.close() })

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
