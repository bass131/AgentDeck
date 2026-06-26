/**
 * appStore.ts — Zustand 전역 store (조립 루트, P12 분해).
 *
 * 단방향 흐름: window.api.onAgentEvent → applyAgentEvent(reducer) → state → 컴포넌트.
 * 컴포넌트는 window.api를 직접 호출하지 않고 액션 함수를 통해서만 호출한다.
 *
 * P12 분해: 도메인 슬라이스(slices/*.ts)로 분리하고 여기서 합성한다.
 *   슬라이스는 (set, get)을 공유 → 교차 결합은 get().xxx() 형태로 보존(거동 불변).
 *   useAppStore + 셀렉터 + 공유 타입을 이 경로에서 re-export → store 밖 import 표면 불변.
 *
 * CRITICAL: renderer untrusted — fs/Node/require 직접 호출 0.
 */
import { create } from 'zustand'
import { makeInitialState } from './reducer'

import { createSystemSlice } from './slices/system'
import { createWorkspaceSlice } from './slices/workspace'
import { createViewerSlice } from './slices/viewer'
import { createConversationSlice } from './slices/conversation'
import { createSessionListSlice } from './slices/sessions'
import { createMultiSessionSlice } from './slices/multiSession'
import { createComposerSlice } from './slices/composer'
import { createRuntimeSlice } from './slices/runtime'
import { createLoopSlice } from './slices/loop'

import type { AppStore } from './slices/types'

/**
 * 전역 store 조립.
 * makeInitialState()(AppState 초기값) + 9개 도메인 슬라이스(상태 초기값 + 액션)를 spread 합성.
 * 키 충돌 0(각 필드/액션은 한 슬라이스 소유) → spread 순서 무관(거동 불변).
 */
export const useAppStore = create<AppStore>()((...a) => ({
  // ── AppState 초기값 (runtime 코어 — reducer 단일 출처) ──────────────────────
  ...makeInitialState(),
  // ── 도메인 슬라이스 (상태 초기값 + 액션) ────────────────────────────────────
  ...createSystemSlice(...a),
  ...createWorkspaceSlice(...a),
  ...createViewerSlice(...a),
  ...createConversationSlice(...a),
  ...createSessionListSlice(...a),
  ...createMultiSessionSlice(...a),
  ...createComposerSlice(...a),
  ...createRuntimeSlice(...a),
  ...createLoopSlice(...a),
}))

// ── 타입 re-export (외부 import 표면 불변) ────────────────────────────────────
export type {
  AppStore,
  StoreState,
  ReferenceEntry,
  OpenedStatus,
  AttachedImage,
  QueuedMessage,
  MultiSessionSummary,
  ConversationEntry,
} from './slices/types'

// ── 셀렉터 + computeTaskScope + TaskScope re-export ───────────────────────────
export * from './slices/selector'
