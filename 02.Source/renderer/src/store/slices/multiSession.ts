/**
 * slices/multiSession.ts — 멀티세션 CRUD 슬라이스 (P12 분해, 1단계 / RMW1-P04 명령 이관).
 *
 * multiSessions 요약 목록 + activeMultiSessionId. 단일챗 conversations 슬라이스와 완전 분리.
 * ADR-031(RMW1): renderer 분산 RMW(read-modify-write)를 폐기하고 의도 명령
 * (multiCmdCreate/Select/Delete/Rename, LOAD는 유지)으로 이관. main이 read→merge→write를
 * 단일 원자 블록(단일 기록자)으로 실행 — 응답의 권위 PersistedMultiState로 Zustand 미러를
 * 동기화한다("명령 보내고 응답으로 수렴", 로컬에서 먼저 병합해 낙관적으로 확정하지 않는다).
 * CRITICAL: renderer untrusted — window.api.multiSessionLoad(읽기)+multiCmd*(명령) 경유만. fs/Node 0.
 */
import type { StateCreator } from 'zustand'
import type { PersistedMultiState } from '../../../../shared/ipc-contract'
import type { AppStore, MultiSessionSummary } from './types'
import { disposePanelManagerSessionsByPrefix, panelSlotKeyPrefix } from '../panelSession'

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
   * sessions 없으면(최초 실행) multiCmdCreate 명령으로 새 세션 1개 자동 생성(main이 원자 기록).
   */
  loadMultiSessions: () => Promise<void>
  /**
   * 새 멀티세션 추가(명령 1발 — ADR-031).
   * id는 main이 발급(title=''·count=2·panels=[] 고정) + 즉시 활성화. 응답 권위 상태로 미러 동기화.
   */
  newMultiSession: () => Promise<void>
  /** 특정 멀티세션 선택 → activeMultiSessionId 즉시 갱신(optimistic) + 명령(select)으로 디스크 기록·응답 수렴. */
  selectMultiSession: (id: string) => Promise<void>
  /**
   * 특정 멀티세션 삭제(명령 1발 — ADR-031).
   * 활성 재계산(남은 첫 세션 활성화, 없으면 새 세션 자동생성)은 main 책임 — renderer는 응답 미러만.
   */
  deleteMultiSession: (id: string) => Promise<void>
  /** 멀티세션 제목 변경(명령 1발 — ADR-031). title trim+cap(200자) 검증은 main 책임, untrusted 입력을 그대로 전달. */
  renameMultiSession: (id: string, title: string) => Promise<void>
}

/**
 * MultiCmdResponse.state(main 병합 후 권위 상태) → Zustand 미러(multiSessions/activeMultiSessionId) 변환.
 *
 * 명령 응답을 받는 모든 호출처(이 슬라이스의 CRUD 4종 + hooks/useMultiPersist.ts의 디바운스
 * 저장)가 공유하는 단일 정의 — 미러링 로직이 여러 곳에 흩어져 드리프트하는 것을 방지한다.
 * ok:false(예: 미지 id upsert/select — stale 명령)여도 state는 여전히 main의 권위 상태이므로
 * 그대로 수렴시킨다(로컬 낙관값을 고집하지 않는다).
 */
export function mirrorFromState(
  state: PersistedMultiState
): Pick<MultiSessionState, 'multiSessions' | 'activeMultiSessionId'> {
  return {
    multiSessions: state.sessions.map((s) => ({
      id: s.id,
      title: s.title ?? '',
      count: s.count,
    })),
    activeMultiSessionId: state.activeSessionId,
  }
}

export const createMultiSessionSlice: StateCreator<AppStore, [], [], MultiSessionState & MultiSessionActions> = (set) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  multiSessions: [], // 멀티세션 슬라이스 (1단계)
  activeMultiSessionId: '', // 현재 활성 멀티세션 ID

  // ── 멀티세션 CRUD (RMW1-P04: 명령 이관) ─────────────────────────────────────
  loadMultiSessions: async () => {
    // IPC 경유(읽기) — renderer는 fs/Node 직접 0.
    // 방어 가드: window.api 미목/미존재 환경에서 unhandled rejection 방지(테스트 graceful).
    if (typeof window?.api?.multiSessionLoad !== 'function') return
    const res = await window.api.multiSessionLoad()
    const loaded = res.state

    // sessions 없음 or 최초 실행 → 명령(create)으로 새 세션 자동 생성(main이 발급+원자 기록)
    if (!loaded || loaded.sessions.length === 0) {
      if (typeof window?.api?.multiCmdCreate !== 'function') return
      const cmdRes = await window.api.multiCmdCreate()
      set(mirrorFromState(cmdRes.state))
      return
    }

    set(mirrorFromState(loaded))
  },

  newMultiSession: async () => {
    // 명령 1발 — id는 main이 발급, 즉시 활성화, 원자 기록(ADR-031).
    const res = await window.api.multiCmdCreate()
    set(mirrorFromState(res.state))
  },

  selectMultiSession: async (id: string) => {
    // activeMultiSessionId 즉시 갱신 (optimistic)
    set({ activeMultiSessionId: id })
    // 명령 1발 — 응답 권위 상태로 수렴(미지 id면 main이 no-op+ok:false여도 state로 수렴).
    const res = await window.api.multiCmdSelect(id)
    set(mirrorFromState(res.state))
  },

  deleteMultiSession: async (id: string) => {
    // 명령 1발 — 활성 재계산·마지막 세션 자동생성은 main 책임(ADR-031).
    const res = await window.api.multiCmdDelete(id)
    set(mirrorFromState(res.state))
    // Phase 07(LR3): 세션 영구 삭제 — 이 세션의 6슬롯이 앱 수명 매니저(usePanelSlot,
    // store/panelSession.ts)에 라이브 상태를 갖고 있었다면 폐기(진행 중이면 agentAbort 후
    // 정리). "다시 돌아올 수 없는" 폐기 지점이므로 화면 이탈(보존)과 달리 여기서는
    // 명시적으로 청소한다 — 고스트 run·앱 수명 상주 상태 누수 방지.
    disposePanelManagerSessionsByPrefix(panelSlotKeyPrefix(id))
  },

  renameMultiSession: async (id: string, title: string) => {
    // 명령 1발 — trim+cap 검증은 main 책임(ADR-031); 발사체는 원본 title 그대로 전달.
    const res = await window.api.multiCmdRename(id, title)
    set(mirrorFromState(res.state))
  },
})
