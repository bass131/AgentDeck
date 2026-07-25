/**
 * gap1-p16-continuity-badge-shots.e2e.ts — GAP1 P16 턴 연속성 + 훅 빨간 배지 컴포넌트
 * 하네스 시각검증 (opt-in).
 *
 * 배경(왜 라이브가 아니라 하네스인가 — gap1-p14-splitview-shots.e2e.ts / gap1-visual-shots.e2e.ts
 * 관행 계승):
 *   P16의 육안 포인트(① 사고→답변 연속 연출 ② 훅 차단 턴 빨간 배지 ③ 서브에이전트 셀
 *   연속성)는 라이브로 재현하려면 —
 *   - ① redacted-thinking("사고 중 ~N 토큰")은 SDK가 원문 대신 토큰 추정치만 보내는
 *     구간이라 유발 불가(gap1-visual-shots P06 주석과 동일 사유).
 *   - ② 훅이 도구를 차단/진행중단한 턴은 격리 워크스페이스에 훅 미설정 + 차단 타이밍이
 *     비결정.
 *   - ③ 서브에이전트가 사고→응답으로 이어지는 순간을 동시에 캡처하려면 실 서브에이전트
 *     구동 필요(비용 과다·비결정).
 *   따라서 *실제 컴포넌트를 실제 CSS로 그대로 렌더*해 육안 자료를 결정적으로 확보한다
 *   (손 마크업 금지 — 골든 드리프트 방지, 앱 소스 무수정 = qa 영역).
 *
 * 렌더 방식(p14 "우선안" 계승): 세 표면은 각각 성격이 다르다 —
 *   - 단일챗(Conversation)·멀티패널(PanelView)은 store/세션 결합 컨테이너지만, thread를
 *     *실 store 시드*(단일챗)/*세션 mock*(패널)로 채워 **컨테이너째 렌더**한다. 근거:
 *     deriveHookTurnBadges(store/hookBadge.ts)·isThinkingContinuous(store/continuity.ts)
 *     실경로가 그대로 발화돼(손 마크업 금지) 파생 배지/연속 판정이 골든과 드리프트하지
 *     않는다.
 *   - 서브에이전트 셀(SubAgentChatStream)은 표현 계층 조각이라 agent prop만 넘겨 직접 렌더.
 *
 * 장면 격리: __paint(scene)가 store/시드를 교체하고 key={scene}로 스캐폴드를 **강제
 *   리마운트** — 이전 장면 상태가 다음 장면에 새지 않는다(결정성).
 *
 * 결정성: 시간/랜덤/네트워크/엔진 0. 모든 fixture는 완결 상태(running 스트리밍 커서 없음)
 *   → SmoothMarkdown 점진 reveal 미발화(정적 MarkdownView). 스피너/dots는
 *   prefers-reduced-motion:reduce로 정지.
 *
 * 실행:
 *   P16SHOTS=1 npx playwright test 99.Others/tests/e2e/gap1-p16-continuity-badge-shots.e2e.ts
 *
 * 산출물: 01.Phases/17_GAP1-core-parity/ScreenShot/ (p16-<장면>-{dark|light}.png)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.P16SHOTS === '1'

// ── 경로 상수 ────────────────────────────────────────────────────────────────
const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02.Source', 'renderer', 'src')
const SHOT_DIR = join(ROOT, '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

/** 실 CSS 주입 목록 — 세 표면 렌더 트리가 소비하는 소유 파일 전부(토큰 포함). */
const CSS_FILES = [
  'theme/tokens.css',
  'layout/shell.css',
  // 단일챗(Conversation) + MessageBubble + 배지/연속 스타일
  'components/01_conversation/Conversation.css', // .conversation/.thread/.msg/.meta/.hook-badge/.msg-continuation/.msg-continues/.notice-row
  'components/01_conversation/MarkdownView.css',
  'components/01_conversation/Composer.css',
  'components/01_conversation/ScrollToBottomButton.css',
  'components/01_conversation/CmdResultCard.css',
  'components/01_conversation/ToolGroup.css', // .toollog(서브에이전트 도구 그룹 재사용)
  'components/01_conversation/ToolCallCard.css',
  // 멀티패널(PanelView) 셸 골격 + 풋터 픽커/컴포저
  'components/00_shell/MultiWorkspace.css', // .ma-panel/.ma-p-*/.ma-p-foot
  // 서브에이전트 셀 스트림
  'components/05_agent/SubAgentFullscreen.css', // .saf-msg--*/.saf-msg-continues/.saf-msg-continuation
  'components/05_agent/AgentPanel.css', // .ag-empty/.spin/TodosSection
  // 컴포저 위 배너 슬롯(컨테이너가 상시 마운트 — 데이터 없으면 null 렌더)
  'components/07_notice/HookTimeline.css',
  'components/07_notice/LoopStatusBanner.css',
  'components/07_notice/PermissionCard.css',
  'components/06_prompt/QuestionModal.css',
]

let app: ElectronApplication
let page: Page
let tmp: string

/**
 * 하네스 진입 번들 — 실제 컨테이너/조각을 실 시드로 그대로 렌더. 템플릿 리터럴 escape
 * 마찰을 피하려고 React.createElement + 문자열 연결로만 쓴다(p14/gap1-visual-shots 관행).
 */
const ENTRY_TSX = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import Conversation from './components/01_conversation/Conversation'
import { PanelView } from './components/00_shell/panel/PanelView'
import SubAgentChatStream from './components/05_agent/SubAgentChatStream'
import { useAppStore } from './store/appStore'
import { makePanelInitialState } from './store/panelSession'

const root = createRoot(document.getElementById('root'))
const noop = function () {}
const noopAsync = function () { return Promise.resolve() }

// ── 고정 fixtures ────────────────────────────────────────────────────────────

// 장면 ① 연속성 — 답변 본문(마크다운). 짧은 목록형 응답으로 gap 축소가 육안에 드러나게.
const CONT_ANSWER = [
  'greet과 동일한 패턴으로 farewell을 추가했어요.',
  '',
  '- sample.ts에 export function farewell(name: string) 1개 추가',
  '- 반환: 안녕히 가세요, {name} 템플릿 문자열',
  '- 기존 코드 변경 없음(additive)',
].join('\\n')

// 장면 ① thread — user → redacted thinking("사고 중 ~N 토큰") → 인접 assistant.
// isThinkingContinuous(thread, 1)=true → thinking에 .msg-continues, assistant에 .msg-continuation.
function contThread() {
  return [
    { kind: 'msg', id: 'u1', role: 'user', text: 'sample.ts에 greet과 같은 패턴으로 farewell(name) 함수를 추가해줘.', time: '14:03' },
    // redacted-thinking 구간: text 없음 + estimatedTokens만(SDK 토큰 추정치 상승분) →
    // ThinkingItem이 "사고 중… ~N 토큰" 진행 표시로 렌더. 영호 육안 피드백(2026-07-15 ①)의
    // "토큰 실시간으로 올라가는 아이콘" 바로 그 케이스.
    { kind: 'thinking', id: 'th1', text: '', estimatedTokens: 1264 },
    { kind: 'msg', id: 'a1', role: 'assistant', text: CONT_ANSWER, time: '14:03' },
  ]
}

// 장면 ② 훅 차단 답변 본문.
const HOOK_ANSWER = [
  '방금 그 명령은 dangerous-cmd-guard 훅이 막았어요 — rm -rf는 되돌릴 수 없어서예요.',
  '',
  '대신 삭제 대상을 먼저 확인하고, 안전하게 옮기는 방식을 제안할게요.',
].join('\\n')

// 장면 ② thread(단일챗·패널 공용) — user → permission-denied(hook) → 같은 턴 assistant.
// deriveHookTurnBadges: pd1이 훅 차단(decisionReasonType==='hook') → 같은 턴 최근접 후속
// assistant(a1)에 귀속 → assistant .meta에 빨간 .hook-badge.
function hookThread() {
  return [
    { kind: 'msg', id: 'u1', role: 'user', text: '임시 파일들 rm -rf로 싹 정리해줘.', time: '15:20' },
    { kind: 'permission-denied', id: 'pd1', toolName: 'Bash', decisionReasonType: 'hook', decisionReason: 'dangerous-cmd-guard 훅이 차단했어요: rm -rf 패턴', time: '15:20' },
    { kind: 'msg', id: 'a1', role: 'assistant', text: HOOK_ANSWER, time: '15:20' },
  ]
}

// 장면 ③ 서브에이전트 — transcript thinking → text(응답). status:'done'(스트리밍 커서 없음
// = 정적 캡처). groupSubagentToolRuns: [single(task), single(thinking), single(text)] →
// thinking.nextGroup=text single → .saf-msg-continues, text.prevGroup=thinking single →
// .saf-msg-continuation. (P16 (e): 훅 배지·토큰은 계약 부재로 보류 — 미포함.)
const SUBAGENT = {
  id: 'sa-1',
  name: 'explorer',
  displayName: '코드 스카우트',
  role: 'greet 함수의 서명을 확인하고 farewell 추가 방안을 요약해 주세요.',
  status: 'done',
  tools: [],
  transcript: [
    { kind: 'thinking', id: 'th', text: 'greet은 name: string을 받아 템플릿 문자열을 반환한다. farewell도 같은 패턴을 따르는 게 일관적이다 — 같은 파일에 export 함수 하나만 추가한다.' },
    { kind: 'text', id: 'tx', text: 'greet과 동일한 패턴으로 farewell(name: string)을 sample.ts에 추가하면 됩니다. 반환은 "안녕히 가세요, " + name 형태예요.' },
  ],
}

// ── 세션 mock — PanelView는 store 비의존(session prop). makePanelInitialState()로 완전한
//    PanelSessionState를 만들고 thread/currentRunId만 덮어쓴다(나머지 필드는 makeInitialState
//    기본값 = 실 초기 상태 그대로). 훅 메서드는 표시 캡처에 안 쓰이므로 전부 no-op. ─────
function mockSession(thread) {
  const base = makePanelInitialState()
  const state = Object.assign({}, base, { thread: thread, isRunning: false, currentRunId: 'run-p16-panel' })
  return {
    state: state,
    send: noopAsync,
    abort: noopAsync,
    restore: noop,
    dismissLoopsStopped: noop,
    respondPermission: noopAsync,
    setReplMode: noop,
    dismissGoalStale: noop,
  }
}

const PANEL_META = {
  title: '훅 차단 예시',
  status: 'working',
  cwd: 'C:/Dev/AgentDeck',
  ctxPct: 24,
}

// ── 스캐폴드 — 각 표면을 뷰포트 중앙 프레임 안에 실물 그대로 배치 ────────────────
function ConvScaffold() {
  return React.createElement(
    'div',
    { className: 'harness-frame harness-frame--conv' },
    React.createElement(Conversation, null)
  )
}

function PanelScaffold() {
  return React.createElement(
    'div',
    { className: 'harness-frame harness-frame--panel' },
    React.createElement(PanelView, {
      slot: 0,
      panel: PANEL_META,
      session: mockSession(hookThread()),
      workspaceRoot: 'C:/Dev/AgentDeck',
      onExpand: noop,
      onPrompt: noop,
      onPickFolder: noop,
    })
  )
}

function SubScaffold() {
  return React.createElement(
    'div',
    { className: 'harness-frame harness-frame--sub' },
    React.createElement(SubAgentChatStream, { agent: SUBAGENT })
  )
}

const SCENES = {
  'continuity-single': function () {
    useAppStore.setState({ thread: contThread() })
    return React.createElement(ConvScaffold, { key: 'continuity-single' })
  },
  'hookbadge-single': function () {
    useAppStore.setState({ thread: hookThread() })
    return React.createElement(ConvScaffold, { key: 'hookbadge-single' })
  },
  'hookbadge-panel': function () {
    // PanelView는 세션 mock 시드 — store thread 미사용(이전 장면 잔상 무해). key로 리마운트.
    return React.createElement(PanelScaffold, { key: 'hookbadge-panel' })
  },
  'subagent-continuity': function () {
    return React.createElement(SubScaffold, { key: 'subagent-continuity' })
  },
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
html, body, #root { height: 100%; margin: 0; padding: 0; }
body {
  background: var(--bg-2, var(--bg));
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
}
#root { display: flex; align-items: center; justify-content: center; width: 100%; }
.harness-frame {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
}
/* 단일챗 — Conversation은 height:100%라 프레임 고정 높이를 채운다. */
.harness-frame--conv { width: 760px; height: 800px; }
/* 멀티패널 — .ma-panel은 자체 height 규칙이 없어(그리드 셀 전제) 프레임이 높이를 주고
   flex로 채운다. */
.harness-frame--panel { width: 440px; height: 720px; }
.harness-frame--panel > .ma-panel { flex: 1 1 auto; height: 100%; }
/* 서브에이전트 셀 — .ma-p-body(flex:1)가 프레임을 채운다. */
.harness-frame--sub { width: 560px; height: 440px; }
.harness-frame--sub > .ma-p-body { flex: 1 1 auto; }
`

async function bundleEntry(): Promise<string> {
  const result = await build({
    stdin: { contents: ENTRY_TSX, resolveDir: RENDERER_SRC, loader: 'tsx', sourcefile: 'gap1-p16-harness-entry.tsx' },
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
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(SHOT_DIR, `${name}-${theme}.png`), fullPage: false })
}

/** 다크/라이트 두 컷. */
async function shootBoth(name: string): Promise<void> {
  await shoot(name, 'dark')
  await shoot(name, 'light')
  await setTheme('dark')
}

test.describe('GAP1 P16 연속성 + 훅 배지: 컴포넌트 하네스 시각검증 (P16SHOTS=1)', () => {
  test.skip(!RUN, '육안 자료 수집 — P16SHOTS=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    tmp = mkdtempSync(join(tmpdir(), 'agentdeck-p16shots-'))

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
// 하네스 스텁 — store 마운트 액션(listFiles/getUsage) 방어(신뢰경계 실 IPC 없음).
// listFiles는 {files:[]}로 안전 shape 반환(projectFiles 배열 계약 유지), 그 외는 async no-op.
window.api = new Proxy({
  listFiles: function () { return Promise.resolve({ files: [] }) },
  getUsage: function () { return Promise.resolve(null) },
  onAgentEvent: function () { return function () {} },
}, {
  get: function (target, prop) {
    if (prop in target) return target[prop]
    return function () { return Promise.resolve({}) }
  }
})
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
    width: 1100,
    height: 880,
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
    // 스피너/dots 무한 애니메이션 정지 — 결정적 캡처(컴포넌트 접근성 경로 재사용).
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  // TG1 P07 예정: 이 shot은 TG1 채증 패키지로 흡수·재편성 예정(현 시점은 P03 턴 블록 회귀 안전망).
  test('p16-continuity-single: 사고("사고 중 ~N 토큰")→답변이 같은 턴 블록(아바타 1개)으로 렌더', async () => {
    await paint('continuity-single')
    // redacted-thinking 진행 표시(영호 피드백 ①의 "토큰 실시간 올라가는 아이콘")
    const prog = page.locator('[data-testid="thinking-progress"]')
    await expect(prog).toBeVisible()
    await expect(prog).toContainText('사고 중')
    await expect(prog).toContainText('1,264 토큰')
    // TG1 P03: 사고→답변이 같은 턴 블록(.turn-block > .turn-body) 안에 함께 있음 — "별개 블록
    // 등장 없음"이 이 Phase의 완료조건(P16 인접 연출 .msg-continues/.msg-continuation은 이
    // 구조로 대체돼 완전히 제거됨, groupIntoTurnBlocks 실경로 발화 결과 — 손 마크업 아님).
    // 단일 Claude 턴(user→thinking→assistant)이므로 턴 블록은 정확히 1개.
    const turnBlock = page.locator('.turn-block')
    await expect(turnBlock).toHaveCount(1)
    await expect(turnBlock.locator('[data-testid="thinking-progress"]')).toBeVisible()
    await expect(turnBlock.locator('.msg.ai-msg .content')).toContainText('additive')
    // 턴당 아바타 1개(턴 블록 헤더) — 메시지별 개별 아바타(구 .ava.ai)는 제거되고 공식 로고
    // Claude Spark(.ava-spark)로 통일됐다(상표 게이트, backendLabel==='Claude Code' 분기).
    await expect(page.locator('.turn-block-ava')).toHaveCount(1)
    await expect(page.locator('.turn-block-ava.ava-spark')).toBeVisible()
    await shootBoth('p16-continuity-single')
  })

  test('p16-hookbadge-single: 훅 차단 턴 빨간 배지(단일챗) — assistant .meta .hook-badge', async () => {
    await paint('hookbadge-single')
    // permission-denied(hook)가 인라인 NoticeItem(tone=error)으로 렌더 — "왜 막혔는지" 노출.
    await expect(page.locator('.notice-row.tone-error')).toBeVisible()
    // 같은 턴 assistant .meta에 빨간 배지(deriveHookTurnBadges 파생 — 손 마크업 아님).
    const badge = page.locator('.msg.ai-msg .meta .hook-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('훅 차단')
    // 답변 본문 실렌더(빈 캡처 방어)
    await expect(page.locator('.msg.ai-msg .content')).toContainText('dangerous-cmd-guard')
    await shootBoth('p16-hookbadge-single')
  })

  test('p16-hookbadge-panel: 훅 차단 턴 빨간 배지(멀티패널 PanelView) — 자동 전파', async () => {
    await paint('hookbadge-panel')
    await expect(page.locator('.ma-panel')).toBeVisible()
    // 패널도 단일챗과 동일 배선(MessageBubble hookBadge prop)으로 배지 전파.
    const badge = page.locator('.ma-panel .msg.ai-msg .meta .hook-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('훅 차단')
    // 패널에서도 permission-denied NoticeItem(tone=error)이 함께 노출(브리프 명시 노출 지점).
    await expect(page.locator('.ma-panel .notice-row.tone-error')).toBeVisible()
    await shootBoth('p16-hookbadge-panel')
  })

  test('p16-subagent-continuity: 서브에이전트 셀 사고→응답 연속 연출(SubAgentChatStream)', async () => {
    await paint('subagent-continuity')
    // 사고 버블(.saf-msg--thinking)에 연속 연출 클래스(.saf-msg-continues) —
    // groupSubagentToolRuns 실경로 판정 결과(손 마크업 아님).
    await expect(page.locator('.saf-msg--thinking.saf-msg-continues')).toBeVisible()
    // 뒤따르는 응답 버블(.saf-msg--agent)에 gap 축소 연속 클래스(.saf-msg-continuation).
    await expect(page.locator('.saf-msg--agent.saf-msg-continuation')).toBeVisible()
    // 사고·응답 본문 실렌더(빈 캡처 방어)
    await expect(page.locator('.saf-msg--thinking .saf-msg-body')).toContainText('greet')
    await expect(page.locator('.saf-msg--agent .content')).toContainText('farewell')
    await shootBoth('p16-subagent-continuity')
  })
})
