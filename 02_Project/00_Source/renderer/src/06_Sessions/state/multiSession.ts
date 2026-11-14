import type { StateCreator } from 'zustand'
import type { PersistedMultiState } from '../../../../shared/ipcContract'
import type { AppStore, MultiSessionSummary } from '@renderer/00_App/state/types'
import { disposePanelManagerSessionsByPrefix, panelSlotKeyPrefix } from '@renderer/03_Agent/state/panelSession'
import { pruneMultiSessionScope } from '@renderer/03_Agent/state/ultracodeToggle'
import { ipc, hasBridge } from '@renderer/01_Ipc'

export interface MultiSessionState {
  multiSessions: MultiSessionSummary[]
  activeMultiSessionId: string
}

export interface MultiSessionActions {
  loadMultiSessions: () => Promise<void>
  newMultiSession: () => Promise<void>
  selectMultiSession: (id: string) => Promise<void>
  deleteMultiSession: (id: string) => Promise<void>
  renameMultiSession: (id: string, title: string) => Promise<void>
}

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
  multiSessions: [],
  activeMultiSessionId: '',

  loadMultiSessions: async () => {
    if (!hasBridge() || typeof ipc.sessions.multiLoad !== 'function') return
    const res = await ipc.sessions.multiLoad()
    const loaded = res.state

    if (!loaded || loaded.sessions.length === 0) {
      if (!hasBridge() || typeof ipc.sessions.multiCreate !== 'function') return
      const cmdRes = await ipc.sessions.multiCreate()
      set(mirrorFromState(cmdRes.state))
      return
    }

    set(mirrorFromState(loaded))
  },

  newMultiSession: async () => {
    const res = await ipc.sessions.multiCreate()
    set(mirrorFromState(res.state))
  },

  selectMultiSession: async (id: string) => {
    set({ activeMultiSessionId: id })
    const res = await ipc.sessions.multiSelect({ id })
    set(mirrorFromState(res.state))
  },

  deleteMultiSession: async (id: string) => {
    const res = await ipc.sessions.multiDelete({ id })
    set(mirrorFromState(res.state))
    disposePanelManagerSessionsByPrefix(panelSlotKeyPrefix(id))
    if (res.ok) pruneMultiSessionScope(id)
  },

  renameMultiSession: async (id: string, title: string) => {
    const res = await ipc.sessions.multiRename({ id, title })
    set(mirrorFromState(res.state))
  },
})
