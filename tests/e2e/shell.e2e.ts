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

test('시각: 다크/라이트 양 테마 셸 캡처', async () => {
  // 다크(기본)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: join(SHOT_DIR, 'shell-dark.png'), fullPage: false })
  // 라이트(코랄 강조)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.screenshot({ path: join(SHOT_DIR, 'shell-light.png'), fullPage: false })
  // 다크 복원
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
})
