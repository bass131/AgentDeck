/**
 * slices/conversation.ts — 현재 대화 슬라이스 (P12 분해).
 *
 * messages(thread-파생 투영)·conversationId·backendLabel + 대화 영속화/초기화 액션.
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 *
 * 슬라이스 cross-call(get() 결합 보존):
 *   - saveConversation → get().listConversations() (sessionList)
 *   - clearConversation: makeInitialState()(AppState) + composer/loop/system 필드 평면 리셋
 *
 * CRITICAL: renderer untrusted — window.api(화이트리스트)만. fs/Node 0.
 */
import type { StateCreator } from 'zustand'
import type { ThreadItem } from '../threadTypes'
import { makeInitialState } from '../reducer'
import { setPref } from '../../lib/prefs'
import { nextMsgId } from './ids'
import type { AppStore, ConversationEntry } from './types'

export interface ConversationState {
  /**
   * 확정된 대화 항목 목록 (Deprecated: Phase A-2 이후 thread가 진실).
   * 하위호환·Composer history 파생용으로 유지 — thread.filter(kind==='msg')에서 파생.
   * saveConversation/loadConversation/selectConversation에서 thread와 동기화.
   */
  messages: ConversationEntry[]
  /** 현재 대화 ID (conversationSave/Load용) */
  conversationId: string | null
  /** 백엔드 라벨 — Phase 05: 고정 텍스트 'Claude Code' */
  backendLabel: string
  /**
   * 현재 활성 대화가 디스크에서 복원되어 sessionId(resume 활성)를 가진 경우 true (LR1).
   * loadConversation/selectConversation(sessions.ts)에서 conv.sessionId 존재 + 메시지 1개 이상일 때만 true —
   * 그 외(이번 세션에서 갓 시작한 신규 대화)는 false. "맥락 복원됨" 배지(Conversation.tsx) 표시조건.
   * 휘발(영속 X) — 매 로드 시점에 다시 파생. clearConversation/newConversation에서 false로 리셋.
   */
  restoredSession: boolean
}

export interface ConversationActions {
  /** 마운트 시 최근 대화 로드 */
  loadConversation: () => Promise<void>
  /** 메시지 추가 후 저장 */
  saveConversation: () => Promise<void>
  /**
   * 현재 대화를 초기화하고 새 대화를 시작한다.
   * messages·streamingText·toolCards·errorMessage·conversationId를 리셋.
   * /clear 슬래시 인터셉트 + Sidebar "새 대화" 버튼에서 사용.
   * CRITICAL: renderer 상태 리셋만 — IPC 미호출, fs 접근 0.
   */
  clearConversation: () => void
}

export const createConversationSlice: StateCreator<AppStore, [], [], ConversationState & ConversationActions> = (set, get) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  messages: [],
  conversationId: null,
  backendLabel: 'Claude Code',
  restoredSession: false,

  // ── 대화 영속화 ──────────────────────────────────────────────────────────
  loadConversation: async () => {
    const res = await window.api.conversationLoad({ limit: 1 })
    if (res.conversations.length === 0) return
    const conv = res.conversations[0]
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
      thread: loadedThread,
      openGroupId: null,
      openMsgId: null,
      seq: 0,
      // Phase 1.5: 영속된 sessionId 복원 → 다음 메시지가 resume으로 맥락 이음(재시작 후에도).
      sessionId: conv.sessionId,
      // LR1: sessionId 보유 + 메시지 1개 이상일 때만 "복원됨" — 빈 대화/신규 세션엔 배지 미표시.
      restoredSession: Boolean(conv.sessionId) && loadedMessages.length > 0,
    })
  },

  saveConversation: async () => {
    const { conversationId, workspaceRoot, sessionId, lastContextWindow, lastUsage } = get()
    // Phase A-2: thread의 msg 항목에서 파생
    const threadMsgs = get().thread
      .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
    if (threadMsgs.length === 0) return
    const messages = threadMsgs.map((m) => ({ role: m.role, content: m.text }))
    // ConversationSaveRequest: id optional (intersection trick) → 명시적 캐스트
    type SaveConv = Parameters<typeof window.api.conversationSave>[0]['conversation']
    const convPayload: SaveConv = {
      id: conversationId ?? (undefined as unknown as string),
      title: (threadMsgs[0]?.text ?? '').slice(0, 40) || 'untitled',
      messages,
      backendId: 'claude-code',
      // ADR-020: 현재 워크스페이스를 대화에 앵커. null이면 미포함(기존 대화 호환).
      ...(workspaceRoot != null ? { cwd: workspaceRoot } : {}),
      // Phase 1.5: 세션 ID 영속 → 재시작 후 로드 시 resume으로 맥락 복원. 빈/누락 미포함.
      ...(sessionId ? { sessionId } : {}),
      // 표시 메타(게이지) 영속 → 재시작 후 컨텍스트 게이지 즉시 복원(다음 턴 전까지 빈 게이지 방지).
      ...(lastContextWindow !== undefined ? { lastContextWindow } : {}),
      ...(lastUsage !== undefined ? { lastUsage } : {}),
    }
    const res = await window.api.conversationSave({
      conversation: convPayload,
    })
    if (!conversationId) {
      set({ conversationId: res.id })
      // 신규 대화 id 발급 시: 마지막 활성 대화 id 영속 → 재시작 후 자동 복원 기준점.
      // 기존 대화(conversationId 존재)는 selectConversation에서 이미 기록됨.
      // CRITICAL: setPref는 캐시 갱신 + window.api.setUiPref 비동기(IPC). renderer untrusted.
      setPref('conversation.lastActiveId', res.id)
    }
    // 23b: 목록 즉시 갱신 — 신규 대화가 사이드바에 반영됨.
    // listConversations는 읽기 전용(saveConversation 미호출) → 무한루프 없음.
    void get().listConversations()
  },

  // ── 대화 초기화 (22a) ────────────────────────────────────────────────────
  clearConversation: () => {
    // renderer 상태 리셋만 — IPC/fs 0. 단방향: 상태 → 뷰.
    // makeInitialState()로 AppState(streamingText·toolCards·changedFiles·isRunning 등) 리셋 +
    // messages·conversationId(StoreState 추가 필드)도 함께 초기화.
    // 22c: attachedImages도 함께 리셋.
    // 22d: queue도 함께 리셋.
    // 24a: thinkingText·todos는 makeInitialState()에 포함(null·[]).
    // 24b: subagents는 makeInitialState()에 포함([]).
    // 24c: pendingPermission은 makeInitialState()에 포함(null).
    // 24d: pendingQuestion은 makeInitialState()에 포함(null).
    // Phase A-2: makeInitialState()에 thread:[], openGroupId:null, openMsgId:null, seq:0 포함
    // Phase 5a: 새 대화 = 새 sessionKey 재생성(이전 대화 키와 분리).
    //           replMode는 미포함(사용자 토글 설정 — 세션 전환 후에도 유지).
    // P3b: 클리어되는 대화 id에 남아있는 백그라운드 run 스냅샷도 함께 evict(고아 방지).
    // 보통은 없음(bg 스냅샷은 selectConversation 복원 시 즉시 소비됨) — 방어적 정리.
    set((s) => {
      const clearedId = s.conversationId
      const restBgRuns = clearedId !== null && clearedId in s.bgRuns
        ? (() => { const rest = { ...s.bgRuns }; delete rest[clearedId]; return rest })()
        : s.bgRuns
      return {
        ...makeInitialState(),
        messages: [],
        conversationId: null,
        attachedImages: [],
        queue: [],
        activeLoop: null,
        currentSessionKey: crypto.randomUUID(),
        // LR1: 새 대화는 복원된 적 없음 — 배지 미표시.
        restoredSession: false,
        bgRuns: restBgRuns,
      }
    })
  },
})
