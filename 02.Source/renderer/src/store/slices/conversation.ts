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
import { buildConversationSavePayload, rebuildThreadWithSubagents, freezePersistedSubagents } from './conversationPayload'
import { getReplModeDefault } from '../../lib/replModeDefault'
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
    const loadedThread: Extract<ThreadItem, { kind: 'msg' }>[] = loadedMessages.map((m) => ({
      kind: 'msg' as const,
      id: m.id,
      role: m.role,
      text: m.content,
    }))
    // CP1 P05: 영속된 서브에이전트 앵커로 thread 재구성(맨앞/중간/맨끝 위치 복원).
    // conv.subagents 미설정(기존 대화) → rebuildThreadWithSubagents가 loadedThread 그대로 반환(회귀 0).
    set({
      conversationId: conv.id,
      messages: loadedMessages,
      thread: rebuildThreadWithSubagents(loadedThread, conv.subagents),
      openGroupId: null,
      openMsgId: null,
      seq: 0,
      runGeneration: null,
      // Phase 1.5: 영속된 sessionId 복원 → 다음 메시지가 resume으로 맥락 이음(재시작 후에도).
      sessionId: conv.sessionId,
      // LR1: sessionId 보유 + 메시지 1개 이상일 때만 "복원됨" — 빈 대화/신규 세션엔 배지 미표시.
      restoredSession: Boolean(conv.sessionId) && loadedMessages.length > 0,
      // CP1 P05: done 동결 스냅샷 복원(표시용, ADR-024 — SDK 세션 재주입 아님). 없으면 []
      // (S9b와 동형 — stale 서브에이전트 카드 미노출).
      subagents: freezePersistedSubagents(conv.subagents),
      // LR4 P07: 대화별 replMode 복원 — 없으면(옛 레코드/마이그 전) getReplModeDefault()
      // (전역 pref 마이그 시드) 폴백.
      replMode: conv.replMode ?? getReplModeDefault(),
    })
  },

  saveConversation: async () => {
    const { conversationId, workspaceRoot, sessionId, lastContextWindow, lastUsage, thread, subagents, replMode } = get()
    // Phase A-2: thread의 msg 항목에서 파생.
    // P3c: payload 빌드는 buildConversationSavePayload(conversationPayload.ts)로 DRY 추출 —
    // bg 경로(runtime.ts)와 동일 로직 공유. threadMsgs 빈 경우 null(기존 조기 return과 동형).
    // CP1 P05(4지점 배선 외 추가 — 전경/활성 경로): subagents를 전달하지 않으면
    // computeSubagentAnchors가 항상 []를 반환해, 스위치되지 않고 계속 활성 상태로 남는
    // "일반적인" 대화에서는 서브에이전트가 영원히 저장되지 않는다(bg 경로만 커버됨).
    // get()의 subagents(state.subagents, SubAgentInfo[])를 그대로 전달.
    // LR4 P07: replMode(현재 활성 대화 값)도 함께 전달 — buildConversationSavePayload가
    // undefined만 omit(false는 유효값으로 보존).
    const convPayload = buildConversationSavePayload(
      { thread, workspaceRoot, sessionId, lastContextWindow, lastUsage, subagents, replMode },
      conversationId ?? undefined
    )
    if (!convPayload) return
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
    // LR4 P04: runGeneration은 RuntimeState 소유라 여기서 명시적으로 null 리셋.
    // Phase A-2: makeInitialState()에 thread:[], openGroupId:null, openMsgId:null, seq:0 포함
    // Phase 5a: 새 대화 = 새 sessionKey 재생성(이전 대화 키와 분리).
    // LR4 P07: replMode는 이제 대화별 설정 — "세션 횡단 유지"가 아니라 새 대화는
    // getReplModeDefault()(마이그 시드 폴백)로 시작한다(직전 대화의 토글이 새지 않음).
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
        runGeneration: null,
        currentSessionKey: crypto.randomUUID(),
        // LR1: 새 대화는 복원된 적 없음 — 배지 미표시.
        restoredSession: false,
        bgRuns: restBgRuns,
        // LR4 P07: 세션별 replMode — 새 대화는 마이그 시드 폴백값으로 시작.
        replMode: getReplModeDefault(),
      }
    })
  },
})
