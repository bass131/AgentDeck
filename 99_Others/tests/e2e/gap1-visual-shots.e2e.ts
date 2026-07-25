/**
 * gap1-visual-shots.e2e.ts — GAP1 육안 일괄 트랙 컴포넌트 하네스 시각검증 (opt-in).
 *
 * 배경(왜 라이브가 아니라 하네스인가 — BL1 P03 bl1-p03-goal-banner-visual.e2e.ts 관행):
 *   dogfood 라이브 통주(gap1-dogfood-live.e2e.ts)가 커버하지 못하는 육안 포인트는 라이브
 *   재현이 비결정적이거나 시스템상 불가능하다 —
 *   - P04 api_retry(실제 API 과부하 필요) · compact(장시간 대화로 컨텍스트 압축 유발 필요)
 *   - P05 HookTimeline(격리 워크스페이스에는 훅 미설정 — 실행 중/오류 상태 조합도 비결정)
 *   - P06 redacted-thinking(SDK가 원문 대신 토큰 추정치만 보내는 구간은 유발 불가)
 *   - P08 검색 렌더 4모드 × 양테마(라이브는 모델이 고른 1모드만) · raw 폴백
 *   - P09 터미널 상태 조합·truncated 마커(상한 10만자 초과 유발은 비용 과다)
 *   따라서 *실제 컴포넌트를 실제 CSS로 그대로 렌더*해 육안 자료를 결정적으로 확보한다
 *   (손 마크업 금지 — 골든 드리프트 방지, 앱 소스 무수정 = qa 영역).
 *
 * 방식: esbuild로 renderer 실제 컴포넌트를 IIFE 번들(CSS import는 empty 로더로 무력화,
 *   스타일은 실 CSS 파일을 <style>로 그대로 주입) → 하네스 전용 최소 Electron main이
 *   BrowserWindow에 로드 → 장면별 __paint(scene) 주입 → DOM 단언 + 다크/라이트 캡처.
 *
 * 결정성: 시간/랜덤/네트워크/엔진 0. 스피너는 prefers-reduced-motion:reduce로 정지.
 *
 * 실행:
 *   GAP1SHOTS=1 npx playwright test 99.Others/tests/e2e/gap1-visual-shots.e2e.ts
 *
 * 산출물: 01.Phases/17_GAP1-core-parity/ScreenShot/ (NN-포인트설명-{dark|light}.png)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.GAP1SHOTS === '1'

// ── 경로 상수 ────────────────────────────────────────────────────────────────
const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02.Source', 'renderer', 'src')
const SHOT_DIR = join(ROOT, '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

/** 실 CSS 주입 목록 — 각 대상 컴포넌트가 import하는 파일을 그대로 쓴다(토큰 포함). */
const CSS_FILES = [
  'theme/tokens.css',
  'components/01_conversation/Conversation.css',
  'components/01_conversation/ToolGroup.css',
  'components/01_conversation/ToolCallCard.css',
  'components/01_conversation/SearchResultView.css',
  'components/01_conversation/BackgroundTaskView.css',
  'components/01_conversation/MarkdownView.css',
  'components/03_viewer/CodeViewer.css',
  'components/05_agent/AgentPanel.css',
  'components/06_prompt/QuestionModal.css', // q-num 공유 스타일(PermissionCard 코로케이션)
  'components/07_notice/HookTimeline.css',
  'components/07_notice/LoopStatusBanner.css',
  'components/07_notice/PermissionCard.css',
]

let app: ElectronApplication
let page: Page
let tmp: string

/**
 * 하네스 진입 번들 — 실제 컴포넌트를 그대로 렌더(손 마크업 금지).
 * 장면(scene) 문자열 → 해당 컴포넌트 + 고정 fixture. 템플릿 리터럴은 escape 마찰을
 * 피하려고 문자열 연결로만 쓴다.
 */
const ENTRY_TSX = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ToolCallCard } from './components/01_conversation/ToolCallCard'
import { TodosSection } from './components/05_agent/AgentPanel'
import { HookTimeline } from './components/07_notice/HookTimeline'
import { LoopStatusBanner } from './components/07_notice/LoopStatusBanner'
import { PermissionCard } from './components/07_notice/PermissionCard'
import { ThinkingItem, NoticeItem } from './components/01_conversation/Conversation'

const root = createRoot(document.getElementById('root'))

// ── 고정 fixtures ────────────────────────────────────────────────────────────

const READ_RESULT = [
  "export type ToolKind = 'read' | 'write' | 'edit' | 'bash' | 'web' | 'search' | 'mcp' | 'git' | 'other'",
  '',
  'export interface ToolMeta {',
  '  kind: ToolKind',
  '  verb: string',
  '  color: string',
  '}',
  '',
  'export function toolMetaFor(name: string): ToolMeta {',
  "  const key = (name || '').toLowerCase().replace(/[^a-z]/g, '')",
  '  if (MAP[key]) return MAP[key]',
  "  if (key.startsWith('mcp')) return { kind: 'mcp', verb: mcpToolLabel(name), color: 'var(--rose)' }",
  "  return { kind: 'other', verb: name || '도구', color: 'var(--text-3)' }",
  '}',
].join('\\n')

const READ_CARD = {
  id: 'tc-read',
  name: 'Read',
  input: { file_path: '02.Source/renderer/src/lib/toolKind.ts' },
  status: 'done',
  result: READ_RESULT,
}

const MCP_CARD = {
  id: 'tc-mcp',
  name: 'mcp__context7__resolve-library-id',
  input: { libraryName: 'react' },
  status: 'done',
  result: '{ "libraryId": "/facebook/react" }',
}

const TODOS = [
  { id: 't1', label: '계약 타입 정의(shared)', status: 'done' },
  { id: 't2', label: '어댑터 정규화 배선', status: 'done' },
  { id: 't3', label: '렌더 컴포넌트 구현', status: 'running' },
  { id: 't4', label: '골든 테스트 갱신', status: 'planned' },
  { id: 't5', label: '육안 스크린샷 채증', status: 'planned' },
]

const HOOK_RUNS = [
  { hookId: 'h1', hookName: 'pin-injector', hookEvent: 'UserPromptSubmit', status: 'success', exitCode: 0 },
  { hookId: 'h2', hookName: 'dangerous-cmd-guard', hookEvent: 'PreToolUse', status: 'success', exitCode: 0 },
  { hookId: 'h3', hookName: 'tdd-guard', hookEvent: 'PreToolUse', status: 'error', exitCode: 2, stderr: 'RED test missing' },
  { hookId: 'h4', hookName: 'reviewer-auto-trigger', hookEvent: 'Stop', status: 'running' },
]

const THINKING_TEXT = [
  '사용자가 요청한 farewell 함수를 sample.ts에 추가하려면 먼저 기존 greet 함수의 서명을 확인해야 한다.',
  'greet은 name: string을 받아 템플릿 문자열을 반환하므로, farewell도 같은 패턴을 따르는 것이 일관적이다.',
  '',
  '고려한 대안: (1) 별도 파일로 분리 — 함수 하나에 과한 구조, (2) 기존 파일에 추가 — 응집도 유지. (2)를 선택.',
  '수정 범위는 sample.ts 한 파일, export 함수 1개 추가. 기존 코드 변경 없음(additive).',
].join('\\n')

const PLAN_MD = [
  '# Plan: Add farewell function',
  '',
  '## Context',
  'sample.ts has greet(name); the user wants a matching farewell(name).',
  '',
  '## Changes',
  '1. Add export function farewell(name: string): string to sample.ts',
  '2. Return the string "Bye, " + name (template literal)',
  '3. No other files touched',
].join('\\n')

const PLAN_PENDING = {
  runId: 'run-p07',
  requestId: 'req-p07',
  toolName: 'ExitPlanMode',
  summary: '계획 검토: Plan: Add farewell function',
  planReview: {
    plan: PLAN_MD,
    planFilePath: 'C:\\\\Users\\\\bass1\\\\.claude\\\\plans\\\\add-farewell-function.md',
  },
}

const PLAN_PENDING_EMPTY = {
  runId: 'run-p07e',
  requestId: 'req-p07e',
  toolName: 'ExitPlanMode',
  summary: 'ExitPlanMode 실행',
  planReview: { plan: '' },
}

const SR_CONTENT = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'content',
  matches: [
    { path: '02.Source/main/index.ts', line: 10, text: "import { app } from 'electron'" },
    { path: '02.Source/main/index.ts', line: 42, text: 'app.whenReady().then(bootstrap)' },
    { path: '02.Source/renderer/src/App.tsx', line: 7, text: 'export function App(): React.JSX.Element {' },
  ],
  files: ['02.Source/main/index.ts', '02.Source/renderer/src/App.tsx'],
  total: 3,
}

const SR_FILES = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'files_with_matches',
  files: ['02.Source/main/01_agents/claude-stream.ts', '02.Source/shared/agent-events.ts', '99.Others/tests/agents/claude-stream.golden.test.ts'],
  total: 3,
}

const SR_COUNT = {
  type: 'search_result',
  toolUseId: 'tc-grep',
  mode: 'count',
  files: ['02.Source/main/01_agents/claudeAgentRun.ts', '02.Source/main/01_agents/agent-runs.ts'],
  total: 17,
}

const SR_GLOB = {
  type: 'search_result',
  toolUseId: 'tc-glob',
  mode: 'glob',
  files: ['02.Source/main/index.ts', '02.Source/preload/index.ts', '02.Source/renderer/src/main.tsx'],
  total: 245,
  truncated: true,
}

function searchCard(sr) {
  return {
    // 장면 전환 시 React 리마운트 유도용 고유 id(아래 SCENES의 key와 함께) — 같은 위치에
    // 같은 컴포넌트 타입이 연속 렌더되면 로컬 open 상태가 보존돼 클릭이 '닫기'가 된다.
    id: 'tc-search-' + sr.mode,
    name: sr.mode === 'glob' ? 'Glob' : 'Grep',
    input: sr.mode === 'glob' ? { pattern: '**/index.ts' } : { pattern: 'app', output_mode: sr.mode },
    status: 'done',
    searchResult: sr,
  }
}

const RAW_CARD = {
  id: 'tc-raw',
  name: 'Grep',
  input: { pattern: 'greet' },
  status: 'done',
  result: 'sample.ts:6:export function greet(name: string): string {\\nutil.ts:1:import { greet } from "./sample"\\nutil.ts:4:  return names.map((n) => greet(n))',
}

function tailLines(n) {
  const out = []
  for (let i = 1; i <= n; i++) out.push('[dev-server] tick ' + i + ' — serving http://localhost:5173')
  return out.join('\\n') + '\\n'
}

function bgCard(status, truncated) {
  return {
    id: 'tc-bg',
    name: 'Bash',
    input: { command: 'npm run dev', run_in_background: true },
    status: 'running',
    background: true,
    bgTask: {
      taskId: 'b7hqf83vz',
      toolUseId: 'tc-bg',
      description: 'dev server',
      status: status,
      tail: tailLines(40),
      truncated: !!truncated,
    },
  }
}

// ── 장면 렌더 ────────────────────────────────────────────────────────────────

function chatWrap(children) {
  return React.createElement(
    'div',
    { className: 'harness-chat' },
    React.createElement('div', { className: 'harness-hint' }, '채팅 영역 — 배치 맥락(하네스 스캐폴드)'),
    children,
  )
}

const noop = function () {}

const SCENES = {
  'p01-read-card': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { card: READ_CARD, fileDiffs: {} }))),
  'p01-todos': () => chatWrap(
    React.createElement('div', { style: { maxWidth: 340 } },
      React.createElement(TodosSection, { todos: TODOS, isRunning: true }))),
  'p01-mcp-verb': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { card: MCP_CARD, fileDiffs: {} }))),
  'p04-api-retry': () => chatWrap(
    React.createElement(LoopStatusBanner, { status: { kind: 'none' }, apiRetry: { attempt: 2, maxRetries: 5 } })),
  'p04-compacting': () => chatWrap(
    React.createElement(LoopStatusBanner, { status: { kind: 'none' }, compacting: 'compacting' })),
  'p04-compact-boundary': () => chatWrap(
    React.createElement(NoticeItem, {
      text: '대화가 길어져 컨텍스트를 압축했어요 (' + (167000).toLocaleString('ko-KR') + ' → ' + (42000).toLocaleString('ko-KR') + ' 토큰)',
      time: '14:02',
    })),
  'p05-hook-timeline': () => chatWrap(
    React.createElement(HookTimeline, { hookRuns: HOOK_RUNS })),
  'p06-thinking': () => chatWrap(
    React.createElement(ThinkingItem, { text: THINKING_TEXT, estimatedTokens: 1264 })),
  'p06-redacted': () => chatWrap(
    React.createElement(ThinkingItem, { text: '', estimatedTokens: 2048 })),
  'p07-plan-card': () => chatWrap(
    React.createElement(PermissionCard, { pending: PLAN_PENDING, onRespond: noop })),
  'p07-plan-empty': () => chatWrap(
    React.createElement(PermissionCard, { pending: PLAN_PENDING_EMPTY, onRespond: noop })),
  'p08-search-content': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { key: 'sr-content', card: searchCard(SR_CONTENT), fileDiffs: {} }))),
  'p08-search-files': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { key: 'sr-files', card: searchCard(SR_FILES), fileDiffs: {} }))),
  'p08-search-count': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { key: 'sr-count', card: searchCard(SR_COUNT), fileDiffs: {} }))),
  'p08-search-glob': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { key: 'sr-glob', card: searchCard(SR_GLOB), fileDiffs: {} }))),
  'p08-search-raw': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { card: RAW_CARD, fileDiffs: {} }))),
  'p09-bg-running': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { card: bgCard('running'), fileDiffs: {}, runId: 'run-p09' }))),
  'p09-bg-stopped': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { card: bgCard('stopped'), fileDiffs: {}, runId: 'run-p09' }))),
  'p09-bg-truncated': () => chatWrap(
    React.createElement('div', { className: 'toollog' },
      React.createElement(ToolCallCard, { card: bgCard('running', true), fileDiffs: {}, runId: 'run-p09' }))),
}

;(window).__paint = (scene) => {
  const fn = SCENES[scene]
  if (!fn) throw new Error('unknown scene: ' + scene)
  root.render(fn())
}
;(window).__ready = true
`

/** 배치 맥락 스캐폴딩(하네스 전용 CSS — 컴포넌트 스타일은 실 CSS가 소유). */
const HARNESS_CSS = `
html, body { margin: 0; padding: 0; }
body { background: var(--bg); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
#root { padding: 28px 0 40px; }
.harness-chat {
  width: 860px;
  margin: 0 auto;
  padding: 16px 24px 24px;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.harness-hint { color: var(--text-4); font-size: 12px; margin-bottom: 12px; }
`

async function bundleEntry(): Promise<string> {
  const result = await build({
    stdin: { contents: ENTRY_TSX, resolveDir: RENDERER_SRC, loader: 'tsx', sourcefile: 'gap1-harness-entry.tsx' },
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

async function paint(scene: string): Promise<void> {
  await page.evaluate((s) => (window as unknown as { __paint: (s: string) => void }).__paint(s), scene)
}

async function setTheme(theme: 'dark' | 'light'): Promise<void> {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
}

async function shoot(name: string, theme: 'dark' | 'light'): Promise<void> {
  await setTheme(theme)
  await page.waitForTimeout(80)
  await page.screenshot({ path: join(SHOT_DIR, `${name}-${theme}.png`), fullPage: false })
}

/** 다크/라이트 두 컷. */
async function shootBoth(name: string): Promise<void> {
  await shoot(name, 'dark')
  await shoot(name, 'light')
  await setTheme('dark')
}

test.describe('GAP1 육안 일괄: 컴포넌트 하네스 시각검증 (GAP1SHOTS=1)', () => {
  test.skip(!RUN, '육안 자료 수집 — GAP1SHOTS=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    tmp = mkdtempSync(join(tmpdir(), 'agentdeck-gap1shots-'))

    const js = await bundleEntry()
    const cssBlocks = CSS_FILES.map((rel) => `<style>${readFileSync(join(RENDERER_SRC, rel), 'utf8')}</style>`).join('\n')

    const html = `<!doctype html>
<html data-theme="dark">
<head>
<meta charset="utf-8" />
${cssBlocks}
<style>${HARNESS_CSS}</style>
</head>
<body>
<div id="root"></div>
<script>
// 하네스 스텁 — 클릭 액션 미사용 경로 방어(신뢰경계 실 IPC 없음)
window.api = { fsRead: async () => ({}), agentTaskStop: async () => ({ accepted: true }) }
</script>
<script>${js}</script>
</body>
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
    height: 900,
    backgroundColor: '#000000',
    webPreferences: { contextIsolation: false, nodeIntegration: false },
  })
  win.loadFile(${JSON.stringify(htmlPath)})
})
app.on('window-all-closed', () => app.quit())
`
    )

    app = await electron.launch({ args: [mainPath] })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, {
      timeout: 20_000,
    })
    // 스피너/dots 무한 애니메이션 정지 — 결정적 캡처(컴포넌트 자체 접근성 경로 재사용)
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  test('P01a: Read 결과 → CodeViewer 구문강조 (펼침, 다크/라이트)', async () => {
    await paint('p01-read-card')
    await page.locator('.t-item.t-read .t-row').click() // 펼침(실 인터랙션)
    await expect(page.locator('.t-code-viewer .code-viewer')).toBeVisible()
    // CodeMirror 실렌더 확인(하이라이트 토큰 존재 — 빈 캡처 방어)
    await expect(page.locator('.t-code-viewer .cm-content')).toContainText('ToolKind')
    await shootBoth('20-p01-read-codeviewer')
  })

  test('P01b: TodosSection(멀티패널 PanelView와 동일 재사용 단위) — 진행바+상태 3종', async () => {
    await paint('p01-todos')
    await expect(page.locator('.ag-sec-title')).toHaveText('할 일')
    await expect(page.locator('.ag-count')).toHaveText('2/5')
    await expect(page.locator('.todo.running')).toHaveCount(1)
    await shootBoth('21-p01-panelview-todos')
  })

  test("P01c: MCP 도구 verb '서버 · 도구' 라벨", async () => {
    await paint('p01-mcp-verb')
    await expect(page.locator('.t-verb')).toHaveText('context7 · resolve-library-id')
    await shootBoth('22-p01-mcp-verb-label')
  })

  test('P04: api_retry 배너 — 과부하 재시도 (N/M)', async () => {
    await paint('p04-api-retry')
    const banner = page.locator('.loop-indicator.loop-api-retry')
    await expect(banner).toBeVisible()
    await expect(banner.locator('.loop-label')).toHaveText('과부하로 재시도 중')
    await expect(banner.locator('.loop-goal-turns')).toHaveText('2/5')
    await shootBoth('23-p04-api-retry-banner')
  })

  test('P04: compacting 배너 — 컨텍스트 압축 중', async () => {
    await paint('p04-compacting')
    await expect(page.locator('.loop-indicator.loop-compacting .loop-label')).toHaveText('컨텍스트를 압축하는 중…')
    await shootBoth('24-p04-compacting-banner')
  })

  test('P04: compact_boundary 인라인 마커 (pre→post 토큰)', async () => {
    await paint('p04-compact-boundary')
    await expect(page.locator('.notice-row .notice-text')).toContainText('컨텍스트를 압축했어요')
    await expect(page.locator('.notice-row .notice-text')).toContainText('167,000 → 42,000 토큰')
    await shootBoth('25-p04-compact-boundary-marker')
  })

  test('P05: HookTimeline — 접힘 요약 + 펼침 상세(성공/오류/실행중 + exit)', async () => {
    await paint('p05-hook-timeline')
    const tl = page.locator('[data-testid="hook-timeline"]')
    await expect(tl).toBeVisible()
    await expect(tl.locator('.hook-timeline-label')).toHaveText('훅 4건')
    await expect(tl.locator('.hook-timeline-count-running')).toHaveText('실행중 1')
    await expect(tl.locator('.hook-timeline-count-error')).toHaveText('오류 1')
    await shootBoth('26-p05-hook-timeline-collapsed')

    await tl.locator('[data-testid="hook-timeline-summary"]').click()
    await expect(tl.locator('[data-testid="hook-timeline-detail"]')).toBeVisible()
    await expect(tl.locator('.hook-timeline-row-error .hook-timeline-exit')).toHaveText('exit 2')
    await shootBoth('27-p05-hook-timeline-expanded')
  })

  test('P06: 확장 사고 블록 — 접힘(글자수+토큰 추정) + 펼침 전문', async () => {
    await paint('p06-thinking')
    const block = page.locator('[data-testid="thinking-block"]')
    await expect(block).toBeVisible()
    await expect(block.locator('.thinking-summary-label')).toHaveText('사고 과정')
    await expect(block.locator('.thinking-summary-tokens')).toContainText('토큰')
    await shootBoth('28-p06-thinking-collapsed')

    await block.locator('[data-testid="thinking-toggle"]').click()
    await expect(block.locator('[data-testid="thinking-detail"]')).toContainText('farewell 함수')
    await shootBoth('29-p06-thinking-expanded')
  })

  test('P06: redacted-thinking 진행 스피너 (토큰 추정치만)', async () => {
    await paint('p06-redacted')
    const prog = page.locator('[data-testid="thinking-progress"]')
    await expect(prog).toBeVisible()
    await expect(prog).toContainText('사고 중… ~2,048 토큰')
    // 토글 없음(펼칠 전문 부재 — fallback 계약)
    expect(await page.locator('[data-testid="thinking-toggle"]').count()).toBe(0)
    await shootBoth('30-p06-redacted-thinking')
  })

  test('P07: plan 승인 카드 — 접힘/펼침 + planFilePath + 2액션', async () => {
    await paint('p07-plan-card')
    const card = page.locator('.perm-card[data-plan-mode]')
    await expect(card).toBeVisible()
    // planFilePath 표기(현행 = 전체 경로 노출, basename 🟡 육안 판정 포인트)
    await expect(card.locator('.perm-card-plan-path')).toContainText('add-farewell-function.md')
    // 액션 2개(allow_always 없음) — 계약 핀
    await expect(card.locator('[data-perm-choice="allow"]')).toContainText('실행 승인')
    await expect(card.locator('[data-perm-choice="deny"]')).toContainText('계속 계획')
    expect(await card.locator('[data-perm-choice="allow_always"]').count()).toBe(0)
    await shootBoth('31-p07-plan-card-collapsed')

    await card.locator('[data-plan-toggle]').click()
    await expect(card.locator('.perm-card-plan-body')).toContainText('Plan: Add farewell function')
    await shootBoth('32-p07-plan-card-expanded')
  })

  test('P07: plan 본문 미확보 fallback', async () => {
    await paint('p07-plan-empty')
    await expect(page.locator('.perm-card-plan-empty')).toHaveText('계획 본문을 가져올 수 없음')
    await shootBoth('33-p07-plan-card-empty')
  })

  test('P08: 검색 렌더 4모드 (content/files/count/glob) — 양테마', async () => {
    // content — 파일 그룹 + 라인번호 매치
    await paint('p08-search-content')
    await page.locator('.t-item.t-search .t-row').click()
    await expect(page.locator('[data-search-file]').first()).toBeVisible()
    await expect(page.locator('[data-search-match]')).toHaveCount(3)
    await shootBoth('34-p08-search-content')

    // files_with_matches — 파일 목록 + total
    await paint('p08-search-files')
    await page.locator('.t-item.t-search .t-row').click()
    await expect(page.locator('[data-search-file]')).toHaveCount(3)
    await expect(page.locator('.sr-total')).toContainText('총 3건')
    await shootBoth('35-p08-search-files')

    // count — 파일 수 ≠ 매치 총수(total 17)
    await paint('p08-search-count')
    await page.locator('.t-item.t-search .t-row').click()
    await expect(page.locator('.sr-total')).toContainText('총 17건')
    await shootBoth('36-p08-search-count')

    // glob — truncated '일부만 표시'
    await paint('p08-search-glob')
    await page.locator('.t-item.t-search .t-row').click()
    await expect(page.locator('.sr-total')).toContainText('총 245건 · 일부만 표시')
    await shootBoth('37-p08-search-glob')
  })

  test('P08: searchResult 부재 → raw <pre> 폴백(회귀 0)', async () => {
    await paint('p08-search-raw')
    await page.locator('.t-item.t-search .t-row').click()
    await expect(page.locator('.bo-res')).toBeVisible()
    expect(await page.locator('[data-search-file]').count()).toBe(0)
    await shootBoth('38-p08-search-raw-fallback')
  })

  test('P09: 배경 셸 — 배지 + 라이브 tail(상시) + 정지 버튼', async () => {
    await paint('p09-bg-running')
    await expect(page.locator('[data-testid="bg-badge"]')).toHaveText('백그라운드')
    const tail = page.locator('[data-testid="bg-tail-view"]')
    await expect(tail).toBeVisible() // 클릭/펼침 없이 상시(T-01 계약)
    await expect(tail).toContainText('tick 40')
    await expect(page.locator('[data-testid="bg-stop-btn"]')).toBeVisible()
    // 고스트 억제: bgTask 카드에 BashOutput 고스트 없음
    expect(await page.locator('.bo-ghost').count()).toBe(0)
    await shootBoth('39-p09-bgtask-running')
  })

  test('P09: 터미널 상태(stopped) — 정지 버튼 소멸 + 로그 보존', async () => {
    await paint('p09-bg-stopped')
    await expect(page.locator('[data-testid="bg-tail-view"]')).toBeVisible()
    expect(await page.locator('[data-testid="bg-stop-btn"]').count()).toBe(0)
    await shootBoth('40-p09-bgtask-stopped')
  })

  test('P09: truncated 절단 표시', async () => {
    await paint('p09-bg-truncated')
    await expect(page.locator('[data-testid="bg-tail-view"]')).toBeVisible()
    await shootBoth('41-p09-bgtask-truncated')
  })
})
