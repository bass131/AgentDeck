/**
 * switch-continuity-repro.test.ts — 전환-연속성 버그 P1 진단(재현): 단일챗 교차오염(cross-contamination).
 *
 * ⚠️ 이건 P1 진단(재현) 테스트다 — 현재 버그를 드러내는 RED가 목적. 수정은 P3(별도 작업).
 *    앱 소스(02.Source/**)는 읽기 전용 — 이 파일은 테스트만 추가한다.
 *
 * 배경(코드맵 [확정]):
 *   - selectConversation(store/slices/sessions.ts:69~)은 대화 전환 시 isRunning:false로
 *     리셋하지만 currentRunId는 그대로 둔다(누수 벡터 후보).
 *   - subscribeAgentEvents(store/slices/runtime.ts:176~)와 applyAgentEvent(store/reducer.ts:132~)에는
 *     runId 필터가 없다 → 떠난 run(run-a)의 늦은 이벤트가 현재(전환된) 대화(B) 상태에 그대로
 *     적용될 수 있다(교차오염).
 *
 * 시나리오:
 *   1) 대화 A 실행 중(currentRunId:'run-a', isRunning:true, thread에 user 메시지 1개) 셋업.
 *   2) subscribeAgentEvents()로 실제 프로덕션 구독 경로(Conversation.tsx 마운트와 동일)를 등록.
 *   3) selectConversation('B')로 대화 B(빈 메시지)로 전환.
 *   4) 전환 후 run-a의 늦은 text 이벤트가 구독 콜백에 도착(runId:'run-a').
 *   5) 핵심 RED 단언: 그 텍스트가 B의 thread에 append되면 안 된다.
 *      현재 코드는 runId 필터가 없어 append됨 → 이 단언이 RED = 교차오염 확정 + 수정 타겟(P3).
 *
 * text AgentEvent shape(shared/agent-events.ts AgentEventText) + envelope(shared/ipc/agent.ts
 * AgentEventPayload):
 *   payload = { runId: string, event: { type:'text', delta:string, messageId?:string, parentToolId?:string } }
 *   → runId는 event 내부가 아니라 envelope(payload.runId)에만 있다. text 이벤트 자체에는
 *     runId 필드가 없다(reducer/text.ts handleText도 event.runId를 참조하지 않음).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord, AgentEventPayload } from '../../../02.Source/shared/ipc-contract'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

// ── 대화 B(전환 대상) — 빈 메시지 + sessionId 보유(정상 전환 케이스) ─────────────
const CONV_B: ConversationRecord = {
  id: 'B',
  title: '대화 B',
  messages: [],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sessionId: 'sess-b',
}

// ── 구독 콜백 캡처(실제 window.api.onAgentEvent가 main → renderer push를 흉내) ──
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

const mockApi = {
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id === 'B') return { conversations: [CONV_B] }
    if (req.id) return { conversations: [] }
    return { conversations: [CONV_B] }
  },
  conversationSave: async () => ({ id: 'cv-x' }),
  conversationRename: async () => ({ ok: true }),
  conversationDelete: async () => ({ ok: true }),
  setUiPref: async (_req: { key: string; value: unknown }) => ({ ok: true }),
  // subscribeAgentEvents() 내부에서 호출 — 콜백을 캡처해 "늦은 이벤트"를 수동으로 흘려보낸다.
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  },
  agentRun: async () => ({ runId: 'run-a' }),
  agentAbort: async () => ({ accepted: true }),
  agentInterrupt: async () => ({ accepted: true }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── 헬퍼: thread의 msg kind 텍스트만 추출 ────────────────────────────────────
function threadTexts(items: ThreadItem[]): string[] {
  return items
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    .map((item) => item.text)
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('switch-continuity-repro — P1 단일챗 교차오염 진단(store 레벨)', () => {
  beforeEach(() => {
    capturedHandler = null
    // 대화 A 실행 상태 셋업: run-a 진행 중, thread에 user 메시지 1개.
    useAppStore.setState({
      conversationId: 'A',
      currentRunId: 'run-a',
      isRunning: true,
      thread: [{ kind: 'msg', id: 'm-a-user', role: 'user', text: 'A의 질문' }],
      messages: [{ id: 'm-a-user', role: 'user', content: 'A의 질문' }],
      openGroupId: null,
      openMsgId: null,
      seq: 1,
      errorMessage: undefined,
      sessionId: 'sess-a',
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('[진단-RED] run-a 구독 라이브 상태에서 B로 전환 후 run-a의 늦은 text가 B thread로 새면 안 된다', async () => {
    // 1) 실제 프로덕션 구독 경로 등록(Conversation.tsx 마운트가 호출하는 것과 동일 액션).
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    // 사전조건 확인
    expect(useAppStore.getState().currentRunId).toBe('run-a')
    expect(useAppStore.getState().conversationId).toBe('A')
    expect(useAppStore.getState().isRunning).toBe(true)

    // 2) 대화 B로 전환 (진행 중인 A를 떠남 — 사용자가 흔히 하는 동작)
    await useAppStore.getState().selectConversation('B')

    const afterSwitch = useAppStore.getState()
    // ── 보조 진단(로그) — hard assert 최소, 거동 기록용 ──────────────────────
    // eslint-disable-next-line no-console
    console.log('[진단] 전환 후 isRunning:', afterSwitch.isRunning)
    // eslint-disable-next-line no-console
    console.log('[진단] 전환 후 currentRunId(누수 벡터?):', afterSwitch.currentRunId)
    // eslint-disable-next-line no-console
    console.log('[진단] 전환 후 conversationId:', afterSwitch.conversationId)

    expect(afterSwitch.conversationId).toBe('B')
    expect(afterSwitch.thread).toHaveLength(0) // B는 빈 대화로 로드되어야 함

    // 3) run-a의 "늦은" text 이벤트 도착 — 전환 이후 도착(네트워크/스트림 지연 시나리오).
    //    구독 콜백은 여전히 라이브(unsubscribe 호출 전) — 실제로 main이 이 payload를 push하면
    //    subscribeAgentEvents 콜백이 그대로 수신한다.
    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: 'A에서 새어나온 텍스트', messageId: 'leak-msg-a' },
    })

    const afterLeak = useAppStore.getState()
    const leakedTexts = threadTexts(afterLeak.thread)
    // eslint-disable-next-line no-console
    console.log('[진단] 늦은 run-a 이벤트 적용 후 B thread 텍스트:', leakedTexts)
    // eslint-disable-next-line no-console
    console.log('[진단] 늦은 이벤트 적용 후 isRunning:', afterLeak.isRunning)

    // ★ 핵심 RED 단언(결정-무관 correctness): run-a의 텍스트가 현재 활성 대화(B) thread에
    //   나타나면 안 된다. 현재 구현은 subscribeAgentEvents/applyAgentEvent 어디에도 runId
    //   필터가 없어 이 단언이 실패(RED)한다 = 교차오염 실재 확정.
    expect(leakedTexts).not.toContain('A에서 새어나온 텍스트')

    unsubscribe()
  })

  it('[진단-보조] applyAgentEvent 레벨에서도 동일 경로: 순수 리듀서에 runId 인자/필터가 없다', async () => {
    // subscribe 콜백을 거치지 않고 reducer 자체가 payload.runId를 무시함을 별도로 확정.
    const { applyAgentEvent } = await import('../../../02.Source/renderer/src/store/reducer')

    await useAppStore.getState().selectConversation('B')
    const bState = useAppStore.getState()
    expect(bState.thread).toHaveLength(0)

    const next = applyAgentEvent(
      bState,
      { runId: 'run-a', event: { type: 'text', delta: '리듀서 레벨 누수', messageId: 'leak-msg-a2' } },
      '12:00'
    )
    const leakedTexts = threadTexts(next.thread)
    // eslint-disable-next-line no-console
    console.log('[진단] applyAgentEvent(runId=run-a) 직접 호출 후 B 파생 상태 텍스트:', leakedTexts)

    // 순수 리듀서 레벨에서도 runId 무관하게 텍스트가 적용됨 — 같은 근본 원인(필터 부재)의 재확인.
    expect(leakedTexts).not.toContain('리듀서 레벨 누수')
  })
})
