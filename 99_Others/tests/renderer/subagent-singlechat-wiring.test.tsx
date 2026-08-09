// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import type { AgentEventPayload } from '../../../02_Source/shared/ipcContract'

let capturedCallback: ((payload: AgentEventPayload) => void) | null = null

function installWindowApi(): void {
  capturedCallback = null
  Object.defineProperty(window, 'api', {
    value: {
      conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
      conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
      agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
      agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
      agentInterrupt: vi.fn().mockResolvedValue({ accepted: true }),
      onAgentEvent: vi.fn((cb: (payload: AgentEventPayload) => void) => {
        capturedCallback = cb
        return () => {}
      }),
      listFiles: vi.fn().mockResolvedValue({ files: [] }),
      workspaceTree: vi.fn().mockResolvedValue({ tree: null }),
    },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  vi.resetModules()
  installWindowApi()
})
afterEach(() => cleanup())

const SUB_ID = 'toolu_agent1'

function fireLiveSequence(): void {
  if (!capturedCallback) throw new Error('onAgentEvent 콜백이 캡처되지 않음')
  const cb = capturedCallback

  cb({
    runId: 'r1',
    event: {
      type: 'subagent',
      subagent: { id: SUB_ID, name: 'general-purpose', role: '1+1을 계산해', status: 'running', tools: [] },
    },
  })

  cb({
    runId: 'r1',
    event: { type: 'tool_result', id: SUB_ID, ok: true, output: '2' },
  })

  cb({
    runId: 'r1',
    event: {
      type: 'subagent',
      subagent: {
        id: SUB_ID,
        name: 'general-purpose',
        role: '1+1을 계산해',
        status: 'done',
        tools: [],
        model: 'claude-haiku-4-5-20251001',
      },
    },
  })
}

describe('단일챗 서브에이전트 라이브 배선(subscribeAgentEvents → store → Conversation)', () => {
  it('SW1: 실제 IPC 콜백 경로로 흘리면 state.subagents/thread가 채워진다', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({
      currentRunId: 'r1',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    fireLiveSequence()

    const state = useAppStore.getState()
    const sub = state.subagents.find((sa) => sa.id === SUB_ID)
    expect(sub).toBeDefined()
    expect(sub?.status).toBe('done')
    expect(sub?.model).toBe('claude-haiku-4-5-20251001')
    expect(state.thread.some((it) => it.kind === 'subagent' && it.id === SUB_ID)).toBe(true)

    unsubscribe()
  })

  it('SW2: Conversation 렌더 시 .sa-inline 카드가 뜬다', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({
      currentRunId: 'r1',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    fireLiveSequence()

    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const card = container.querySelector('.sa-inline')
    expect(card).toBeTruthy()
    expect(card?.textContent).toContain('general-purpose')

    unsubscribe()
  })

  it('SW3: 카드 클릭 → SubAgentFullscreen 상세(.fs-overlay/.saf-convo)가 열린다', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({
      currentRunId: 'r1',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    fireLiveSequence()

    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const card = container.querySelector('.sa-inline')!
    await act(async () => fireEvent.click(card))

    expect(document.querySelector('.fs-overlay')).toBeTruthy()
    expect(document.querySelector('.saf-convo')).toBeTruthy()

    unsubscribe()
  })

  it('SW4: 모델 배지(.sa-model-badge)가 라이브 model 값을 표시한다', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({
      currentRunId: 'r1',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    fireLiveSequence()

    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const badge = container.querySelector('.sa-model-badge')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toContain('Haiku 4.5')

    unsubscribe()
  })
})
