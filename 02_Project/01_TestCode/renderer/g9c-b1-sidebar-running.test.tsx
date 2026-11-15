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
import { __resetPanelSessionManagerForTests } from '@renderer/03_Agent/state/panelSession'

// G9c B1 — Sidebar 실행 표시는 활성 대화만이 아니라 세션 레지스트리 기준이다(차이 목록 「S 의미」).
// 대화 행: 레지스트리 isRunning(convKey(id)) — 활성 대화는 전경 저장 칸, 배경 대화는 레지스트리 항목.
// 멀티 세션 행: 그 세션의 패널 키(multi:<id>:slot:*) 가운데 하나라도 실행 중이면 running.

Object.defineProperty(window, 'api', {
  value: {
    getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
    onAgentEvent: vi.fn(() => () => {}),
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  },
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
  __resetPanelSessionManagerForTests()
  useAppStore.setState({
    workspaceMode: 'single',
    conversations: [rec('active'), rec('bg-run'), rec('bg-done'), rec('cold')],
    conversationId: 'active',
    isRunning: false,
    multiSessions: [{ id: 'ms1', title: '작업1', count: 4 }, { id: 'ms2', title: '작업2', count: 4 }],
    activeMultiSessionId: 'ms1',
    listConversations: vi.fn().mockResolvedValue(undefined),
    loadMultiSessions: vi.fn().mockResolvedValue(undefined),
  } as Parameters<typeof useAppStore.setState>[0])
})

afterEach(() => {
  cleanup()
  __resetBackgroundRunsForTests()
  __resetPanelSessionManagerForTests()
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

describe('B1 — 멀티 세션 행은 그 세션의 패널 하나라도 실행 중이면 running이다', () => {
  it('ms2의 패널 하나가 실행 중이면 ms2 행만 running이고, 끝나면 idle로 돌아간다', async () => {
    useAppStore.setState({ workspaceMode: 'multi' })
    const container = await renderSidebar()
    expect(rowRunning(container, 0)).toBe(false)
    expect(rowRunning(container, 1)).toBe(false)
    act(() => { sessionRegistry.set(panelKey('ms2', 3), { isRunning: true, currentRunId: 'r-p' }) })
    expect(rowRunning(container, 0)).toBe(false)
    expect(rowRunning(container, 1)).toBe(true)
    act(() => { sessionRegistry.set(panelKey('ms2', 3), { isRunning: false, currentRunId: null }) })
    expect(rowRunning(container, 1)).toBe(false)
  })
})
