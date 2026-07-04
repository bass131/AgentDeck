/**
 * slices/runtime.ts — 에이전트 실행 코어 슬라이스 (P12 분해, 최대).
 *
 * 상태는 AppState(reducer makeInitialState)에서 상속 — 이 슬라이스는 액션만 기여한다:
 *   sendMessage·abortRun·interruptRun·subscribeAgentEvents·respondPermission·respondQuestion.
 * 거동 보존: 액션 본문은 기존 appStore.ts에서 그대로 이전.
 *
 * 슬라이스 cross-call(get() 결합 보존):
 *   - sendMessage → get().saveConversation() (conversation); reads thread/workspaceRoot/sessionId/
 *                   replMode/conversationId/currentSessionKey
 *   - subscribeAgentEvents(경로1) → get().saveConversation() (conversation) + get().refreshFileTree() (workspace)
 *   - subscribeAgentEvents(경로2, P3c) → window.api.conversationSave 직접 호출(bg 스냅샷에서
 *     buildConversationSavePayload로 payload 빌드 — conversationPayload.ts, conversation.ts와 공유).
 *     get().saveConversation() 미재사용(활성 flat을 읽어 교차오염 위험 — bg는 스냅샷만 읽는다).
 *
 * CRITICAL: renderer untrusted — window.api(화이트리스트)만. fs/Node 0.
 *   W7: nowTime() stamp는 구독/액션 레이어(impure 허용) — reducer는 받은 time만 사용(순수성).
 */
import type { StateCreator } from 'zustand'
import type { ConversationMessage } from '../../../../shared/ipc-contract'
import { applyAgentEvent, applyBeginCommand } from '../reducer'
import type { AppState } from '../reducer'
import type { ThreadItem } from '../threadTypes'
import { commandOf } from '../../lib/cmdCards'
import { closeAbortedCommandCard, closeAbortedOrchestrationCards } from '../reducer/helpers'
import { handleError } from '../reducer/lifecycle'
import { nextMsgId } from './ids'
import { buildConversationSavePayload } from './conversationPayload'
import {
  syncConversationLoopDisplayAndRouting,
  registerConversationRun,
  lookupConversationForRun,
  unregisterConversationRun,
  applyLoopDisplayEventFallback,
  sessionLoopDisplayRegistry,
} from './loopDisplay'
import type { AppStore, ConversationEntry, ConversationRunState } from './types'

export interface RuntimeActions {
  /**
   * 메시지 전송 → agentRun IPC 호출. pickerValues 전달 시 model/effort/mode 포함(M4-1).
   * displayImages(22c): 사용자 버블에 표시할 data URL 목록 (in-memory — 영속화 미적용).
   * orchestration(Phase 37): 오케스트레이션 모드 토글 — boolean만 운반, 엔진중립.
   */
  sendMessage: (text: string, pickerValues?: { model: string; effort: string; mode: string }, promptForEngine?: string, displayImages?: string[], orchestration?: boolean) => Promise<void>
  /** 실행 중단 → agentAbort IPC 호출 (세션 종료) */
  abortRun: () => Promise<void>
  /** 정지 확인 배너(loopsStoppedNotice) ✕ 닫기 (LR3-06 정지 신뢰 피드백) */
  dismissLoopsStopped: () => void
  /**
   * 현재 turn만 중단 → agentInterrupt IPC 호출 (세션 유지).
   * REPL 지속세션(replMode ON) 정지 — 다음 턴부터 재개 가능. currentRunId 없으면 no-op(방어 가드).
   * CRITICAL: renderer untrusted — window.api.agentInterrupt(화이트리스트)만 호출.
   */
  interruptRun: () => Promise<void>
  /** window.api.onAgentEvent 구독 등록 → unsubscribe 반환 */
  subscribeAgentEvents: () => () => void
  /**
   * 권한 요청 카드(PermissionCard, BF3 Phase 06/ADR-030 — 구 PermissionModal) 사용자 선택
   * → window.api.permissionRespond IPC 호출.
   * pendingPermission이 있으면 runId/requestId와 함께 behavior 전송. 성공/실패 무관 pendingPermission=null.
   * CRITICAL: renderer untrusted — window.api.permissionRespond(화이트리스트)만 호출.
   */
  respondPermission: (behavior: 'allow' | 'allow_always' | 'deny') => Promise<void>
  /**
   * QuestionModal 사용자 답변 → window.api.questionRespond IPC 호출.
   * pendingQuestion이 있으면 runId/requestId와 함께 answers 전송. answers=null이면 건너뜀(dismiss).
   * CRITICAL: renderer untrusted — window.api.questionRespond(화이트리스트)만 호출.
   */
  respondQuestion: (answers: string[][] | null) => Promise<void>
}

export const createRuntimeSlice: StateCreator<AppStore, [], [], RuntimeActions> = (set, get) => ({
  // ── 에이전트 ─────────────────────────────────────────────────────────────
  sendMessage: async (text: string, pickerValues?: { model: string; effort: string; mode: string }, promptForEngine?: string, displayImages?: string[], orchestration?: boolean) => {
    const state = get()
    if (state.isRunning) return

    // M6(Phase 34): 카드 커맨드 감지 → user 버블 대신 진행카드 push (B2)
    const cmdName = commandOf(text)
    if (cmdName) {
      // cardId = "cmd-{nextMsgId()}" 형식 (msg id와 구분)
      const cardId = `cmd-${nextMsgId()}`
      const time = new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
      // LR2-03: goal 카드는 목표 텍스트(커맨드 인자)를 sub로 표시 — goal 한정(타 카드 회귀 0).
      const cmdDetail = cmdName === 'goal'
        ? (text.trim().replace(/^\/goal\b\s*/i, '') || null)
        : null
      set((s) => ({
        ...applyBeginCommand(s as AppState, {
          type: 'begin-command',
          name: cmdName,
          cardId,
          time,
          ...(cmdDetail ? { detail: cmdDetail } : {}),
        }),
        errorMessage: undefined,
        isRunning: true,
      }))
      // 백엔드에는 슬래시 커맨드 그대로 전송 — 이하 IPC 코드 공통 사용
    } else {
      const userEntry: ConversationEntry = {
        id: nextMsgId(),
        role: 'user',
        // 표시/저장 메시지는 항상 원문(text) — 노트는 엔진에만 전달
        content: text,
        // 22c: 사용자 버블 썸네일용 data URL (in-memory)
        ...(displayImages && displayImages.length > 0 ? { images: displayImages } : {}),
      }

      // Phase A-2: user 메시지를 thread + messages 양쪽에 push
      // W7: nowTime() stamp — sendMessage는 구독/액션 레이어이므로 impure 허용.
      //     reducer는 받은 time만 사용(순수성 유지).
      const userTime = new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
      const userThreadItem: ThreadItem = {
        kind: 'msg',
        id: userEntry.id,
        role: 'user',
        text: userEntry.content,
        time: userTime,
        ...(userEntry.images && userEntry.images.length > 0 ? { images: userEntry.images } : {}),
      }

      set((s) => ({
        // messages는 thread-파생 영속/history 투영(렌더는 thread가 단일 소스).
        messages: [...s.messages, userEntry],
        thread: [...s.thread, userThreadItem],
        errorMessage: undefined,
        isRunning: true,
      }))
    }

    // IPC 메시지 형식으로 변환 — thread(kind==='msg')에서 파생
    // M6: 카드 커맨드인 경우 history에 커맨드 text를 수동으로 append(cmdresult는 msg가 아님)
    const history: ConversationMessage[] = get().thread
      .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
      .map((m) => ({
        role: m.role,
        content: m.text,
      }))

    if (cmdName) {
      // 카드 커맨드: thread에는 cmdresult가 push됐지만 history에는 슬래시 커맨드 텍스트 추가
      history.push({ role: 'user', content: text })
    }

    // M4-2: promptForEngine 제공 시 history 마지막 메시지(=방금 추가한 user 메시지)
    // content를 엔진 전달용 prompt(멘션 노트 포함)로 교체.
    // 표시 메시지(userEntry.content)는 원문 text 유지.
    if (promptForEngine && history.length > 0) {
      history[history.length - 1] = { ...history[history.length - 1], content: promptForEngine }
    }

    // Phase 5a: REPL 지속세션 배선 — sessionKey 결정
    // conversationId가 있으면 그것이 sessionKey(이미 저장된 대화), 없으면 안정 UUID 재사용.
    // currentSessionKey는 clearConversation/대화전환 시 재생성(새 대화 = 새 키).
    const { replMode, conversationId: convId, currentSessionKey } = get()

    // LR2-04: held-open 키 안정화 — 신규 대화(convId=null)의 첫 send는 agentRun *전에*
    // 선저장으로 conversationId를 확정한다. 키가 대화 생애 동안 conversationId로 불변이어야
    // turn1(UUID)→turn2(convId) 키 flip으로 main persistentRuns 재사용이 끊기고 turn1
    // held-open 세션이 고아로 남는 누수(agent-runs.ts는 무변경 — 🔴 최대위험 구역)를 막는다.
    // 저장 실패/빈 thread(카드 커맨드 등)면 기존 폴백(currentSessionKey) — 회귀 0.
    if (replMode && convId === null) {
      await get().saveConversation().catch(() => {})
    }
    const resolvedSessionKey = get().conversationId ?? currentSessionKey

    // reviewer 🟡 처방 봉합(전송 실패 isRunning 영구 고착): agentRun이 IPC/백엔드 도달 전에
    // reject하면(네트워크 없는 IPC 자체 실패 등) SET_RUN_ID 상당의 currentRunId 세팅이
    // 전혀 발화하지 않아 currentRunId=null로 고착되고, 위에서 낙관적으로 세운 isRunning=true
    // (64d7109)는 되돌릴 사람이 없어 영구 true로 남는다 — WorkingIndicator 무한 표시 +
    // abortRun의 `if (!currentRunId) return` 조기반환으로 정지/인터럽트도 전부 no-op이 되는
    // 이중 고착(증상은 5a55b86 handleDone 동형 정리가 다루는 "abort 후 done 부재" 케이스와
    // 같은 뿌리 — "낙관 상태를 되돌릴 이벤트가 결코 오지 않는다"). handleError(reducer/
    // lifecycle.ts)를 실패 시 그대로 재사용해 정상 error 이벤트와 동일하게 정리한다 —
    // isRunning/thinkingText/pendingPermission/pendingQuestion/pendingCommand 해제 +
    // errorMessage 세팅(진행 중이던 슬래시 카드가 있었으면 handleError의 실패 카드 처리까지
    // 동형 적용). 가시화는 기존 conv-error 배너(Conversation.tsx errorMessage&&!isRunning)를
    // 그대로 재사용 — 새 시각 문법 0.
    let res: Awaited<ReturnType<typeof window.api.agentRun>>
    try {
      res = await window.api.agentRun({
        messages: history,
        workspaceRoot: get().workspaceRoot ?? undefined,
        // M4-1: picker 선택값 포함 (미전달 시 undefined → main이 CLI 기본값 사용)
        model: pickerValues?.model,
        effort: pickerValues?.effort,
        mode: pickerValues?.mode,
        // Phase 37: 오케스트레이션 모드 토글 — boolean 운반, backend가 매핑
        orchestration,
        // Phase 1 맥락 복구: 직전 턴의 session 이벤트로 저장한 sessionId를 되돌려 보내 resume.
        resumeSessionId: get().sessionId,
        // Phase 5a 지속세션: replMode ON이면 backend가 held-open 세션 유지(ADR-024).
        // OFF면 기존 단발 query(미포함 → 회귀 0).
        ...(replMode ? { persistent: true, sessionKey: resolvedSessionKey } : {}),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set((s) => handleError(s as AppState, { type: 'error', message }) as Partial<AppStore>)
      return
    }

    // LR3-06 정지 신뢰 피드백: 새 전송이 정지 확인 배너를 자연 해제(가장 최근 사실이 우선).
    set({ currentRunId: res.runId, loopsStoppedNotice: false })

    // reviewer 🔴 2차 봉합: run 생성 시점에 내구 라우팅을 무조건 등록(패널 SET_RUN_ID·
    // panelSession.ts:716과 동형 — "패널식 완전 미러"). leave 시점의 조건부 등록(트리오
    // 非빈)만으로는 "background-started 순수 크론"(leave 당시엔 트리오가 비어 있었다가
    // 이후 백그라운드에서 처음 루프가 시작되는 경우)의 라우팅이 누락될 수 있었다 — 등록을
    // run 생성 시점으로 당겨 트리오 상태와 무관하게 항상 해두면, loops 이벤트가 언제 도착
    // 하든(활성/백그라운드 무관) 이미 라우팅이 존재해 봉합이 구조적으로 튼튼해진다.
    // conversationId가 아직 null이면(카드 커맨드 등 저장 실패·미저장 신규 대화) no-op —
    // 안정 키가 없으므로 등록 불가(다른 write-through 지점과 동일 관례).
    const convIdForRouting = get().conversationId
    if (convIdForRouting !== null) {
      registerConversationRun(res.runId, convIdForRouting)
    }

    // 대화 저장 (비동기, 결과 무시)
    void get().saveConversation()
  },

  abortRun: async () => {
    const { currentRunId, activeLoops, pendingCommand, thread } = get()
    if (!currentRunId) return
    // 원본 미러(App.tsx:534): 실행 중단은 예약 큐도 함께 폐기한다.
    // 큐를 먼저 비워야 abort→done/error 전이 시 드레인 effect가 자동전송하지 않는다.
    // LR2-03: SDK 크론 표시(activeLoops)도 로컬 해제 — abort=세션 종료=크론 사멸 동기화.
    // BF2-mini P1(2026-07-03) 이후 main이 abort 후에도 loops:[] 정리 이벤트를 통과시키므로
    // (agent-runs.ts done-후 loops 화이트리스트) 이 로컬 리셋은 더 이상 유일한 경로가 아니다 —
    // IPC 왕복 전 즉시 피드백 + 방어심층(벨트+멜빵)으로 유지(interrupt=세션 유지 경로는 미적용).
    // LR3-03: 앱 타이머 /loop(activeLoop) 폐기로 그 정리 라인은 삭제 — activeLoops(SDK) 정리는 잔존.
    // LR3-06 정지 신뢰 피드백: 루프를 끊은 abort에만 정지 확인 배너(stopped)를 점화 —
    // 내부 정리는 실측 정상(lr3-p06-stop-cleanup probe — 80s간 증가 0)이나 피드백
    // 부재로 사용자가 정리 여부를 신뢰할 수 없었다(영호 육안 피드백 2026-07-03).
    //
    // FB2 P02 후속 P0(영호 육안 2026-07-04, "loop/goal 정지 버튼 클릭 시 thinking GUI
    // 무한 표시 + 인터럽트 버튼 이후 무반응"): main(agent-runs.ts RunManager.abort())은
    // cleanup()으로 activeRun.done=true를 abortFn() 호출 *전에* 세팅하고, 이후 소비 루프는
    // 'loops' 타입 이벤트만 통과시키며 done/error를 포함한 나머지는 전부 드롭한다(의도적
    // 설계, agent-runs.ts:206-224 — activeLoops 로컬 리셋과 동일한 "renderer가 로컬로
    // 이미 정리했다" 전제). 즉 abort 후에는 done/error가 결코 오지 않아 handleDone/
    // handleError(reducer/lifecycle.ts)가 isRunning/thinkingText/currentRunId/pendingCommand
    // 를 해제할 기회가 원천 차단된다 — 방치하면 WorkingIndicator·goal LoopStatusBanner가
    // 죽은 run을 가리키며 무한 표시되고(증상①), currentRunId가 죽은 값으로 고착돼 이후
    // 정지/인터럽트 클릭도 전부 no-op이 된다(증상② — main이 이미 activeRuns에서 지운
    // runId라 abort()/interrupt() 둘 다 false 반환). handleDone과 동형으로 로컬에서
    // 즉시 정리한다(벨트+멜빵의 연장 — 여기서도 main 이벤트가 유일한 경로가 아니다).
    // pendingCommand(goal/compact 진행카드)가 있었으면 카드도 "중단됨"으로 닫는다
    // (closeAbortedCommandCard — 방치 시 goal 카드 스피너도 영구 잔존). reviewer 🟡 봉합:
    // running orchestration(서브에이전트 블랙박스, Phase 37 #4b) 카드도 동일 버그 클래스라
    // closeAbortedOrchestrationCards로 함께 닫는다(handleDone의 closeOrch 동형 — goal/loop가
    // 서브에이전트를 띄운 채 정지되면 orchestration 스피너도 영구 잔존했을 경로).
    // goal은 loop과 동형의 "self-re-arm 자기지속"이라 정지 확인 배너(stopped) 대상에도 편입.
    const goalStopping = pendingCommand?.name === 'goal'
    set({
      queue: [],
      activeLoops: [],
      ...((activeLoops.length > 0 || goalStopping) ? { loopsStoppedNotice: true } : {}),
      isRunning: false,
      currentRunId: null,
      thinkingText: null,
      pendingPermission: null,
      pendingQuestion: null,
      openMsgId: null,
      openGroupId: null,
      pendingCommand: null,
      thread: closeAbortedOrchestrationCards(closeAbortedCommandCard(thread, pendingCommand?.cardId)),
    })
    await window.api.agentAbort({ runId: currentRunId })
  },

  // LR3-06 정지 신뢰 피드백: stopped 확인 배너 ✕ 닫기
  dismissLoopsStopped: () => {
    set({ loopsStoppedNotice: false })
  },

  // Phase 5b: 현재 turn만 중단 — 세션 유지 (REPL 지속세션 정지)
  interruptRun: async () => {
    const { currentRunId } = get()
    // currentRunId 없으면 no-op(방어 가드 — 이미 idle이면 interrupt 불필요)
    if (!currentRunId) return
    // CRITICAL: renderer untrusted — window.api.agentInterrupt(화이트리스트)만 호출.
    // 세션 유지: queue 미폐기(abort와 구별됨).
    await window.api.agentInterrupt({ runId: currentRunId })
  },

  // ── IPC 구독 초기화 ──────────────────────────────────────────────────────
  subscribeAgentEvents: () => {
    // W7: 이벤트 수신 시 nowTime() stamp — 구독 레이어(impure 허용)에서 부여.
    //     applyAgentEvent는 받은 time만 사용(순수성 유지).
    function nowTime(): string {
      return new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
    }
    const unsubscribe = window.api.onAgentEvent((payload) => {
      const t = nowTime()

      // ── 경로 1: 활성 대화의 run 이벤트 (기존 P3a 이후 거동 그대로) ────────────────
      if (payload.runId === get().currentRunId) {
        // 리듀서를 통해 상태 갱신 (단방향)
        set((state) => {
          const next = applyAgentEvent(state as AppState, payload, t)

          // Phase A-2: done 이벤트 시 thread의 assistant msg들을 messages와 동기화
          // (thread가 진실 — streamingText 확정 블록 제거, thread msg에서 파생)
          if (payload.event.type === 'done') {
            const threadMsgs = next.thread
              .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
            // messages와 thread 동기화: thread의 msg만 messages에 반영
            const syncedMessages: ConversationEntry[] = threadMsgs.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.text,
              ...(m.images ? { images: m.images } : {}),
            }))
            return {
              ...next,
              messages: syncedMessages,
            } as Partial<AppStore>
          }

          return next as Partial<AppStore>
        })

        // LR1 Phase 03 갈래 A: session 이벤트 즉시 저장 — done 전 중단(interrupt/앱 종료) 시
        // sessionId 유실 방지. saveConversation은 threadMsgs.length===0 가드로 빈 저장 방지,
        // conversationId 있으면 같은 레코드 갱신(중복 없음) — conversation.ts:117-118 참조.
        if (payload.event.type === 'session') {
          void get().saveConversation()
        }

        // done 이벤트 후 대화 저장 + 탐색기 갱신 (side-effect은 액션에서)
        if (payload.event.type === 'done') {
          void get().saveConversation()
          // P13: 턴 종료 시 파일 트리 재읽기 — 에이전트가 변경한 파일 탐색기 반영
          // (원본 fsTick on done/error 미러). 워크스페이스 미오픈 시 내부 가드.
          void get().refreshFileTree()
        }
        // P13: error 이벤트 시에도 탐색기 갱신 (부분 변경 파일 반영)
        if (payload.event.type === 'error') {
          void get().refreshFileTree()
        }
        // reviewer 🔴 2차 봉합 point 3(정리 대칭 재점검): run 생성 시점 등록이 무조건이 되므로,
        // 루프 없이 끝나는 평범한 run(트리오가 done/error 시점에도 계속 비어 있던 경우)의
        // 라우팅 엔트리는 여기서 정리한다 — conversationId당 1엔트리 교체-정리(loopDisplay.ts
        // registerConversationRun)로 무한 누수는 아니지만, "현재 in-flight이거나 표시할
        // 무언가가 있는 대화만" 라우팅에 남기는 편이 나머지 레지스트리(자기 가지치기)와
        // 동일한 유계 철학을 유지한다. 안전성: 활성 경로(경로1)는 라우팅을 참조하지 않으므로
        // (경로1이 이미 매칭됐다는 것 자체가 라우팅 불필요 신호) 여기서 지워도 이 run이 아직
        // 활성인 동안의 처리에는 영향이 없고, 이후 트리오가 다시 非빈이 되면(같은 run이 늦게
        // loops를 보고하거나) leave-스냅샷/경로2가 재등록한다.
        if ((payload.event.type === 'done' || payload.event.type === 'error') && get().conversationId !== null) {
          if (sessionLoopDisplayRegistry.read(get().conversationId as string) === undefined) {
            unregisterConversationRun(payload.runId)
          }
        }
        return
      }

      // ── 경로 2: 백그라운드 대화의 run 이벤트 (P3b seamless + P3c 영속) ──────────────
      // 활성 대화가 아닌 run이라도 bgRuns 맵에 그 runId로 스냅샷된 대화(selectConversation이
      // 떠나며 보존한 것)가 있으면, 그 스냅샷에 계속 이벤트를 적용해 in-memory 진행을 이어간다
      // (P3b). refreshFileTree는 활성 탐색기에만 의미 있어 여전히 미발화.
      // P3c: done/session은 그 bg 스냅샷으로부터 conversationSave를 직접 발화 — 활성 flat
      // 상태(get().thread 등)는 절대 읽지 않는다(읽으면 다른 대화 데이터로 이 대화를 덮어쓰는
      // 교차오염이 된다). 기존 IPC 채널(conversationSave) 재사용 — 신규 채널 없음.
      const bgEntries = Object.entries(get().bgRuns)
      const bgHit = bgEntries.find(([, s]) => s.currentRunId === payload.runId)
      if (bgHit) {
        const [bgConvId, bgState] = bgHit
        let nextBg = applyAgentEvent(bgState as AppState, payload, t) as unknown as ConversationRunState

        // done: 활성 경로(경로1, ~193-207)와 동형 — thread의 msg를 messages에 동기화.
        // bgRuns[id]에 이 동기화가 없으면 A로 복귀했을 때(P3b 소비) messages 투영이
        // 스냅샷 시점(백그라운드 누적 전)에 고착된다 — reviewer 이연분(P3c-Tsync).
        if (payload.event.type === 'done') {
          const threadMsgs = nextBg.thread
            .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
          const syncedMessages: ConversationEntry[] = threadMsgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.text,
            ...(m.images ? { images: m.images } : {}),
          }))
          nextBg = { ...nextBg, messages: syncedMessages }
        }

        set((state) => ({
          bgRuns: { ...state.bgRuns, [bgConvId]: nextBg },
        }))

        // BF3 P07(배너 연속성) + reviewer 🔴 2차 봉합: 백그라운드 중에도 표시 트리오가 바뀔
        // 수 있으므로(예: loops 이벤트로 새 루프 시작/종료) 레지스트리를 최신으로 유지 —
        // bgRuns가 나중에 이 항목을 capBgRuns로 축출해도 이 최신값이 살아남는다(stale 배너
        // 방지 — 빈 값이면 자기 가지치기). routing-aware 변형(syncConversationLoopDisplayAndRouting)
        // 사용 — run 생성 시점 등록(위 sendMessage)과 이중 안전: 트리오가 여기서 처음
        // 非빈이 되는 순간(background-started 순수 크론)에도 라우팅이 등록/최신화된다.
        syncConversationLoopDisplayAndRouting(bgConvId, payload.runId, {
          activeLoops: nextBg.activeLoops,
          loopsStoppedNotice: nextBg.loopsStoppedNotice,
          pendingCommand: nextBg.pendingCommand,
        })

        // P3c: bg done/session → 디스크 영속. get().saveConversation() 재사용 금지(활성 flat을
        // 읽어 B 데이터로 A를 덮어쓰는 교차오염) — bg 스냅샷(nextBg)에서 직접 payload 빌드.
        // LR1 갈래 A(session 즉시저장)·done 저장 관례를 bg 경로에도 동형 적용.
        if (payload.event.type === 'done' || payload.event.type === 'session') {
          const convPayload = buildConversationSavePayload(
            {
              thread: nextBg.thread,
              workspaceRoot: nextBg.workspaceRoot,
              sessionId: nextBg.sessionId,
              lastContextWindow: nextBg.lastContextWindow,
              lastUsage: nextBg.lastUsage,
              // CP1 P05: bg 스냅샷(buildConversationRunSnapshot)이 이미 subagents를 캡처 —
              // 여기서 payload 빌더에 전달만 하면 computeSubagentAnchors가 앵커를 계산한다.
              subagents: nextBg.subagents,
            },
            bgConvId
          )
          // convPayload===null(threadMsgs 빈 경우)은 저장 스킵 — 활성 saveConversation의
          // 조기 return과 동형(빈 저장 방지). bg 대화는 항상 기존 저장 대화라 id 보장.
          if (convPayload) {
            // 활성 경로(saveConversation)와 동일한 관례: void + 내부 catch 없음(fire-and-forget,
            // 실패해도 다음 이벤트에서 최신 상태로 재시도되므로 방어적으로 삼키지 않는다).
            void window.api.conversationSave({ conversation: convPayload }).then(() => {
              void get().listConversations()
            })
          }
        }
        return
      }

      // ── 경로 2.5(reviewer 🔴 봉합): bgRuns에서 이미 축출된 대화라도 내구 라우팅
      // (runIdToConversationId, loopDisplay.ts)에 등록돼 있으면 loops/done/error의 "표시
      // 트리오 효과"만 레지스트리에 직접 반영한다. 이게 없으면 축출 후 도착하는 loops:[]
      // (루프 자연종료)가 영영 레지스트리에 안 닿아 죽은 루프의 배너가 stale 잔존한다
      // (reviewer 🔴 실측 — LR2-03 "크론 배너 영구 잔존" 재림). thread 등 전체 상태 복원은
      // 여전히 대상 아님(bgRuns 자체가 없어 불가능 — Phase 07 범위 밖 그대로).
      const routedConvId = lookupConversationForRun(payload.runId)
      if (routedConvId !== undefined) {
        applyLoopDisplayEventFallback(routedConvId, payload.event)
        // 표시 트리오가 이 처리로 완전히 비었으면(루프 확정 종료) 라우팅도 함께 정리 —
        // 더 이상 이 runId로 도착할 이벤트가 레지스트리에 영향을 줄 일이 없다(누수 대칭).
        if (sessionLoopDisplayRegistry.read(routedConvId) === undefined) {
          unregisterConversationRun(payload.runId)
        }
        return
      }

      // ── 경로 3: 어디에도 매칭 안 되는 미지 run — 드롭 (교차오염 가드 보존, P3a 취지 유지) ──
    })
    return unsubscribe
  },

  // ── Phase 24c: 권한 응답 ─────────────────────────────────────────────────
  respondPermission: async (behavior) => {
    const { pendingPermission } = get()
    if (!pendingPermission) return // no-op: 대기 중 요청 없음

    // 카드 즉시 닫음(BF3 P06: 구 "모달 즉시 닫음") — IPC 성공/실패 무관(방어적 정책)
    set({ pendingPermission: null })

    try {
      // CRITICAL: window.api.permissionRespond(화이트리스트된 기존 노출)만 호출
      await window.api.permissionRespond({
        runId: pendingPermission.runId,
        requestId: pendingPermission.requestId,
        behavior,
      })
    } catch {
      // IPC 실패는 무시 — 모달은 이미 닫혔음(방어적)
    }
  },

  // ── Phase 24d: 질문 응답 ─────────────────────────────────────────────────
  respondQuestion: async (answers) => {
    const { pendingQuestion } = get()
    if (!pendingQuestion) return // no-op: 대기 중 요청 없음

    // 모달 즉시 닫음 — IPC 성공/실패 무관(방어적 정책, 24c와 동일)
    set({ pendingQuestion: null })

    try {
      // CRITICAL: window.api.questionRespond(화이트리스트된 기존 노출)만 호출
      await window.api.questionRespond({
        runId: pendingQuestion.runId,
        requestId: pendingQuestion.requestId,
        answers,
      })
    } catch {
      // IPC 실패는 무시 — 모달은 이미 닫혔음(방어적)
    }
  },
})
