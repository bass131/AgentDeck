/**
 * theme-dark-cascade.e2e.ts — 다크 테마 토큰이 실제로 적용되는지 가드.
 *
 * 회귀 방지: tokens.css 다크 블록 직전 주석에 별표+슬래시 시퀀스(예 `--clay`
 * 뒤에 글롭 별표가 슬래시와 붙는 경우)가 들어가면 주석이 조기 종료되어
 * 다크 블록 전체가 CSS 파서에서 드롭 → 다크에서도 라이트 값이 계산됨
 * (css-comment-star-slash-trap). 기존 F6 토글 테스트는 data-theme 속성만
 * 확인(스샷 blank)해 이 버그를 놓쳤다. 여기선 getComputedStyle 로 실 계산값을 단언.
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

  // 다크 블록이 드롭되면 dark.bg 가 라이트값(#FBF8F1)이 된다 → 이 단언이 실패.
  expect(dark.bg).toBe('#242322')
  expect(dark.text).toBe('#ECE8E1')
  expect(dark.winBg).toBe('rgb(36, 35, 34)')

  // 라이트는 크림. 두 테마가 반드시 달라야 한다.
  expect(light.bg).toBe('#FBF8F1')
  expect(dark.bg).not.toBe(light.bg)
  expect(dark.winBg).not.toBe(light.winBg)
})
