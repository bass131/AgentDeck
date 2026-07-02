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
import { nextMsgId } from './ids'
import { buildConversationSavePayload } from './conversationPayload'
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
   * PermissionModal 사용자 선택 → window.api.permissionRespond IPC 호출.
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

    const res = await window.api.agentRun({
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

    // LR3-06 정지 신뢰 피드백: 새 전송이 정지 확인 배너를 자연 해제(가장 최근 사실이 우선).
    set({ currentRunId: res.runId, loopsStoppedNotice: false })

    // 대화 저장 (비동기, 결과 무시)
    void get().saveConversation()
  },

  abortRun: async () => {
    const { currentRunId, activeLoops } = get()
    if (!currentRunId) return
    // 원본 미러(App.tsx:534): 실행 중단은 예약 큐도 함께 폐기한다.
    // 큐를 먼저 비워야 abort→done/error 전이 시 드레인 effect가 자동전송하지 않는다.
    // LR2-03: SDK 크론 표시(activeLoops)도 로컬 해제 — abort=세션 종료=크론 사멸인데
    // main abort는 done 마킹 후 이벤트를 끊어(agent-runs.ts:193) 백엔드 abortCleanup의
    // loops:[] 정리 이벤트가 renderer에 안 닿는다(라이브 실측). main 내부 상태는 정리되므로
    // 표시만 동기화(interrupt=세션 유지 경로는 유지 — 크론 살아있음).
    // LR3-03: 앱 타이머 /loop(activeLoop) 폐기로 그 정리 라인은 삭제 — activeLoops(SDK) 정리는 잔존.
    // LR3-06 정지 신뢰 피드백: 루프를 끊은 abort에만 정지 확인 배너(stopped)를 점화 —
    // 내부 정리는 실측 정상(lr3-p06-stop-cleanup probe — 80s간 증가 0)이나 피드백
    // 부재로 사용자가 정리 여부를 신뢰할 수 없었다(영호 육안 피드백 2026-07-03).
    set({ queue: [], activeLoops: [], ...(activeLoops.length > 0 ? { loopsStoppedNotice: true } : {}) })
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

      // ── 경로 3: 어디에도 매칭 안 되는 미지 run — 드롭 (교차오염 가드 보존, P3a 취지 유지) ──
    })
    return unsubscribe
  },

  // ── Phase 24c: 권한 응답 ─────────────────────────────────────────────────
  respondPermission: async (behavior) => {
    const { pendingPermission } = get()
    if (!pendingPermission) return // no-op: 대기 중 요청 없음

    // 모달 즉시 닫음 — IPC 성공/실패 무관(방어적 정책)
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
