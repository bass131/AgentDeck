import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { isolatedBoot } from './helpers/isolatedBoot'

let page: Page
let teardown: (() => Promise<void>) | undefined

test.beforeAll(async () => {
  const boot = await isolatedBoot({ slug: 'agentdeck-theme', nickname: '테마테스트' })
  page = boot.page
  teardown = boot.teardown
  await page.waitForSelector('.win', { timeout: 15_000 })
})
test.afterAll(async () => { await teardown?.() })

async function readTheme(theme: 'dark' | 'light') {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  return page.evaluate(() => {
    const root = document.documentElement
    const win = document.querySelector('.win')!
    return {
      bg: getComputedStyle(root).getPropertyValue('--bg').trim().toUpperCase(),
      text: getComputedStyle(root).getPropertyValue('--text').trim().toUpperCase(),
      winBg: getComputedStyle(win).backgroundColor,
    }
  })
}

test('다크 토큰이 실제 계산값으로 적용된다(라이트와 구별)', async () => {
  const dark = await readTheme('dark')
  const light = await readTheme('light')

  expect(dark.bg).toBe('#242322')
  expect(dark.text).toBe('#ECE8E1')
  expect(dark.winBg).toBe('rgb(36, 35, 34)')

  expect(light.bg).toBe('#FBF8F1')
  expect(dark.bg).not.toBe(light.bg)
  expect(dark.winBg).not.toBe(light.winBg)
})
