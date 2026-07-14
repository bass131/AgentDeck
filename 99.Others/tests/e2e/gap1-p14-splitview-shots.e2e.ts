/**
 * gap1-p14-splitview-shots.e2e.ts — GAP1 P14 SubAgent 스플릿 뷰 컴포넌트 하네스 시각검증 (opt-in).
 *
 * 배경(왜 라이브가 아니라 하네스인가 — gap1-visual-shots.e2e.ts 관행 계승):
 *   스플릿 뷰의 육안 포인트(동시 6셀·대기열 탭·활성 셀 자동 확대·비활성 dim)는 라이브로
 *   재현하려면 실제 SubAgent를 1~7개 동시 구동해야 해 비용 과다 + 배치/활성 타이밍이
 *   비결정적이다. *실제 컴포넌트를 실제 CSS로 그대로 렌더*해 육안 자료를 결정적으로
 *   확보한다(손 마크업 금지 — 골든 드리프트 방지, 앱 소스 무수정 = qa 영역).
 *
 * 렌더 방식(브리프 "우선안" 채택): SubAgentSplitView는 store 결합 컨테이너지만,
 *   `useAppStore.setState({ subagents: fixture })`로 **실 store를 시드해 컨테이너째 렌더**한다.
 *   근거: ① 같은 시드 관행이 단위 테스트(gap1-p14-splitview-container.test.tsx setup)에서
 *   이미 검증됨 ② store의 window.api 접근은 전부 액션 내부(모듈 최상위 0)라 Proxy 스텁으로
 *   안전 ③ 표현 계층만 렌더하는 차선과 달리 헤더 스트립·대기열 탭·그리드 골격
 *   (SubAgentSplitView.css)까지 실물 그대로 채증된다.
 *
 * 장면 격리: __paint(scene)가 store를 교체하고 key={scene}로 컨테이너를 **강제 리마운트** —
 *   이전 장면의 disabled/activeId/참조 맵이 다음 장면에 새지 않는다(결정성).
 *   활성 확대(p14-active)는 __touch(id)로 해당 agent만 새 참조로 교체 —
 *   컨테이너의 참조 비교 활동 감지 → noteActivity 실경로를 그대로 발화시킨다.
 *
 * 결정성: 시간/랜덤/네트워크/엔진 0. 모든 fixture는 running(doneAt 없음 → 린저 타이머 0).
 *   스피너/커서는 prefers-reduced-motion:reduce로 정지. flex-grow 전이는 toHaveCSS 폴링으로
 *   settle 후 캡처. SmoothMarkdown 점진 reveal(RAF 구동 — reduced-motion 무관)은 전체
 *   텍스트로 수렴하는 종단 상태가 있으므로, 각 셀 본문의 **꼬리 텍스트 단언**으로 reveal
 *   완료를 기다린 뒤 캡처한다(중간 표출 컷의 런 간 편차 제거).
 *
 * 실행:
 *   P14SHOTS=1 npx playwright test 99.Others/tests/e2e/gap1-p14-splitview-shots.e2e.ts
 *
 * 산출물: 01.Phases/17_GAP1-core-parity/ScreenShot/ (p14-<장면>-{dark|light}.png)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.P14SHOTS === '1'

// ── 경로 상수 ────────────────────────────────────────────────────────────────
const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02.Source', 'renderer', 'src')
const SHOT_DIR = join(ROOT, '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

/** 실 CSS 주입 목록 — 스플릿 뷰 렌더 트리가 소비하는 소유 파일 전부(토큰 포함). */
const CSS_FILES = [
  'theme/tokens.css',
  'layout/shell.css', // .pane/.pane.agent — 우측 도크 골격
  'components/00_shell/PaneSplitter.css',
  'components/00_shell/MultiWorkspace.css', // .ma-panel/.ma-p-* 셀 카드 문법
  'components/05_agent/SubAgentSplitView.css',
  'components/05_agent/SubAgentCell.css',
  'components/05_agent/SubAgentFullscreen.css', // .saf-msg--*/.saf-running 소유
  'components/05_agent/AgentPanel.css', // .ag-empty/.spin 소유
  'components/01_conversation/Conversation.css', // .msg/.ava/.meta/.content(MessageBubble)
  'components/01_conversation/ToolGroup.css', // .toollog
  'components/01_conversation/ToolCallCard.css',
  'components/01_conversation/MarkdownView.css',
]

let app: ElectronApplication
let page: Page
let tmp: string

/**
 * 하네스 진입 번들 — 실제 컨테이너(SubAgentSplitView)를 실 store 시드로 그대로 렌더.
 * 장면(scene) 문자열 → subagents fixture 교체 + key 리마운트. 템플릿 리터럴 escape 마찰을
 * 피하려고 문자열 연결로만 쓴다(gap1-visual-shots 관행).
 */
const ENTRY_TSX = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import SubAgentSplitView from './components/05_agent/SubAgentSplitView'
import { useAppStore } from './store/appStore'

const root = createRoot(document.getElementById('root'))

// ── 고정 fixtures ────────────────────────────────────────────────────────────

/** SubAgentInfo 최소 생성자 — 전부 running(린저 타이머 0 = 결정성). */
function mk(id, name, extra) {
  return Object.assign(
    { id: id, name: name, role: '', status: 'running', tools: [], transcript: [] },
    extra || {}
  )
}

/** p14-single — 셀 1개: task(role)/tool/text 혼합 transcript + 도구 요약 라인. */
const SINGLE = [
  mk('sa-solo', 'explorer', {
    displayName: '정책 스카우트',
    role: 'splitView.ts 배정 정책을 읽고 rowWeights 계약을 요약해 주세요. 관련 테스트 파일도 함께 확인합니다.',
    tools: [
      { id: 'tl-1', verb: 'read', target: '02.Source/renderer/src/lib/splitView.ts', status: 'done' },
      { id: 'tl-2', verb: 'search', target: 'rowWeights', status: 'done' },
      { id: 'tl-3', verb: 'bash', target: 'npm run test -- splitview', status: 'running' },
    ],
    transcript: [
      { kind: 'thinking', id: 'th-1', text: '정책 파일을 먼저 읽고 컬럼 분해·가중치 규칙을 확인한 뒤 테스트로 계약을 대조한다…' },
      { kind: 'tool', id: 'tl-1', verb: 'read', target: '02.Source/renderer/src/lib/splitView.ts', status: 'done' },
      { kind: 'tool', id: 'tl-2', verb: 'search', target: 'rowWeights', status: 'done' },
      {
        kind: 'text',
        id: 'tx-1',
        text: ['정책을 확인했어요.', '', '- 컬럼당 최대 3행, 동시 표시 상한 6', '- 활성 셀 가중치 2, 나머지 1', '- 단일 셀 컬럼은 [1] 고정(전체 높이)'].join('\\n'),
      },
      { kind: 'tool', id: 'tl-3', verb: 'bash', target: 'npm run test -- splitview', status: 'running' },
    ],
  }),
]

/** 소형 셀 공통 — role 1줄 + 진행 텍스트 1개(셀 판독성 유지). */
function small(id, display, roleText, bodyText) {
  return mk(id, id, {
    displayName: display,
    role: roleText,
    transcript: [{ kind: 'text', id: id + '-tx', text: bodyText }],
  })
}

/** p14-four — 4개: 컬럼1 = 3행, 컬럼2 = 1개 전체 높이(§📐 채움 순서). */
const FOUR = [
  small('sa-a', '자료 조사', '기존 그리드 관례를 조사해 주세요.', 'MultiWorkspace의 .ma-grid 관례를 확인 중입니다.'),
  small('sa-b', '구현 검토', '셀 컴포넌트 재사용성을 검토해 주세요.', 'SubAgentCell props 표면을 검토 중입니다.'),
  small('sa-c', '테스트 정리', '정책 테스트 시나리오를 정리해 주세요.', '1~7개 배치 시나리오를 표로 정리 중입니다.'),
  small('sa-d', '문서 초안', 'UI.md 셸 골격 갱신 초안을 써 주세요.', '우측 도크 분기 서술을 작성 중입니다.'),
]

/** p14-queue — 7개: 6셀 + 대기열 탭 1(§📐 상한 초과 → FIFO 대기). */
const QUEUE = [
  small('sa-a', '자료 조사', '기존 그리드 관례를 조사해 주세요.', 'MultiWorkspace의 .ma-grid 관례를 확인 중입니다.'),
  small('sa-b', '구현 검토', '셀 컴포넌트 재사용성을 검토해 주세요.', 'SubAgentCell props 표면을 검토 중입니다.'),
  small('sa-c', '테스트 정리', '정책 테스트 시나리오를 정리해 주세요.', '1~7개 배치 시나리오를 표로 정리 중입니다.'),
  small('sa-d', '문서 초안', 'UI.md 셸 골격 갱신 초안을 써 주세요.', '우측 도크 분기 서술을 작성 중입니다.'),
  small('sa-e', '회귀 점검', '기존 소비 계약 회귀를 점검해 주세요.', 'components.test.tsx 소비 지점을 대조 중입니다.'),
  small('sa-f', '성능 측정', '6셀 동시 스트리밍 렌더 비용을 측정해 주세요.', 'memo 셀 재렌더 횟수를 계측 중입니다.'),
  small('sa-g', '일곱째 분석', '축출·승격 경로를 분석해 주세요.', '대기열에서 승격을 기다리는 중입니다.'),
]

/** p14-active — 5개(컬럼1=3·컬럼2=2): __touch('sa-b')로 활성 확대(2:1) 트리거. */
const ACTIVE = [
  small('sa-a', '자료 조사', '기존 그리드 관례를 조사해 주세요.', 'MultiWorkspace의 .ma-grid 관례를 확인 중입니다.'),
  small('sa-b', '구현 검토', '셀 컴포넌트 재사용성을 검토해 주세요.', 'SubAgentCell props 표면을 검토 중입니다.'),
  small('sa-c', '테스트 정리', '정책 테스트 시나리오를 정리해 주세요.', '1~7개 배치 시나리오를 표로 정리 중입니다.'),
  small('sa-d', '문서 초안', 'UI.md 셸 골격 갱신 초안을 써 주세요.', '우측 도크 분기 서술을 작성 중입니다.'),
  small('sa-e', '회귀 점검', '기존 소비 계약 회귀를 점검해 주세요.', 'components.test.tsx 소비 지점을 대조 중입니다.'),
]

/** p14-disabled — 3개: 셀 sa-b를 실 토글 클릭으로 비활성(.sac-off dim). */
const DISABLED = [
  small('sa-a', '자료 조사', '기존 그리드 관례를 조사해 주세요.', 'MultiWorkspace의 .ma-grid 관례를 확인 중입니다.'),
  small('sa-b', '구현 검토', '셀 컴포넌트 재사용성을 검토해 주세요.', 'SubAgentCell props 표면을 검토 중입니다.'),
  small('sa-c', '테스트 정리', '정책 테스트 시나리오를 정리해 주세요.', '1~7개 배치 시나리오를 표로 정리 중입니다.'),
]

const SCENES = {
  'p14-single': SINGLE,
  'p14-four': FOUR,
  'p14-queue': QUEUE,
  'p14-active': ACTIVE,
  'p14-disabled': DISABLED,
}

// ── 셸 스캐폴드 — 좌측 메인 대화 자리(맥락) + 실제 컨테이너(우측 도크) ────────
function HarnessShell() {
  return React.createElement(
    'div',
    { className: 'harness-shell' },
    React.createElement(
      'div',
      { className: 'harness-main' },
      '메인 세션 대화 영역 — 배치 맥락(하네스 스캐폴드)'
    ),
    React.createElement(SubAgentSplitView, null)
  )
}

;(window).__paint = (scene) => {
  const fixture = SCENES[scene]
  if (!fixture) throw new Error('unknown scene: ' + scene)
  useAppStore.setState({ subagents: fixture })
  // key=scene → 장면마다 컨테이너 강제 리마운트(disabled/activeId 장면 간 오염 차단).
  root.render(React.createElement(HarnessShell, { key: scene }))
}

/** 활성 확대 트리거 — 해당 agent만 새 참조(transcript 추가)로 교체 → 컨테이너의
 *  참조 비교 활동 감지(noteActivity) 실경로 발화. 나머지는 참조 보존(reducer 규율 재현). */
;(window).__touch = (id) => {
  const cur = useAppStore.getState().subagents
  useAppStore.setState({
    subagents: cur.map((a) =>
      a.id === id
        ? Object.assign({}, a, {
            transcript: (a.transcript || []).concat([
              // 선행 빈 줄 2개 — 인접 text 병합(buildSubagentChatItems) 시 문단 경계 유지.
              { kind: 'text', id: 'touch-1', text: '\\n\\n방금 새 진행 로그가 도착했어요 — 활성 셀 자동 확대.' },
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
body { background: var(--bg); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
.harness-shell { display: flex; flex-direction: row; height: 100%; background: var(--bg); }
.harness-main {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-4);
  font-size: 12px;
}
`

async function bundleEntry(): Promise<string> {
  const result = await build({
    stdin: { contents: ENTRY_TSX, resolveDir: RENDERER_SRC, loader: 'tsx', sourcefile: 'gap1-p14-harness-entry.tsx' },
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
  await page.waitForTimeout(150)
  await page.screenshot({ path: join(SHOT_DIR, `${name}-${theme}.png`), fullPage: false })
}

/** 다크/라이트 두 컷. */
async function shootBoth(name: string): Promise<void> {
  await shoot(name, 'dark')
  await shoot(name, 'light')
  await setTheme('dark')
}

/** SmoothMarkdown reveal 종단 대기 — 셀 본문 꼬리 텍스트가 표출될 때까지 폴링(결정적 캡처). */
async function settled(id: string, tail: string): Promise<void> {
  await expect(page.locator(`[data-subagent-id="${id}"]`)).toContainText(tail)
}

test.describe('GAP1 P14 스플릿 뷰: 컴포넌트 하네스 시각검증 (P14SHOTS=1)', () => {
  test.skip(!RUN, '육안 자료 수집 — P14SHOTS=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    tmp = mkdtempSync(join(tmpdir(), 'agentdeck-p14shots-'))

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
// 하네스 스텁 — store 번들의 액션 경로 방어(신뢰경계 실 IPC 없음). 모든 속성이 async no-op.
window.api = new Proxy({}, { get: function () { return function () { return Promise.resolve({}) } } })
// 분할 도크 폭 사전 시드 — 2컬럼 그리드가 판독 가능한 폭으로 열리게(loadPaneWidth 실경로 소비).
try { localStorage.setItem('agentdeck.pane.splitW', '840') } catch (e) {}
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
    width: 1280,
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
    // 스피너/스트리밍 커서 무한 애니메이션 정지 — 결정적 캡처.
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  })

  test('p14-single: 셀 1개 — 우측 전체 높이 + task/tool/text 혼합 transcript', async () => {
    await paint('p14-single')
    await expect(page.locator('.sag-count')).toHaveText('동시 표시 1')
    await expect(page.locator('.sag-grid [data-subagent-id]')).toHaveCount(1)
    await expect(page.locator('.sag-col')).toHaveCount(1) // 1개 = 컬럼 1(전체 높이)
    // transcript 혼합 실렌더 확인(빈 캡처 방어): task 버블 + tool 런 그룹 + text 응답
    await expect(page.locator('.saf-msg--task')).toBeVisible()
    await expect(page.locator('.toollog').first()).toBeVisible()
    await expect(page.locator('.saf-msg--agent .content')).toContainText('컬럼당 최대 3행')
    // 도구 요약 라인(done 2 / 전체 3)
    await expect(page.locator('.ma-p-scope-item')).toHaveText('도구 2/3')
    // reveal 종단 대기 — 응답 마지막 줄까지 표출 후 캡처(중간 표출 편차 제거)
    await settled('sa-solo', '단일 셀 컬럼은 [1] 고정(전체 높이)')
    await shootBoth('p14-single')
  })

  test('p14-four: 4개 — 컬럼1=3행 + 컬럼2=1개 전체 높이', async () => {
    await paint('p14-four')
    const cols = page.locator('.sag-col')
    await expect(cols).toHaveCount(2)
    await expect(cols.nth(0).locator('[data-subagent-id]')).toHaveCount(3)
    await expect(cols.nth(1).locator('[data-subagent-id]')).toHaveCount(1)
    await expect(cols.nth(1).locator('[data-subagent-id="sa-d"]')).toBeVisible() // 채움 순서(4번째 = 컬럼2 혼자)
    // 4셀 전부 reveal 종단 대기
    await settled('sa-a', '확인 중입니다')
    await settled('sa-b', '검토 중입니다')
    await settled('sa-c', '정리 중입니다')
    await settled('sa-d', '작성 중입니다')
    await shootBoth('p14-four')
  })

  test('p14-queue: 7개 — 6셀 + 대기열 탭 1(헤더 스트립 노출)', async () => {
    await paint('p14-queue')
    await expect(page.locator('.sag-grid [data-subagent-id]')).toHaveCount(6)
    await expect(page.locator('.sag-count')).toHaveText('동시 표시 6')
    await expect(page.locator('.sag-queue-label')).toHaveText('대기 1')
    await expect(page.locator('.sag-queue-tab')).toHaveText('일곱째 분석')
    // 표시 전용 계약 — 수동 승격 버튼 없음
    expect(await page.locator('.sag-queue button').count()).toBe(0)
    // 6셀 전부 reveal 종단 대기
    await settled('sa-a', '확인 중입니다')
    await settled('sa-b', '검토 중입니다')
    await settled('sa-c', '정리 중입니다')
    await settled('sa-d', '작성 중입니다')
    await settled('sa-e', '대조 중입니다')
    await settled('sa-f', '계측 중입니다')
    await shootBoth('p14-queue')
  })

  test('p14-active: 활성 셀 확대 — __touch 참조 갱신 → rowWeights 2:1 반영', async () => {
    await paint('p14-active')
    await expect(page.locator('.sag-grid [data-subagent-id]')).toHaveCount(5)
    // 참조 갱신(스트림 활동) — 컨테이너의 noteActivity 실경로 발화
    await page.evaluate((id) => (window as unknown as { __touch: (id: string) => void }).__touch(id), 'sa-b')
    // computed flex-grow 폴링 = CSS transition settle 대기 겸 단언(2:1 확정 후 캡처)
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-b"])')).toHaveCSS('flex-grow', '2')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-a"])')).toHaveCSS('flex-grow', '1')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-e"])')).toHaveCSS('flex-grow', '1')
    // reveal 종단 대기 — 활성 셀은 방금 도착한 조각까지, 나머지는 본문 꼬리까지
    await settled('sa-b', '활성 셀 자동 확대')
    await settled('sa-a', '확인 중입니다')
    await settled('sa-c', '정리 중입니다')
    await settled('sa-d', '작성 중입니다')
    await settled('sa-e', '대조 중입니다')
    await shootBoth('p14-active')
  })

  test('p14-disabled: 창 비활성 토글 — .sac-off dim(본문) + 헤더는 라이브 유지', async () => {
    await paint('p14-disabled')
    await expect(page.locator('.sag-grid [data-subagent-id]')).toHaveCount(3)
    // reveal 종단 대기 — freeze 전에 전체 표출(비활성 셀도 완성된 본문 위에서 dim)
    await settled('sa-a', '확인 중입니다')
    await settled('sa-b', '검토 중입니다')
    await settled('sa-c', '정리 중입니다')
    // 실 인터랙션 — 셀 sa-b 헤더 토글 클릭
    await page.locator('[data-subagent-id="sa-b"] .sac-toggle').click()
    await expect(page.locator('[data-subagent-id="sa-b"].sac-off')).toBeVisible()
    await expect(page.locator('[data-subagent-id="sa-b"] .sac-toggle')).toHaveAttribute('aria-label', '창 활성화')
    expect(await page.locator('.sac-off').count()).toBe(1) // 나머지 셀은 활성 유지
    await shootBoth('p14-disabled')
  })
})
