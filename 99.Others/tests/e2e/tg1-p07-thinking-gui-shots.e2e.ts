/**
 * tg1-p07-thinking-gui-shots.e2e.ts — TG1(사고 GUI Desktop 스타일) 마감 채증 패키지 (opt-in).
 *
 * 계승 관계(gap1-p16-continuity-badge-shots.e2e.ts의 흡수·재편성):
 *   P16 하네스 말미 주석이 예고한 "TG1 채증 패키지로 흡수·재편성"의 실체다. P16의 관례를
 *   그대로 물려받는다 —
 *     · 옵트인 env(P16SHOTS→TG1SHOTS=1)
 *     · shootBoth(dark/light 2컷)·파일명 `pNN-표면-상태-테마.png`
 *     · esbuild로 *실 컴포넌트 + 실 CSS*를 그대로 번들(손 마크업 금지 — 골든 드리프트/앱 소스
 *       무수정 = qa 영역)
 *     · reducedMotion으로 스피너/맥동 정지(결정성)
 *     · 완결 상태 fixture(러닝 스트리밍 커서 없음)
 *     · key={scene} 강제 리마운트 + 장면별 store 전량 시드로 장면 간 상태 누수 차단.
 *
 * TG1 고유 추가(P16 대비):
 *   1) CSS_FILES에 StatusLine.css 추가(TG1 P04 신규 소유 — .status-line-*). turn-block/
 *      turn-body/turn-block-ava/ava-spark는 Conversation.css 소유(이미 목록에 있음),
 *      saf-status-symbol은 SubAgentFullscreen.css 소유(이미 목록에 있음).
 *   2) **Date.now 프리즈** — StatusLine의 경과 초(computeThinkingElapsedSeconds(thinkingStartedAt,
 *      Date.now()))가 벽시계에 의존하므로, 하네스 페이지에서 Date.now를 고정 epoch로 덮어써
 *      경과 초를 결정론적으로 만든다(fixture는 thinkingStartedAt = FROZEN - Ns*1000). 이 프리즈는
 *      P16엔 없었다(P16은 경과 초 표시가 없었음).
 *   3) (TG1 P08 마감 후 편입) p08-split-zigzag 장면 — SubAgentSplitView 컨테이너째 실 store
 *      시드로 렌더(gap1-p14-splitview-shots.e2e.ts의 store-seed 관행 계승). 균등 셀(flex-grow
 *      항상 1)·정적 하이라이트(.sag-cell--active)·지그재그 스태킹(짝수 index=좌, 홀수=우)을
 *      3개 running 서브에이전트로 채증한다. 활성 확정은 __touch(id)로 참조 교체(P14 관행 계승)
 *      해 noteActivity 실경로를 발화시킨다(컨테이너 최초 마운트 시 activeId는 마지막 running
 *      항목이 되므로, 결정론적 특정 셀 하이라이트를 원하면 2차 갱신이 필요 — 헤더 주석 하단
 *      __touch 정의 참고).
 *
 * 왜 라이브가 아니라 하네스인가(P16 계승): 사고 중(경과 초·실시간 토큰)·전이·이중 말줄임
 *   경계는 라이브로 결정론적 재현이 불가(비용·비결정·redacted 구간). 실 컴포넌트를 실 CSS로
 *   그대로 렌더해 육안 자료를 결정적으로 확보한다.
 *
 * 실행:
 *   TG1SHOTS=1 npx playwright test 99.Others/tests/e2e/tg1-p07-thinking-gui-shots.e2e.ts
 *
 * 산출물: 01.Phases/18_TG1-thinking-gui/ScreenShot/ (pNN-<표면>-<상태>-{dark|light}.png)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.TG1SHOTS === '1'

// ── 경로 상수 ────────────────────────────────────────────────────────────────
const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02.Source', 'renderer', 'src')
const SHOT_DIR = join(ROOT, '01.Phases', '18_TG1-thinking-gui', 'ScreenShot')

/** 실 CSS 주입 목록 — TG1 세 표면 렌더 트리가 소비하는 소유 파일 전부(토큰 포함).
 *  P16 목록 + StatusLine.css(TG1 P04 신규 소유). */
const CSS_FILES = [
  'theme/tokens.css',
  'layout/shell.css',
  // 단일챗(Conversation) + MessageBubble + 턴 블록/상태 라인
  'components/01_conversation/Conversation.css', // .conversation/.thread/.turn-block/.turn-body/.turn-block-ava/.ava-spark/.msg/.meta/.hook-badge/.notice-row
  'components/01_conversation/StatusLine.css', // TG1 P04 신규 — .status-line-symbol/.status-line-phrase/.status-line-meta
  'components/01_conversation/MarkdownView.css',
  'components/01_conversation/Composer.css',
  'components/01_conversation/ScrollToBottomButton.css',
  'components/01_conversation/CmdResultCard.css',
  'components/01_conversation/ToolGroup.css',
  'components/01_conversation/ToolCallCard.css',
  // 멀티패널(PanelView) 셸 골격
  'components/00_shell/MultiWorkspace.css',
  // 서브에이전트 셀 스트림 — .saf-msg--*/.saf-status-symbol
  'components/05_agent/SubAgentFullscreen.css',
  'components/05_agent/AgentPanel.css',
  // p08 — 스플릿 그리드(균등·정적 하이라이트·지그재그) + 셀 최소 델타 + 리사이즈 핸들
  'components/05_agent/SubAgentSplitView.css',
  'components/05_agent/SubAgentCell.css',
  'components/00_shell/PaneSplitter.css',
  // 컴포저 위 배너 슬롯(컨테이너 상시 마운트 — 데이터 없으면 null 렌더)
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
 * 마찰을 피하려고 React.createElement + 문자열 연결로만 쓴다(P16 관례).
 *
 * seedStore: 장면 전량 시드 — 이전 장면 필드가 다음 장면에 새지 않도록 매번 4필드를 전부
 *   덮어쓴다(thread/isRunning/thinkingText/thinkingStartedAt). Date.now는 아래 프리즈되어 있어
 *   thinkingStartedAt = Date.now() - Ns*1000이 결정론적 경과 초를 만든다.
 */
const ENTRY_TSX = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import Conversation from './components/01_conversation/Conversation'
import { PanelView } from './components/00_shell/panel/PanelView'
import SubAgentChatStream from './components/05_agent/SubAgentChatStream'
import SubAgentSplitView from './components/05_agent/SubAgentSplitView'
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
    // .svg: dataurl — Claude Spark 공식 로고를 <img src>로 실제 렌더하기 위해 data URL로 인라인.
    // (P16 하네스는 'text'였는데, 그 경우 import가 원문 XML 문자열이 되어 <img src>가 깨진다 —
    //  P16은 로고 자체가 검증 대상이 아니었다. TG1 파트2는 공식 로고 아바타가 핵심이라 실제
    //  글리프가 컷에 나와야 한다. 실 앱은 Vite가 asset URL로 처리 — data URL과 시각 동형.)
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

/** 다크/라이트 두 컷. */
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
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  test('p03-single-turn: 한 턴 = 한 블록 = 아바타 1개(.ava-spark) — 사고 전문(접이식) + 답변 완료', async () => {
    await paint('p03-single-turn')
    // 사고 전문을 펼쳐 "같은 턴 블록 안에 사고+답변이 함께 있음"을 육안으로 드러낸다.
    await page.locator('[data-testid="thinking-toggle"]').click()
    // 단일 Claude 턴(user→thinking→assistant) → agent 턴 블록 정확히 1개.
    const turnBlock = page.locator('.turn-block')
    await expect(turnBlock).toHaveCount(1)
    // 턴당 아바타 1개(턴 블록 헤더) — 공식 로고 Claude Spark(.ava-spark).
    await expect(page.locator('.turn-block-ava')).toHaveCount(1)
    await expect(page.locator('.turn-block-ava.ava-spark')).toBeVisible()
    // 로고 img가 실제로 로드됐는지(깨진 src가 아님) — 공식 Spark 글리프가 컷에 실제로 나오는지 계약.
    const sparkImg = page.locator('.turn-block-ava.ava-spark img')
    await expect(sparkImg).toBeVisible()
    const sparkLoaded = await sparkImg.evaluate((img) => (img as HTMLImageElement).naturalWidth > 0)
    expect(sparkLoaded).toBe(true)
    // 사고 전문(펼침) + 답변이 같은 턴 블록 안.
    await expect(turnBlock.locator('[data-testid="thinking-detail"]')).toBeVisible()
    await expect(turnBlock.locator('[data-testid="thinking-detail"]')).toContainText('additive')
    await expect(turnBlock.locator('.msg.ai-msg .content')).toContainText('farewell')
    // 완결 상태이므로 상태 라인은 없다.
    await expect(page.locator('[data-testid="status-line"]')).toHaveCount(0)
    await shootBoth('p03-single-turn')
  })

  test('p04-status-thinking: 상태 라인 4요소(✻ 심볼 + 유희 동사 + 경과 초 + 실시간 토큰) 전부 렌더', async () => {
    await paint('p04-status-thinking')
    const status = page.locator('[data-testid="status-line"]')
    await expect(status).toBeVisible()
    // ① ✻ 심볼
    await expect(status.locator('.status-line-symbol')).toBeVisible()
    // ② 유희 동사(thinkingText=null → WORKING_PHRASES[0] = '골똘히 생각하는 중')
    await expect(status.locator('.status-line-phrase')).toContainText('생각하는 중')
    // ③ 경과 초(Date.now 프리즈 → 12s 결정론) + ④ 실시간 토큰(estimatedTokens 3400 → 3.4k)
    await expect(status.locator('.status-line-meta')).toContainText('12s')
    await expect(status.locator('.status-line-meta')).toContainText('3.4k tokens')
    // 상태 라인은 마지막 agent 턴 블록의 turn-body 안(별개 블록 아님).
    await expect(page.locator('.turn-block .turn-body [data-testid="status-line"]')).toBeVisible()
    await shootBoth('p04-status-thinking')
  })

  test('p04-transitioned: 상태 라인 소멸 + 같은 턴 블록 안 답변(별개 블록 등장 없음)', async () => {
    await paint('p04-transitioned')
    // 전이 완료 → 상태 라인 소멸.
    await expect(page.locator('[data-testid="status-line"]')).toHaveCount(0)
    // 턴 블록은 여전히 1개(별개 블록 교대 아님) — 사고+답변이 같은 블록.
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
    // 육안 판정용 채증 — 현재 렌더 사실을 측정해 트랜스크립트에 남긴다(무인 "정상" 처리 X).
    // StatusLine.tsx L89가 {label}… 을 무조건 덧붙이므로, thinkingText가 이미 …로 끝나면
    // "……"(U+2026 2개 인접)이 된다. 아래 로그가 그 사실을 채증한다(영호 판정).
    const raw = await phrase.evaluate((el) => el.textContent || '')
    const trailing = raw.slice(-4)
    // eslint-disable-next-line no-console
    console.log('[TG1-P07 이중말줄임 체크포인트] status-line-phrase textContent 말미 4자 =', JSON.stringify(trailing))
    // 기본 텍스트는 확실히 포함(빈 캡처 방어). 이중 여부 판정은 영호 육안 트랙.
    await expect(phrase).toContainText('결정을 마무리하는 중')
    await shootBoth('p04-double-ellipsis')
  })

  test('p06-panel-turn: 멀티패널 PanelView 동형 턴 블록(아바타 1개 .ava-spark)', async () => {
    await paint('p06-panel-turn')
    await expect(page.locator('.ma-panel')).toBeVisible()
    // 패널도 단일챗과 동형 턴 블록 — agent 블록 1개 + .ava-spark 헤더 1개.
    await expect(page.locator('.ma-panel .turn-block')).toHaveCount(1)
    await expect(page.locator('.ma-panel .turn-block-ava.ava-spark')).toBeVisible()
    // 답변 본문 실렌더(빈 캡처 방어). 패널은 개별 버블 아바타를 bare로 생략 → 턴 헤더 1개만.
    await expect(page.locator('.ma-panel .turn-block .msg.ai-msg .content')).toContainText('farewell')
    await shootBoth('p06-panel-turn')
  })

  test('p06-subagent-graceful: 서브에이전트 정적 ✻(.saf-status-symbol) + 우아한 부재(토큰·훅 없음)', async () => {
    await paint('p06-subagent-graceful')
    // 정적 ✻ — StatusLine의 무한 애니메이션 .status-line-symbol이 아니라 전용 정적 클래스.
    const thinking = page.locator('.saf-msg--thinking')
    await expect(thinking).toBeVisible()
    await expect(thinking.locator('.saf-status-symbol')).toBeVisible()
    // 라이브 애니메이션 심볼은 서브 표면에 없어야 한다(거짓 신호 방지 — 계약 부재의 정직한 반영).
    await expect(page.locator('.saf-convo .status-line-symbol')).toHaveCount(0)
    // 사고 → 응답 연속(P16/TG1 P06 계승) + 본문 실렌더.
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
    // 결정론적 활성 확정 — sag-a 참조 교체(같은 id/status) → noteActivity 재발화(위 __touch 주석).
    await page.evaluate(() => (window as unknown as { __touch: (id: string) => void }).__touch('sag-a'))

    // 지그재그: 짝수 index=좌, 홀수 index=우 — 3개 running이면 좌2([a,c])·우1([b]).
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

    // 균등 고정 — 옛 활성확대(flex-grow 2:1) 계약 폐기, 활성 여부와 무관하게 항상 1:1:1.
    await expect(page.locator('.sag-cell:has([data-subagent-id="sag-a"])')).toHaveCSS('flex-grow', '1')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sag-b"])')).toHaveCSS('flex-grow', '1')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sag-c"])')).toHaveCSS('flex-grow', '1')

    // 정적 하이라이트 — 활성 셀 정확히 1개(sag-a), 크기 변화 없이 강조만.
    await expect(page.locator('.sag-cell--active')).toHaveCount(1)
    await expect(page.locator('.sag-cell--active [data-subagent-id="sag-a"]')).toBeVisible()

    await shootBoth('p08-split-zigzag')
  })
})
