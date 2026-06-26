/**
 * slices/multiSession.ts — 멀티세션 CRUD 슬라이스 (P12 분해, 1단계).
 *
 * multiSessions 요약 목록 + activeMultiSessionId. 단일챗 conversations 슬라이스와 완전 분리.
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 * CRITICAL: renderer untrusted — window.api.multiSessionLoad/Save 경유만. fs/Node 0.
 */
import type { StateCreator } from 'zustand'
import type { PersistedMultiState, PersistedMultiSession } from '../../../../shared/ipc-contract'
import type { AppStore, MultiSessionSummary } from './types'

export interface MultiSessionState {
  /**
   * 사이드바 멀티세션 요약 목록.
   * loadMultiSessions() 액션으로 갱신.
   * 단일챗 conversations 슬라이스와 완전 분리.
   */
  multiSessions: MultiSessionSummary[]
  /**
   * 현재 활성 멀티세션 ID.
   * selectMultiSession(id) 로 갱신.
   */
  activeMultiSessionId: string
}

export interface MultiSessionActions {
  /**
   * 디스크에서 멀티세션 전체 상태 로드 → multiSessions·activeMultiSessionId 갱신.
   * sessions 없으면(최초 실행) 새 세션 1개 자동 생성 + save.
   */
  loadMultiSessions: () => Promise<void>
  /**
   * 새 멀티세션 추가(RMW).
   * id=crypto.randomUUID(), title='', count=2, panels=[]. 기존 세션을 read→append→write하여 보존.
   */
  newMultiSession: () => Promise<void>
  /** 특정 멀티세션 선택 → activeMultiSessionId 갱신 + RMW로 디스크 기록. */
  selectMultiSession: (id: string) => Promise<void>
  /**
   * 특정 멀티세션 삭제(RMW).
   * 활성 세션 삭제 시 남은 첫 세션 활성화(없으면 새 세션 생성).
   */
  deleteMultiSession: (id: string) => Promise<void>
  /** 멀티세션 제목 변경(RMW). title cap(200자) + trim 후 저장. untrusted 입력. */
  renameMultiSession: (id: string, title: string) => Promise<void>
}

export const createMultiSessionSlice: StateCreator<AppStore, [], [], MultiSessionState & MultiSessionActions> = (set) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  multiSessions: [], // 멀티세션 슬라이스 (1단계)
  activeMultiSessionId: '', // 현재 활성 멀티세션 ID

  // ── 멀티세션 CRUD (1단계) ─────────────────────────────────────────────────
  loadMultiSessions: async () => {
    // IPC 경유 — renderer는 fs/Node 직접 0.
    // 방어 가드: window.api 미목/미존재 환경에서 unhandled rejection 방지(테스트 graceful).
    if (
      typeof window?.api?.multiSessionLoad !== 'function' ||
      typeof window?.api?.multiSessionSave !== 'function'
    ) return
    const res = await window.api.multiSessionLoad()
    const loaded = res.state

    // sessions 없음 or 최초 실행 → 새 세션 자동 생성
    if (!loaded || loaded.sessions.length === 0) {
      const newId = crypto.randomUUID()
      const newSession: PersistedMultiSession = { id: newId, title: '', count: 2, panels: [] }
      const newState: PersistedMultiState = {
        version: 2,
        activeSessionId: newId,
        sessions: [newSession],
      }
      await window.api.multiSessionSave(newState)
      set({
        multiSessions: [{ id: newId, title: '', count: 2 }],
        activeMultiSessionId: newId,
      })
      return
    }

    const summaries: MultiSessionSummary[] = loaded.sessions.map((s) => ({
      id: s.id,
      title: s.title ?? '',
      count: s.count,
    }))
    set({
      multiSessions: summaries,
      activeMultiSessionId: loaded.activeSessionId,
    })
  },

  newMultiSession: async () => {
    // RMW: 디스크 read → 새 세션 append → write → store 갱신
    const res = await window.api.multiSessionLoad()
    const base = res.state ?? { version: 2, activeSessionId: '', sessions: [] }
    const newId = crypto.randomUUID()
    const newSession: PersistedMultiSession = { id: newId, title: '', count: 2, panels: [] }
    const updatedSessions = [...base.sessions, newSession]
    const newState: PersistedMultiState = {
      version: 2,
      activeSessionId: newId,
      sessions: updatedSessions,
    }
    await window.api.multiSessionSave(newState)
    // store 갱신 — 단일챗 conversations 무영향
    set((s) => ({
      multiSessions: updatedSessions.map((sess) => ({
        id: sess.id,
        title: sess.title ?? '',
        count: sess.count,
      })),
      activeMultiSessionId: newId,
      // 단일챗 필드 미변경: conversations·conversationId 보존 (spread 없이 필드 지정)
      conversations: s.conversations,
      conversationId: s.conversationId,
    }))
  },

  selectMultiSession: async (id: string) => {
    // activeMultiSessionId 즉시 갱신 (optimistic)
    set({ activeMultiSessionId: id })
    // RMW: 디스크 read → activeSessionId 변경 → write
    const res = await window.api.multiSessionLoad()
    const base = res.state ?? { version: 2, activeSessionId: id, sessions: [] }
    const newState: PersistedMultiState = {
      ...base,
      activeSessionId: id,
    }
    await window.api.multiSessionSave(newState)
  },

  deleteMultiSession: async (id: string) => {
    // RMW: 디스크 read → 세션 제거 → 활성 재결정 → write
    const res = await window.api.multiSessionLoad()
    const base = res.state ?? { version: 2, activeSessionId: '', sessions: [] }
    const remaining = base.sessions.filter((s) => s.id !== id)

    let newActiveId: string
    if (remaining.length === 0) {
      // 남은 세션 없음 → 새 세션 자동 생성
      const newId = crypto.randomUUID()
      remaining.push({ id: newId, title: '', count: 2, panels: [] })
      newActiveId = newId
    } else if (base.activeSessionId === id) {
      // 활성 세션 삭제 → 남은 첫 세션 활성화
      newActiveId = remaining[0].id
    } else {
      newActiveId = base.activeSessionId
    }

    const newState: PersistedMultiState = {
      version: 2,
      activeSessionId: newActiveId,
      sessions: remaining,
    }
    await window.api.multiSessionSave(newState)
    set({
      multiSessions: remaining.map((s) => ({
        id: s.id,
        title: s.title ?? '',
        count: s.count,
      })),
      activeMultiSessionId: newActiveId,
    })
  },

  renameMultiSession: async (id: string, title: string) => {
    // title untrusted: cap(200자) + trim
    const safeTitle = title.trim().slice(0, 200)
    // RMW: 디스크 read → title 갱신 → write
    const res = await window.api.multiSessionLoad()
    const base = res.state ?? { version: 2, activeSessionId: '', sessions: [] }
    const updatedSessions: PersistedMultiSession[] = base.sessions.map((s) =>
      s.id === id ? { ...s, title: safeTitle } : s
    )
    const newState: PersistedMultiState = {
      ...base,
      sessions: updatedSessions,
    }
    await window.api.multiSessionSave(newState)
    // store 목록 갱신
    set((s) => ({
      multiSessions: s.multiSessions.map((ms) =>
        ms.id === id ? { ...ms, title: safeTitle } : ms
      ),
    }))
  },
})
