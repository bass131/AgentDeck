/**
 * switch-continuity-repro.test.ts — 전환-연속성 P3a correctness 바닥: 단일챗 교차오염(cross-contamination) 계약.
 *
 * ⚠️ 이 파일은 store/subscription 레벨 계약이다. 앱 소스(02.Source/**)는 읽기 전용 — 테스트만 다룬다.
 *
 * ── P1 진단(재현) 이력 ────────────────────────────────────────────────────────
 *   - selectConversation(store/slices/sessions.ts:69~)은 대화 전환 시 isRunning:false로
 *     리셋하지만 currentRunId는 그대로 둔다(누수 벡터).
 *   - subscribeAgentEvents(store/slices/runtime.ts:176~)와 applyAgentEvent(store/reducer.ts:132~)에는
 *     runId 필터가 없다 → 떠난 run(run-a)의 늦은 이벤트가 현재(전환된) 대화(B) 상태에 그대로
 *     적용될 수 있다(교차오염). P1 단계에서 이 파일이 RED로 이를 확정했다.
 *
 * ── P3a 설계 배경(추천안 a — 확정) ────────────────────────────────────────────
 *   필터는 **PURE 리듀서(applyAgentEvent)가 아니라 SUBSCRIPTION/라우팅 레이어**에 둔다.
 *   이유: applyAgentEvent는 runId-agnostic 순수 함수로 유지해야 한다 — reducer.test.ts를 비롯해
 *   base-null(currentRunId:null 초기상태) + runId 포함 payload를 그대로 적용하는 기존 테스트가
 *   ~20개 존재(orchestration-reducer.test.ts / m4-4-*.test.ts / repl-mode.test.ts 등, applyAgentEvent
 *   직접 호출 기반). 이들은 currentRunId를 아예 안 쓰거나 필터링을 기대하지 않는다 — pure 리듀서에
 *   runId 필터를 넣으면 이 회귀 안전망을 깨뜨린다. 따라서 필터는 store 상태(state.currentRunId)를
 *   알고 있는 **구독 콜백**(subscribeAgentEvents)이 담당하고, applyAgentEvent 자체는 손대지 않는다.
 *
 *   P3a 완료조건(이 파일의 3개 it이 GREEN):
 *     1) subscribeAgentEvents가 활성 대화의 currentRunId와 불일치하는 run 이벤트를 드롭한다
 *        (다른 run의 이벤트가 store에 전혀 반영되지 않음 — thread/isRunning 모두 불변).
 *     2) selectConversation(id)이 currentRunId를 "대상 대화의 값"으로 정합한다(디스크에 저장된
 *        conv에 활성 run이 없으면 null — 현재는 이 필드를 아예 안 건드려서 이전 run이 남는다).
 *
 *   pure 리듀서 레벨 필터 테스트는 설계상 요구하지 않는다(구 it#2 제거 — 하단 참조).
 *
 * text AgentEvent shape(shared/agent-events.ts AgentEventText) + envelope(shared/ipc/agent.ts
 * AgentEventPayload):
 *   payload = { runId: string, event: { type:'text', delta:string, messageId?:string, parentToolId?:string } }
 *   → runId는 event 내부가 아니라 envelope(payload.runId)에만 있다. text 이벤트 자체에는
 *     runId 필드가 없다(reducer/text.ts handleText도 event.runId를 참조하지 않는다 — 의도적,
 *     필터가 reducer 책임이 아니기 때문).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord, AgentEventPayload } from '../../../02.Source/shared/ipc-contract'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

// ── 대화 B(전환 대상) — 빈 메시지 + sessionId 보유(정상 전환 케이스), 활성 run 없음 ─────
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
  // vi.fn 래핑: [P3a-4]가 mockResolvedValueOnce로 특정 호출의 runId만 오버라이드할 수 있게
  // 한다(기본값 'run-a'는 유지 — 이 mockApi를 재사용하는 다른 it에는 영향 없음. 어차피
  // 기존 it들은 sendMessage를 호출하지 않고 capturedHandler를 수동으로 흘려보내는 방식이라
  // agentRun 자체는 호출되지 않는다).
  agentRun: vi.fn(async () => ({ runId: 'run-a' })),
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
describe('switch-continuity — P3a correctness 바닥: subscription 레벨 runId 필터 + currentRunId 정합', () => {
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

  // ── 계약 1(load-bearing, P1에서 이관) ────────────────────────────────────────
  it('[P3a-1] run-a 구독 라이브 상태에서 B로 전환 후, run-a의 늦은 text가 B thread로 새면 안 된다', async () => {
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

    // ★ 핵심 단언(결정-무관 correctness): run-a의 텍스트가 현재 활성 대화(B) thread에
    //   나타나면 안 된다. subscribeAgentEvents가 payload.runId(='run-a') !== state.currentRunId
    //   (전환 후 B의 값)일 때 이벤트를 드롭해야 GREEN.
    expect(leakedTexts).not.toContain('A에서 새어나온 텍스트')

    unsubscribe()
  })

  // ── 계약 2(신규) — currentRunId 정합: selectConversation이 이전 run을 들고 넘어오면 안 된다 ──
  it('[P3a-2] selectConversation(\'B\')(B는 실행 중 아님) 후 currentRunId는 이전 대화(A)의 run-a가 아니라 B의 값(null)이어야 한다', async () => {
    // 사전조건: A가 run-a 실행 중
    expect(useAppStore.getState().currentRunId).toBe('run-a')

    await useAppStore.getState().selectConversation('B')

    const afterSwitch = useAppStore.getState()
    expect(afterSwitch.conversationId).toBe('B')
    // ★ 핵심 단언: CONV_B는 활성 run이 없는 대화 — currentRunId는 대상값(null)으로 정합돼야 한다.
    //   현재 selectConversation은 currentRunId 필드를 아예 건드리지 않아 'run-a'가 그대로 남는다(RED).
    expect(afterSwitch.currentRunId).toBe(null)
  })

  // ── 계약 3(신규) — 유령 표시 없음: 드롭된 이벤트가 isRunning을 켜면 안 된다 ────────────
  it('[P3a-3] 전환 후 늦은 run-a 이벤트가 도착해도 B에 유령 "생각 중"(isRunning=true)이 켜지면 안 된다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')
    // 전환 직후 사전조건: B는 실행 중이 아님(selectConversation의 기존 isRunning:false 리셋).
    expect(useAppStore.getState().isRunning).toBe(false)

    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: 'A에서 새어나온 텍스트(유령 표시 진단)', messageId: 'leak-msg-a3' },
    })

    // ★ 핵심 단언: 드롭돼야 할 이벤트가 isRunning을 true로 되돌리면 B에 실재하지 않는 "생각 중"
    //   표시가 뜬다(유령 표시). handleText는 무조건 isRunning:true를 세팅하므로, 이벤트가
    //   subscription 필터를 통과하지 못하게 막아야만 이 단언이 GREEN.
    expect(useAppStore.getState().isRunning).toBe(false)

    unsubscribe()
  })

  // ── 계약 4(신규) — 순서 불변식: currentRunId는 이벤트가 흐르기 전에 세팅돼야 한다 ──
  it('[P3a-4] sendMessage 후 currentRunId가 즉시 세팅되고, 그 뒤 도착하는 활성 run 이벤트는 드롭되지 않는다(순서 불변식)', async () => {
    // P3a 가드(runtime.ts:189 `if (payload.runId !== get().currentRunId) return`)의
    // load-bearing 전제: sendMessage가 agentRun resolve 直後 `set({currentRunId: res.runId})`를
    // 이벤트가 흐르기 전에 실행한다(runtime.ts:149). 이 순서가 깨지면(세팅이 지연/누락되면)
    // 방금 시작한 활성 run의 초기 이벤트가 "다른 run"으로 오인돼 교차오염 방지 가드에
    // 걸려 조용히 드롭된다 — 스트리밍이 화면에 아예 안 뜨는 회귀. 이 계약이 그 순서를 못박는다.
    //
    // A(run-a 진행 중) 시나리오와 무관한 새 대화/새 run으로 초기화.
    useAppStore.setState({
      conversationId: 'ORDER-INVARIANT',
      currentRunId: null,
      isRunning: false,
      thread: [],
      messages: [],
      openGroupId: null,
      openMsgId: null,
      seq: 1,
      errorMessage: undefined,
      sessionId: undefined,
    } as Parameters<typeof useAppStore.setState>[0])

    // 실제 프로덕션 구독 경로 등록(sendMessage보다 먼저 — Conversation.tsx 마운트 시점과 동일).
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    mockApi.agentRun.mockResolvedValueOnce({ runId: 'rX' })

    await useAppStore.getState().sendMessage('순서 불변식 확인용 메시지')

    // ★ 단언 1: sendMessage가 resolve된 시점에는 이미 currentRunId가 새 run('rX')으로
    //   세팅돼 있어야 한다.
    expect(useAppStore.getState().currentRunId).toBe('rX')

    // ★ 단언 2: 그 뒤 도착하는 rX(활성 run)의 이벤트는 P3a 가드를 통과해 thread에
    //   반영돼야 한다 — 활성 run의 이벤트가 드롭되면 안 된다.
    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'rX',
      event: { type: 'text', delta: '드롭되면 안 되는 텍스트', messageId: 'order-invariant-msg' },
    })

    const texts = threadTexts(useAppStore.getState().thread)
    expect(texts).toContain('드롭되면 안 되는 텍스트')

    unsubscribe()
  })

  // ── 구 it#2 제거 근거(정비, 재정렬) ──────────────────────────────────────────
  // 구 P1 버전에는 applyAgentEvent(순수 리듀서)를 직접 호출해 runId 필터 부재를 재확인하는
  // it이 있었다. 이는 "pure 리듀서가 필터해야 한다"는 전제였는데, 위 설계 배경대로 P3a는
  // 필터를 subscription 레이어에 두기로 확정했다 — pure 리듀서는 runId-agnostic으로 남는다
  // (reducer.test.ts 등 base-null + runId payload 테스트 ~20개가 이 전제에 의존). 따라서 그
  // it은 설계와 모순되는 계약(리듀서가 필터해야 한다)을 강제하므로 제거한다. 리듀서 레벨의
  // "runId를 안 본다"는 성질 자체는 회귀 신호가 아니라 의도된 설계이며, reducer.test.ts 쪽의
  // 기존 테스트들이 이를 계속 보증한다.
})
