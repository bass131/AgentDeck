import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { build } from 'esbuild'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.P14SHOTS === '1'

const ROOT = process.cwd()
const RENDERER_SRC = join(ROOT, '02_Source', 'renderer', 'src')
const SHOT_DIR = join(ROOT, '01_Phases', '17_GAP1-core-parity', 'ScreenShot')

const CSS_FILES = [
  'theme/tokens.css',
  'layout/shell.css',
  'components/00_shell/PaneSplitter.css',
  'components/00_shell/MultiWorkspace.css',
  'components/05_agent/SubAgentSplitView.css',
  'components/05_agent/SubAgentCell.css',
  'components/05_agent/SubAgentFullscreen.css',
  'components/05_agent/AgentPanel.css',
  'components/01_conversation/Conversation.css',
  'components/01_conversation/ToolGroup.css',
  'components/01_conversation/ToolCallCard.css',
  'components/01_conversation/MarkdownView.css',
]

let app: ElectronApplication
let page: Page
let tmp: string

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
      { id: 'tl-1', verb: 'read', target: '02_Source/renderer/src/lib/splitView.ts', status: 'done' },
      { id: 'tl-2', verb: 'search', target: 'rowWeights', status: 'done' },
      { id: 'tl-3', verb: 'bash', target: 'npm run test -- splitview', status: 'running' },
    ],
    transcript: [
      { kind: 'thinking', id: 'th-1', text: '정책 파일을 먼저 읽고 컬럼 분해·가중치 규칙을 확인한 뒤 테스트로 계약을 대조한다…' },
      { kind: 'tool', id: 'tl-1', verb: 'read', target: '02_Source/renderer/src/lib/splitView.ts', status: 'done' },
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

/** p14-four — 4개: 지그재그 좌[a,c]·우[b,d](§📐 TG1 P08 — 짝수 index=좌·홀수=우, 균등). */
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

/** p14-active — 5개(좌[a,c,e]·우[b,d]): __touch('sa-b')로 정적 하이라이트(.sag-cell--active) 트리거. */
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

async function shootBoth(name: string): Promise<void> {
  await shoot(name, 'dark')
  await shoot(name, 'light')
  await setTheme('dark')
}

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

  test('p14-single: 셀 1개 — 우측 전체 높이 + task/tool/text 혼합 transcript', async () => {
    await paint('p14-single')
    await expect(page.locator('.sag-count')).toHaveText('동시 표시 1')
    await expect(page.locator('.sag-grid [data-subagent-id]')).toHaveCount(1)
    await expect(page.locator('.sag-col')).toHaveCount(1)
    await expect(page.locator('.saf-msg--task')).toBeVisible()
    await expect(page.locator('.toollog').first()).toBeVisible()
    await expect(page.locator('.saf-msg--agent .content')).toContainText('컬럼당 최대 3행')
    await expect(page.locator('.ma-p-scope-item')).toHaveText('도구 2/3')
    await settled('sa-solo', '단일 셀 컬럼은 [1] 고정(전체 높이)')
    await shootBoth('p14-single')
  })

  test('p14-four: 4개 — 지그재그 좌[a,c]·우[b,d](균등 2·2)', async () => {
    await paint('p14-four')
    const cols = page.locator('.sag-col')
    await expect(cols).toHaveCount(2)
    await expect(cols.nth(0).locator('[data-subagent-id]')).toHaveCount(2)
    await expect(cols.nth(1).locator('[data-subagent-id]')).toHaveCount(2)
    await expect(cols.nth(1).locator('[data-subagent-id="sa-d"]')).toBeVisible()
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
    expect(await page.locator('.sag-queue button').count()).toBe(0)
    await settled('sa-a', '확인 중입니다')
    await settled('sa-b', '검토 중입니다')
    await settled('sa-c', '정리 중입니다')
    await settled('sa-d', '작성 중입니다')
    await settled('sa-e', '대조 중입니다')
    await settled('sa-f', '계측 중입니다')
    await shootBoth('p14-queue')
  })

  test('p14-active: 활성 셀 정적 하이라이트 — __touch 참조 갱신 → .sag-cell--active(균등 유지)', async () => {
    await paint('p14-active')
    await expect(page.locator('.sag-grid [data-subagent-id]')).toHaveCount(5)
    await page.evaluate((id) => (window as unknown as { __touch: (id: string) => void }).__touch(id), 'sa-b')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-b"])')).toHaveClass(/sag-cell--active/)
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-b"])')).toHaveCSS('flex-grow', '1')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-a"])')).not.toHaveClass(/sag-cell--active/)
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-a"])')).toHaveCSS('flex-grow', '1')
    await expect(page.locator('.sag-cell:has([data-subagent-id="sa-e"])')).toHaveCSS('flex-grow', '1')
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
    await settled('sa-a', '확인 중입니다')
    await settled('sa-b', '검토 중입니다')
    await settled('sa-c', '정리 중입니다')
    await page.locator('[data-subagent-id="sa-b"] .sac-toggle').click()
    await expect(page.locator('[data-subagent-id="sa-b"].sac-off')).toBeVisible()
    await expect(page.locator('[data-subagent-id="sa-b"] .sac-toggle')).toHaveAttribute('aria-label', '창 활성화')
    expect(await page.locator('.sac-off').count()).toBe(1)
    await shootBoth('p14-disabled')
  })
})
