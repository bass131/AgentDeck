// @vitest-environment jsdom
// 세션 push 하나가 작업 화면 전체를 다시 그리지 않는다. 그리기 횟수를 세려고 무거운 칸을 대역으로 바꾼다
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
import type { AgentEvent, LoopSessionEventPayload, LoopSessionLog, LoopSessionTag, LoopStatus, MainChatView } from '@shared/ipcContract'
import type { LoopSessionRecord } from '@shared/ipcContract'
import { installWindowApi, type InstalledWindowApi } from '../00_Helpers/windowApiMock'

const counts = vi.hoisted(() => ({ main: 0, board: 0, thread: 0, panel: 0 }))
vi.mock('@renderer/13_Loop/MainChatView', async (orig) => ({
  ...(await orig<typeof import('@renderer/13_Loop/MainChatView')>()),
  MainChatView: () => { counts.main++; return null },
}))
vi.mock('@renderer/13_Loop/LoopScreen', async (orig) => ({
  ...(await orig<typeof import('@renderer/13_Loop/LoopScreen')>()),
  StatusBoard: () => { counts.board++; return null },
}))
vi.mock('@renderer/05_Conversation/ThreadView', async (orig) => ({
  ...(await orig<typeof import('@renderer/05_Conversation/ThreadView')>()),
  ThreadView: () => { counts.thread++; return null },
}))
vi.mock('@renderer/13_Loop/sessionLogModel', async (orig) => {
  const m = await orig<typeof import('@renderer/13_Loop/sessionLogModel')>()
  return { ...m, mainPanelOf: (rec: LoopSessionRecord | undefined) => { counts.panel++; return m.mainPanelOf(rec) } }
})

const CWD = 'C:\\work\\practice'
const status: LoopStatus = {
  cwd: CWD, root: CWD, phase: 'running', milestoneId: 'M02', node: 'G2/implement', nodeTitle: '구현', reason: null,
  base: 'main', ghRepo: 'me/practice', failCount: 0, goals: [], approval: null, milestonePr: null, cards: [],
  sessionActive: true, lastVerdict: null, latch: null, paused: false, mainBusy: false, mainWaiting: false,
  mainNode: false, recentLines: [], sessions: [{ key: 'w.1', kind: 'work', node: 'implement', goal: 'G2', live: true }],
}
const mv: MainChatView = { cwd: CWD, root: CWD, chapter: 'c1', sessionId: 'S1', items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0 }
const work: LoopSessionTag = { key: 'w.1', kind: 'work', node: 'implement', goal: 'G2', sessionId: 'W1' }
const main: LoopSessionTag = { key: 'main', kind: 'main', node: null, goal: null, sessionId: 'S1' }
const log: LoopSessionLog = {
  cwd: CWD,
  sessions: [
    { session: work, events: [{ type: 'session', sessionId: 'W1' }], next: 1, truncated: false, live: true },
    { session: main, events: [{ type: 'todos', todos: [{ id: '1', label: '결정 대장 쓰기', status: 'running' }] }], next: 1, truncated: false, live: true },
  ],
}

let installed: InstalledWindowApi<Record<string, unknown>>
let handlers: Set<(p: LoopSessionEventPayload) => void>

beforeEach(() => {
  handlers = new Set()
  installed = installWindowApi({
    loopStatus: vi.fn().mockResolvedValue(status),
    onLoopState: vi.fn(() => () => {}),
    loopMainRead: vi.fn().mockResolvedValue(mv),
    onLoopMainState: vi.fn(() => () => {}),
    loopSessionLog: vi.fn().mockResolvedValue(log),
    loopMainArchives: vi.fn().mockResolvedValue({ cwd: CWD, archives: [] }),
    onLoopSessionEvent: vi.fn((cb: (p: LoopSessionEventPayload) => void) => { handlers.add(cb); return () => handlers.delete(cb) }),
  })
  const git = installed.api.git as unknown as Record<string, ReturnType<typeof vi.fn>>
  git.status.mockResolvedValue({ root: CWD, branch: 'goal/M02-G2', ahead: 0, behind: 0, changes: [], branches: [], remotes: [], tags: [] })
})
afterEach(() => { cleanup(); installed.uninstall() })

const flush = async (): Promise<void> => { await act(async () => { await new Promise((r) => setTimeout(r, 0)) }) }
const emit = async (session: LoopSessionTag, seq: number, event: AgentEvent): Promise<void> => {
  await act(async () => { for (const h of [...handlers]) h({ cwd: CWD, session, event, seq }) })
}
const snapshotOf = (): { main: number; board: number; thread: number; panel: number } => ({ ...counts })

describe('세션 push의 다시 그리기 범위 (M10 G4 검수 1)', () => {
  // 메인 대화가 메인 세션의 사건을 그리므로 메인의 글 조각은 메인 대화만 다시 그린다
  it('노드 세션 글 조각은 메인 대화·현황판·파일 칸을 다시 그리지 않고, 메인의 글 조각은 메인 대화만 다시 그리고 할 일·서브에이전트를 다시 접지 않는다', async () => {
    const { WorkView, useWorkStore } = await import('@renderer/13_Loop')
    useWorkStore.setState({ hydrated: true, cwd: CWD, projects: [CWD], center: 'main', extraTabs: [], right: 'files', archives: [] })
    render(<WorkView />)
    await flush()
    const before = snapshotOf()
    expect(before.main).toBeGreaterThan(0)
    await emit(work, 1, { type: 'text', delta: '테스트를', messageId: 'm1' })
    await emit(work, 2, { type: 'text', delta: ' 쓸게', messageId: 'm1' })
    expect(snapshotOf()).toEqual(before)
    await emit(main, 1, { type: 'text', delta: '정리할게', messageId: 'b1' })
    await emit(main, 2, { type: 'text', delta: '요', messageId: 'b1' })
    expect(snapshotOf()).toEqual({ ...before, main: before.main + 2 })
    await emit(main, 3, { type: 'todos', todos: [{ id: '2', label: '스펙 초안', status: 'running' }] })
    expect(counts.panel).toBe(before.panel + 1)
    expect([counts.main, counts.board]).toEqual([before.main + 3, before.board])
    expect(within(screen.getByRole('region', { name: '파일·변경' })).getByText('스펙 초안')).toBeTruthy()
  })

  it('열어 둔 노드 세션 탭은 다른 세션의 push로 다시 그리지 않는다', async () => {
    const { WorkView, useWorkStore } = await import('@renderer/13_Loop')
    useWorkStore.setState({ hydrated: true, cwd: CWD, projects: [CWD], center: 'session:w.1', extraTabs: ['session:w.1'], right: 'board', archives: [] })
    render(<WorkView />)
    await flush()
    const thread = counts.thread
    expect(thread).toBeGreaterThan(0)
    await emit(main, 1, { type: 'text', delta: '메인 글', messageId: 'b1' })
    expect(counts.thread).toBe(thread)
    await emit(work, 1, { type: 'tool_call', id: 't1', name: 'Read', input: { file_path: 'a.ts' } })
    expect(counts.thread).toBe(thread + 1)
  })
})
