/**
 * slices/sessions.ts — 단일챗 세션(대화) 목록 CRUD 슬라이스 (P12 분해, 스펙상 "sessionList").
 *
 * conversations 목록 + listConversations/select/rename/delete/new/restoreLastActive.
 * (파일명: TDD-guard 훅 stem 매칭 — "sessionList" 미존재라 "sessions" 사용. 함수는 createSessionListSlice 유지.)
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 *
 * 슬라이스 cross-call(get() 결합 보존):
 *   - selectConversation → get().restoreWorkspaceFromCwd() (workspace), get().workspaceRoot
 *   - deleteConversation → get().clearConversation() (conversation), get().conversationId
 *   - newConversation    → get().clearConversation() (conversation)
 *   - restoreLastActiveConversation → get().selectConversation() (sessionList 내부)
 *
 * CRITICAL: renderer untrusted — window.api(화이트리스트)만. fs/Node 0.
 */
import type { StateCreator } from 'zustand'
import type { ConversationRecord } from '../../../../shared/ipc-contract'
import type { ThreadItem } from '../threadTypes'
import { getPref, setPref } from '../../lib/prefs'
import { nextMsgId } from './ids'
import type { AppStore, ConversationRunState } from './types'

// P3b 봉합(🟡#3, reviewer) — bgRuns 상한. 세션-유계(앱 실행 중에만 존재)·휘발 자료구조지만
// "떠난 뒤 다시 안 돌아온 실행 중 대화"가 계속 쌓이는 이론적 무한성장을 방어한다.
// 초과 시 가장 오래 전에 삽입된 키(most-stale)를 evict — LRU 근사(재방문 시 소비돼 삭제되므로
// "오래 방치된 것부터"가 실제로도 가장 stale하다).
const BG_RUNS_CAP = 8

export interface SessionListState {
  /**
   * 사이드바에 표시할 대화 목록 (최근 20개).
   * listConversations() 액션으로 갱신. 초기값 [].
   */
  conversations: ConversationRecord[]
  /**
   * 대화별 백그라운드 run 상태 스냅샷 맵 (P3b: switch-continuity seamless, 키=conversationId).
   * selectConversation이 실행 중인 대화를 떠날 때 여기 보존하고(스냅샷), 그 대화로 복귀할 때
   * 소비한다(복원 후 항목 삭제). subscribeAgentEvents(runtime.ts)가 활성 대화가 아닌 run의
   * 이벤트를 이 맵의 해당 항목에 계속 적용해 백그라운드 진행을 in-memory로 이어간다.
   * 초기값 {}. 영속 X(휘발 — 앱 재시작 시 백그라운드 run은 어차피 무의미).
   */
  bgRuns: Record<string, ConversationRunState>
}

export interface SessionListActions {
  /** 최근 대화 목록 로드 → conversations 갱신. limit:20, id 미지정(목록 모드). */
  listConversations: () => Promise<void>
  /**
   * 특정 대화 선택 → 해당 대화의 메시지를 현재 대화로 로드.
   *
   * P3b(switch-continuity seamless): 두 경로.
   *   1) 떠나는 대화(leaving)가 실행 중이면(currentRunId!=null — 봉합 후 조건, 🟡#4) 현재 run
   *      상태 + workspaceRoot/attachedImages/restoredSession(AppState 밖 대화-스코프 필드,
   *      🔴+🟡#1)을 bgRuns[leaving]에 스냅샷 보존 후 전환(백그라운드로 계속 진행 — 완료/오류
   *      시 subscribeAgentEvents가 그 스냅샷에 계속 적용, runtime.ts 참조). bgRuns는
   *      BG_RUNS_CAP(8)개로 유계 — 초과 시 가장 오래 삽입된 키부터 evict(🟡#3).
   *   2) 전환 대상(id)이 bgRuns에 스냅샷을 갖고 있으면 그 스냅샷으로 flat 상태를 그대로
   *      복원(디스크 conversationLoad 우회 — seamless 이음) + 소비(bgRuns[id] 삭제).
   *      workspaceRoot만 예외 — 신뢰경계 규율상 restoreWorkspaceFromCwd(IPC 재검증) 경유로
   *      별도 반영(직접 set 금지, 디스크 경로 2단계와 동일 규율).
   *      없으면 기존 conversationLoad({id}) IPC 경유 디스크 로드(없는 id면 no-op).
   *      streaming·toolCards·errorMessage·attachedImages 리셋(디스크 경로에서만 — bg 복원
   *      경로는 스냅샷이 이미 그 시점의 정확한 상태).
   */
  selectConversation: (id: string) => Promise<void>
  /** 대화 제목 변경 → conversationRename IPC 경유 → 로컬 conversations 갱신. ok:false면 무변경. */
  renameConversation: (id: string, title: string) => Promise<void>
  /**
   * 대화 삭제 → conversationDelete IPC 경유 → conversations에서 제거.
   * 삭제된 id가 활성 conversationId이면 clearConversation() 호출. ok:false면 무변경.
   */
  deleteConversation: (id: string) => Promise<void>
  /** 새 대화 시작 → clearConversation() 재사용. IPC 미호출. */
  newConversation: () => void
  /**
   * 재시작 시 마지막 활성 단일챗 대화 복원.
   * prefs에서 'conversation.lastActiveId' 읽기 → 있으면 selectConversation(id) 호출.
   * 없거나 null이면 no-op(빈 대화로 시작). selectConversation은 없는 id면 자체 no-op.
   * CRITICAL: renderer untrusted — IPC는 selectConversation 내부에서 window.api 경유.
   */
  restoreLastActiveConversation: () => Promise<void>
}

export const createSessionListSlice: StateCreator<AppStore, [], [], SessionListState & SessionListActions> = (set, get) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  conversations: [], // 23b: 사이드바 대화 목록
  bgRuns: {}, // P3b: 대화별 백그라운드 run 상태 스냅샷 맵

  // ── 세션 CRUD (23b) ──────────────────────────────────────────────────────
  listConversations: async () => {
    // id 미지정 → 최근 목록 모드 (읽기 전용, saveConversation 미호출 → 무한루프 없음)
    // 응답이 비정상(undefined)이어도 크래시 없이 빈 목록 유지(방어적).
    const res = await window.api.conversationLoad({ limit: 20 })
    set({ conversations: res?.conversations ?? [] })
  },

  selectConversation: async (id: string) => {
    const leaving = get().conversationId

    // ── P3b 1단계: 떠나는 대화가 실행 중이면 진행 상태를 스냅샷 보존 ──────────────
    // leaving===id(같은 대화 재선택)는 스냅샷 불필요.
    // P3b 봉합(🟡#4, reviewer): 조건을 `currentRunId !== null` 단독으로 좁힘(기존
    // `isRunning || currentRunId !== null`에서 축소). isRunning=true·currentRunId=null인
    // 레이스 구간(예: agentRun IPC resolve 직전)은 라우팅 불가능한 run이라 스냅샷해도
    // subscribeAgentEvents가 매칭할 runId가 없어 죽은 엔트리로만 남는다 — bgRuns에 넣지 않는다.
    if (leaving !== null && leaving !== id) {
      const cur = get()
      if (cur.currentRunId !== null) {
        const snapshot: ConversationRunState = {
          currentRunId: cur.currentRunId,
          thread: cur.thread,
          openGroupId: cur.openGroupId,
          openMsgId: cur.openMsgId,
          seq: cur.seq,
          changedFiles: cur.changedFiles,
          fileDiffs: cur.fileDiffs,
          isRunning: cur.isRunning,
          lastUsage: cur.lastUsage,
          lastContextWindow: cur.lastContextWindow,
          sessionId: cur.sessionId,
          activeLoops: cur.activeLoops,
          errorMessage: cur.errorMessage,
          thinkingText: cur.thinkingText,
          todos: cur.todos,
          subagents: cur.subagents,
          pendingPermission: cur.pendingPermission,
          pendingQuestion: cur.pendingQuestion,
          pendingCommand: cur.pendingCommand,
          messages: cur.messages,
          // P3b 봉합(🔴+🟡#1, reviewer) — AppState 밖의 대화-스코프 필드도 함께 스냅샷.
          // 없으면 B에서 리셋/변경된 값이 A 복귀 시 고착(workspaceRoot)되거나 새어든다(나머지).
          workspaceRoot: cur.workspaceRoot,
          attachedImages: cur.attachedImages,
          restoredSession: cur.restoredSession,
        }
        set((s) => {
          // P3b 봉합(🟡#3, reviewer) — LRU 캡: leaving이 이미 bgRuns에 있으면(재기록) 개수
          // 불변이라 evict 불필요. 새 엔트리 추가로 캡을 넘기면 가장 오래 삽입된 키부터 evict.
          const isNewEntry = !(leaving in s.bgRuns)
          let base = s.bgRuns
          if (isNewEntry && Object.keys(s.bgRuns).length >= BG_RUNS_CAP) {
            const oldestKey = Object.keys(s.bgRuns)[0]
            base = { ...s.bgRuns }
            delete base[oldestKey]
          }
          return { bgRuns: { ...base, [leaving]: snapshot } }
        })
      }
    }

    // ── P3b 2단계: 전환 대상이 백그라운드로 보존돼 있으면 그 스냅샷으로 복원 ─────────
    // (디스크 conversationLoad 우회 — seamless 이음). 소비: 복원 후 해당 키 삭제.
    const bg = get().bgRuns[id]
    if (bg) {
      // workspaceRoot는 신뢰경계(CRITICAL) 규율 대상 — bgRuns 스냅샷 값을 여기서 직접
      // set 금지. 아래에서 restoreWorkspaceFromCwd(IPC 재검증, ADR-020) 경유로만 반영한다
      // (디스크 로드 경로의 3단계와 동일한 규율). attachedImages/restoredSession은 대화별
      // renderer-only 표시 상태라 부수효과 없이 set으로 충분 — bg 스프레드에 그대로 포함.
      const bgWorkspaceRoot = bg.workspaceRoot
      set((s) => {
        const restBgRuns = { ...s.bgRuns }
        delete restBgRuns[id]
        return {
          ...bg,
          conversationId: id,
          // 전환 전 값 유지(직접 set 금지) — 필요 시 아래 restoreWorkspaceFromCwd가 갱신.
          workspaceRoot: s.workspaceRoot,
          bgRuns: restBgRuns,
        }
      })
      if (bgWorkspaceRoot && bgWorkspaceRoot !== get().workspaceRoot) {
        await get().restoreWorkspaceFromCwd(bgWorkspaceRoot)
      }
      // 마지막 활성 대화 id 영속 — 디스크 경로와 동일하게 유지.
      // CRITICAL: setPref는 캐시 갱신 + window.api.setUiPref 비동기(IPC). renderer untrusted.
      setPref('conversation.lastActiveId', id)
      return
    }

    // ── 기존 디스크 로드 경로 (P3a까지의 거동 그대로) ────────────────────────────
    const res = await window.api.conversationLoad({ id })
    if (!res?.conversations?.length) return // no-op: 없는 id / 비정상 응답
    const conv = res.conversations[0]

    // 1단계: 대화 상태 적용 (스트리밍·도구카드·오류·첨부 리셋 포함)
    const loadedMessages = conv.messages.map((m) => ({
      id: nextMsgId(),
      role: m.role,
      content: m.content,
    }))
    // Phase A-2: thread도 동기화
    const loadedThread: ThreadItem[] = loadedMessages.map((m) => ({
      kind: 'msg' as const,
      id: m.id,
      role: m.role,
      text: m.content,
    }))
    set({
      conversationId: conv.id,
      messages: loadedMessages,
      // Phase A-2: thread 세팅
      thread: loadedThread,
      openGroupId: null,
      openMsgId: null,
      seq: 0,
      // P3a(switch-continuity): 전환 대상은 디스크에서 로드된 비실행 대화 — 이전 대화의
      // currentRunId(예: run-a)가 그대로 남으면 누수 벡터(subscription 가드가 "여전히 활성"으로
      // 오인해 이전 run 이벤트를 통과시킴). ConversationRecord는 활성 run을 영속하지 않으므로
      // 항상 null로 정합한다(진행 중 run을 재개하는 개념이 아님 — 재개는 sessionId로 별도 처리).
      currentRunId: null,
      // 오류·첨부 리셋 (makeInitialState의 AppState 필드 부분)
      errorMessage: undefined,
      isRunning: false,
      attachedImages: [],
      // Phase 1.5: 전환한 대화의 영속 sessionId 복원 → resume 맥락 이음(없으면 undefined=새 세션).
      sessionId: conv.sessionId,
      // LR1: sessionId 보유 + 메시지 1개 이상일 때만 "복원됨" — 빈 대화/신규 세션엔 배지 미표시.
      restoredSession: Boolean(conv.sessionId) && loadedMessages.length > 0,
      // 표시 메타(게이지) 복원 → 재시작/전환 후 컨텍스트 게이지 즉시 표시(다음 턴 result 전까지).
      lastContextWindow: conv.lastContextWindow,
      lastUsage: conv.lastUsage,
      // 5c: 대화 전환 시 활성 루프 표시 리셋(stale 방지) — 전환 대화의 루프는 세션 이벤트로 갱신.
      activeLoops: [],
    })

    // 2단계: cwd 복원 (ADR-020) — 대화 state 적용 후 워크스페이스/트리/@멘션 base 갱신
    // CRITICAL(신뢰경계): 직접 set({workspaceRoot}) 금지 — restoreWorkspaceFromCwd 경유(main 재검증)
    // conv.cwd 없음 → 복원 안 함(전역 workspaceRoot 유지)
    // conv.cwd === 현재 workspaceRoot → 불필요 재오픈 방지(최적화)
    if (conv.cwd && conv.cwd !== get().workspaceRoot) {
      await get().restoreWorkspaceFromCwd(conv.cwd)
    }

    // 3단계: 마지막 활성 대화 id 영속 — 재시작 후 자동 복원 기준점.
    // CRITICAL: setPref는 캐시 갱신 + window.api.setUiPref 비동기(IPC). renderer untrusted.
    setPref('conversation.lastActiveId', conv.id)
  },

  renameConversation: async (id: string, title: string) => {
    const res = await window.api.conversationRename({ id, title })
    if (!res.ok) return
    // ok: 로컬 목록 해당 항목 title만 갱신 (전체 리로드 없이 즉시 반영)
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }))
  },

  deleteConversation: async (id: string) => {
    const res = await window.api.conversationDelete({ id })
    if (!res.ok) return
    // 목록에서 제거
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
    }))
    // P3b: 삭제된 대화의 백그라운드 run 스냅샷도 함께 evict — 디스크에서 지워진 대화로는
    // 다시 돌아올 수 없으므로(UI 목록에서도 제거됨) 고아 엔트리로 남지 않게 정리.
    set((s) => {
      if (!(id in s.bgRuns)) return s
      const restBgRuns = { ...s.bgRuns }
      delete restBgRuns[id]
      return { ...s, bgRuns: restBgRuns }
    })
    // 삭제된 대화가 현재 활성 대화이면 빈 대화로 리셋 + lastActiveId 무효화
    if (get().conversationId === id) {
      get().clearConversation()
      // 삭제된 대화가 활성 id이면 lastActiveId를 null로 → boot가 삭제된 대화 복원 시도 방지.
      // CRITICAL: setPref는 캐시 갱신 + window.api.setUiPref 비동기(IPC). renderer untrusted.
      setPref('conversation.lastActiveId', null)
    }
  },

  newConversation: () => {
    // clearConversation 재사용 — IPC 미호출, renderer 상태 리셋만
    get().clearConversation()
  },

  // ── 재시작 후 마지막 활성 단일챗 복원 ──────────────────────────────────
  restoreLastActiveConversation: async () => {
    // prefs 캐시(동기)에서 lastActiveId 읽기.
    // loadPrefs() 완료 전이거나 값이 null/undefined이면 null fallback → no-op.
    // CRITICAL: getPref는 renderer 인메모리 캐시 읽기 — fs/Node 직접 0.
    const lastId = getPref<string | null>('conversation.lastActiveId', null)
    if (!lastId) return
    // selectConversation은 없는 id이면 conversationLoad 빈 배열 → 내부 no-op(안전).
    // IPC는 selectConversation 내부 window.api.conversationLoad 경유 — renderer untrusted 준수.
    await get().selectConversation(lastId)
  },
})
