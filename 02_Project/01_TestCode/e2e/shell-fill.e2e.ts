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
  expect(m.left).toBe(0)
  expect(m.top).toBe(0)
  expect(Math.round(m.winW)).toBe(m.vw)
  expect(Math.round(m.winH)).toBe(m.vh)
})
