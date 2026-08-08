import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.TG1SHOTS === '1'

const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02_Source', 'renderer', 'src')
const SHOT_DIR = join(ROOT, '01_Phases', '18_TG1-thinking-gui', 'ScreenShot')

const CSS_FILES = [
  'theme/tokens.css',
  'layout/shell.css',
  'components/01_conversation/Conversation.css',
  'components/01_conversation/StatusLine.css',
  'components/01_conversation/MarkdownView.css',
  'components/01_conversation/Composer.css',
  'components/01_conversation/ScrollToBottomButton.css',
  'components/01_conversation/CmdResultCard.css',
  'components/01_conversation/ToolGroup.css',
  'components/01_conversation/ToolCallCard.css',
  'components/00_shell/MultiWorkspace.css',
  'components/05_agent/SubAgentFullscreen.css',
  'components/05_agent/AgentPanel.css',
  'components/05_agent/SubAgentSplitView.css',
  'components/05_agent/SubAgentCell.css',
  'components/00_shell/PaneSplitter.css',
  'features/notice/HookTimeline.css',
  'features/notice/LoopStatusBanner.css',
  'features/notice/PermissionCard.css',
  'components/06_prompt/QuestionModal.css',
  'components/00_shell/SettingsModal.css',
  'components/common/Modal.css',
  'components/05_agent/ProviderStatusPanel.css',
  'components/04_git/GitModal.css',
  'components/02_file/FileBadge.css',
]

let app: ElectronApplication
let page: Page
let tmp: string

const ENTRY_TSX = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import Conversation from './components/01_conversation/Conversation'
import { PanelView } from './components/00_shell/panel/PanelView'
import SubAgentChatStream from './components/05_agent/SubAgentChatStream'
import SubAgentSplitView from './components/05_agent/SubAgentSplitView'
import SettingsModal from './components/00_shell/SettingsModal'
import GitModal from './components/04_git/GitModal'
import { useAppStore } from './store/appStore'
import { makePanelInitialState } from './store/panelSession'

const root = createRoot(document.getElementById('root'))
const noop = function () {}
const noopAsync = function () { return Promise.resolve() }

// ── 고정 fixtures ────────────────────────────────────────────────────────────

const USER_ASK = 'sample.ts에 greet과 같은 패턴으로 farewell(name) 함수를 추가해줘.'

const THINKING_TEXT = [
  'greet은 name: string을 받아 템플릿 문자열을 반환한다.',
  '같은 파일에 farewell도 export 함수 하나로 추가하는 게 일관적이다 —',
  '반환 문자열만 인사말에서 작별로 바꾸면 되고, 기존 코드는 건드리지 않는다(additive).',
].join(' ')

const ANSWER = [
  'greet과 동일한 패턴으로 farewell을 추가했어요.',
  '',
  '- sample.ts에 export function farewell(name: string) 1개 추가',
  '- 반환: 안녕히 가세요, {name} 템플릿 문자열',
  '- 기존 코드 변경 없음(additive)',
].join('\\n')

// 완결 턴(사고 전문 + 답변) — user → thinking(text) → assistant. isRunning=false.
function completedTurnThread() {
  return [
    { kind: 'msg', id: 'u1', role: 'user', text: USER_ASK, time: '14:03' },
    { kind: 'thinking', id: 'th1', text: THINKING_TEXT, estimatedTokens: 842 },
    { kind: 'msg', id: 'a1', role: 'assistant', text: ANSWER, time: '14:03' },
  ]
}

// 사고 중(redacted 진행) — user → thinking(text='', estimatedTokens). isRunning=true.
// thread 마지막이 thinking(agent 블록)이라 그 turn-body에 StatusLine이 이어 붙고,
// openThinkingEstimatedTokens=3400이 status-line-meta의 "↑ 3.4k tokens"를 만든다.
function thinkingThread() {
  return [
    { kind: 'msg', id: 'u1', role: 'user', text: USER_ASK, time: '14:03' },
    { kind: 'thinking', id: 'th1', text: '', estimatedTokens: 3400 },
  ]
}

// 서브에이전트 — transcript thinking → text(응답). status:'done'(정적 캡처, 스트리밍 커서 없음).
// SubAgentChatStream: thinking은 .saf-msg--thinking > .saf-status-symbol(정적 ✻) — StatusLine의
// 무한 애니메이션 .status-line-symbol을 일부러 재사용하지 않는다(완료 과거 기록에 라이브 신호가
// 새지 않도록). 토큰·훅 배지는 P05 계약 부재로 렌더하지 않음(우아한 부재 — 조용한 드롭 아님).
const SUBAGENT_CONVO = {
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

// 서브에이전트 — 데이터 부재(빈 transcript, status:'queued') → .ag-empty "아직 대화가 없어요".
// P05 계약 부재의 극단 케이스: 표시할 데이터 자체가 없을 때 조용한 공백이 아니라 명시 안내.
const SUBAGENT_EMPTY = {
  id: 'sa-2',
  name: 'explorer',
  displayName: '코드 스카우트',
  role: 'sample.ts 구조를 파악해 주세요.',
  status: 'queued',
  tools: [],
  transcript: [],
}

// p08 — 스플릿 그리드용 3개 running 서브에이전트. 지그재그(짝수 index=좌, 홀수=우) 검산:
// index0 sag-a→좌, index1 sag-b→우, index2 sag-c→좌 ⇒ 좌[sag-a,sag-c]·우[sag-b].
const SPLIT_SUBAGENTS = [
  {
    id: 'sag-a',
    name: 'explorer',
    displayName: '코드 스카우트',
    role: 'sample.ts에서 greet 함수 패턴을 확인해 주세요.',
    status: 'running',
    tools: [],
    transcript: [
      { kind: 'thinking', id: 'sag-a-th', text: 'greet 함수의 서명과 반환 형태를 먼저 확인한다.' },
      { kind: 'text', id: 'sag-a-tx', text: 'greet(name: string)이 템플릿 문자열을 반환하는 걸 확인했어요.' },
    ],
  },
  {
    id: 'sag-b',
    name: 'builder',
    displayName: '패치 빌더',
    role: 'farewell 함수를 sample.ts에 추가해 주세요.',
    status: 'running',
    tools: [],
    transcript: [
      { kind: 'thinking', id: 'sag-b-th', text: '같은 파일에 export 함수 하나만 추가하면 일관적이다.' },
      { kind: 'text', id: 'sag-b-tx', text: 'farewell(name: string) 함수를 추가하는 중이에요.' },
    ],
  },
  {
    id: 'sag-c',
    name: 'verifier',
    displayName: '테스트 검증',
    role: '추가된 farewell 함수 동작을 확인해 주세요.',
    status: 'running',
    tools: [],
    transcript: [
      { kind: 'thinking', id: 'sag-c-th', text: '반환 문자열이 기대한 형식인지 대조한다.' },
      { kind: 'text', id: 'sag-c-tx', text: '반환값을 검증하는 중이에요.' },
    ],
  },
]

// ── 세션 mock — PanelView는 store 비의존(session prop). makePanelInitialState()로 완전한
//    PanelSessionState를 만들고 thread/isRunning만 덮어쓴다. 훅 메서드는 표시 캡처에 안 쓰이므로
//    전부 no-op. ─────────────────────────────────────────────────────────────
function mockSession(thread, isRunning) {
  const base = makePanelInitialState()
  const state = Object.assign({}, base, {
    thread: thread,
    isRunning: !!isRunning,
    currentRunId: 'run-tg1-panel',
  })
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
  title: 'farewell 추가',
  status: 'working',
  cwd: 'C:/Dev/AgentDeck',
  ctxPct: 24,
}

// ── 스토어 시드 — 장면 전량 덮어쓰기(누수 차단). Date.now는 프리즈됨. ────────────
function seedStore(opts) {
  useAppStore.setState({
    thread: opts.thread,
    isRunning: !!opts.isRunning,
    thinkingText: opts.thinkingText != null ? opts.thinkingText : null,
    thinkingStartedAt: opts.elapsedSec != null ? Date.now() - opts.elapsedSec * 1000 : null,
  })
}

// ── 스캐폴드 ──────────────────────────────────────────────────────────────────
function ConvScaffold(props) {
  return React.createElement(
    'div',
    { className: 'harness-frame harness-frame--conv' },
    React.createElement(Conversation, null)
  )
}

function PanelScaffold(props) {
  return React.createElement(
    'div',
    { className: 'harness-frame harness-frame--panel' },
    React.createElement(PanelView, {
      slot: 0,
      panel: PANEL_META,
      session: mockSession(props.thread, props.isRunning),
      workspaceRoot: 'C:/Dev/AgentDeck',
      onExpand: noop,
      onPrompt: noop,
      onPickFolder: noop,
    })
  )
}

function SubScaffold(props) {
  return React.createElement(
    'div',
    { className: 'harness-frame harness-frame--sub' },
    React.createElement(SubAgentChatStream, { agent: props.agent })
  )
}

// p08 — SubAgentSplitView는 (PaneSplitter, aside) 형제 Fragment를 반환하므로 프레임을
// 가로 flex로 감싼다(실제 셸의 우측 도크 자리 재현). 셸 CSS(.pane/.pane.agent)가 aside 폭을
// 스스로 결정(flex-basis min(640px,65vw)) — 프레임은 높이만 고정.
function SplitScaffold(props) {
  return React.createElement(
    'div',
    { className: 'harness-frame harness-frame--split' },
    React.createElement(SubAgentSplitView, null)
  )
}

// p09 — SettingsModal/GitModal은 자체가 전체 화면 고정 오버레이(.modal-overlay/.gitm-overlay)라
// harness-frame으로 감싸지 않고 root에 그대로 렌더한다(실 앱의 모달 배치 재현). 창 뷰포트 전체를
// 캡처(fullPage:false)하면 중앙 정렬된 카드가 그대로 담긴다.
function SettingsScaffold() {
  return React.createElement(SettingsModal, { onClose: noop })
}

// GitModal은 root prop(레포 경로)만 필요 — git.status/git.log는 window.api.git 스텁이 픽스처를
// 돌려준다. onAskClaude/onOpenFile/onClose는 표시 캡처에 안 쓰이므로 no-op.
function GitScaffold() {
  return React.createElement(GitModal, {
    root: 'C:/Dev/AgentDeck',
    onClose: noop,
    onOpenFile: noop,
    onAskClaude: noop,
  })
}

const SCENES = {
  // ① p03 단일챗 완결 턴 — 사고 전문(접이식) + 답변. 아바타 1개(.ava-spark).
  'p03-single-turn': function () {
    seedStore({ thread: completedTurnThread(), isRunning: false })
    return React.createElement(ConvScaffold, { key: 'p03-single-turn' })
  },
  // ② p04 상태 라인 사고 중 — 4요소(✻·유희 동사·경과 초·실시간 토큰). thinkingText=null → 유희 동사.
  'p04-status-thinking': function () {
    seedStore({ thread: thinkingThread(), isRunning: true, thinkingText: null, elapsedSec: 12 })
    return React.createElement(ConvScaffold, { key: 'p04-status-thinking' })
  },
  // ③ p04 전이 후 — 상태 라인 소멸 + 같은 턴 블록 안 답변(isRunning=false).
  'p04-transitioned': function () {
    seedStore({ thread: completedTurnThread(), isRunning: false })
    return React.createElement(ConvScaffold, { key: 'p04-transitioned' })
  },
  // ④ p04 육안 체크포인트 — thinkingText가 …로 끝날 때 상태 라인 이중 말줄임 여부.
  //    StatusLine.tsx는 {label}…을 무조건 덧붙이므로 text가 …로 끝나면 "……"이 된다.
  'p04-double-ellipsis': function () {
    seedStore({ thread: thinkingThread(), isRunning: true, thinkingText: '결정을 마무리하는 중…', elapsedSec: 8 })
    return React.createElement(ConvScaffold, { key: 'p04-double-ellipsis' })
  },
  // ⑤ p06 멀티패널 완결 턴 — PanelView 동형 턴 블록.
  'p06-panel-turn': function () {
    return React.createElement(PanelScaffold, { key: 'p06-panel-turn', thread: completedTurnThread(), isRunning: false })
  },
  // ⑥ p06 서브에이전트 — 정적 ✻ + 우아한 부재(토큰·훅 없음).
  'p06-subagent-graceful': function () {
    return React.createElement(SubScaffold, { key: 'p06-subagent-graceful', agent: SUBAGENT_CONVO })
  },
  // ⑦ p06 서브에이전트 데이터 부재 — .ag-empty(명시 안내).
  'p06-subagent-empty': function () {
    return React.createElement(SubScaffold, { key: 'p06-subagent-empty', agent: SUBAGENT_EMPTY })
  },
  // ⑧ p08 스플릿 그리드 — 균등 셀·정적 하이라이트·지그재그(좌2·우1). 실 store 시드(SubAgentSplitView
  // 는 useAppStore.selectSubagents 구독 컨테이너 — SplitScaffold가 props 없이 그대로 렌더).
  'p08-split-zigzag': function () {
    useAppStore.setState({ subagents: SPLIT_SUBAGENTS })
    return React.createElement(SplitScaffold, { key: 'p08-split-zigzag' })
  },
  // ⑨ p09 Welcome 히어로 — 빈 thread(isEmpty=true) → Conversation이 <Welcome> 렌더. .wc-mark가
  // provider→브랜드 매핑(backendLabel 기본 'Claude Code' → 'claude-code' → 공식 Claude Spark
  // <img>)로 바인딩됐음을 채증(P09 시각 변화: 자체 별표 IconSpark → 공식 Spark 로고).
  'p09-welcome-hero': function () {
    seedStore({ thread: [], isRunning: false })
    return React.createElement(ConvScaffold, { key: 'p09-welcome-hero' })
  },
  // ⑩ p09 SettingsModal — 기본 nav='version' 렌더가 NAV 'Claude Code' 탭(.set-nav-item.on)과
  // 현재 엔진 카드(.ver-ic.engine)를 동시에 담는다. 둘 다 ProviderBrandIcon(공식 로고) 소비 — 한
  // 컷으로 "NAV 탭 + 현재 엔진 카드" 두 소비처를 함께 채증.
  'p09-settings-engine': function () {
    return React.createElement(SettingsScaffold, { key: 'p09-settings-engine' })
  },
  // ⑪ p09 GitModal AI 커밋 버튼 — git.status 픽스처에 변경 3건 → 'changes' 뷰로 전환하면
  // .gitm-btn.claude(공식 Claude Spark 아이콘 + "Claude에게 메시지 짓게 하기")가 enabled로 렌더.
  // 뷰 전환은 테스트에서 nav 클릭으로 수행(내부 state).
  'p09-git-commit': function () {
    return React.createElement(GitScaffold, { key: 'p09-git-commit' })
  },
}

;(window).__paint = (scene) => {
  const fn = SCENES[scene]
  if (!fn) throw new Error('unknown scene: ' + scene)
  root.render(fn())
}

// p08 활성 확정 — 컨테이너 최초 마운트 시 activeId는 마지막 running 항목(sag-c)이 된다.
// 결정론적으로 특정 셀(sag-a)을 하이라이트하려면 그 agent만 새 참조로 교체해 컨테이너의
// 참조 비교 활동 감지(noteActivity) 실경로를 재발화시킨다(gap1-p14-splitview-shots.e2e.ts
// __touch 관행 계승 — 나머지 agent는 참조 보존, reducer 규율 재현).
;(window).__touch = (id) => {
  const cur = useAppStore.getState().subagents
  useAppStore.setState({
    subagents: cur.map((a) =>
      a.id === id
        ? Object.assign({}, a, {
            transcript: (a.transcript || []).concat([
              { kind: 'text', id: id + '-touch', text: '방금 진행 로그가 도착했어요.' },
            ]),
          })
        : a
    ),
  })
}

;(window).__ready = true
`

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
.harness-frame--conv { width: 760px; height: 800px; }
.harness-frame--panel { width: 440px; height: 720px; }
.harness-frame--panel > .ma-panel { flex: 1 1 auto; height: 100%; }
.harness-frame--sub { width: 560px; height: 440px; }
.harness-frame--sub > .ma-p-body { flex: 1 1 auto; }
/* p08 — SubAgentSplitView는 (PaneSplitter, aside) 형제를 반환 — 가로 flex로 감싸 실 셸의
   우측 도크 배치를 재현. aside 자체 폭은 .pane.agent.sag-split(flex-basis)가 결정한다. */
.harness-frame--split { flex-direction: row; height: 640px; }
`

async function bundleEntry(): Promise<string> {
  const result = await build({
    stdin: { contents: ENTRY_TSX, resolveDir: RENDERER_SRC, loader: 'tsx', sourcefile: 'tg1-p07-harness-entry.tsx' },
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'dataurl' },
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

async function shootBoth(name: string): Promise<void> {
  await shoot(name, 'dark')
  await shoot(name, 'light')
  await setTheme('dark')
}

test.describe('TG1 사고 GUI: 컴포넌트 하네스 시각검증 (TG1SHOTS=1)', () => {
  test.skip(!RUN, '육안 자료 수집 — TG1SHOTS=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    tmp = mkdtempSync(join(tmpdir(), 'agentdeck-tg1shots-'))

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
// Date.now 프리즈 — StatusLine 경과 초(computeThinkingElapsedSeconds)의 벽시계 의존을 제거해
// 컷을 결정론적으로 만든다. StatusLine이 소비하는 시간 소스는 Date.now()뿐(useState 초기값 +
// setInterval 틱)이므로 Date.now만 고정하면 충분하다(Date 생성자 전체 교체는 불필요한 리스크).
// fixture의 thinkingStartedAt = Date.now() - Ns*1000이 정확히 Ns 경과가 되도록 고정 epoch로 덮음.
// (React 스케줄러는 performance.now 사용 — 영향 없음.)
Date.now = function () { return 1700000000000 }

// 하네스 스텁 — store 마운트 액션(listFiles/getUsage) 방어(신뢰경계 실 IPC 없음).
// p09 추가: SettingsModal(getEngineState·listBackends)·GitModal(git.*) 소비처가 마운트 시
// 부르는 IPC를 결정론적 픽스처로 스텁한다(신뢰경계 실 IPC 없음 — 표시 캡처용 mock).
var GIT_STATUS_FIXTURE = {
  root: 'C:/Dev/AgentDeck',
  branch: 'feature/gap1-core-parity',
  ahead: 2,
  behind: 0,
  changes: [
    { path: '02_Source/renderer/src/lib/providerBrand.ts', status: 'A', add: 66, del: 0 },
    { path: '02_Source/renderer/src/components/common/ProviderBrandIcon.tsx', status: 'A', add: 34, del: 0 },
    { path: '02_Source/renderer/src/components/01_conversation/Conversation.tsx', status: 'M', add: 12, del: 5 },
  ],
  branches: [
    { name: 'feature/gap1-core-parity', current: true },
    { name: 'master', current: false },
  ],
  remotes: ['origin'],
  tags: [],
}
var GIT_COMMITS_FIXTURE = [
  {
    hash: 'b3dad99aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    shortHash: 'b3dad99',
    subject: 'chore: 권한 규칙 구식 형식 정리',
    body: '',
    author: 'YYH',
    date: 1700000000000,
    tags: [],
    pushed: true,
  },
]
window.api = new Proxy({
  listFiles: function () { return Promise.resolve({ files: [] }) },
  getUsage: function () { return Promise.resolve(null) },
  onAgentEvent: function () { return function () {} },
  // SettingsModal VersionView — 인증됨/정상 카드로 표시(현재 엔진 카드 ProviderBrandIcon 채증).
  getEngineState: function () { return Promise.resolve({ available: true, authed: true, version: '2.0.1' }) },
  // ProviderStatusPanel(VersionView 하위) — 단일 Claude 백엔드 정상 카드.
  listBackends: function () {
    return Promise.resolve([
      { id: 'claude-code', name: 'Claude Code', available: true, version: '2.0.1', latestVersion: '2.0.1', authed: true },
    ])
  },
  // GitModal — status(변경 3건)/log 픽스처, 나머지는 no-op 성공.
  git: {
    status: function () { return Promise.resolve(GIT_STATUS_FIXTURE) },
    log: function () { return Promise.resolve(GIT_COMMITS_FIXTURE) },
    commitDetail: function () { return Promise.resolve([]) },
    fileAt: function () { return Promise.resolve({ content: null, diff: null, error: null }) },
    workingFile: function () { return Promise.resolve({ diff: null }) },
    commit: function () { return Promise.resolve({ ok: true }) },
    push: function () { return Promise.resolve({ ok: true }) },
    pull: function () { return Promise.resolve({ ok: true }) },
    root: function () { return Promise.resolve('C:/Dev/AgentDeck') },
  },
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

    const uddDir = join(tmp, 'udd')
    mkdirSync(uddDir, { recursive: true })
    app = await electron.launch({ args: [`--user-data-dir=${uddDir}`, mainPath] })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true, null, {
      timeout: 20_000,
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  test('p03-single-turn: 한 턴 = 한 블록 = 아바타 1개(.ava-spark) — 사고 전문(접이식) + 답변 완료', async () => {
    await paint('p03-single-turn')
    await page.locator('[data-testid="thinking-toggle"]').click()
    const turnBlock = page.locator('.turn-block')
    await expect(turnBlock).toHaveCount(1)
    await expect(page.locator('.turn-block-ava')).toHaveCount(1)
    await expect(page.locator('.turn-block-ava.ava-spark')).toBeVisible()
    const sparkImg = page.locator('.turn-block-ava.ava-spark img')
    await expect(sparkImg).toBeVisible()
    const sparkLoaded = await sparkImg.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
    expect(sparkLoaded).toBe(true)
    await expect(turnBlock.locator('[data-testid="thinking-detail"]')).toBeVisible()
    await expect(turnBlock.locator('[data-testid="thinking-detail"]')).toContainText('additive')
    await expect(turnBlock.locator('.msg.ai-msg .content')).toContainText('farewell')
    await expect(page.locator('[data-testid="status-line"]')).toHaveCount(0)
    await shootBoth('p03-single-turn')
  })

  test('p04-status-thinking: 상태 라인 4요소(✻ 심볼 + 유희 동사 + 경과 초 + 실시간 토큰) 전부 렌더', async () => {
    await paint('p04-status-thinking')
    const status = page.locator('[data-testid="status-line"]')
    await expect(status).toBeVisible()
    await expect(status.locator('.status-line-symbol')).toBeVisible()
    await expect(status.locator('.status-line-phrase')).toContainText('생각하는 중')
    await expect(status.locator('.status-line-meta')).toContainText('12s')
    await expect(status.locator('.status-line-meta')).toContainText('3.4k tokens')
    await expect(page.locator('.turn-block .turn-body [data-testid="status-line"]')).toBeVisible()
    await shootBoth('p04-status-thinking')
  })

  test('p04-transitioned: 상태 라인 소멸 + 같은 턴 블록 안 답변(별개 블록 등장 없음)', async () => {
    await paint('p04-transitioned')
    await expect(page.locator('[data-testid="status-line"]')).toHaveCount(0)
    const turnBlock = page.locator('.turn-block')
    await expect(turnBlock).toHaveCount(1)
    await expect(turnBlock.locator('[data-testid="thinking-block"]')).toBeVisible()
    await expect(turnBlock.locator('.msg.ai-msg .content')).toContainText('farewell')
    await shootBoth('p04-transitioned')
  })

  test('p04-double-ellipsis[체크포인트]: thinkingText가 …로 끝날 때 상태 라인 말줄임 중복 여부', async () => {
    await paint('p04-double-ellipsis')
    const phrase = page.locator('[data-testid="status-line"] .status-line-phrase')
    await expect(phrase).toBeVisible()
    const raw = await phrase.evaluate((el) => el.textContent || '')
    const trailing = raw.slice(-4)
    // eslint-disable-next-line no-console
    console.log('[TG1-P07 이중말줄임 체크포인트] status-line-phrase textContent 말미 4자 =', JSON.stringify(trailing))
    await expect(phrase).toContainText('결정을 마무리하는 중')
    await shootBoth('p04-double-ellipsis')
  })

  test('p06-panel-turn: 멀티패널 PanelView 동형 턴 블록(아바타 1개 .ava-spark)', async () => {
    await paint('p06-panel-turn')
    await expect(page.locator('.ma-panel')).toBeVisible()
    await expect(page.locator('.ma-panel .turn-block')).toHaveCount(1)
    await expect(page.locator('.ma-panel .turn-block-ava.ava-spark')).toBeVisible()
    await expect(page.locator('.ma-panel .turn-block .msg.ai-msg .content')).toContainText('farewell')
    await shootBoth('p06-panel-turn')
  })

  test('p06-subagent-graceful: 서브에이전트 정적 ✻(.saf-status-symbol) + 우아한 부재(토큰·훅 없음)', async () => {
    await paint('p06-subagent-graceful')
    const thinking = page.locator('.saf-msg--thinking')
    await expect(thinking).toBeVisible()
    await expect(thinking.locator('.saf-status-symbol')).toBeVisible()
    await expect(page.locator('.saf-convo .status-line-symbol')).toHaveCount(0)
    await expect(page.locator('.saf-msg--thinking.saf-msg-continues')).toBeVisible()
    await expect(page.locator('.saf-msg--agent .content')).toContainText('farewell')
    await shootBoth('p06-subagent-graceful')
  })

  test('p06-subagent-empty: 데이터 부재 우아한 처리 — .ag-empty 명시 안내(조용한 공백 아님)', async () => {
    await paint('p06-subagent-empty')
    const empty = page.locator('.ag-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('아직 대화가 없어요')
    await shootBoth('p06-subagent-empty')
  })

  test('p08-split-zigzag: 균등 셀(flex-grow 항상 1) · 정적 하이라이트(.sag-cell--active) · 지그재그(좌2·우1)', async () => {
    await paint('p08-split-zigzag')
    await page.evaluate(() => (window as unknown as { __touch: (id: string) => void }).__touch('sag-a'))

    const cols = page.locator('.sag-col')
    await expect(cols).toHaveCount(2)
    await expect(cols.nth(0).locator('[data-subagent-id]')).toHaveCount(2)
    await expect(cols.nth(1).locator('[data-subagent-id]')).toHaveCount(1)
    const leftIds = await cols
      .nth(0)
      .locator('[data-subagent-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-subagent-id')))
    expect(leftIds).toEqual(['sag-a', 'sag-c'])
    const rightIds = await cols
      .nth(1)
      .locator('[data-subagent-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-subagent-id')))
    expect(rightIds).toEqual(['sag-b'])

    await expect(page.locator('.sag-cell:has([data-subagent-id="sag-a"])')).toHaveCSS('flex-grow', '1')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sag-b"])')).toHaveCSS('flex-grow', '1')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sag-c"])')).toHaveCSS('flex-grow', '1')

    await expect(page.locator('.sag-cell--active')).toHaveCount(1)
    await expect(page.locator('.sag-cell--active [data-subagent-id="sag-a"]')).toBeVisible()

    await shootBoth('p08-split-zigzag')
  })

  test('p09-welcome-hero: Welcome .wc-mark = 공식 Claude Spark <img>(자체 별표 아님) — provider 바인딩', async () => {
    await paint('p09-welcome-hero')
    await expect(page.locator('.welcome')).toBeVisible()
    const mark = page.locator('.welcome .wc-mark')
    await expect(mark).toBeVisible()
    const markImg = mark.locator('img')
    await expect(markImg).toBeVisible()
    const loaded = await markImg.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
    expect(loaded).toBe(true)
    await expect(mark.locator('svg')).toHaveCount(0)
    await shootBoth('p09-welcome-hero')
  })

  test('p09-settings-engine: SettingsModal NAV Claude Code 탭 + 현재 엔진 카드 = 공식 로고(ProviderBrandIcon)', async () => {
    await paint('p09-settings-engine')
    await expect(page.locator('.modal-card')).toBeVisible()
    const activeTab = page.locator('.set-nav-item.on')
    await expect(activeTab).toContainText('Claude Code')
    const tabImg = activeTab.locator('img')
    await expect(tabImg).toBeVisible()
    const tabLoaded = await tabImg.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
    expect(tabLoaded).toBe(true)
    const cardImg = page.locator('.ver-ic.engine img')
    await expect(cardImg).toBeVisible()
    const cardLoaded = await cardImg.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
    expect(cardLoaded).toBe(true)
    await shootBoth('p09-settings-engine')
  })

  test('p09-git-commit: GitModal AI 커밋 버튼 = 공식 Claude Spark 아이콘(ProviderBrandIcon)', async () => {
    await paint('p09-git-commit')
    await expect(page.locator('.gitm-modal')).toBeVisible()
    await page.getByRole('button', { name: /변경 사항/ }).click()
    const aiBtn = page.locator('.gitm-btn.claude')
    await expect(aiBtn).toBeVisible()
    await expect(aiBtn).toContainText('Claude에게 메시지 짓게 하기')
    await expect(aiBtn).toBeEnabled()
    const btnImg = aiBtn.locator('img')
    await expect(btnImg).toBeVisible()
    const btnLoaded = await btnImg.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
    expect(btnLoaded).toBe(true)
    await shootBoth('p09-git-commit')
  })
})
