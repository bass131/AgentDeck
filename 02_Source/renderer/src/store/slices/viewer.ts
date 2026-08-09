import type { StateCreator } from 'zustand'
import { viewerForPath } from '../../lib/viewer'
import type { OpenedViewer } from '../../lib/viewer'
import type { AppStore, ReferenceEntry, OpenedStatus } from './types'

const MAX_RECENT_FILES = 5

export interface ViewerState {
  openedFile: string | null
  openedContent: string | null
  openedLanguage: string | null
  openedStatus: OpenedStatus
  openedLine: number | null

  openedViewer: OpenedViewer
  openedDataUrl: string | null

  references: ReferenceEntry[]
  openedRootId: string | null
}

export interface ViewerActions {
  openFile: (path: string, rootId?: string, line?: number) => Promise<void>
  closeOpenedFile: () => void
  addReference: () => Promise<void>
  loadReferences: () => Promise<void>
}

export const createViewerSlice: StateCreator<AppStore, [], [], ViewerState & ViewerActions> = (set, get) => ({
  openedFile: null,
  openedContent: null,
  openedLanguage: null,
  openedStatus: 'idle' as OpenedStatus,
  openedLine: null,
  openedViewer: 'code' as OpenedViewer,
  openedDataUrl: null,
  references: [],
  openedRootId: null,

  openFile: async (path: string, rootId?: string, line?: number) => {
    set((s) => {
      const filtered = s.recentFiles.filter((p) => p !== path)
      return { recentFiles: [path, ...filtered].slice(0, MAX_RECENT_FILES) }
    })
    const viewer = viewerForPath(path)

    set({
      openedFile: path,
      openedStatus: 'loading',
      openedContent: null,
      openedLanguage: null,
      openedDataUrl: null,
      openedViewer: viewer,
      openedRootId: rootId ?? null,
      openedLine: line ?? null,
    })

    try {
      let req: { path: string; asBinary?: boolean; root?: string }
      if (viewer === 'image') {
        req = rootId ? { path, asBinary: true, root: rootId } : { path, asBinary: true }
      } else {
        req = rootId ? { path, root: rootId } : { path }
      }

      const res = await window.api.fsRead(req)

      switch (res.kind) {
        case 'text':
          set({
            openedContent: res.content,
            openedLanguage: res.language,
            openedStatus: 'ready',
            openedDataUrl: null,
          })
          break
        case 'binary':
          set({
            openedDataUrl: res.dataUrl,
            openedContent: null,
            openedLanguage: null,
            openedStatus: 'ready',
          })
          break
        case 'too-large':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'too-large' })
          break
        case 'binary-skipped':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'binary-skipped' })
          break
        case 'not-found':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
          break
        default: {
          const _exhaustive: never = res
          void _exhaustive
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
        }
      }
    } catch {
      set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
    }
  },

  closeOpenedFile: () => {
    set({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedLine: null,
      openedDataUrl: null,
      diffFilePath: null,
    })
  },

  addReference: async () => {
    const res = await window.api.referenceAdd({})
    if (!res.reference) return

    const { id, name } = res.reference

    const existing = get().references
    if (existing.some((r) => r.id === id)) return

    const treeRes = await window.api.referenceTree({ id })
    const tree = treeRes.tree

    set((s) => ({
      references: [...s.references, { id, name, tree }],
    }))
  },

  loadReferences: async () => {
    const listRes = await window.api.referenceList({})
    const entries = await Promise.all(
      listRes.references.map(async (ref) => {
        const treeRes = await window.api.referenceTree({ id: ref.id })
        return { id: ref.id, name: ref.name, tree: treeRes.tree }
      })
    )
    set({ references: entries })
  },
})
