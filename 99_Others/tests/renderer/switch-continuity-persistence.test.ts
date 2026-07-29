/**
 * switch-continuity-persistence.test.ts — 전환-연속성 P3c: 백그라운드 라우팅 영속 계약.
 *
 * ⚠️ 이 파일은 store/subscription 레벨 계약이다. 앱 소스(02_Source/**)는 읽기 전용 — 테스트만 다룬다.
 * (신규 파일 — switch-continuity-seamless.test.ts가 이미 400줄대라 P3c는 관심사가 다른
 *  새 파일로 분리: P3b는 "in-memory 보존"을, 이 파일은 "디스크 영속(IPC 발화)"을 검증한다.)
 *
 * ── P3b → P3c 배경 ────────────────────────────────────────────────────────────
 *   P3b(switch-continuity-seamless.test.ts)는 대화를 떠날 때 실행 중이던 진행 상태를
 *   bgRuns[conversationId] 맵에 스냅샷하고, runId가 일치하는 백그라운드 이벤트를 그 스냅샷에
 *   계속 적용해 in-memory 진행을 이어가는 것까지 봉합했다(GREEN). 하지만 runtime.ts의 백그라운드
 *   경로(경로2, subscribeAgentEvents)는 in-memory 갱신만 하고 **디스크 저장(saveConversation)을
 *   전혀 발화하지 않는다** — reviewer가 P3c로 명시 이연한 갭이다(01_Phases/05_switch-continuity/
 *   _diagnosis.md 참조). 결과: 대화 A가 백그라운드에서 완료(done)되거나 새 sessionId를 받아도
 *   그 진행이 디스크에 반영되지 않고, 앱을 닫으면(또는 A로 복귀하지 않으면) 통째로 유실된다.
 *
 *   활성 대화(경로1)의 저장 경로(conversation.ts saveConversation)는 `get().thread`/
 *   `get().conversationId` 등 **활성 flat 상태**를 읽어 payload를 만든다 — 백그라운드 대화는
 *   활성 상태가 아니므로 이 함수를 그대로 재사용할 수 없다(재사용하면 활성 대화 B의 데이터로
 *   A를 저장하는 교차오염이 된다). P3c 봉합 방향은 **bg 스냅샷(ConversationRunState)으로부터
 *   직접 conversationSave IPC 페이로드를 빌드**하는 것 — IPC 채널 자체는 기존 `conversationSave`
 *   그대로 재사용한다(계약 변경 없음, main 쪽 핸들러 수정 불필요).
 *
 *   이 테스트는 그 "거동"만 단언한다 — bgRuns의 내부 키/구조나 P3c 구현이 실제로 어떤 헬퍼를
 *   쓰는지에는 결합하지 않는다(mock conversationSave 호출 인자·활성 상태 불변만 확인). 현재(P3c
 *   미구현) 상태에서는 RED가 정상이다 — 경로2가 saveConversation류 IPC를 아예 호출하지 않기 때문.
 *
 * text/done/session AgentEvent shape(shared/agentEvents.ts) + envelope(shared/ipc/agent.ts
 * AgentEventPayload):
 *   payload = { runId: string, event: { type:'text'|'done'|'session', ... } }
 * conversationSave 계약(shared/ipc/conversation.ts ConversationSaveRequest):
 *   { conversation: { id?, title, messages:{role,content}[], backendId, cwd?, sessionId?, ... } }
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAppStore } from '../../../02_Source/renderer/src/store/appStore'
import type {
  ConversationRecord,
  AgentEventPayload,
  ConversationSaveRequest,
  ConversationSaveResponse,
} from '../../../02_Source/shared/ipcContract'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'
import { installWindowApi } from './helpers/windowApiMock'

// ── 대화 A(전환 원점, 백그라운드로 남을 실행 중 대화) — 디스크 base는 user 메시지만 보유 ──
const CONV_A_BASE: ConversationRecord = {
  id: 'A',
  title: '대화 A',
  messages: [{ role: 'user', content: 'A의 질문' }],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sessionId: 'sess-a',
  cwd: 'C:\\projA',
}

// ── 대화 B(전환 대상) — 빈 메시지, 활성 run 없음 ────────────────────────────────
const CONV_B_BASE: ConversationRecord = {
  id: 'B',
  title: '대화 B',
  messages: [],
  backendId: 'claude-code',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  sessionId: 'sess-b',
  cwd: 'C:\\projB',
}

// ── 구독 콜백 캡처(실제 window.api.onAgentEvent가 main → renderer push를 흉내) ──
let capturedHandler: ((payload: AgentEventPayload) => void) | null = null

// ── conversationSave 호출 인자 캡처용 mock — P3c 핵심 단언 대상.
//    id 있으면 그대로 echo(신규 생성 없음 — 이 테스트는 A/B 모두 기존 대화라 upsert만 다룸).
const conversationSaveMock = vi.fn(
  async (req: ConversationSaveRequest): Promise<ConversationSaveResponse> => ({
    id: req.conversation.id ?? 'cv-generated',
  })
)

// RS1 P02: preload 전 표면은 helpers/windowApiMock.ts 기본 스텁이 깔고, 이 파일이 의미를
// 부여한 IPC만 override 한다(conversationRename/Delete·setUiPref·agentAbort·agentInterrupt 는
// 기본 스텁과 값이 같아 생략).
installWindowApi({
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    if (req.id === 'A') return { conversations: [CONV_A_BASE] }
    if (req.id === 'B') return { conversations: [CONV_B_BASE] }
    if (req.id) return { conversations: [] }
    return { conversations: [CONV_A_BASE, CONV_B_BASE] }
  },
  conversationSave: conversationSaveMock,
  // 아래 테스트들이 capturedHandler 자체를 단언하므로 로컬 캡처를 유지한다(단언 불변 규율).
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  },
  agentRun: async () => ({ runId: 'run-a' }),
  // selectConversation의 cwd 복원(ADR-020)이 호출 — folderPath를 그대로 rootPath로 echo.
  workspaceOpen: async (req: { folderPath?: string }) => ({
    rootPath: req.folderPath ?? null,
    tree: null,
  }),
})

// ── 헬퍼: thread의 msg kind 텍스트만 추출 ────────────────────────────────────
function threadTexts(items: ThreadItem[]): string[] {
  return items
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    .map((item) => item.text)
}

// ── 공통 셋업: 대화 A가 run-a로 실행 중, 이미 부분 스트리밍된 assistant 텍스트 보유 ──
// (switch-continuity-seamless.test.ts의 setupRunningA와 동일 — 파일 분리로 자체 복제, 관례 유지.)
function setupRunningA(): void {
  useAppStore.setState({
    conversationId: 'A',
    currentRunId: 'run-a',
    isRunning: true,
    thread: [
      { kind: 'msg', id: 'm-a-user', role: 'user', text: 'A의 질문' },
      { kind: 'msg', id: 'm-a-assistant', role: 'assistant', text: '1부터 셉니다: 1, 2, 3' },
    ],
    openGroupId: null,
    openMsgId: 'm-a-assistant',
    seq: 2,
    errorMessage: undefined,
    sessionId: 'sess-a',
  } as Parameters<typeof useAppStore.setState>[0])
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('switch-continuity — P3c 백그라운드 라우팅 영속: bg done/session이 conversationSave를 발화한다', () => {
  beforeEach(() => {
    capturedHandler = null
    conversationSaveMock.mockClear()
    // bgRuns는 테스트 간 누수 방지 차원의 방어적 리셋(P3c 핵심 관심사가 아니라 위생 목적).
    useAppStore.setState({ bgRuns: {} } as Parameters<typeof useAppStore.setState>[0])
    setupRunningA()
  })

  // ── T-bgdone-save ────────────────────────────────────────────────────────────
  it('[P3c-Tdone] 🔴 bg run-a의 done 이벤트가 도착하면 conversationSave가 A의 데이터(누적 텍스트 포함)로 호출된다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    // A 실행 중 → B로 전환(A는 bgRuns로 백그라운드 이동, P3b 경로 — GREEN 전제).
    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')
    const bThreadBefore = useAppStore.getState().thread

    // 백그라운드 run-a에 텍스트 델타 두 개 누적.
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 5', messageId: 'm-a-assistant' },
    })

    // run-a done 도착 — 현재(P3c 미구현)는 runtime.ts 경로2가 in-memory(bgRuns)만 갱신하고
    // conversationSave류 IPC를 전혀 호출하지 않는다.
    capturedHandler!({ runId: 'run-a', event: { type: 'done' } })

    // ★ 핵심 단언: conversationSave가 A(id='A')의 데이터로 호출돼야 한다 — 누적된 백그라운드
    //   텍스트(', 4' / ', 5')가 messages에 포함돼야 한다(디스크에 진행이 반영됨을 뜻함).
    //   현재는 호출 자체가 없어 find()가 undefined → RED.
    const saveCall = conversationSaveMock.mock.calls.find(([req]) => req.conversation.id === 'A')
    expect(saveCall).toBeDefined()
    const savedMessages = saveCall![0].conversation.messages
    const assistantMsg = savedMessages.find((m) => m.role === 'assistant')
    expect(assistantMsg?.content).toContain(', 4')
    expect(assistantMsg?.content).toContain(', 5')

    // ★ B(활성) 상태는 불변 — bg done의 저장 처리가 B thread를 오염시키면 안 된다.
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('B')
    expect(after.thread).toEqual(bThreadBefore)
    // B는 이 테스트에서 저장될 이유가 없다 — 만약 B로 저장이 새면 그 자체가 교차오염 회귀.
    expect(conversationSaveMock.mock.calls.some(([req]) => req.conversation.id === 'B')).toBe(false)

    unsubscribe()
  })

  // ── T-bgsession-save ─────────────────────────────────────────────────────────
  it('[P3c-Tsession] 🔴 bg run-a의 session 이벤트가 도착하면 conversationSave가 A 레코드에 새 sessionId로 호출된다(B의 sessionId 불변)', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')
    // 사전조건: B는 디스크의 sess-b를 그대로 가짐(전환 시 conv.sessionId 복원).
    expect(useAppStore.getState().sessionId).toBe('sess-b')

    // 백그라운드 run-a가 새 sessionId를 받음(LR1 갈래A: session 이벤트 즉시 저장 — 활성 경로에서만
    // 적용되던 것과 동일한 성질을 bg 경로에도 요구).
    capturedHandler!({ runId: 'run-a', event: { type: 'session', sessionId: 'sess-a-new' } })

    // ★ 핵심 단언: conversationSave가 A(id='A') 레코드에 sessionId='sess-a-new'로 호출돼야 한다.
    //   현재는 bg session 이벤트가 in-memory(bgRuns['A'].sessionId)만 갱신하고 저장 IPC를
    //   호출하지 않는다 — find()가 undefined → RED.
    const saveCall = conversationSaveMock.mock.calls.find(([req]) => req.conversation.id === 'A')
    expect(saveCall).toBeDefined()
    expect(saveCall![0].conversation.sessionId).toBe('sess-a-new')

    // ★ 활성 B의 sessionId는 불변 — bg session이 활성 대화로 새면 안 된다(P3a 교차오염 가드 재확인).
    expect(useAppStore.getState().sessionId).toBe('sess-b')

    unsubscribe()
  })

  // ── T-bgdone-persist-source (reviewer 이연분 — RS1 P04에서 재정의) ───────────
  //
  // 옛 핀: "bg done 후 A로 복귀하면 **messages 투영**도 thread와 동기돼 있다".
  // RS1 P04에서 store의 messages 투영 자체가 제거돼(읽기 소비처 0 실측) 그 형태의 단언은
  // 검증 대상이 소멸했다. 다만 핀이 지키려던 **의도** — "전환 연속성 경로에서 대화 데이터가
  // 유실되지 않는다(백그라운드 누적분이 저장/이력 파생까지 도달한다)" — 는 그대로 유효하므로,
  // 같은 의도를 thread 기반으로 재정의한다:
  //   ① 복귀 후 assistant 항목(thread)이 백그라운드 누적 텍스트를 담고 있는가 —
  //      옛 `messages.find(role==='assistant').content` 단언의 1:1 대응(투영 → 단일 소스).
  //   ② 그 thread가 실제 저장 payload(conversationSave.conversation.messages)로 나가는가 —
  //      옛 단언이 "저장/이력 파생에 쓰이는 필드"라 부르던 그 지점을, 투영 대신 파생 결과에서
  //      직접 확인한다(투영이 사라진 지금 무손실을 판정할 수 있는 유일한 종단점).
  it('[P3c-Tsync] bg done 후 A로 복귀하면 대화 데이터(thread)와 그 저장 파생분이 백그라운드 누적분을 포함한다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')

    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({ runId: 'run-a', event: { type: 'done' } })

    // A로 복귀 — bgRuns 소비 경로(디스크 우회, P3b seamless).
    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    // thread 자체는 P3b가 이미 보장하는 사전조건(applyAgentEvent가 항상 thread를 갱신) — 참고 확인.
    expect(threadTexts(after.thread).join('')).toContain(', 4')

    // ★ 핵심 단언 ① — 복귀한 대화의 assistant 항목이 백그라운드 누적분을 담고 있다
    //   (옛 `after.messages.find(role==='assistant').content` 단언의 단일-소스 대응).
    const assistantItem = after.thread.find(
      (item): item is Extract<ThreadItem, { kind: 'msg' }> =>
        item.kind === 'msg' && item.role === 'assistant'
    )
    expect(assistantItem?.text).toContain(', 4')

    // ★ 핵심 단언 ② — 그 데이터가 디스크 저장 payload까지 무손실로 도달한다.
    //   (저장 payload의 conversation.messages는 **영속 계약** 필드로 살아 있다 — 제거된 것은
    //    store의 in-memory 투영뿐이다. 여기서 A(id='A')로 나가는지까지 확인해 교차오염도 배제.)
    conversationSaveMock.mockClear()
    await useAppStore.getState().saveConversation()
    const saveCall = conversationSaveMock.mock.calls.find(([req]) => req.conversation.id === 'A')
    expect(saveCall).toBeDefined()
    const persistedAssistant = saveCall![0].conversation.messages.find((m) => m.role === 'assistant')
    expect(persistedAssistant?.content).toContain(', 4')

    unsubscribe()
  })
})
