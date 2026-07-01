/**
 * switch-continuity-seamless.test.ts — 전환-연속성 P3b: 백그라운드 실행 seamless 이음 계약.
 *
 * ⚠️ 이 파일은 store/subscription 레벨 계약이다. 앱 소스(02.Source/**)는 읽기 전용 — 테스트만 다룬다.
 *
 * ── P3a → P3b 배경 ────────────────────────────────────────────────────────────
 *   P3a(switch-continuity-repro.test.ts)는 활성 대화의 currentRunId와 불일치하는 run 이벤트를
 *   subscribeAgentEvents에서 **드롭**해 교차오염(cross-contamination)·유령 "생각 중" 표시를
 *   차단했다(완료·GREEN). 하지만 그 드롭은 "떠난 실행 중 대화(A)의 진행 자체를 버린다"는
 *   부작용이 있다 — A로 되돌아오면 selectConversation이 디스크(conversationLoad)에서
 *   A를 다시 읽는데, 스트리밍 중이던 텍스트는 아직 저장되지 않았으므로 disk base로 리셋되고
 *   화면이 "끊겨 보인다"(01.Phases/switch-continuity/_diagnosis.md P1 스샷 증상).
 *
 *   P3b는 이 표시 끊김을 없앤다: 대화를 떠날 때 그 대화가 실행 중이면 진행 상태를
 *   **어딘가에 보존**해 두었다가(설계=추천안 a: `bgRuns[conversationId]` 맵 — store가 대화별
 *   백그라운드 실행 스냅샷을 들고 있다가, runId가 일치하는 이벤트를 그 스냅샷에 계속 적용),
 *   해당 대화로 되돌아왔을 때 disk base가 아니라 **보존된 진행 상태**를 보여준다(seamless).
 *
 *   이 테스트는 그 최종 "거동"만 단언한다 — bgRuns의 내부 키/구조에는 결합하지 않는다
 *   (설계가 다른 자료구조로 바뀌어도 이 계약 자체는 유지돼야 한다). 현재(P3b 미구현) 상태에서는
 *   RED가 정상이다 — P3a가 이벤트를 드롭하는 순간 "보존" 자체가 없기 때문.
 *
 * text AgentEvent shape(shared/agent-events.ts AgentEventText) + envelope(shared/ipc/agent.ts
 * AgentEventPayload):
 *   payload = { runId: string, event: { type:'text', delta:string, messageId?:string, parentToolId?:string } }
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import type { ConversationRecord, AgentEventPayload } from '../../../02.Source/shared/ipc-contract'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { AttachedImage } from '../../../02.Source/renderer/src/store/slices/types'

// ── 대화 A(전환 원점, 백그라운드로 남을 실행 중 대화) — 디스크 base는 user 메시지만
//    보유(스트리밍 중이던 assistant 텍스트는 아직 저장 전이라는 전제, 배경 참조) ──────────
// cwd: P3b 봉합 RED 추가분([P3b-Tcwd])에서 B의 디스크 로드 경로(ADR-020 restoreWorkspaceFromCwd)
// 사전조건 셋업에 사용. A 자신의 disk-load 경로는 기존 테스트들에서 실사용되지 않는다
// (A→B→A 전환은 항상 A가 bgRuns 스냅샷을 갖고 있어 disk 재로드를 우회하므로) — 참고/향후 재사용 대비.
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
// cwd: [P3b-Tcwd]가 B 전환 시 disk-load 경로로 workspaceRoot가 실제로 바뀌는 것(정상 회귀 아님을
// 재확인하는 사전조건)까지 검증하기 위해 필요.
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

const mockApi = {
  conversationLoad: async (req: { id?: string; limit?: number }) => {
    // A/B는 id로 구분 반환 — 둘 다 "디스크 base"(스트리밍 미저장 반영: A도 user 메시지만).
    if (req.id === 'A') return { conversations: [CONV_A_BASE] }
    if (req.id === 'B') return { conversations: [CONV_B_BASE] }
    if (req.id) return { conversations: [] }
    return { conversations: [CONV_A_BASE, CONV_B_BASE] }
  },
  conversationSave: async () => ({ id: 'cv-x' }),
  conversationRename: async () => ({ ok: true }),
  conversationDelete: async () => ({ ok: true }),
  setUiPref: async (_req: { key: string; value: unknown }) => ({ ok: true }),
  // subscribeAgentEvents() 내부에서 호출 — 콜백을 캡처해 "늦은/백그라운드 이벤트"를 수동으로 흘려보낸다.
  onAgentEvent: (cb: (payload: AgentEventPayload) => void) => {
    capturedHandler = cb
    return () => {
      capturedHandler = null
    }
  },
  agentRun: async () => ({ runId: 'run-a' }),
  agentAbort: async () => ({ accepted: true }),
  agentInterrupt: async () => ({ accepted: true }),
  // [P3b-Tcwd]가 사용: selectConversation의 cwd 복원 2단계(restoreWorkspaceFromCwd, ADR-020)가
  // 호출하는 IPC. folderPath를 그대로 rootPath로 echo — main 재검증을 흉내(실제 main 로직은
  // isAbsolute+existsSync+isDirectory이지만 이 테스트는 renderer store 계약만 다룬다).
  workspaceOpen: async (req: { folderPath?: string }) => ({
    rootPath: req.folderPath ?? null,
    tree: null,
  }),
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

// ── 공통 셋업: 대화 A가 run-a로 실행 중, 이미 부분 스트리밍된 assistant 텍스트 보유 ──
function setupRunningA(): void {
  useAppStore.setState({
    conversationId: 'A',
    currentRunId: 'run-a',
    isRunning: true,
    thread: [
      { kind: 'msg', id: 'm-a-user', role: 'user', text: 'A의 질문' },
      { kind: 'msg', id: 'm-a-assistant', role: 'assistant', text: '1부터 셉니다: 1, 2, 3' },
    ],
    messages: [
      { id: 'm-a-user', role: 'user', content: 'A의 질문' },
      { id: 'm-a-assistant', role: 'assistant', content: '1부터 셉니다: 1, 2, 3' },
    ],
    openGroupId: null,
    // 진행 중인 스트리밍 — 다음 text 이벤트(messageId 'm-a-assistant')는 이 메시지에 누적된다.
    openMsgId: 'm-a-assistant',
    seq: 2,
    errorMessage: undefined,
    sessionId: 'sess-a',
  } as Parameters<typeof useAppStore.setState>[0])
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('switch-continuity — P3b seamless: 백그라운드 실행 보존(설계=추천안 a, bgRuns 맵)', () => {
  beforeEach(() => {
    capturedHandler = null
    setupRunningA()
  })

  // ── T1 — seamless 복귀 ───────────────────────────────────────────────────────
  it('[P3b-T1] A를 떠나 B로 전환 후 run-a가 백그라운드로 계속되면, A로 복귀 시 그 진행이 이어져 보인다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    // 사전조건
    expect(useAppStore.getState().conversationId).toBe('A')
    expect(useAppStore.getState().currentRunId).toBe('run-a')
    expect(useAppStore.getState().isRunning).toBe(true)

    // 3) B로 전환 — A는 실행 중인 채로 떠남
    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')

    // 4) run-a의 늦은 text 이벤트 여러 개 도착 — A가 백그라운드로 계속 스트리밍.
    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 5', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 6', messageId: 'm-a-assistant' },
    })

    // 5) A로 복귀
    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    const joined = threadTexts(after.thread).join('')

    // ★ 핵심 단언(seamless): 백그라운드로 도착한 ', 4' / ', 5' / ', 6'이 A thread에 포함돼야
    //   한다 — 디스크 base(CONV_A_BASE, user 메시지만)로 리셋되면 이 델타들은 전혀 없다.
    //   현재(P3a까지)는 B로 전환된 순간 currentRunId가 null이 되어 이후 run-a 이벤트는
    //   subscribeAgentEvents 가드에서 전부 드롭된다 — "보존" 자체가 없어 RED가 정상이다.
    expect(joined).toContain(', 4')
    expect(joined).toContain(', 5')
    expect(joined).toContain(', 6')

    // ★ 핵심 단언: run-a는 아직 done을 보내지 않았으므로(백그라운드에서 계속 진행 중),
    //   A로 돌아왔을 때 isRunning은 A의 실제 실행 상태(true)를 반영해야 한다.
    //   현재는 selectConversation이 항상 isRunning:false로 리셋하므로 RED.
    expect(after.isRunning).toBe(true)

    unsubscribe()
  })

  // ── T2 — 동시 실행 독립 ──────────────────────────────────────────────────────
  it('[P3b-T2a] B를 보는 동안 run-a 텍스트는 B thread에 새지 않는다(교차오염 0 — P3a 유지 확인)', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().conversationId).toBe('B')

    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: '누출되면 안 되는 텍스트', messageId: 'm-a-assistant' },
    })

    const bState = useAppStore.getState()
    expect(bState.conversationId).toBe('B')
    // P3a가 이미 보증하는 성질 — 이 테스트에서 회귀 없음을 재확인(GREEN 유지 기대).
    expect(threadTexts(bState.thread).join('')).not.toContain('누출되면 안 되는 텍스트')

    unsubscribe()
  })

  it('[P3b-T2b] B를 보는 동안 도착한 run-a 텍스트도, A로 복귀하면 A thread에 보존돼 있어야 한다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    await useAppStore.getState().selectConversation('B')

    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })

    // B를 보는 동안 도착한 백그라운드 진행도, A로 돌아오면 보여야 한다(T1과 동일 성질,
    // "B를 거쳐갔다"는 사실이 A의 백그라운드 보존을 방해하면 안 된다는 것을 별도로 확인).
    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    expect(threadTexts(after.thread).join('')).toContain(', 4')

    unsubscribe()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ── P3b 봉합 RED(reviewer 🔴+🟡#1) — bgRuns 스냅샷에 없는 대화-스코프 필드 ──────────
  //   ConversationRunState(slices/types.ts) = AppState(reducer) & {messages}.
  //   AppState는 reducer.ts makeInitialState()가 정의하는 필드만 포함한다 —
  //   workspaceRoot(WorkspaceState 슬라이스)·attachedImages(ComposerState 슬라이스)·
  //   restoredSession(ConversationState 슬라이스, AppState 밖)은 전부 여기 빠져 있다.
  //   즉 selectConversation의 bg-restore 경로(sessions.ts L124-139, `set({...bg, ...})`)는
  //   이 필드들을 절대 건드리지 않는다 — 떠날 때(B로) 리셋/변경된 값이 돌아올 때(A로) 그대로
  //   고착되거나 새어든다. 아래 두 테스트는 그 거동(내부 bgRuns 구조가 아니라 store 최종 상태)만
  //   단언한다 — 봉합(구현 수정) 전에는 RED가 정상이다.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── T-cwd(🔴) — workspaceRoot는 대화-스코프가 아니라 전역 WorkspaceState라 스냅샷 밖 ──────
  it('[P3b-Tcwd] 🔴 A(cwd=projA)에서 B(cwd=projB)로 전환 후 A로 복귀하면 workspaceRoot도 A의 cwd로 복원돼야 한다', async () => {
    // A를 보고 있던 동안의 workspaceRoot(디스크 cwd 복원으로 도달했을 상태)를 사전조건으로 직접 셋업.
    // CRITICAL(신뢰경계) 주석은 실제 액션(restoreWorkspaceFromCwd)에만 적용 — 여기는 테스트 사전조건
    // 셋업이라 store.setState 직접 사용(기존 setupRunningA와 동일한 테스트 관례).
    useAppStore.setState({ workspaceRoot: 'C:\\projA' } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    // B로 전환 — 디스크 로드 경로(bgRuns에 B 없음) → conv.cwd='C:\\projB' → restoreWorkspaceFromCwd
    // 경유 workspaceOpen IPC(ADR-020) → workspaceRoot가 B의 cwd로 바뀐다. 이건 기존(P3a까지)
    // 디스크 경로 회귀가 아님을 재확인하는 사전조건.
    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().workspaceRoot).toBe('C:\\projB')

    // run-a 백그라운드 이벤트(선택 — A가 여전히 진행 중임을 보여주는 참고용, 판정에 필수 아님)
    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })

    // A로 복귀 — bgRuns 경로(디스크 conversationLoad 우회, seamless 이음)
    await useAppStore.getState().selectConversation('A')

    // ★ 핵심 단언(🔴): A로 돌아왔으면 A가 보고 있던 워크스페이스(projA)로도 되돌아가야 한다.
    //   현재는 bg-restore가 workspaceRoot를 전혀 건드리지 않아 B에서 세팅된 'C:\\projB'가
    //   그대로 고착된다 — RED.
    expect(useAppStore.getState().workspaceRoot).toBe('C:\\projA')

    unsubscribe()
  })

  // ── T-attachedImages/restoredSession(🟡#1) — 디스크 경로는 명시 리셋/설정하는데 bg 경로는 누락 ──
  it('[P3b-Timg] 🟡#1 A(attachedImages 1개+restoredSession=true)에서 B로 전환 후 복귀하면 그 값이 A로 복원돼야 한다(B값이 새면 안 됨)', async () => {
    const aImage: AttachedImage = { path: 'C:\\imgs\\a.png', dataUrl: 'data:image/png;base64,AAA==' }
    // A를 보고 있던 동안의 첨부/복원배지 상태를 사전조건으로 직접 셋업.
    useAppStore.setState({
      attachedImages: [aImage],
      restoredSession: true,
    } as Parameters<typeof useAppStore.setState>[0])

    const unsubscribe = useAppStore.getState().subscribeAgentEvents()

    // B로 전환 — 디스크 로드 경로(sessions.ts L175/179)가 attachedImages:[] / restoredSession:false로
    // 명시 리셋한다(B는 빈 메시지 대화라 restoredSession 계산 자체도 false). 사전조건 재확인.
    await useAppStore.getState().selectConversation('B')
    expect(useAppStore.getState().attachedImages).toEqual([])
    expect(useAppStore.getState().restoredSession).toBe(false)

    // A로 복귀 — bgRuns 경로(디스크 conversationLoad 우회)
    await useAppStore.getState().selectConversation('A')

    const after = useAppStore.getState()
    // ★ 핵심 단언(🟡#1): A가 갖고 있던 attachedImages/restoredSession이 복원돼야 한다.
    //   현재는 bg-restore가 이 필드들을 전혀 건드리지 않아 B에서 리셋된 [] / false가
    //   그대로 새어드는(누수) RED — "고착"이 아니라 "복원 누락"이라는 점이 T-cwd와의 차이.
    expect(after.attachedImages).toEqual([aImage])
    expect(after.restoredSession).toBe(true)

    unsubscribe()
  })

  // ── T3 — done 백그라운드 (이연) ──────────────────────────────────────────────
  // A가 백그라운드에서 도는 도중 done(run-a) 이벤트가 도착하는 케이스(완료 상태를 in-memory로
  // 어떻게 반영할지 — isRunning:false 전환 + 최종 messages 동기화가 "B를 보는 도중"에 일어나야
  // 하는지, 아니면 A로 복귀하는 시점까지 지연해도 되는지)는 영속(persist) 타이밍과 얽혀 P3b
  // 범위에서 애매하다(saveConversation 호출 시점이 B가 활성인 동안이어도 되는가 등). 이 계약은
  // P3c(영속화 트랙)로 이연한다 — 여기서는 T1/T2의 in-flight(미완료) 텍스트 보존만 확정한다.
})

// ═══════════════════════════════════════════════════════════════════════════════
// P3b-2: "새 대화" 갭 (라이브 e2e로 확정됨) ────────────────────────────────────────
//
//   selectConversation은 떠나는 실행 중 대화를 bgRuns[leaving]에 스냅샷 후 전환한다(P3b, 위
//   describe). "새 대화" 버튼(newConversation, sessions.ts:302)은 selectConversation이 아니라
//   clearConversation()(conversation.ts:130)을 재사용하는데 — clearConversation은 makeInitialState()로
//   리셋 + 남아있던 bgRuns[clearedId] evict만 할 뿐 진행 중 run을 스냅샷하지 않아, (봉합 전) A가
//   실행 중일 때 "새 대화"를 누르면 이후 run-a 이벤트가 subscribeAgentEvents 경로3(드롭)으로 떨어지고
//   복귀 시 디스크 base(user 메시지만)로 폴백해 스트리밍 응답이 증발했다.
//   라이브 e2e로 봉합 전 afterReturn=-1(증발) 재현 확정.
//
//   봉합(완료): newConversation도 나가는 실행 중 대화를 buildConversationRunSnapshot로 스냅샷 후
//   리셋하도록 수정됨(sessions.ts:302 — 스냅샷 캡처 → clearConversation → bgRuns 재추가). 라이브
//   e2e로 봉합 후 afterReturn 진행·finalMax 완주 확정. 이 테스트는 그 seamless 계약을 고정한다(GREEN).
// ═══════════════════════════════════════════════════════════════════════════════
describe('switch-continuity — P3b-2 "새 대화" seamless: newConversation도 진행 중 대화를 스냅샷해 복귀 시 이어진다', () => {
  beforeEach(() => {
    capturedHandler = null
    setupRunningA()
  })

  // ── T-newconv-seamless ───────────────────────────────────────────────────────
  it('[P3b2-T1] A 실행 중 "새 대화" 클릭 → 새 대화 전환 뒤 도착한 run-a 텍스트가 A 복귀 시 보존된다', async () => {
    const unsubscribe = useAppStore.getState().subscribeAgentEvents()
    expect(capturedHandler).not.toBeNull()

    // 사전조건 — 대화 A가 run-a로 실행 중.
    expect(useAppStore.getState().conversationId).toBe('A')
    expect(useAppStore.getState().currentRunId).toBe('run-a')
    expect(useAppStore.getState().isRunning).toBe(true)

    // 3) "새 대화" 제스처 — sessions.ts:302 newConversation(). 실행 중이면 스냅샷 후 clearConversation.
    //    IPC 미호출(동기 상태 리셋만).
    useAppStore.getState().newConversation()

    // 4) 단언(빈 새 대화, 즉시): makeInitialState 기반 빈 새 대화로 전환됐어야 한다 — 교차오염 0.
    //    이 단언은 봉합 여부와 무관하게 항상 성립(리셋 자체는 정상 동작) — GREEN이 정상이다.
    const justAfterNew = useAppStore.getState()
    expect(justAfterNew.conversationId).toBeNull()
    expect(threadTexts(justAfterNew.thread)).toEqual([])

    // 5) run-a의 늦은 text 이벤트 여러 개 도착 — A가 (개념상) 백그라운드로 계속 진행 중이라는 전제.
    expect(capturedHandler).not.toBeNull()
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 4', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 5', messageId: 'm-a-assistant' },
    })
    capturedHandler!({
      runId: 'run-a',
      event: { type: 'text', delta: ', 6', messageId: 'm-a-assistant' },
    })

    // 6) A로 복귀 (예: 사이드바에서 A 다시 선택)
    await useAppStore.getState().selectConversation('A')

    // 7) 단언(seamless): newConversation이 떠나기 전 스냅샷하므로 selectConversation('A')가
    //    bgRuns 경로로 복원해 5의 텍스트가 살아있다. (봉합 후 GREEN — sessions.ts:302 newConversation이
    //    buildConversationRunSnapshot로 스냅샷 후 clearConversation, 그 뒤 bgRuns 재추가.)
    const after = useAppStore.getState()
    expect(after.conversationId).toBe('A')
    const joined = threadTexts(after.thread).join('')
    expect(joined).toContain(', 4')
    expect(joined).toContain(', 5')
    expect(joined).toContain(', 6')

    unsubscribe()
  })

  // ── T-newconv-nonrunning ─────────────────────────────────────────────────────
  it('[P3b2-T2] A가 실행 중이 아닐 때 "새 대화"는 스냅샷 없이 그냥 리셋한다(불필요 bgRuns 엔트리 방지)', () => {
    // A를 실행 중이 아닌 상태로 재정의 — setupRunningA()가 세팅한 실행 중 상태를 덮어씀.
    useAppStore.setState({
      currentRunId: null,
      isRunning: false,
    } as Parameters<typeof useAppStore.setState>[0])

    useAppStore.getState().newConversation()

    const after = useAppStore.getState()
    expect(after.conversationId).toBeNull()
    expect(threadTexts(after.thread)).toEqual([])
    // 주의사항 예외: 이 케이스의 계약("불필요 엔트리를 만들지 않는다")은 관측 가능한 거동만으로는
    // 대체 신호가 없다(스냅샷을 안 했든 애초에 대상이 없었든 이후 selectConversation 결과가
    // 동일해 보임) — 여기서만 예외적으로 bgRuns 존재 여부를 직접 확인한다.
    expect('A' in after.bgRuns).toBe(false)
  })
})
