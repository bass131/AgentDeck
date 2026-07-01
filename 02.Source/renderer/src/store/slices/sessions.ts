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
import type { AppStore } from './types'

export interface SessionListState {
  /**
   * 사이드바에 표시할 대화 목록 (최근 20개).
   * listConversations() 액션으로 갱신. 초기값 [].
   */
  conversations: ConversationRecord[]
}

export interface SessionListActions {
  /** 최근 대화 목록 로드 → conversations 갱신. limit:20, id 미지정(목록 모드). */
  listConversations: () => Promise<void>
  /**
   * 특정 대화 선택 → 해당 대화의 메시지를 현재 대화로 로드.
   * conversationLoad({id}) IPC 경유. 없는 id면 no-op. streaming·toolCards·errorMessage·attachedImages 리셋.
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

  // ── 세션 CRUD (23b) ──────────────────────────────────────────────────────
  listConversations: async () => {
    // id 미지정 → 최근 목록 모드 (읽기 전용, saveConversation 미호출 → 무한루프 없음)
    // 응답이 비정상(undefined)이어도 크래시 없이 빈 목록 유지(방어적).
    const res = await window.api.conversationLoad({ limit: 20 })
    set({ conversations: res?.conversations ?? [] })
  },

  selectConversation: async (id: string) => {
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
