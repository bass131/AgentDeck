// @vitest-environment jsdom
/**
 * subagent-singlechat-wiring.test.tsx — 단일챗 서브에이전트 라이브 배선 진단·회귀 잠금
 * (영호 재육안 NG 2026-07-04: "멀티패널은 되는데 단일챗은 안 된다").
 *
 * 기존 커버리지의 사각지대: subagent-inline-thread.test.ts/fb2-p07-subagent-model-order-
 * replay.test.ts는 applyAgentEvent(순수 리듀서)를 *직접* 호출만 한다 — 실제 라이브 경로인
 * "window.api.onAgentEvent 콜백 → subscribeAgentEvents(runtime.ts) → useAppStore →
 * Conversation.tsx 렌더"는 전혀 왕복하지 않았다. 이 파일은 그 실제 왕복 전체를 재생한다.
 *
 * 이벤트 순서(coordinator 지시 — ng1-ng2b 프로브 실측 그대로): subagent 생성(running, model
 * 없음) → tool_result(ack, 완료) → 늦게 도착하는 subagent model-only update.
 *
 * SW1: 위 3이벤트를 실제 subscribeAgentEvents 경로로 흘리면 state.subagents/thread가
 *      채워진다(경로1 — 활성 대화 매칭, 리듀서 자체는 이미 검증됨 — 여기선 "왕복"만 검증).
 * SW2: Conversation을 렌더하면 .sa-inline 카드가 뜬다(렌더 배선).
 * SW3: 카드 클릭 → SubAgentFullscreen(.fs-overlay/.saf-convo) 상세가 열린다.
 * SW4: 모델 배지(.sa-model-badge)가 라이브 model 값을 표시한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

let capturedCallback: ((payload: AgentEventPayload) => void) | null = null

function installWindowApi(): void {
  capturedCallback = null
  // jsdom 환경(SW2~4)에서는 실제 window(addEventListener 등 DOM API 보유)가 이미 존재 —
  // p13-file-tree-refresh.test.ts(node 환경, window 자체가 없어 전체 stub) 패턴을 그대로
  // 가져오면 실 window를 통째로 갈아치워 SelectionToolbar 등의 addEventListener가 깨진다
  // (실제로 최초 시도에서 재현됨 — "window.addEventListener is not a function").
  // m4-4-permission-conversation.test.tsx처럼 window.api *속성만* 주입한다.
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

  // 1) subagent 생성(running, model 없음) — Task/Agent tool_use 정규화 결과.
  cb({
    runId: 'r1',
    event: {
      type: 'subagent',
      subagent: { id: SUB_ID, name: 'general-purpose', role: '1+1을 계산해', status: 'running', tools: [] },
    },
  })

  // 2) tool_result(ack, 완료) — 서브에이전트 자신의 assistant 메시지보다 먼저 도착(라이브 실측).
  cb({
    runId: 'r1',
    event: { type: 'tool_result', id: SUB_ID, ok: true, output: '2' },
  })

  // 3) 늦게 도착하는 subagent model-only update.
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
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    // sendMessage 없이도 활성 run처럼 시뮬레이트(경로1 매칭 조건 = payload.runId===currentRunId).
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
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      currentRunId: 'r1',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    fireLiveSequence()

    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const card = container.querySelector('.sa-inline')
    expect(card).toBeTruthy()
    expect(card?.textContent).toContain('general-purpose')

    unsubscribe()
  })

  it('SW3: 카드 클릭 → SubAgentFullscreen 상세(.fs-overlay/.saf-convo)가 열린다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      currentRunId: 'r1',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    fireLiveSequence()

    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const card = container.querySelector('.sa-inline')!
    await act(async () => fireEvent.click(card))

    // 오버레이는 document.body 포털 렌더 — document 기준 조회.
    expect(document.querySelector('.fs-overlay')).toBeTruthy()
    expect(document.querySelector('.saf-convo')).toBeTruthy()

    unsubscribe()
  })

  it('SW4: 모델 배지(.sa-model-badge)가 라이브 model 값을 표시한다', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      currentRunId: 'r1',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    fireLiveSequence()

    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const badge = container.querySelector('.sa-model-badge')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toContain('Haiku 4.5')

    unsubscribe()
  })
})
