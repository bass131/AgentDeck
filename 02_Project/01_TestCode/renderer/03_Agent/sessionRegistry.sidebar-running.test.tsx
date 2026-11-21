// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useAppStore } from '@renderer/00_App/appStore'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'
import type { ConversationRecord } from '@shared/ipcContract'
import type { ConversationRunState } from '@renderer/00_App/state/types'
import { sessionRegistry } from '@renderer/03_Agent/state/sessionRegistry'
import { panelKey } from '@renderer/03_Agent/state/sessionKeys'
import {
  __resetBackgroundRunsForTests,
  __seedBackgroundRunsForTests,
  deleteBackgroundRun,
} from '@renderer/03_Agent/state/backgroundRuns'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

// Sidebar 실행 표시는 활성 대화만이 아니라 세션 레지스트리 기준이다.
// 대화 행: 활성 대화는 전경 저장 칸(store isRunning), 배경 대화는 레지스트리 runningKeys.

Object.defineProperty(window, 'api', {
  value: adaptFlatApi({
    getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
    onAgentEvent: vi.fn(() => () => {}),
    agentAbort: vi.fn().mockResolvedValue({ ok: true }),
    onLoopState: vi.fn(() => () => {}),
  }),
  writable: true,
  configurable: true,
})

const rec = (id: string): ConversationRecord => ({
  id,
  title: id,
  messages: [],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

function bgRun(isRunning: boolean, runId: string): ConversationRunState {
  return {
    ...makeInitialState(),
    currentRunId: runId,
    isRunning,
    runGeneration: null,
    workspaceRoot: null,
    attachedImages: [],
    restoredSession: false,
    replMode: false,
    pickerMode: 'auto',
    selectedModel: 'default',
  }
}

async function renderSidebar(): Promise<HTMLElement> {
  const { Sidebar } = await import('@renderer/12_Window/Sidebar')
  let container!: HTMLElement
  await act(async () => {
    container = render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />).container
  })
  return container
}

const rowRunning = (container: HTMLElement, index: number): boolean =>
  container.querySelectorAll('.sb-item')[index]?.querySelector('.dot.run') !== null

beforeEach(() => {
  __resetBackgroundRunsForTests()
  sessionRegistry.__resetKindForTests('panel')
  useAppStore.setState({
    workspaceMode: 'single',
    conversations: [rec('active'), rec('bg-run'), rec('bg-done'), rec('cold')],
    conversationId: 'active',
    isRunning: false,
    listConversations: vi.fn().mockResolvedValue(undefined),
  } as Parameters<typeof useAppStore.setState>[0])
})

afterEach(() => {
  cleanup()
  __resetBackgroundRunsForTests()
  sessionRegistry.__resetKindForTests('panel')
})

describe('B1 — 대화 행은 레지스트리 기준으로 실행 중을 보인다', () => {
  it('실행 중인 배경 대화 행이 running이고, 끝난 배경 대화와 열지 않은 대화는 idle이다', async () => {
    __seedBackgroundRunsForTests({ 'bg-run': bgRun(true, 'r-bg'), 'bg-done': bgRun(false, 'r-done') })
    const container = await renderSidebar()
    expect(rowRunning(container, 0)).toBe(false)
    expect(rowRunning(container, 1)).toBe(true)
    expect(rowRunning(container, 2)).toBe(false)
    expect(rowRunning(container, 3)).toBe(false)
  })

  it('활성 대화는 지금처럼 전경 isRunning을 따른다', async () => {
    useAppStore.setState({ isRunning: true })
    const container = await renderSidebar()
    expect(rowRunning(container, 0)).toBe(true)
  })

  it('배경 대화가 레지스트리에서 빠지면 표시가 따라 바뀐다', async () => {
    __seedBackgroundRunsForTests({ 'bg-run': bgRun(true, 'r-bg') })
    const container = await renderSidebar()
    expect(rowRunning(container, 1)).toBe(true)
    act(() => { deleteBackgroundRun('bg-run') })
    expect(rowRunning(container, 1)).toBe(false)
  })

  it('활성 대화와 같은 id의 배경 항목이 남아 있어도 활성 행은 전경 isRunning을 따른다(레지스트리 isRunning과 같은 판정)', async () => {
    __seedBackgroundRunsForTests({ active: bgRun(true, 'r-dup') })
    const container = await renderSidebar()
    expect(rowRunning(container, 0)).toBe(false)
  })
})

// 패널 키가 실행 중이어도 대화 행은 바뀌지 않는다.
describe('B1 — 패널 실행은 대화 행에 새지 않는다(채팅 칸), 작업 모드에는 대화 행이 없다', () => {
  it('작업 모드에는 대화 행이 없다', async () => {
    useAppStore.setState({ workspaceMode: 'work' })
    const container = await renderSidebar()
    expect(container.querySelectorAll('.sb-item')).toHaveLength(0)
    useAppStore.setState({ workspaceMode: 'single' })
  })

  it('채팅 칸에서 패널 하나가 실행 중이어도 대화 행은 idle이다', async () => {
    useAppStore.setState({ workspaceMode: 'single' })
    const container = await renderSidebar()
    expect(rowRunning(container, 0)).toBe(false)
    expect(rowRunning(container, 1)).toBe(false)
    act(() => { sessionRegistry.set(panelKey('ms2', 3), { isRunning: true, currentRunId: 'r-p' }) })
    expect(rowRunning(container, 0)).toBe(false)
    expect(rowRunning(container, 1)).toBe(false)
    act(() => { sessionRegistry.set(panelKey('ms2', 3), { isRunning: false, currentRunId: null }) })
    useAppStore.setState({ workspaceMode: 'single' })
  })
})
