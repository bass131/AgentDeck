/**
 * shell.e2e.ts — F1-b 셸 통합 e2e (Phase 06).
 *
 * 실제 Electron 런타임으로 투명 frameless 셸을 구동:
 *   - .win 플로팅 카드 + 커스텀 타이틀바 컨트롤
 *   - 4컬럼(사이드바 248 / 탐색기 236 / 대화 1fr / 에이전트 392) 폭 측정
 *   - 윈도우 컨트롤(custom maximize → .win.max 토글)
 *   - 컬럼 접힘(사이드바 → rail)
 *   - 리사이즈 핸들 8개
 *   - 양 테마(다크/라이트) 스크린샷 → 충실도 육안 대조
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let page: Page
let workspace: string

const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  workspace = mkdtempSync(join(tmpdir(), 'agentdeck-shell-'))
  writeFileSync(join(workspace, 'README.md'), '# Shell e2e\n\n4컬럼 투명창 셸 검증.\n')

  app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js')],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.titlebar', { timeout: 15_000 })
})

test.afterAll(async () => {
  await app?.close()
  if (workspace) rmSync(workspace, { recursive: true, force: true })
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

  // F4: 에이전트 패널 — 헤더 + 상태 pill + 섹션 3(할일/서브에이전트/변경파일)
  await expect(page.locator('.pane.agent .ag-head .ag-pill')).toBeVisible()
  expect(await page.locator('.pane.agent .ag-sec').count()).toBe(3)
})

test('컬럼 폭이 원본 1:1 (사이드바 248 / 탐색기 236 / 에이전트 392)', async () => {
  const sidebar = await page.locator('.sidebar').boundingBox()
  const explorer = await page.locator('.pane.explorer').boundingBox()
  const agent = await page.locator('.pane.agent').boundingBox()
  // box-sizing:border-box + flex:0 0 <w> → 경계 포함 정확 폭(서브픽셀 ±1 허용)
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
  await expect(page.locator('.win.max')).toBeVisible() // WINDOW_STATE → useWindowState → .win.max
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

  // 기본 다크 캡처
  expect(await themeAttr()).toBe('dark')
  await page.screenshot({ path: join(SHOT_DIR, 'shell-dark.png'), fullPage: false })

  // 설정 → 테마 nav → 라이트 옵션 클릭(직접 set이 아닌 UI 클릭 경로)
  await page.getByLabel('설정 열기').click()
  await expect(page.locator('.modal-overlay')).toBeVisible()
  await page.getByRole('button', { name: '테마' }).click()
  await page.getByRole('button', { name: /라이트/ }).click()
  expect(await themeAttr()).toBe('light') // 토글로 전환됨
  await expect(page.getByRole('button', { name: /라이트/, pressed: true })).toBeVisible()

  // 라이트 셸 캡처(모달 닫고)
  await page.keyboard.press('Escape')
  await expect(page.locator('.modal-overlay')).toHaveCount(0)
  await page.screenshot({ path: join(SHOT_DIR, 'shell-light.png'), fullPage: false })

  // 다크 복원(UI 경로) + localStorage 정리 — 후속 e2e 상태 비오염(필수)
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

  // nav 5탭 존재
  await expect(page.locator('.set-nav .set-nav-item')).toHaveCount(5)

  // Claude Code(엔진 버전) — set-h1 + Agent SDK 정보 표시
  // P5c에서 버전 피커(vpick-btn/vpick-menu) 제거됨 — SDK 내장 방식으로 변경
  // 현행 VersionView: "현재 엔진", "Agent SDK", 인증 배지(.vtag) 표시
  await page.getByRole('button', { name: 'Claude Code', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('Claude Code')
  // 현행: 버전 피커 대신 "현재 엔진" 텍스트 + SDK 정보 표시
  await expect(page.locator('.ver-name')).toContainText('현재 엔진')
  await page.screenshot({ path: join(SHOT_DIR, 'settings-version.png'), fullPage: false })

  // MCP — scope 탭 + ext-list.
  await page.getByRole('button', { name: 'MCP', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('MCP')
  await expect(page.locator('.skill-tabs')).toBeVisible()
  await expect(page.locator('.ext-list .ext-item').first()).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-mcp.png'), fullPage: false })

  // Skill — scope 탭 + 토글
  await page.getByRole('button', { name: 'Skill', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('Skill')
  await expect(page.locator('.ext-item .skill-toggle').first()).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-skill.png'), fullPage: false })

  // Code(LSP) — FileBadge + ext-item
  await page.getByRole('button', { name: 'Code', exact: true }).click()
  await expect(page.locator('.set-h1')).toContainText('Code')
  await expect(page.locator('.ext-list .ext-item').first()).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-code.png'), fullPage: false })

  // 테마 — 라이트/다크 옵션(F6)
  await page.getByRole('button', { name: '테마' }).click()
  await expect(page.getByRole('button', { name: /라이트/ })).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'settings-theme.png'), fullPage: false })

  await page.keyboard.press('Escape')
  await expect(page.locator('.modal-overlay')).toHaveCount(0)
})

test('F8 사이드바: 단일/멀티 토글 + 세션 행 + 컨텍스트 메뉴 + 이름변경 다이얼로그', async () => {
  // 단일/멀티 토글
  const modeBtns = page.locator('.sb-mode .sb-mode-btn')
  await expect(modeBtns).toHaveCount(2)
  await modeBtns.nth(1).click() // 멀티
  await expect(modeBtns.nth(1)).toHaveClass(/on/)
  await modeBtns.nth(0).click() // 단일 복원
  await expect(modeBtns.nth(0)).toHaveClass(/on/)

  // 세션 행 존재
  const items = page.locator('.sb-list .sb-item')
  expect(await items.count()).toBeGreaterThan(0)
  await page.screenshot({ path: join(SHOT_DIR, 'sidebar-sessions.png'), fullPage: false })

  // more → 컨텍스트 메뉴
  await items.first().locator('.more').click()
  await expect(page.locator('.ctx-menu')).toBeVisible()
  await expect(page.locator('.ctx-item', { hasText: '이름 변경' })).toBeVisible()
  await expect(page.locator('.ctx-item.danger', { hasText: '삭제' })).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'sidebar-ctxmenu.png'), fullPage: false })

  // 이름 변경 → 다이얼로그
  await page.locator('.ctx-item', { hasText: '이름 변경' }).click()
  await expect(page.locator('.set-dialog .sd-input')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'sidebar-rename.png'), fullPage: false })
  await page.keyboard.press('Escape') // 다이얼로그 닫기
  await expect(page.locator('.set-dialog')).toHaveCount(0)
})

test('F13 멀티에이전트: 멀티 토글 → 그리드 + count 탭 + 확장 모달', async () => {
  const modeBtns = page.locator('.sb-mode .sb-mode-btn')
  // 멀티 토글 → MultiWorkspace 그리드(메인 영역 교체, 사이드바 유지)
  await modeBtns.nth(1).click()
  await expect(page.locator('.multi .ma-grid')).toBeVisible()
  expect(await page.locator('.ma-grid .ma-panel').count()).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.ma-head .ma-head-title')).toContainText('멀티 에이전트')
  await page.screenshot({ path: join(SHOT_DIR, 'multiagent-grid.png'), fullPage: false })

  // count 탭 6 → 패널 6
  await page.locator('.ma-count .ma-count-btn', { hasText: '6' }).click()
  expect(await page.locator('.ma-grid .ma-panel').count()).toBe(6)

  // 패널 「크게 보기」 → 확장 모달 (zoom 버튼은 패널 호버 시 노출 — 먼저 hover)
  await page.locator('.ma-panel .ma-p-body').first().hover()
  await page.locator('.ma-panel .ma-p-zoom').first().click()
  await expect(page.locator('.ma-expand-overlay')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'multiagent-expand.png'), fullPage: false })
  await page.keyboard.press('Escape')
  await expect(page.locator('.ma-expand-overlay')).toHaveCount(0)

  // 단일 복귀(후속 e2e 비오염)
  await modeBtns.nth(0).click()
  await expect(page.locator('.multi')).toHaveCount(0)
  await expect(page.locator('.pane.chat')).toBeVisible()
})
