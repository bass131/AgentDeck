import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

let page: Page
let teardown: (() => Promise<void>) | undefined

const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const boot = await isolatedBoot({ slug: 'agentdeck-shell', nickname: 'shell테스트', echo: true })
  page = boot.page
  teardown = boot.teardown
})

test.afterAll(async () => {
  await teardown?.()
})

test('투명창 셸: .win 카드 + 타이틀바 컨트롤 3버튼 + 4컬럼', async () => {
  await expect(page.locator('.win')).toBeVisible()
  await expect(page.locator('.titlebar')).toBeVisible()
  await expect(page.getByLabel('최소화')).toBeVisible()
  await expect(page.getByLabel('최대화')).toBeVisible()
  await expect(page.getByLabel('닫기')).toBeVisible()

  await expect(page.locator('.win-body')).toBeVisible()
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.pane.explorer')).toBeVisible()
  await expect(page.locator('.pane.chat')).toBeVisible()
  await expect(page.locator('.pane.agent')).toBeVisible()

  await expect(page.locator('.pane.agent .ag-head .ag-pill')).toBeVisible()
  expect(await page.locator('.pane.agent .ag-sec').count()).toBe(3)
})

test('컬럼 폭이 원본 1:1 (사이드바 248 / 탐색기 236 / 에이전트 392)', async () => {
  const sidebar = await page.locator('.sidebar').boundingBox()
  const explorer = await page.locator('.pane.explorer').boundingBox()
  const agent = await page.locator('.pane.agent').boundingBox()
  expect(Math.abs((sidebar?.width ?? 0) - 248)).toBeLessThanOrEqual(1)
  expect(Math.abs((explorer?.width ?? 0) - 236)).toBeLessThanOrEqual(1)
  expect(Math.abs((agent?.width ?? 0) - 392)).toBeLessThanOrEqual(1)
})

test('리사이즈 핸들 8개(엣지/모서리)가 존재한다', async () => {
  expect(await page.locator('.resize-layer .rz').count()).toBe(8)
})

test('컬럼 접힘: 사이드바 → rail → 복원', async () => {
  await expect(page.locator('.sidebar')).toBeVisible()
  await page.getByLabel('사이드바 접기').click()
  await expect(page.locator('.col-rail')).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCount(0)
  await page.getByLabel('사이드바 펼치기').click()
  await expect(page.locator('.sidebar')).toBeVisible()
})

test('윈도우 컨트롤: custom maximize 토글 → .win.max', async () => {
  await expect(page.locator('.win.max')).toHaveCount(0)
  await page.getByLabel('최대화').click()
  await expect(page.locator('.win.max')).toBeVisible()
  await page.getByLabel('이전 크기로').click()
  await expect(page.locator('.win.max')).toHaveCount(0)
})

test('설정 모달(F5): backdrop + 카드 + 좌nav, Esc 닫기', async () => {
  await page.getByLabel('설정 열기').click()
  await expect(page.locator('.modal-overlay')).toBeVisible()
  await expect(page.locator('.modal-card .modal-title')).toContainText('설정')
  await expect(page.locator('.set-nav')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-modal.png'), fullPage: false })
  await page.keyboard.press('Escape')
  await expect(page.locator('.modal-overlay')).toHaveCount(0)
})

test('F6 토글: 설정 → 테마 → 라이트 선택 시 실제 data-theme 전환 + 양 테마 캡처', async () => {
  const themeAttr = (): Promise<string | null> =>
    page.evaluate(() => document.documentElement.getAttribute('data-theme'))

  expect(await themeAttr()).toBe('dark')
  await page.screenshot({ path: join(SHOT_DIR, 'shell-dark.png'), fullPage: false })

  await page.getByLabel('설정 열기').click()
  await expect(page.locator('.modal-overlay')).toBeVisible()
  await page.getByRole('button', { name: '테마' }).click()
  await page.getByRole('button', { name: /라이트/ }).click()
  expect(await themeAttr()).toBe('light')
  await expect(page.getByRole('button', { name: /라이트/, pressed: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.locator('.modal-overlay')).toHaveCount(0)
  await page.screenshot({ path: join(SHOT_DIR, 'shell-light.png'), fullPage: false })

  await page.getByLabel('설정 열기').click()
  await page.getByRole('button', { name: '테마' }).click()
  await page.getByRole('button', { name: /다크/ }).click()
  expect(await themeAttr()).toBe('dark')
  await page.keyboard.press('Escape')
  await page.evaluate(() => localStorage.removeItem('agentdeck.theme'))
})

test('F7 설정 5탭: Claude Code/MCP/Skill/Code/테마 전환 + 탭별 캡처', async () => {
  await page.getByLabel('설정 열기').click()
  await expect(page.locator('.modal-overlay')).toBeVisible()

  await expect(page.locator('.set-nav .set-nav-item')).toHaveCount(5)

  await page.getByRole('button', { name: 'Claude Code', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('Claude Code')
  await expect(page.locator('.ver-name')).toContainText('현재 엔진')
  await page.screenshot({ path: join(SHOT_DIR, 'settings-version.png'), fullPage: false })

  await page.getByRole('button', { name: 'MCP', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('MCP')
  await expect(page.locator('.skill-tabs')).toBeVisible()
  await expect(page.locator('.ext-list .ext-item').first()).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-mcp.png'), fullPage: false })

  await page.getByRole('button', { name: 'Skill', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('Skill')
  await expect(page.locator('.ext-item .skill-toggle').first()).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-skill.png'), fullPage: false })

  await page.getByRole('button', { name: 'Code', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('Code')
  await expect(page.locator('.ext-list .ext-item').first()).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-code.png'), fullPage: false })

  await page.getByRole('button', { name: '테마' }).click()
  await expect(page.getByRole('button', { name: /라이트/ })).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-theme.png'), fullPage: false })

  await page.keyboard.press('Escape')
  await expect(page.locator('.modal-overlay')).toHaveCount(0)
})

test('F8 사이드바: 단일/멀티 토글 + 세션 행 + 컨텍스트 메뉴 + 이름변경 다이얼로그', async () => {
  const modeBtns = page.locator('.sb-mode .sb-mode-btn')
  await expect(modeBtns).toHaveCount(2)
  await modeBtns.nth(1).click()
  await expect(modeBtns.nth(1)).toHaveClass(/on/)
  await modeBtns.nth(0).click()
  await expect(modeBtns.nth(0)).toHaveClass(/on/)

  const composer = page.locator('.pane.chat').getByLabel('메시지 입력')
  await composer.click()
  await composer.fill('세션 행 시드')
  await composer.press('Enter')
  const items = page.locator('.sb-list .sb-item')
  await expect(items.first()).toBeVisible()
  expect(await items.count()).toBeGreaterThan(0)
  await page.screenshot({ path: join(SHOT_DIR, 'sidebar-sessions.png'), fullPage: false })

  await items.first().locator('.more').click()
  await expect(page.locator('.ctx-menu')).toBeVisible()
  await expect(page.locator('.ctx-item', { hasText: '이름 변경' })).toBeVisible()
  await expect(page.locator('.ctx-item.danger', { hasText: '삭제' })).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'sidebar-ctxmenu.png'), fullPage: false })

  await page.locator('.ctx-item', { hasText: '이름 변경' }).click()
  await expect(page.locator('.set-dialog .sd-input')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'sidebar-rename.png'), fullPage: false })
  await page.keyboard.press('Escape')
  await expect(page.locator('.set-dialog')).toHaveCount(0)
})

test('F13 멀티에이전트: 멀티 토글 → 그리드 + count 탭 + 확장 모달', async () => {
  const modeBtns = page.locator('.sb-mode .sb-mode-btn')
  await modeBtns.nth(1).click()
  await expect(page.locator('.multi .ma-grid')).toBeVisible()
  expect(await page.locator('.ma-grid .ma-panel').count()).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.ma-head .ma-head-title')).toContainText('멀티 에이전트')
  await page.screenshot({ path: join(SHOT_DIR, 'multiagent-grid.png'), fullPage: false })

  await page.locator('.ma-count .ma-count-btn', { hasText: '6' }).click()
  expect(await page.locator('.ma-grid .ma-panel').count()).toBe(6)

  await page.locator('.ma-panel .ma-p-body').first().hover()
  await page.locator('.ma-panel .ma-p-zoom').first().click()
  await expect(page.locator('.ma-expand-overlay')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'multiagent-expand.png'), fullPage: false })
  await page.keyboard.press('Escape')
  await expect(page.locator('.ma-expand-overlay')).toHaveCount(0)

  await modeBtns.nth(0).click()
  await expect(page.locator('.multi')).toHaveCount(0)
  await expect(page.locator('.pane.chat')).toBeVisible()
})
