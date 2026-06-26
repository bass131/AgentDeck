/**
 * slices/types.ts — store 공유 타입 + 슬라이스 합성 (P12 분해).
 *
 * 슬라이스 간 공유 소형 타입(ReferenceEntry·OpenedStatus·AttachedImage·QueuedMessage·
 * MultiSessionSummary·ConversationEntry)을 단일 정의하고, 각 슬라이스의 State/Actions 인터페이스를
 * intersection으로 합쳐 StoreState·StoreActions·AppStore를 조립한다.
 *
 * 순환 import 주의: 슬라이스 파일은 여기서 AppStore(+공유타입)를 import하고,
 *   여기서는 슬라이스의 State/Actions 인터페이스를 import한다(타입 전용 — ESLint cycle 규칙 없음, 런타임 0).
 */
import type { FileTreeNode } from '../../../../shared/ipc-contract'
import type { AppState } from '../reducer'
import type { OpenedViewer } from '../../lib/viewer'

import type { SystemState, SystemActions } from './system'
import type { WorkspaceState, WorkspaceActions } from './workspace'
import type { ViewerState, ViewerActions } from './viewer'
import type { ConversationState, ConversationActions } from './conversation'
import type { SessionListState, SessionListActions } from './sessions'
import type { MultiSessionState, MultiSessionActions } from './multiSession'
import type { ComposerState, ComposerActions } from './composer'
import type { RuntimeActions } from './runtime'
import type { LoopState, LoopActions } from './loop'

// re-export 편의 — 일부 슬라이스가 OpenedViewer를 타입 시그니처에 사용
export type { OpenedViewer }

// ── 레퍼런스 폴더 상태 ──────────────────────────────────────────────────────────

/** store 내 레퍼런스 폴더 항목 (tree는 로드 후 채워짐) */
export interface ReferenceEntry {
  id: string
  name: string
  tree: FileTreeNode | null
}

// ── 코드 뷰어 상태 ─────────────────────────────────────────────────────────────

/** 코드 뷰어 로드 상태 */
export type OpenedStatus = 'idle' | 'loading' | 'ready' | 'too-large' | 'binary-skipped' | 'not-found'

// ── 추가 UI 상태 ───────────────────────────────────────────────────────────────

/**
 * 이미지 첨부 항목 (22c).
 * path = 엔진 노트용 절대경로, dataUrl = 표시용 data URL.
 */
export interface AttachedImage {
  path: string
  dataUrl: string
}

/**
 * 예약 큐 항목 (22d).
 * 실행 중(isRunning)에 Enter/예약버튼으로 적재, busy→idle 전이 시 FIFO 드레인.
 */
export interface QueuedMessage {
  id: string
  text: string
  images: AttachedImage[]
  picker?: { model: string; effort: string; mode: string; orchestration?: boolean }
}

/**
 * 사이드바 멀티세션 목록 행 표시 단위.
 * PersistedMultiSession에서 파생 — panels 제외(UI 미필요).
 */
export interface MultiSessionSummary {
  id: string
  title: string
  count: number
}

export interface ConversationEntry {
  id: string
  role: 'user' | 'assistant'
  /** 완성된 텍스트 (assistant의 경우 streaming 완료 후 확정) */
  content: string
  /**
   * 사용자 버블에 표시할 첨부 이미지 data URL 목록 (22c).
   * in-memory 전용 — 영속화 MVP 범위 외(saveConversation은 role/content만 저장).
   */
  images?: string[]
}

// ── 슬라이스 합성 ──────────────────────────────────────────────────────────────

/**
 * 전역 store 상태. AppState(reducer)를 상속(intersection)하고 각 도메인 슬라이스 상태를 합친다.
 * (기존 `StoreState extends AppState`와 구조 동일 — intersection으로 재구성.)
 */
export type StoreState = AppState &
  SystemState &
  WorkspaceState &
  ViewerState &
  ConversationState &
  SessionListState &
  MultiSessionState &
  ComposerState &
  LoopState

/** 전역 store 액션 — 각 도메인 슬라이스 액션의 합집합. */
export type StoreActions = SystemActions &
  WorkspaceActions &
  ViewerActions &
  ConversationActions &
  SessionListActions &
  MultiSessionActions &
  ComposerActions &
  RuntimeActions &
  LoopActions

export type AppStore = StoreState & StoreActions
