import type { StateCreator } from 'zustand'
import { MODES, DEFAULT_MODE_CONVERSATION, DEFAULT_MODEL } from '@renderer/03_Agent/pickerOptions'
import { normalizeModel, defaultModelOf, FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import type { ModelRow } from '@shared/03_Agent/models/modelList'
import { isEffortLevel } from '@shared/03_Agent/models/modelEffort'
import { filesToAttachedImages } from '../imageAttach'
import { ipc, hasBridge } from '@renderer/01_Ipc'
import type { AppStore, AttachedImage, QueuedMessage } from '@renderer/00_App/state/types'
import { runReducer } from '@renderer/03_Agent/state/runReducer'

const MODEL_LIST_RETRY_MS: readonly number[] = [5_000, 15_000, 60_000]

const LIVE_SWITCHABLE_MODES:ReadonlySet<string> = new Set([
  'normal',
  'plan',
  'acceptEdits',
  'auto',
])

function requestLiveModeSwitch(
  runId: string | null | undefined,
  replMode: boolean,
  mode: string,
): void {
  if (!replMode || !runId || !LIVE_SWITCHABLE_MODES.has(mode)) return
  try {
    void ipc.agent.setMode({ runId, mode }).catch(() => {
    })
  } catch {
  }
}

function isLiveSwitchable(model: string, rows: readonly ModelRow[]): boolean {
  return normalizeModel(model, rows) !== undefined
}

export function requestLiveModelSwitch(
  runId: string | null | undefined,
  replMode: boolean,
  model: string,
  rows: readonly ModelRow[] = FALLBACK_MODELS,
): void {
  if (!replMode || !runId || !isLiveSwitchable(model, rows)) return
  try {
    void ipc.agent.setModel({ runId, model }).catch(() => {
    })
  } catch {
  }
}

// 실행 중인 REPL 세션의 effort를 바꾼다. 턴 사이에 바꾼 값은 다음 전송의 effort가 같은 세션에 싣는다.
export function requestLiveEffortSwitch(runId: string | null | undefined, replMode: boolean, effort: string): void {
  if (!replMode || !runId || !isEffortLevel(effort)) return
  try {
    void ipc.agent.setEffort({ runId, effort }).catch(() => {
    })
  } catch {
  }
}

export interface ComposerState {
  selectedModel: string
  // 사람이 선택기에서 모델을 고른 적이 있나 — 없으면 SDK 목록이 왔을 때 default 행으로 맞춘다
  modelChosen: boolean
  // 선택기가 그리는 모델 목록 — main의 agent.listModels가 준 SDK 목록. 오기 전에는 최소 목록이다.
  modelRows: ModelRow[]
  pickerMode: string
  projectFiles: string[]
  attachedImages: AttachedImage[]
  queue: QueuedMessage[]
}

export interface ComposerActions {
  setSelectedModel: (modelId: string) => void
  loadModelRows: (attempt?: number) => Promise<void>
  setPickerMode: (mode: string) => void
  cyclePickerMode: () => void
  loadProjectFiles: () => Promise<void>
  attachImagesFromFiles: (files: File[]) => Promise<void>
  removeAttachedImage: (index: number) => void
  clearAttachedImages: () => void
  enqueueMessage: (item: QueuedMessage) => void
  dequeueMessage: () => QueuedMessage | undefined
  removeQueued: (id: string) => void
}

export const createComposerSlice: StateCreator<AppStore, [], [], ComposerState & ComposerActions> = (set, get) => ({
  selectedModel: DEFAULT_MODEL,
  modelChosen: false,
  modelRows: [...FALLBACK_MODELS],
  pickerMode: DEFAULT_MODE_CONVERSATION,
  projectFiles: [],
  attachedImages: [],
  queue: [],

  setSelectedModel: (modelId) => {
    if (modelId === get().selectedModel) return
    // 직전 턴이 잰 창은 옛 모델의 창이다 — 다음 턴이 새로 잴 때까지 재적재 예산에서 빼고 계기는 그대로 둔다
    set({ selectedModel: modelId, modelChosen: true, contextWindowStale: get().isRunning ? 'after-turn' : true })
    const { replMode, currentRunId, modelRows } = get()
    requestLiveModelSwitch(currentRunId, replMode, modelId, modelRows)
  },

  // 앱 시작 때 한 번 부른다. 실패하거나 빈 응답이면 지금 목록(최소 목록)을 그대로 둔다.
  loadModelRows: async (attempt = 0) => {
    if (!hasBridge() || typeof ipc.agent.listModels !== 'function') return
    let fromSdk = false
    try {
      const res = await ipc.agent.listModels()
      if (res && Array.isArray(res.models) && res.models.length > 0) set({ modelRows: res.models })
      fromSdk = res?.source === 'sdk'
      const { modelChosen, conversationId, thread } = get()
      if (fromSdk && !modelChosen && conversationId === null && thread.length === 0) {
        set({ selectedModel: defaultModelOf(res.models) })
      }
    } catch {
    }
    // SDK 목록을 못 받았으면 조금 뒤 다시 묻는다 — main 공급자도 그때 SDK에 다시 묻는다
    const delay = MODEL_LIST_RETRY_MS[attempt]
    if (!fromSdk && delay !== undefined) setTimeout(() => void get().loadModelRows(attempt + 1), delay)
  },

  setPickerMode: (mode) => {
    set({ pickerMode: mode })
    const { replMode, currentRunId, conversationId, isRunning } = get()
    requestLiveModeSwitch(currentRunId, replMode, mode)
    // 대화마다 기억한다 — 턴이 도는 중이면 그 턴의 done 저장이 새 모드를 싣는다
    if (conversationId !== null && !isRunning) void get().saveConversation().catch(() => {})
  },
  cyclePickerMode: () => {
    const current = get().pickerMode
    const idx = MODES.findIndex((m) => m.id === current)
    const nextIdx = (idx + 1) % MODES.length
    get().setPickerMode(MODES[nextIdx].id)
  },

  loadProjectFiles: async () => {
    try {
      const res = await ipc.workspace.listFiles({})
      set({ projectFiles: res.files })
    } catch {
    }
  },

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

  // 대기열 넣고 빼기는 공용 reducer가 한다.
  enqueueMessage: (item) => {
    set((s) => runReducer(s, { type: 'ENQUEUE', item }))
  },

  dequeueMessage: () => {
    const first = get().queue[0]
    if (!first) return undefined
    set((s) => runReducer(s, { type: 'DEQUEUE' }))
    return first
  },

  removeQueued: (id) => {
    set((s) => runReducer(s, { type: 'REMOVE_QUEUED', id }))
  },
})
