/**
 * slices/loop.ts — 앱 레벨 /loop 슬라이스 (P12 분해, 9번째 슬라이스).
 *
 * activeLoop 휘발 상태 + startLoop/tickLoop/stopLoop/dismissLoop.
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 * CRITICAL: startedAt 스탬프(Date.now())는 액션 레이어이므로 impure 허용(reducer 밖).
 */
import type { StateCreator } from 'zustand'
import type { ActiveLoop, LoopStopReason } from '../../lib/loopCommand'
import type { AppStore } from './types'

export interface LoopState {
  /**
   * 활성 루프 상태(단일 대화). null = 루프 없음.
   * `/loop [interval] <prompt>` 인터셉트 시 startLoop()로 설정 → busy→idle 전이마다
   * 다음 틱 재dispatch. 정지 3경로(사용자 `/loop stop`·인디케이터 버튼·abort)를 stopLoop()로 수렴.
   *
   * CRITICAL: 휘발(영속 X — snapshotForPersist 미포함). 타이머는 reducer 밖(컴포넌트 effect).
   * 멀티 패널은 PanelView 컴포넌트 로컬에서 별도 관리(패널 격리 — 이 필드 미사용).
   */
  activeLoop: ActiveLoop | null
}

export interface LoopActions {
  /**
   * 루프 시작 — activeLoop를 running으로 설정(tickCount 0, startedAt=now).
   * `/loop [interval] <prompt>` 인터셉트가 호출. 첫 틱은 호출부가 즉시 dispatch.
   * CRITICAL: startedAt 스탬프(Date.now())는 액션 레이어이므로 impure 허용(reducer 밖).
   */
  startLoop: (params: { prompt: string; intervalMs: number; picker?: { model: string; effort: string; mode: string } }) => void
  /** 틱 카운트 증가 — 매 루프 dispatch 직전 호출(안전 가드 분모). activeLoop 없으면 no-op. */
  tickLoop: () => void
  /**
   * 루프 정지 — 정지 3경로 수렴(🔴#3).
   * 'user'/'abort' → activeLoop null(인디케이터 제거). 'max-ticks'/'max-duration' →
   * status='stopped' + stopReason 유지(상한 알림 표시, 사용자가 dismissLoop로 닫음).
   */
  stopLoop: (reason: LoopStopReason) => void
  /** 정지된(stopped) 인디케이터 닫기 → activeLoop null. */
  dismissLoop: () => void
}

export const createLoopSlice: StateCreator<AppStore, [], [], LoopState & LoopActions> = (set) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  activeLoop: null, // 앱 레벨 /loop — 활성 루프 휘발 상태

  // ── 앱 레벨 /loop ─────────────────────────
  startLoop: ({ prompt, intervalMs, picker }) => {
    set({
      activeLoop: {
        prompt,
        intervalMs,
        ...(picker ? { picker } : {}),
        tickCount: 0,
        status: 'running',
        startedAt: Date.now(),
      },
    })
  },

  tickLoop: () => {
    set((s) => (s.activeLoop ? { activeLoop: { ...s.activeLoop, tickCount: s.activeLoop.tickCount + 1 } } : {}))
  },

  stopLoop: (reason) => {
    if (reason === 'max-ticks' || reason === 'max-duration') {
      // 상한 도달 — 인디케이터 유지(stopped + 사유). 사용자가 dismissLoop로 닫음.
      set((s) => (s.activeLoop ? { activeLoop: { ...s.activeLoop, status: 'stopped', stopReason: reason } } : {}))
    } else {
      // 사용자/abort — 즉시 제거.
      set({ activeLoop: null })
    }
  },

  dismissLoop: () => {
    set({ activeLoop: null })
  },
})
