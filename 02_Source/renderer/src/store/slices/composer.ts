/**
 * slices/composer.ts — 컴포저 슬라이스 (P12 분해).
 *
 * 모델/모드 피커·프로젝트 파일 목록·이미지 첨부·예약 큐.
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 * CRITICAL: renderer untrusted — window.api(화이트리스트)만. fs/Node 0.
 */
import type { StateCreator } from 'zustand'
import { MODES, MODELS, DEFAULT_MODE_SINGLE, DEFAULT_MODEL } from '../../lib/pickerOptions'
import { filesToAttachedImages } from '../../lib/imageAttach'
import type { AppStore, AttachedImage, QueuedMessage } from './types'

// ── GAP1 P13: 진행 중 세션 권한 모드 라이브 전환 (dogfood 결함 A 봉합) ────────────

/** 라이브 전환 허용 모드(picker id) 화이트리스트 — 'bypass' 제외(영호 박제 2026-07-14). */
export const LIVE_SWITCHABLE_MODES: ReadonlySet<string> = new Set([
  'normal',
  'plan',
  'acceptEdits',
  'auto',
])

/**
 * requestLiveModeSwitch — 게이트 통과 시 agentSetMode IPC를 fire-and-forget으로 발화.
 *
 * renderer측 라이브 전환의 단일 출처: 단일챗 setPickerMode(아래 — Composer 피커 onChange +
 * Shift+Tab cyclePickerMode 공용 지점)와 멀티패널 PanelView(RunPickers 모드 onChange 래퍼)가
 * 이 함수 하나를 공유한다 — 게이트·화이트리스트 드리프트 차단.
 *
 * 게이트(전부 만족 시에만 IPC 발화):
 *   1) replMode=true — 라이브 전환은 지속(REPL, ADR-024) 세션 전용. 단발 run은 어댑터
 *      계약상 setPermissionMode 자체가 no-op(SDK streaming-input 한정)이라 renderer가
 *      애초에 보내지 않는다(불필요 IPC 0).
 *   2) runId 존재 — 진행 중(턴 사이 held-open 포함) run이 없으면 로컬 상태만
 *      (다음 새 세션 생성 시 적용되는 기존 의미 유지).
 *   3) mode ∈ 화이트리스트 4종 — 'bypass'는 라이브 전환 불가(세션 생성 시에만).
 *      main 핸들러도 같은 화이트리스트를 강제하지만(CORE-01 — renderer는 untrusted라
 *      이 필터는 신뢰 근거가 아님) 여기서 먼저 거르면 IPC 소음 0.
 *
 * fire-and-forget: 전환 *결과* 정본은 SetModeResponse가 아니라 permission_mode
 * AgentEvent(엔진 측 상태 관찰 신호 — shared/agent-events.ts)로 흐른다. 실패해도
 * 피커 로컬 상태는 유지(다음 새 세션부터 적용으로 자연 degrade) — 에러 UI 없음.
 *
 * CRITICAL(ADR-003): mode 는 picker id 원문('normal'|'plan'|'acceptEdits'|'auto') —
 * SDK 어휘('default' 등) 변환은 어댑터 내부에만. renderer는 엔진 어휘를 모른다.
 * CRITICAL: renderer untrusted — window.api.agentSetMode(화이트리스트 IPC)만 호출.
 */
export function requestLiveModeSwitch(
  runId: string | null | undefined,
  replMode: boolean,
  mode: string,
): void {
  if (!replMode || !runId || !LIVE_SWITCHABLE_MODES.has(mode)) return
  try {
    void window.api.agentSetMode({ runId, mode }).catch(() => {
      // fire-and-forget — 반영 정본은 permission_mode 이벤트. 실패 시 로컬 피커 값은
      // "다음 새 세션부터 적용" 의미로 자연 degrade(에러 배너/토스트 발명 금지).
    })
  } catch {
    // preload 미노출 등 동기 실패(부분 mock 테스트 더블 포함)도 동일하게 조용히 무시.
  }
}

// ── LM1 P04: 진행 중 세션 모델 라이브 전환 (dogfood 결함 모델판 봉합) ────────────

/**
 * 라이브 전환 허용 모델(picker id) 화이트리스트 — `MODELS`(pickerOptions.ts:45-50)에서
 * id를 파생한다. 리터럴로 새로 쓰면 'opus'|'sonnet'|'haiku'|'fable' id 집합이 MODELS·
 * main KNOWN_MODELS(P03)·shared 계약(P01)에 이어 4번째 동기화 지점이 된다 — 신설 금지.
 */
export const LIVE_SWITCHABLE_MODELS: ReadonlySet<string> = new Set(MODELS.map((m) => m.id))

/**
 * requestLiveModelSwitch — 게이트 통과 시 agentSetModel IPC를 fire-and-forget으로 발화.
 *
 * requestLiveModeSwitch(위, 모드판)의 모델판 미러. renderer측 라이브 모델 전환의 단일
 * 출처: 단일챗 setSelectedModel(아래)과 멀티패널 PanelView(RunPickers 모델 onChange
 * 래퍼)가 이 함수 하나를 공유한다 — 게이트·화이트리스트 드리프트 차단.
 *
 * 게이트(전부 만족 시에만 IPC 발화):
 *   1) replMode=true — 라이브 전환은 지속(REPL, ADR-024) 세션 전용. 단발 run은 어댑터
 *      계약상 setModel 자체가 no-op(SDK streaming-input 한정)이라 renderer가 애초에
 *      보내지 않는다(불필요 IPC 0).
 *   2) runId 존재 — 진행 중(턴 사이 held-open 포함) run이 없으면 로컬 상태만
 *      (다음 새 세션 생성 시 적용되는 기존 의미 유지).
 *   3) model ∈ LIVE_SWITCHABLE_MODELS(= MODELS id 파생) — main 핸들러도 같은 화이트
 *      리스트를 강제하지만(CORE-01 — renderer는 untrusted라 이 필터는 신뢰 근거가
 *      아니다) 여기서 먼저 거르면 IPC 소음 0.
 *
 * fire-and-forget + 낙관 반영만: 모드판과 달리 역통지 이벤트가 없다(2026-07-17 확정
 * — permission_mode 같은 전용 이벤트를 신설하지 않음). 전환 *반영* 정본은 다음
 * assistant message의 `.model` 필드(엔진이 실제로 무엇을 썼는지 관찰하는 기존 신호)이고,
 * 실패·미지원 시의 안전망은 새 UI가 아니라 기존 model-fallback 배너(엔진 자율 변경 통지
 * 경로)를 재사용해 흡수한다. 여기서는 성공/실패 여부와 무관하게 로컬 피커 값을 유지한다
 * (에러 배너/토스트 발명 금지).
 *
 * CRITICAL(ADR-003): model 은 picker id 원문('opus'|'sonnet'|'haiku'|'fable') — SDK
 * 어휘 변환은 어댑터 내부에만. renderer는 엔진 어휘를 모른다.
 * CRITICAL: renderer untrusted — window.api.agentSetModel(화이트리스트 IPC)만 호출.
 */
export function requestLiveModelSwitch(
  runId: string | null | undefined,
  replMode: boolean,
  model: string,
): void {
  if (!replMode || !runId || !LIVE_SWITCHABLE_MODELS.has(model)) return
  try {
    void window.api.agentSetModel({ runId, model }).catch(() => {
      // fire-and-forget — 반영 정본은 다음 assistant message.model. 실패 시 로컬
      // 피커 값은 유지(에러 배너/토스트 발명 금지, 안전망은 기존 model-fallback 배너).
    })
  } catch {
    // preload 미노출 등 동기 실패(부분 mock 테스트 더블 포함)도 동일하게 조용히 무시.
  }
}

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
  /**
   * 선택된 모델 id를 store에 동기화 (토큰 게이지 분모 갱신).
   * LM1 P04: setPickerMode(:150-)의 모델판 미러 — same-value 가드(현재값과 동일하면
   * no-op, Conversation.tsx sendNow 재호출 중복 발화 차단) 후 로컬을 낙관 set하고
   * requestLiveModelSwitch(위)로 라이브 전환을 위임한다. 모드판과 달리 역통지 이벤트가
   * 없다(2026-07-17 확정) — 반영 정본은 다음 assistant message.model이고, 실패·미지원
   * 시 안전망은 기존 model-fallback 배너를 재사용해 흡수한다(새 이벤트/배너 미신설).
   */
  setSelectedModel: (modelId: string) => void
  /**
   * 실행 모드를 직접 설정 (Picker onChange 시 호출).
   * GAP1 P13: 활성 지속(REPL) run 존재 + 화이트리스트 4종이면 agentSetMode IPC로
   * 라이브 전환을 실전달한다(requestLiveModeSwitch — fire-and-forget). 'bypass'/
   * 게이트 미충족이면 로컬 상태만(기존 거동 — 다음 새 세션부터 적용).
   */
  setPickerMode: (mode: string) => void
  /**
   * MODES 순서로 현재 모드의 다음으로 순환 (끝→처음 wrap).
   * Shift+Tab 전역 단축키에서 호출. GAP1 P13: setPickerMode 경유 — 순환도 라이브
   * 전환 side effect 단일 지점을 공유한다(직접 set 금지).
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

  // ── 피커 선택값 (M4-1 + LM1 P04: 라이브 전환) ─────────────────────────────
  setSelectedModel: (modelId) => {
    // same-value 가드 — Conversation.tsx:678 sendNow가 전송마다 setSelectedModel을
    // 재호출한다. 가드가 없으면 같은 모델로도 IPC가 중복 발화한다(어댑터 change-guard와
    // 이중 방어). 값이 바뀔 때만 아래로 진행.
    if (modelId === get().selectedModel) return
    // 로컬 상태는 즉시 반영(낙관적) — 피커 표시값 자체가 현재 모델 "배지".
    set({ selectedModel: modelId })
    // LM1 P04(dogfood 결함 모델판 봉합): 활성 지속(REPL) run이 있으면 엔진에 라이브
    // 전환을 실전달한다 — fire-and-forget, 반영 정본은 다음 assistant message.model.
    const { replMode, currentRunId } = get()
    requestLiveModelSwitch(currentRunId, replMode, modelId)
  },

  // ── 피커 모드 (P7: Shift+Tab 모드 순환 + GAP1 P13: 라이브 전환) ──────────
  setPickerMode: (mode) => {
    // 로컬 상태는 기존대로 즉시 반영(낙관적) — 피커 표시값 자체가 현재 모드 "배지".
    set({ pickerMode: mode })
    // GAP1 P13(dogfood 결함 A 봉합): 활성 지속(REPL) run이 있으면 엔진에 라이브 전환을
    // 실전달한다 — fire-and-forget, 반영 정본은 permission_mode 이벤트(runtime.ts
    // subscribeAgentEvents가 pickerMode로 재동기화). 'bypass'는 화이트리스트 밖 →
    // IPC 없이 로컬만(다음 새 세션 생성 시 적용 — ComposerBar note로 안내).
    const { replMode, currentRunId } = get()
    requestLiveModeSwitch(currentRunId, replMode, mode)
  },
  cyclePickerMode: () => {
    const current = get().pickerMode
    const idx = MODES.findIndex((m) => m.id === current)
    // idx=-1(알 수 없는 mode): 다음 index = 0 → MODES[0]
    const nextIdx = (idx + 1) % MODES.length
    // GAP1 P13: setPickerMode 경유 — Shift+Tab 순환도 같은 단일 지점에서 라이브 전환
    // side effect를 탄다(Composer 피커 onChange와 공용, 게이트 드리프트 차단).
    get().setPickerMode(MODES[nextIdx].id)
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
