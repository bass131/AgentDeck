/**
 * theme-dark-cascade.e2e.ts — 다크 테마 토큰이 실제로 적용되는지 가드.
 *
 * 회귀 방지: tokens.css 다크 블록 직전 주석에 별표+슬래시 시퀀스(예 `--clay`
 * 뒤에 글롭 별표가 슬래시와 붙는 경우)가 들어가면 주석이 조기 종료되어
 * 다크 블록 전체가 CSS 파서에서 드롭 → 다크에서도 라이트 값이 계산됨
 * (css-comment-star-slash-trap). 기존 F6 토글 테스트는 data-theme 속성만
 * 확인(스샷 blank)해 이 버그를 놓쳤다. 여기선 getComputedStyle 로 실 계산값을 단언.
 *
 * userData 격리(A-스프린트 백로그 2): 공용 `isolatedBoot`(--user-data-dir=<tmp>) 경유.
 *   토큰 계산값만 보는 스펙이라 헬퍼의 표준 부트로 충분하다. 격리 전에는 개발자 실
 *   프로필의 저장된 테마 선호가 부팅 시 복원돼 초기 data-theme이 런마다 달라질 수 있었다
 *   (본문이 매번 setAttribute로 덮어쓰긴 하지만, 전제를 환경에 맡기지 않는 게 결정론이다).
 */
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

  // 다크 블록이 드롭되면 dark.bg 가 라이트값(#FBF8F1)이 된다 → 이 단언이 실패.
  expect(dark.bg).toBe('#242322')
  expect(dark.text).toBe('#ECE8E1')
  expect(dark.winBg).toBe('rgb(36, 35, 34)')

  // 라이트는 크림. 두 테마가 반드시 달라야 한다.
  expect(light.bg).toBe('#FBF8F1')
  expect(dark.bg).not.toBe(light.bg)
  expect(dark.winBg).not.toBe(light.winBg)
})
