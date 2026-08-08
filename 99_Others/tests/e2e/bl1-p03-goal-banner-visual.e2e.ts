import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.BL1P03SHOTS === '1'

const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02_Source', 'renderer', 'src')
const TOKENS_CSS = join(RENDERER_SRC, 'theme', 'tokens.css')
const BANNER_CSS = join(RENDERER_SRC, 'features', 'notice', 'LoopStatusBanner.css')
const SHOT_DIR = join(ROOT, '01_Phases', '16_BL1-backlog-closeout', 'ScreenShot')

const GOAL_DETAIL = '터미널에서 90초 대기 후 완료 보고'
const GOAL_ACTIVITY = '터미널 명령을 실행하고 결과를 기다리는 중'

let app: ElectronApplication
let page: Page
let tmp: string

const ENTRY_TSX = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { LoopStatusBanner } from './features/notice'
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

    const uddDir = join(tmp, 'udd')
    mkdirSync(uddDir, { recursive: true })
    app = await electron.launch({ args: [`--user-data-dir=${uddDir}`, mainPath] })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, {
      timeout: 15_000,
    })
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
      await expect(root.locator('.loop-spinner')).toHaveCount(0)
      await shoot(`p03-stopped-${theme}`)
    }
  })
})
