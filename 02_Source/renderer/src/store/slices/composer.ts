import type { StateCreator } from 'zustand'
import { MODES, DEFAULT_MODE_SINGLE, DEFAULT_MODEL } from '../../lib/pickerOptions'
import { normalizeModel } from '../../../../shared/knownModels'
import { filesToAttachedImages } from '../../lib/imageAttach'
import type { AppStore, AttachedImage, QueuedMessage } from './types'

export const LIVE_SWITCHABLE_MODES: ReadonlySet<string> = new Set([
  'normal',
  'plan',
  'acceptEdits',
  'auto',
])

export function requestLiveModeSwitch(
  runId: string | null | undefined,
  replMode: boolean,
  mode: string,
): void {
  if (!replMode || !runId || !LIVE_SWITCHABLE_MODES.has(mode)) return
  try {
    void window.api.agentSetMode({ runId, mode }).catch(() => {
    })
  } catch {
  }
}

function isLiveSwitchable(model: string): boolean {
  return normalizeModel(model) !== undefined
}

export function requestLiveModelSwitch(
  runId: string | null | undefined,
  replMode: boolean,
  model: string,
): void {
  if (!replMode || !runId || !isLiveSwitchable(model)) return
  try {
    void window.api.agentSetModel({ runId, model }).catch(() => {
    })
  } catch {
  }
}

export interface ComposerState {
  selectedModel: string
  pickerMode: string
  projectFiles: string[]
  attachedImages: AttachedImage[]
  queue: QueuedMessage[]
}

export interface ComposerActions {
  setSelectedModel: (modelId: string) => void
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
  pickerMode: DEFAULT_MODE_SINGLE,
  projectFiles: [],
  attachedImages: [],
  queue: [],

  setSelectedModel: (modelId) => {
    if (modelId === get().selectedModel) return
    set({ selectedModel: modelId })
    const { replMode, currentRunId } = get()
    requestLiveModelSwitch(currentRunId, replMode, modelId)
  },

  setPickerMode: (mode) => {
    set({ pickerMode: mode })
    const { replMode, currentRunId } = get()
    requestLiveModeSwitch(currentRunId, replMode, mode)
  },
  cyclePickerMode: () => {
    const current = get().pickerMode
    const idx = MODES.findIndex((m) => m.id === current)
    const nextIdx = (idx + 1) % MODES.length
    get().setPickerMode(MODES[nextIdx].id)
  },

  loadProjectFiles: async () => {
    try {
      const res = await window.api.listFiles()
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
