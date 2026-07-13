/**
 * slices/composer.ts — 컴포저 슬라이스 (P12 분해).
 *
 * 모델/모드 피커·프로젝트 파일 목록·이미지 첨부·예약 큐.
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 * CRITICAL: renderer untrusted — window.api(화이트리스트)만. fs/Node 0.
 */
import type { StateCreator } from 'zustand'
import { MODES, DEFAULT_MODE_SINGLE, DEFAULT_MODEL } from '../../lib/pickerOptions'
import { filesToAttachedImages } from '../../lib/imageAttach'
import type { AppStore, AttachedImage, QueuedMessage } from './types'

export interface ComposerState {
  // ── 피커 선택값 (M4-1) ─────────────────────────────────────────────────
  /**
   * 현재 선택된 모델 id (pickerOptions MODELS id: 'opus'|'sonnet'|'fable'|'haiku').
   * 토큰 게이지의 컨텍스트 윈도우 분모 결정에 사용.
   */
  selectedModel: string
  // ── 피커 모드 (P7: Shift+Tab 모드 순환) ──────────────────────────────────
  /**
   * 현재 선택된 실행 모드 id (pickerOptions MODES id).
   * Composer 로컬 state에서 store로 리프팅 — Shift+Tab cyclePickerMode()가
   * MODES 순서로 순환. Composer는 이 값을 읽고 변경 시 setPickerMode()로 갱신.
   * 기본값: DEFAULT_MODE_SINGLE ('auto').
   */
  pickerMode: string
  // ── 프로젝트 파일 목록 (M4-2: @멘션 팔레트) ─────────────────────────────
  /**
   * 워크스페이스 파일 플랫 목록. `window.api.listFiles()` 응답.
   * 워크스페이스 미오픈 시 빈 배열. Composer의 mentionFiles prop에 전달.
   */
  projectFiles: string[]
  // ── 이미지 첨부 (22c) ────────────────────────────────────────────────────
  /**
   * 현재 컴포저에 첨부된 이미지 목록.
   * 전송 후 clearAttachedImages()로 리셋.
   */
  attachedImages: AttachedImage[]
  // ── 메시지 예약 큐 (22d) ─────────────────────────────────────────────────
  /**
   * 실행 중(isRunning)에 적재된 예약 메시지 목록 (FIFO).
   * busy→idle 전이 시 첫 항목부터 자동 드레인.
   */
  queue: QueuedMessage[]
}

export interface ComposerActions {
  /** 선택된 모델 id를 store에 동기화 (토큰 게이지 분모 갱신) */
  setSelectedModel: (modelId: string) => void
  /** 실행 모드를 직접 설정 (Picker onChange 시 호출) */
  setPickerMode: (mode: string) => void
  /**
   * MODES 순서로 현재 모드의 다음으로 순환 (끝→처음 wrap).
   * Shift+Tab 전역 단축키에서 호출. renderer-only 상태 — IPC 0.
   */
  cyclePickerMode: () => void
  /**
   * window.api.listFiles() IPC 호출 → projectFiles 갱신.
   * Conversation mount 시 + openWorkspace 완료 후 호출.
   * CRITICAL: window.api 경유만 — fs/Node 직접 0.
   */
  loadProjectFiles: () => Promise<void>
  /**
   * File[] → isImagePath 필터 → pathForFile 직득 or saveImageData 폴백 → dataUrl 생성
   * → attachedImages 누적.
   * CRITICAL: window.api 경유만 — fs/Node 직접 0. Composer에서 직접 호출 X.
   */
  attachImagesFromFiles: (files: File[]) => Promise<void>
  /** 특정 index 항목 제거. */
  removeAttachedImage: (index: number) => void
  /** 전송 후 초기화. */
  clearAttachedImages: () => void
  /** 항목 추가 (호출자가 id 생성 — 결정론 테스트 용이). */
  enqueueMessage: (item: QueuedMessage) => void
  /** FIFO: 첫 항목 반환 + 큐에서 제거. 빈 큐 → undefined. */
  dequeueMessage: () => QueuedMessage | undefined
  /** id로 특정 항목 제거 (스트립 × 버튼용). */
  removeQueued: (id: string) => void
}

export const createComposerSlice: StateCreator<AppStore, [], [], ComposerState & ComposerActions> = (set, get) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  // GAP1 P02(I-03): 하드코딩 'opus' 대신 DEFAULT_MODEL import — 단일 출처(pickerOptions.ts)로
  // 정합(회귀 0, DEFAULT_MODEL 실측값이 그대로 'opus'라 기본 동작 불변).
  selectedModel: DEFAULT_MODEL, // M4-1: 토큰 게이지 분모 + GAP1 P02: 컴포저 picker 초기값
  pickerMode: DEFAULT_MODE_SINGLE, // P7: Shift+Tab 모드 순환 — Composer local에서 리프팅
  projectFiles: [], // M4-2: @멘션 팔레트 실 파일 목록
  attachedImages: [], // 22c: 이미지 첨부 목록
  queue: [], // 22d: 예약 메시지 큐

  // ── 피커 선택값 (M4-1) ──────────────────────────────────────────────────
  setSelectedModel: (modelId) => {
    set({ selectedModel: modelId })
  },

  // ── 피커 모드 (P7: Shift+Tab 모드 순환) ─────────────────────────────────
  setPickerMode: (mode) => {
    set({ pickerMode: mode })
  },
  cyclePickerMode: () => {
    const current = get().pickerMode
    const idx = MODES.findIndex((m) => m.id === current)
    // idx=-1(알 수 없는 mode): 다음 index = 0 → MODES[0]
    const nextIdx = (idx + 1) % MODES.length
    set({ pickerMode: MODES[nextIdx].id })
  },

  // ── 프로젝트 파일 목록 (M4-2) ────────────────────────────────────────────
  loadProjectFiles: async () => {
    // IPC 경유 — renderer는 fs/Node 직접 0. main이 워크스페이스 루트 열거.
    try {
      const res = await window.api.listFiles()
      set({ projectFiles: res.files })
    } catch {
      // 워크스페이스 미오픈 등 실패 시 빈 배열 유지 — 팔레트는 graceful degradation
    }
  },

  // ── 이미지 첨부 (22c) ────────────────────────────────────────────────────
  // File→{path,dataUrl} 변환은 lib/imageAttach.filesToAttachedImages 단일 출처.
  // (멀티패널 PanelComposer와 동일 헬퍼 공유 — 중복 제거.)
  attachImagesFromFiles: async (files: File[]) => {
    const added = await filesToAttachedImages(files)
    if (added.length > 0) {
      set((s) => ({ attachedImages: [...s.attachedImages, ...added] }))
    }
  },

  removeAttachedImage: (index: number) => {
    set((s) => ({ attachedImages: s.attachedImages.filter((_, i) => i !== index) }))
  },

  clearAttachedImages: () => {
    set({ attachedImages: [] })
  },

  // ── 메시지 예약 큐 (22d) ─────────────────────────────────────────────────
  enqueueMessage: (item) => {
    set((s) => ({ queue: [...s.queue, item] }))
  },

  dequeueMessage: () => {
    const [first, ...rest] = get().queue
    if (!first) return undefined
    set({ queue: rest })
    return first
  },

  removeQueued: (id) => {
    set((s) => ({ queue: s.queue.filter((q) => q.id !== id) }))
  },
})
