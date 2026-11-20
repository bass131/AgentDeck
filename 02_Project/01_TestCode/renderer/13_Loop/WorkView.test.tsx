// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import type { AgentEvent, LoopSessionEventPayload, LoopSessionLog, LoopSessionTag, LoopStatus, MainChatView } from '@shared/ipcContract'
import { installWindowApi, type InstalledWindowApi } from '../00_Helpers/windowApiMock'

const CWD = 'C:\\work\\practice'
const st = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'running', milestoneId: 'M02', node: 'G2/implement', nodeTitle: '구현', reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: true, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [{ key: 'w.1', kind: 'work', node: 'implement', goal: 'G2', live: true }], ...over,
})
const mv: MainChatView = { cwd: CWD, root: CWD, chapter: 'c1', sessionId: 'S1', items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0 }
const tag = (key: string, kind: LoopSessionTag['kind'] = 'work'): LoopSessionTag =>
  kind === 'main' ? { key, kind, node: 'brainstorm', goal: null, sessionId: 'S1' } : { key, kind, node: 'implement', goal: 'G2', sessionId: 'W1' }
const text = (messageId: string, delta: string): AgentEvent => ({ type: 'text', messageId, delta })
const snapshot = (): LoopSessionLog => ({
  cwd: CWD,
  sessions: [
    { session: tag('w.1'), events: [{ type: 'session', sessionId: 'W1' }, text('m1', 'goal 문서를 읽었어. 결과 표 함수부터 테스트를 쓸게.')], next: 2, truncated: false, live: true },
    {
      session: tag('main', 'main'),
      events: [
        { type: 'todos', todos: [{ id: '1', label: '결정 대장 쓰기', status: 'running' }] },
        { type: 'subagent', subagent: { id: 'sa1', name: 'Explore', role: '탐색', status: 'running', tools: [] } },
      ],
      next: 2, truncated: false, live: true,
    },
  ],
})

let installed: InstalledWindowApi<Record<string, unknown>>
let sessionHandlers: Set<(p: LoopSessionEventPayload) => void>
let mainHandlers: Set<(v: MainChatView) => void>
let api: Record<string, ReturnType<typeof vi.fn>>
let git: Record<string, ReturnType<typeof vi.fn>>
let ws: Record<string, ReturnType<typeof vi.fn>>

function install(log: Promise<LoopSessionLog> | LoopSessionLog = snapshot(), status: LoopStatus = st()): void {
  sessionHandlers = new Set()
  mainHandlers = new Set()
  api = {
    loopStatus: vi.fn().mockResolvedValue(status),
    onLoopState: vi.fn(() => () => {}),
    loopMainRead: vi.fn().mockResolvedValue(mv),
    onLoopMainState: vi.fn((cb: (v: MainChatView) => void) => { mainHandlers.add(cb); return () => mainHandlers.delete(cb) }),
    loopSessionLog: vi.fn(() => Promise.resolve(log)),
    loopMainArchives: vi.fn().mockResolvedValue({ cwd: CWD, archives: [] }),
    onLoopSessionEvent: vi.fn((cb: (p: LoopSessionEventPayload) => void) => { sessionHandlers.add(cb); return () => sessionHandlers.delete(cb) }),
    loopListDir: vi.fn(async (req: { relDir: string }) => ({
      ok: true,
      entries: req.relDir === ''
        ? [{ name: 'src', path: 'src', kind: 'directory' }, { name: 'work-only.ts', path: 'work-only.ts', kind: 'file' }]
        : req.relDir === 'src' ? [{ name: 'inner.ts', path: 'src/inner.ts', kind: 'file' }] : [],
    })),
  }
  installed = installWindowApi(api)
  git = installed.api.git as unknown as Record<string, ReturnType<typeof vi.fn>>
  const flat = installed.api as unknown as Record<string, ReturnType<typeof vi.fn>>
  ws = { listDir: flat.fsListDir, open: flat.workspaceOpen, read: flat.fsRead }
  git.status.mockResolvedValue({ root: CWD, branch: 'goal/M02-G2', ahead: 0, behind: 0, changes: [{ path: 'src/report.ts', status: 'M', add: 6, del: 1 }], branches: [], remotes: [], tags: [] })
  git.prRead.mockResolvedValue({ ok: false, error: 'x' })
}

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const click = async (el: HTMLElement): Promise<void> => { await act(async () => { fireEvent.click(el) }); await flush() }
const emitSession = async (p: LoopSessionEventPayload): Promise<void> => { await act(async () => { for (const h of [...sessionHandlers]) h(p) }) }
const tabs = (label: string): HTMLElement => screen.getByRole('tablist', { name: label })
const tabNames = (label: string): string[] => within(tabs(label)).getAllByRole('tab').map((t) => t.getAttribute('aria-label') ?? t.textContent ?? '')

async function renderWork() {
  const { WorkView, useWorkStore } = await import('@renderer/13_Loop')
  useWorkStore.setState({ hydrated: true, cwd: CWD, projects: [CWD], center: 'main', extraTabs: [], right: 'board', archives: [] })
  const r = render(<WorkView />)
  await flush()
  return r
}

beforeEach(() => install())
afterEach(() => { cleanup(); installed.uninstall() })

describe('작업 모드 세 영역과 탭 (M10 G4)', () => {
  it('가운데는 「그래프」「메인 대화」 탭(처음은 메인 대화), 오른쪽은 「현황판」「파일·변경」 탭(처음은 현황판)이다', async () => {
    const r = await renderWork()
    expect(tabNames('가운데 탭')).toEqual(['그래프', '메인 대화'])
    expect(tabNames('오른쪽 탭')).toEqual(['현황판', '파일·변경'])
    expect(within(tabs('가운데 탭')).getByRole('tab', { name: '메인 대화' }).getAttribute('aria-selected')).toBe('true')
    expect(within(tabs('오른쪽 탭')).getByRole('tab', { name: '현황판' }).getAttribute('aria-selected')).toBe('true')
    expect(r.container.querySelector('.work-center .main-chat')).not.toBeNull()
    expect(r.container.querySelector('.work-side .status-board')).not.toBeNull()
  })

  it('그래프 탭을 열면 그래프를 읽는다(캔버스는 WorkView.graph.test). 탭을 바꿔도 메인 대화는 내려가지 않고 숨는다', async () => {
    const r = await renderWork()
    await click(within(tabs('가운데 탭')).getByRole('tab', { name: '그래프' }))
    expect(installed.api.loopGraph).toHaveBeenCalledWith({ cwd: CWD })
    expect(r.container.querySelector('[data-tab-panel="graph"]')?.hasAttribute('hidden')).toBe(false)
    const chat = r.container.querySelector('.main-chat')?.closest('[data-tab-panel]') as HTMLElement
    expect(chat).not.toBeNull()
    expect(chat.hidden).toBe(true)
    expect(api.loopMainRead).toHaveBeenCalledTimes(1)
    await click(within(tabs('가운데 탭')).getByRole('tab', { name: '메인 대화' }))
    expect(chat.hidden).toBe(false)
    expect(api.loopMainRead).toHaveBeenCalledTimes(1)
  })
})

describe('노드 세션 탭 — 보기 전용 (M10 G4)', () => {
  it('현황판 노드 한 줄의 「열기」로 탭을 열면 그 세션의 처음부터의 기록을 채팅 모양으로 보이고 입력칸이 없다', async () => {
    await renderWork()
    expect(api.loopSessionLog).toHaveBeenCalledWith({ cwd: CWD })
    const board = screen.getByRole('region', { name: '노드 세션' })
    await click(within(board).getByRole('button', { name: '열기' }))
    expect(tabNames('가운데 탭')).toEqual(['그래프', '메인 대화', 'G2 implement · 작업'])
    const view = screen.getByRole('region', { name: '노드 세션 G2 implement · 작업' })
    expect(within(view).getByText('goal 문서를 읽었어. 결과 표 함수부터 테스트를 쓸게.')).toBeTruthy()
    expect(within(view).queryByRole('textbox')).toBeNull()
    expect(within(view).getByText(/보기 전용/)).toBeTruthy()
    // 그 뒤 push는 이어 붙고, 이미 받은 차례는 버린다
    await emitSession({ cwd: CWD, session: tag('w.1'), event: text('m1', '중복'), seq: 1 })
    await emitSession({ cwd: CWD, session: tag('w.1'), event: text('m2', '타임아웃 표기가 빠졌어.'), seq: 2 })
    expect(within(view).getByText('타임아웃 표기가 빠졌어.')).toBeTruthy()
    expect(within(view).queryByText(/중복/)).toBeNull()
    // 다른 폴더의 push는 버린다
    await emitSession({ cwd: 'C:\\work\\other', session: tag('w.1'), event: text('m3', '남의 폴더'), seq: 3 })
    expect(within(view).queryByText('남의 폴더')).toBeNull()
    await click(within(view).getByRole('button', { name: '메인 대화로' }))
    expect(within(tabs('가운데 탭')).getByRole('tab', { name: '메인 대화' }).getAttribute('aria-selected')).toBe('true')
  })

  it('스냅숏을 읽는 동안 온 push도 겹치지 않고 빠지지 않는다 — 늦게 연 탭이 처음부터 보인다', async () => {
    let resolve!: (l: LoopSessionLog) => void
    install(new Promise<LoopSessionLog>((r) => { resolve = r }))
    await renderWork()
    // 스냅숏보다 먼저 온 push — 차례 1은 스냅숏에도 있고, 차례 2는 스냅숏 뒤의 사건이다
    await emitSession({ cwd: CWD, session: tag('w.1'), event: text('m1', ' 결과 표 함수부터 테스트를 쓸게.'), seq: 1 })
    await emitSession({ cwd: CWD, session: tag('w.1'), event: text('m2', '두 번째 글'), seq: 2 })
    await act(async () => { resolve(snapshot()) })
    await flush()
    await click(within(screen.getByRole('region', { name: '노드 세션' })).getByRole('button', { name: '열기' }))
    const view = screen.getByRole('region', { name: '노드 세션 G2 implement · 작업' })
    expect(within(view).getByText('goal 문서를 읽었어. 결과 표 함수부터 테스트를 쓸게.')).toBeTruthy()
    expect(within(view).getByText('두 번째 글')).toBeTruthy()
  })

  it('탭의 ×로 닫으면 메인 대화로 돌아간다', async () => {
    await renderWork()
    await click(within(screen.getByRole('region', { name: '노드 세션' })).getByRole('button', { name: '열기' }))
    await click(within(tabs('가운데 탭')).getByRole('button', { name: 'G2 implement · 작업 탭 닫기' }))
    expect(tabNames('가운데 탭')).toEqual(['그래프', '메인 대화'])
    expect(within(tabs('가운데 탭')).getByRole('tab', { name: '메인 대화' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('지난 메인 대화 탭 — 보기 전용 (M10 G4)', () => {
  it('지난 메인 대화 탭은 보관본의 기록을 메인 대화와 같은 모양으로 보이고 입력칸이 없다', async () => {
    await renderWork()
    const { useWorkStore } = await import('@renderer/13_Loop')
    await act(async () => {
      useWorkStore.setState({
        archives: [{ id: 'k-1', at: '2026-11-18T05:00:00.000Z', items: [
          { id: 'i1', at: '2026-11-18T05:00:00.000Z', kind: 'user', text: '외부 링크로 가자', state: 'sent' },
          { id: 'i2', at: '2026-11-18T05:01:00.000Z', kind: 'event', event: { kind: 'spec-approved', node: 'spec-approval', goal: null, text: '스펙 승인' } },
        ] }],
      })
      useWorkStore.getState().openTab('archive:k-1')
    })
    await flush()
    expect(tabNames('가운데 탭')).toEqual(['그래프', '메인 대화', '지난 대화 11/18'])
    const view = screen.getByRole('region', { name: /^지난 메인 대화/ })
    expect(within(view).getByText('외부 링크로 가자')).toBeTruthy()
    expect(view.querySelector('[data-item="i2"]')).not.toBeNull()
    // 긴 보관본도 스크롤되도록 메인 대화와 같은 스크롤 칸(.mc-thread) 안에 그린다
    const log = within(view).getByRole('log', { name: '지난 메인 대화 기록' })
    expect(log.classList.contains('mc-thread')).toBe(true)
    expect(log.contains(within(view).getByText('외부 링크로 가자'))).toBe(true)
    expect(within(view).queryByRole('textbox')).toBeNull()
    expect(installed.api.loopMainSend).not.toHaveBeenCalled()
  })
})

describe('「파일·변경」 탭 (M10 G4)', () => {
  it('탐색기와 작업 폴더의 변경된 파일, 메인 대화의 할 일·서브에이전트를 보인다', async () => {
    const r = await renderWork()
    await click(within(tabs('오른쪽 탭')).getByRole('tab', { name: '파일·변경' }))
    const files = screen.getByRole('region', { name: '파일·변경' })
    // 현황판은 내려가지 않고 숨는다(답한 표시·대기열이 산다)
    expect((r.container.querySelector('.work-side .status-board')?.closest('[data-tab-panel]') as HTMLElement).hidden).toBe(true)
    // 탐색기 자리(.files-explorer) 안에 실제 FileExplorer의 뿌리(.file-explorer)가 있어야 한다
    expect(files.querySelector('.files-explorer .file-explorer')).not.toBeNull()
    expect(git.status).toHaveBeenCalledWith({ root: CWD })
    const changed = within(files).getByRole('region', { name: '변경된 파일' })
    expect(within(changed).getByText('src/report.ts')).toBeTruthy()
    expect(within(changed).getByText('+6')).toBeTruthy()
    expect(within(files).getByText('결정 대장 쓰기')).toBeTruthy()
    expect(within(files).getByText('Explore')).toBeTruthy()
  })

  // G4 검수 10 — 새 메인 대화 뒤에 지난 장의 할 일·서브에이전트가 남지 않는다. main이 비운 기록을 다시 읽고, 차례는 이어 붙는다
  it('메인 대화의 장 표지가 바뀌면 세션 기록을 다시 읽어 지난 장의 할 일·서브에이전트를 지운다', async () => {
    await renderWork()
    await click(within(tabs('오른쪽 탭')).getByRole('tab', { name: '파일·변경' }))
    const files = (): HTMLElement => screen.getByRole('region', { name: '파일·변경' })
    expect(within(files()).getByText('결정 대장 쓰기')).toBeTruthy()
    const reads = api.loopSessionLog.mock.calls.length
    const cleared = snapshot()
    cleared.sessions[1] = { ...cleared.sessions[1], events: [] }
    api.loopSessionLog.mockResolvedValue(cleared)
    await act(async () => { for (const h of [...mainHandlers]) h({ ...mv, chapter: 'c2', sessionId: null }) })
    await flush()
    expect(api.loopSessionLog).toHaveBeenCalledTimes(reads + 1)
    expect(within(files()).queryByText('결정 대장 쓰기')).toBeNull()
    expect(within(files()).queryByText('Explore')).toBeNull()
    await emitSession({ cwd: CWD, session: tag('main', 'main'), event: { type: 'todos', todos: [{ id: '2', label: '새 장의 할 일', status: 'running' }] }, seq: 2 })
    expect(within(files()).getByText('새 장의 할 일')).toBeTruthy()
    await act(async () => { for (const h of [...mainHandlers]) h({ ...mv, chapter: 'c2', sessionId: 'S2' }) })
    await flush()
    expect(api.loopSessionLog).toHaveBeenCalledTimes(reads + 1)
  })

  // M11 G4 — 옛 「채팅에서 연 폴더가 없으면 … 알린다」(M10 G4)를 새 동작으로 바꿨다: 탐색기는 채팅 폴더와 상관없이 작업 폴더를 그린다
  it('[M11-G4 M10-16] 채팅에서 연 폴더가 없어도 탐색기는 작업 폴더의 트리를 보인다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: null } as never)
    await renderWork()
    await click(within(tabs('오른쪽 탭')).getByRole('tab', { name: '파일·변경' }))
    const box = within(screen.getByRole('region', { name: '파일·변경' })).getByRole('region', { name: '파일' })
    expect(within(box).getByText('work-only.ts')).toBeTruthy()
    expect(within(box).queryByText(/채팅 모드에서 연 폴더/)).toBeNull()
    expect(within(box).queryByRole('button', { name: '폴더 선택' })).toBeNull()
  })
})

describe('「파일·변경」 탐색기는 작업 폴더를 그린다 (M11 G4)', () => {
  const CHAT = 'C:\\chat\\notes'
  async function openFiles(): Promise<HTMLElement> {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({
      workspaceRoot: CHAT,
      fileTree: { name: 'notes', path: '', kind: 'directory', children: [{ name: 'chat-only.md', path: 'chat-only.md', kind: 'file' }] },
    } as never)
    await renderWork()
    await click(within(tabs('오른쪽 탭')).getByRole('tab', { name: '파일·변경' }))
    return within(screen.getByRole('region', { name: '파일·변경' })).getByRole('region', { name: '파일' })
  }
  afterEach(async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ workspaceRoot: null, fileTree: null } as never)
  })

  it('[M11-G4 M10-16] 채팅 모드가 다른 폴더를 열고 있어도 탐색기는 작업 폴더의 트리를 보인다', async () => {
    const box = await openFiles()
    expect(within(box).getByText('work-only.ts')).toBeTruthy()
    expect(within(box).queryByText('chat-only.md')).toBeNull()
    expect(within(box).queryByText(/채팅 모드에서 연 폴더/)).toBeNull()
    expect(box.querySelector('.file-explorer')).not.toBeNull()
    expect(api.loopListDir).toHaveBeenCalledWith({ cwd: CWD, relDir: '' })
    expect(ws.listDir).not.toHaveBeenCalled()
    await click(within(box).getByRole('button', { name: /src/ }))
    expect(api.loopListDir).toHaveBeenCalledWith({ cwd: CWD, relDir: 'src' })
    expect(within(box).getByText('inner.ts')).toBeTruthy()
  })

  it('[M11-G4 M10-16] 작업 폴더의 실행기가 열려 있지 않으면 트리 대신 그 까닭을 보인다', async () => {
    api.loopListDir.mockResolvedValue({ ok: false, entries: [] })
    const box = await openFiles()
    expect(within(box).getByText(/이 폴더의 실행기를 열면/)).toBeTruthy()
    expect(within(box).queryByText('chat-only.md')).toBeNull()
  })

  it('[M11-G4 M10-16] 작업 모드 탐색기의 조작은 채팅 모드의 폴더·참조 폴더·연 파일을 바꾸지 않는다', async () => {
    const box = await openFiles()
    expect(within(box).queryByRole('button', { name: '메인 작업 폴더' })).toBeNull()
    expect(within(box).queryByText(/폴더 추가/)).toBeNull()
    // 파일 검색은 채팅 모드 폴더의 목록(workspace.listFiles)을 읽으므로 작업 모드 탐색기에는 없다
    expect(within(box).queryByRole('textbox', { name: '파일 검색' })).toBeNull()
    await click(within(box).getByText('work-only.ts'))
    const { useAppStore } = await import('@renderer/00_App/appStore')
    expect(ws.open).not.toHaveBeenCalled()
    expect(ws.read).not.toHaveBeenCalled()
    expect(useAppStore.getState().workspaceRoot).toBe(CHAT)
    expect(useAppStore.getState().openedFile).toBeNull()
  })
})

describe('메인 대화가 채팅 스레드 그리기를 쓴다 (M11 G4)', () => {
  const withMain = (events: AgentEvent[]): LoopSessionLog => {
    const s = snapshot()
    s.sessions[1] = { ...s.sessions[1], events, next: events.length, live: true }
    return s
  }
  const region = (): HTMLElement => screen.getByRole('region', { name: '메인 대화' })
  const at = '2026-11-20T05:00:00.000Z'

  it('[M11-G4 M10-22] 메인 턴이 도는 동안 추론 중 표시와 생각 블록이 메인 대화에 보인다', async () => {
    install(withMain([{ type: 'session', sessionId: 'S1' }, { type: 'thinking_delta', text: '범위를 따져 보는 중' }]))
    api.loopMainRead.mockResolvedValue({ ...mv, busy: true })
    await renderWork()
    expect(within(region()).getByTestId('status-line')).toBeTruthy()
    expect(within(region()).getByTestId('thinking-block')).toBeTruthy()
  })

  it('[M11-G4 M10-22] 메인 턴이 돌지 않으면 추론 중 표시를 켜지 않는다', async () => {
    install(withMain([{ type: 'session', sessionId: 'S1' }, { type: 'thinking_delta', text: '범위를 따져 보는 중' }]))
    await renderWork()
    expect(within(region()).queryByTestId('status-line')).toBeNull()
  })

  it('[M11-G4 M10-22] 흘러나오는 중인 메인의 글이 메인 대화에 보인다', async () => {
    install(withMain([{ type: 'session', sessionId: 'S1' }, text('b1', '스펙 초안을 쓰는 중이야')]))
    api.loopMainRead.mockResolvedValue({ ...mv, busy: true })
    await renderWork()
    // 흘러나오는 글은 채팅 모드처럼 부드럽게 드러난다(SmoothMarkdown)
    expect(await within(region()).findByText('스펙 초안을 쓰는 중이야', undefined, { timeout: 3000 })).toBeTruthy()
    expect(region().querySelector('.turn-block')).not.toBeNull()
  })

  it('[M11-G4 M10-22] 메인의 도구 호출과 결과가 채팅 모드의 도구 묶음 모양으로 보인다', async () => {
    install(withMain([
      { type: 'session', sessionId: 'S1' },
      { type: 'tool_call', id: 't1', name: 'Read', input: { file_path: 'docs/spec.md' } },
      { type: 'tool_result', id: 't1', ok: true, output: 'ok' },
    ]))
    await renderWork()
    expect(region().querySelector('.toollog')).not.toBeNull()
  })

  it('[M11-G4 M10-22] 끝난 턴의 답은 세션 사건의 글과 대화 기록의 답 중 한 번만 그리고, 도구 묶음은 그 답 자리에 함께 있다', async () => {
    install(withMain([
      { type: 'session', sessionId: 'S1' },
      { type: 'tool_call', id: 't1', name: 'Read', input: { file_path: 'docs/spec.md' } },
      { type: 'tool_result', id: 't1', ok: true, output: 'ok' },
      text('b1', '스펙 초안을 썼어'),
      { type: 'done' },
    ]))
    api.loopMainRead.mockResolvedValue({ ...mv, items: [
      { id: 'u1', at, kind: 'user', text: '초안 써 줘', state: 'sent' },
      { id: 'a1', at, kind: 'assistant', text: '스펙 초안을 썼어', turn: 'user' },
      { id: 'u2', at, kind: 'user', text: '다음은?', state: 'sent' },
    ] })
    await renderWork()
    expect(within(region()).getAllByText('스펙 초안을 썼어')).toHaveLength(1)
    const answer = region().querySelector('[data-item="a1"]') as HTMLElement
    expect(answer.querySelector('.toollog')).not.toBeNull()
    const order = [...region().querySelectorAll('[data-item]')].map((el) => el.getAttribute('data-item'))
    expect(order).toEqual(['u1', 'a1', 'u2'])
  })

  it('[M11-G4 M10-22] 세션 기록이 없는 지난 답(재기동·새 장)은 대화 기록의 글로 그린다', async () => {
    install(withMain([]))
    api.loopMainRead.mockResolvedValue({ ...mv, items: [{ id: 'a1', at, kind: 'assistant', text: '어제 정한 범위야', turn: 'user' }] })
    await renderWork()
    expect(within(region()).getAllByText('어제 정한 범위야')).toHaveLength(1)
  })
})
