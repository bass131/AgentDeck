/**
 * slices/system.ts — 프로필·REPL·usage·backends 시스템 슬라이스 (P12 분해).
 *
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 * CRITICAL: renderer untrusted — window.api(화이트리스트)만. fs/Node/network 0.
 */
import type { StateCreator } from 'zustand'
import type { Profile, UsageInfo, BackendStatus } from '../../../../shared/ipc-contract'
import type { AppStore } from './types'

export interface SystemState {
  // ── 프로필 (P2 — 부트 게이트, window.api.getProfile/setProfile) ────────────
  /**
   * 로컬 사용자 프로필. null = 미설정/첫실행.
   * AppGate 부트 시 getProfile IPC로 로드.
   * 온보딩 제출 시 setProfile IPC 저장 후 갱신.
   * 컴포넌트는 selectProfile 셀렉터로 구독.
   */
  profile: Profile | null

  // ── Phase 5a: REPL 지속세션 기본 모드 (ADR-024) ──────────────────────────
  /**
   * REPL 모드 토글 — true(기본): 모든 세션 지속(persistent).
   * false: 헤드리스 단발(-p) 모드(명시 옵트아웃).
   *
   * 휘발(clearConversation/makeInitialState 미포함) — 사용자가 UI에서 토글한 설정은
   * 세션 전환 후에도 유지된다(세션 횡단 설정).
   * CRITICAL: renderer 상태만. IPC 0.
   */
  replMode: boolean
  /**
   * 현재 대화의 안정 sessionKey — 대화 라우팅 식별자 (Phase 5a).
   * conversationId가 있으면 그것을 사용. 없으면(새 대화) crypto.randomUUID()로 생성 후 보관.
   * clearConversation/대화전환 시 재생성(새 대화 = 새 키).
   * CRITICAL: renderer 상태만. IPC 0. 민감 정보 없음(단순 UUID/conversationId).
   */
  currentSessionKey: string

  // ── Usage (OAuth 레이트리밋 게이지 — B8 Phase 26) ────────────────────────
  /**
   * 5시간·주간 레이트리밋 게이지.
   * loadUsage() 액션으로 갱신(마운트 시 + run done/error 전이 시).
   * CRITICAL: 토큰/시크릿 미포함 — pct·resetsAt 파생값만.
   */
  usage: UsageInfo

  // ── 백엔드 프로바이더 상태 (B1 — 듀얼 프로바이더 패널) ─────────────────
  /**
   * 등록된 코딩 엔진(백엔드) 상태 목록.
   * loadBackends() 액션으로 갱신(설정 모달 VersionView 마운트 시).
   * CRITICAL(신뢰경계 — ADR-008): BackendStatus 6필드만 — 토큰/시크릿 0.
   */
  backends: BackendStatus[]
}

export interface SystemActions {
  /**
   * 프로필 상태를 store에 직접 동기화 (IPC 미호출, 인메모리만).
   * AppGate 부트 로드 완료 후, 또는 온보딩 제출 후 setProfile IPC 호출 직후 호출.
   * CRITICAL: window.api 호출 0 — 호출부 책임(AppGate에서 IPC 처리).
   */
  applyProfile: (profile: Profile | null) => void
  /**
   * REPL 모드를 설정한다 (renderer state, IPC 0).
   * true: 지속세션(기본). false: 단발 -p 모드(옵트아웃).
   * CRITICAL: IPC 미호출. 휘발 설정 — clearConversation 미포함.
   */
  setReplMode: (on: boolean) => void
  /**
   * window.api.getUsage() 호출 → usage 갱신.
   * 마운트 시 + run done/error 전이 시 호출. 실패 시 catch-and-ignore(조용히 무시).
   * CRITICAL: renderer untrusted — window.api.getUsage(화이트리스트)만 호출.
   */
  loadUsage: () => Promise<void>
  /**
   * window.api.listBackends() 호출 → backends 갱신.
   * 설정 모달 VersionView(Claude Code 탭) 마운트 시 호출. 실패 시 catch-and-ignore(빈 배열 유지).
   * CRITICAL: renderer untrusted — window.api.listBackends(화이트리스트)만 호출.
   */
  loadBackends: () => Promise<void>
}

export const createSystemSlice: StateCreator<AppStore, [], [], SystemState & SystemActions> = (set) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  profile: null, // P2: 부트 시 getProfile IPC로 로드, 초기값 null
  // Phase 5a: REPL 지속세션 기본 모드(ADR-024) — default true(모든 세션 지속)
  replMode: true,
  // Phase 5a: 안정 sessionKey — 신규 대화는 UUID 생성, 기존 대화는 conversationId 사용
  currentSessionKey: crypto.randomUUID(),
  usage: { fiveHour: null, weekly: null } as UsageInfo, // B8: OAuth 레이트리밋 게이지
  backends: [], // B1: 듀얼 프로바이더 상태(초기 빈 배열 — loadBackends()로 갱신)

  // ── 프로필 (P2) ──────────────────────────────────────────────────────────
  applyProfile: (profile) => {
    // renderer 상태 동기화만 — IPC 미호출. 호출부(AppGate)가 IPC 담당.
    set({ profile })
  },

  // ── Phase 5a: REPL 지속세션 기본 모드 토글 (ADR-024) ────────────────────
  setReplMode: (on) => {
    // renderer 상태만 — IPC 0. 사용자 토글 → store 갱신 → Composer 배지 등 리렌더.
    set({ replMode: on })
  },

  // ── Usage (OAuth 레이트리밋 게이지 — B8 Phase 26) ───────────────────────
  loadUsage: async () => {
    // IPC 경유 — renderer는 fs/Node/network 직접 0.
    // window.api.getUsage: 인자 없음, 응답 UsageInfo(pct·resetsAt만, 토큰/시크릿 0).
    // 마운트 시 + run done/error 전이 시 호출. 실패 시 catch-and-ignore(게이지 이전 상태 유지).
    try {
      const result = await window.api.getUsage()
      set({ usage: result })
    } catch {
      // 네트워크/IPC 실패: 게이지 이전 상태 유지 — 조용히 무시
    }
  },

  // ── 백엔드 프로바이더 상태 (B1 — 듀얼 프로바이더 패널) ─────────────────
  loadBackends: async () => {
    // IPC 경유 — renderer는 fs/Node/network 직접 0.
    // window.api.listBackends: 인자 없음, 응답 BackendStatus[](6필드만, 토큰/시크릿 0).
    // 설정 모달 VersionView 마운트 시 호출. 실패 시 catch-and-ignore(빈 배열 유지).
    try {
      const result = await window.api.listBackends()
      set({ backends: result })
    } catch {
      // IPC 실패: 빈 배열 유지 — 조용히 무시
    }
  },
})
