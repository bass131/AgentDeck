/**
 * bl1-p03-goal-banner-visual.e2e.ts — BL1 P03 / goal 표시 수명 일원화의 (b) ui-visual
 * 육안 판정용 결정적 시각검증 (opt-in: BL1P03SHOTS=1).
 *
 * 배경(왜 라이브 재현이 아니라 컴포넌트 하네스인가):
 *   goal-stale(신호 없음) 배너의 라이브 재현은 시스템 공백으로 불가능하다 —
 *   (1) 포그라운드 장기 실행 불가, (2) 백그라운드 알림 정책 부재, (3) `/goal` 조기 종료로
 *   stale-watchdog 임계에 도달하기 전에 goalRun이 소멸한다. 따라서 육안 미감 판정 자료는
 *   라이브 e2e 대신 *컴포넌트 하네스 렌더*로 확보한다(01.Phases/16_BL1-backlog-closeout).
 *
 * 방식(결정적 · 앱 소스 무수정 — qa 영역):
 *   LoopStatusBanner는 순수 표시 컴포넌트(props → 확정 DOM, window/fs/타이머 0)라
 *   손으로 마크업을 그리지 않고 *실제 컴포넌트를 그대로 렌더*한다(골든 드리프트 방지).
 *   1) esbuild로 renderer의 LoopStatusBanner + resolveLoopStatus를 브라우저 IIFE로 번들
 *      (CSS import는 `empty` 로더로 무력화 — 스타일은 아래 2)에서 실 파일을 그대로 주입).
 *   2) 실 `theme/tokens.css` + `LoopStatusBanner.css`를 <style>로 그대로 삽입 → 실 CSS 토큰.
 *   3) 최소 Electron main(하네스 전용, 앱 아님)이 이 HTML을 BrowserWindow에 로드.
 *   4) resolveLoopStatus로 store 상태(goalRun/bannerStale/staleDismissed)를 그대로 재현한
 *      LoopStatus를 주입 → 각 상태 × 다크/라이트 스크린샷.
 *
 * 결정성: 시간/랜덤/네트워크/엔진 0. 스피너 무한회전은 prefers-reduced-motion:reduce
 *   에뮬레이션으로 정지(컴포넌트 자체 접근성 경로 재사용 — 주입 해킹 아님)해 캡처 안정화.
 *
 * 이 스펙은 *육안 게이트용 자료 수집*이 목적이라(bf3-p06-permission-card-shots 관례) 기본
 *   e2e 스위트에서는 skip하고 BL1P03SHOTS=1일 때만 구동한다. 단, 구동 시엔 실 컴포넌트가
 *   실 CSS로 렌더됐는지 DOM 단언으로 회귀도 함께 검증한다(빈 캡처·마크업 드리프트 방어).
 *
 * 실행:
 *   BL1P03SHOTS=1 npx playwright test 99.Others/tests/e2e/bl1-p03-goal-banner-visual.e2e.ts
 *
 * 산출물: 01.Phases/16_BL1-backlog-closeout/ScreenShot/
 *   - p03-goal-{dark,light}.png            (goal 정상 — 배치 맥락 포함 전체창)
 *   - p03-goal-stale-{dark,light}.png      (goal-stale 핵심 — ✕ 닫기 버튼 포함)
 *   - p03-goal-stale-{dark,light}-closeup.png (배너 근접 — 경고 표면·아이콘·닫기 확인용)
 *   - p03-stopped-{dark,light}.png         (여유: 정지 확인)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.BL1P03SHOTS === '1'

// ── 경로 상수 ────────────────────────────────────────────────────────────────
const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02.Source', 'renderer', 'src')
const TOKENS_CSS = join(RENDERER_SRC, 'theme', 'tokens.css')
const BANNER_CSS = join(RENDERER_SRC, 'components', '07_notice', 'LoopStatusBanner.css')
const SHOT_DIR = join(ROOT, '01.Phases', '16_BL1-backlog-closeout', 'ScreenShot')

// goal 목표 텍스트(과제 지정) — 라이브에서 흔한 "장기 대기형" 목표를 대표.
const GOAL_DETAIL = '터미널에서 90초 대기 후 완료 보고'
const GOAL_ACTIVITY = '터미널 명령을 실행하고 결과를 기다리는 중'

let app: ElectronApplication
let page: Page
let tmp: string

/**
 * 하네스 진입 번들 — 실제 LoopStatusBanner를 그대로 렌더한다(손 마크업 금지).
 * store 상태는 resolveLoopStatus를 통해 재현 → 표시 판정 계약을 우회하지 않는다.
 * onDismissStale/onDismissStopped를 전달해 ✕ 닫기 버튼(.loop-dismiss)이 실제로 렌더되게 한다.
 */
const ENTRY_TSX = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { LoopStatusBanner } from './components/07_notice/LoopStatusBanner'
import { resolveLoopStatus } from './lib/loopStatus'

const root = createRoot(document.getElementById('root'))

function paint(status, activity) {
  const active = status.kind === 'goal' || status.kind === 'goal-stale'
  root.render(
    React.createElement(
      'div',
      { className: 'conversation' + (active ? ' loop-active' : '') },
      React.createElement(
        'div',
        { className: 'harness-scroll' },
        React.createElement('div', { className: 'harness-hint' }, '채팅 영역 — 컴포저 위 배너 배치 맥락'),
      ),
      React.createElement(LoopStatusBanner, {
        status,
        onStopSdk: status.kind === 'sdk' ? function () {} : undefined,
        onDismissStopped: function () {},
        onDismissStale: function () {},
        currentActivity: activity == null ? null : activity,
      }),
      React.createElement(
        'div',
        { className: 'harness-composer' },
        React.createElement('div', { className: 'harness-composer-inner' }, '메시지 입력…'),
      ),
    ),
  )
}

;(window).__paintGoal = (turns, detail, activity) => paint(resolveLoopStatus([], { turns, detail }), activity)
;(window).__paintGoalStale = (turns, detail) => paint(resolveLoopStatus([], { turns, detail }, false, true, false), null)
;(window).__paintStopped = () => paint(resolveLoopStatus([], null, true), null)
;(window).__ready = true
`

/** 배치 맥락 스캐폴딩 — 하네스 전용(앱 CSS 아님). 배너/카드 스타일은 실 CSS가 소유,
 *  여기선 "채팅 패널 + 컴포저" 배치만 흉내내 배너가 어디에 앉는지 육안 맥락을 준다. */
const HARNESS_CSS = `
html, body { margin: 0; padding: 0; }
body { background: var(--desktop); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
#root { padding: 44px 0; }
.conversation {
  width: 860px;
  margin: 0 auto;
  padding: 18px 0 0;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
}
.harness-scroll { min-height: 200px; padding: 18px 28px 8px; }
.harness-hint { color: var(--text-4); font-size: 12.5px; }
.harness-composer { margin: 6px 28px 22px; }
.harness-composer-inner {
  border: 1px solid var(--line-2);
  background: var(--inset);
  border-radius: 12px;
  padding: 15px 16px;
  color: var(--text-3);
  font-size: 13px;
}
`

async function bundleEntry(): Promise<string> {
  const result = await build({
    stdin: { contents: ENTRY_TSX, resolveDir: RENDERER_SRC, loader: 'tsx', sourcefile: 'harness-entry.tsx' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
    write: false,
    logLevel: 'silent',
  })
  return result.outputFiles[0].text
}

async function setTheme(theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
}

/** 전체창 + 배너 근접 두 컷. closeup=false면 근접샷 생략. */
async function shoot(name: string, closeup = false): Promise<void> {
  await expect(page.locator('.loop-indicator')).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: false })
  if (closeup) {
    await page.locator('.loop-indicator').screenshot({ path: join(SHOT_DIR, `${name}-closeup.png`) })
  }
}

test.describe('BL1 P03: goal 배너 상태 시각검증 (BL1P03SHOTS=1)', () => {
  test.skip(!RUN, '육안 자료 수집 — BL1P03SHOTS=1로 명시 실행')

  test.beforeAll(async () => {
    mkdirSync(SHOT_DIR, { recursive: true })
    tmp = mkdtempSync(join(tmpdir(), 'agentdeck-bl1p03-'))

    const js = await bundleEntry()
    const tokensCss = readFileSync(TOKENS_CSS, 'utf8')
    const bannerCss = readFileSync(BANNER_CSS, 'utf8')

    const html = `<!doctype html>
<html data-theme="dark">
<head>
<meta charset="utf-8" />
<style>${tokensCss}</style>
<style>${bannerCss}</style>
<style>${HARNESS_CSS}</style>
</head>
<body><div id="root"></div><script>${js}</script></body>
</html>`
    const htmlPath = join(tmp, 'harness.html')
    writeFileSync(htmlPath, html)

    // 하네스 전용 최소 Electron main(앱 아님) — 클린 BrowserWindow에 HTML 로드.
    const mainPath = join(tmp, 'main.cjs')
    writeFileSync(
      mainPath,
      `const { app, BrowserWindow } = require('electron')
app.disableHardwareAcceleration()
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1000,
    height: 920,
    backgroundColor: '#000000',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.loadFile(${JSON.stringify(htmlPath)})
})
app.on('window-all-closed', () => app.quit())
`,
    )

    app = await electron.launch({ args: [mainPath] })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, {
      timeout: 15_000,
    })
    // 스피너 무한회전 정지 → 결정적 캡처(컴포넌트 자체 reduced-motion 경로 재사용).
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  test('goal 정상 변형 — 스피너 + 라벨 + N턴 배지 + 목표 텍스트 (다크/라이트)', async () => {
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(theme)
      await page.evaluate(
        ([d, a]) => (window as unknown as { __paintGoal: (t: number, d: string, a: string) => void }).__paintGoal(3, d, a),
        [GOAL_DETAIL, GOAL_ACTIVITY],
      )
      const root = page.locator('.loop-indicator.loop-goal')
      await expect(root).toBeVisible()
      // 실 컴포넌트 렌더 회귀 단언(빈 캡처·드리프트 방어)
      await expect(root.locator('.loop-spinner')).toBeVisible()
      await expect(root.locator('.loop-goal-turns')).toHaveText('3턴')
      await expect(root.locator('.loop-topic')).toHaveText(GOAL_DETAIL)
      await expect(root).toContainText('목표를 향해 자율 반복 중')
      await shoot(`p03-goal-${theme}`)
    }
  })

  test('goal-stale 변형(핵심) — ⚠ + 신호 없음 문구 + 목표 텍스트 유지 + ✕ 닫기 (다크/라이트)', async () => {
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(theme)
      await page.evaluate(
        (d) => (window as unknown as { __paintGoalStale: (t: number, d: string) => void }).__paintGoalStale(3, d),
        GOAL_DETAIL,
      )
      const root = page.locator('.loop-indicator.loop-goal-stale')
      await expect(root).toBeVisible()
      // 경고 아이콘(IconAlert svg) + 라벨 + 안내 문구 + 목표 텍스트 유지 + 우상단 ✕
      await expect(root.locator('.loop-ic svg')).toBeVisible()
      await expect(root.locator('.loop-label')).toHaveText('목표 자율 반복 — 신호 없음')
      await expect(root.locator('.loop-topic')).toContainText('일정 시간 진행 신호가 없어요')
      await expect(root.locator('.loop-current')).toHaveText(GOAL_DETAIL)
      await expect(root.locator('.loop-dismiss')).toBeVisible()
      await shoot(`p03-goal-stale-${theme}`, true)
    }
  })

  test('stopped 변형(여유) — 루프 정지됨 확인 (다크/라이트)', async () => {
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(theme)
      await page.evaluate(() => (window as unknown as { __paintStopped: () => void }).__paintStopped())
      const root = page.locator('.loop-indicator.loop-stopped')
      await expect(root).toBeVisible()
      await expect(root.locator('.loop-label')).toHaveText('루프 정지됨')
      await expect(root.locator('.loop-spinner')).toHaveCount(0) // 진행 아님 — 회전 없음
      await shoot(`p03-stopped-${theme}`)
    }
  })
})
