import type { StateCreator } from 'zustand'
import type { PersistedMultiState } from '../../../../shared/ipcContract'
import type { AppStore, MultiSessionSummary } from './types'
import { disposePanelManagerSessionsByPrefix, panelSlotKeyPrefix } from '../panelSession'
import { pruneMultiSessionScope } from '../ultracodeToggle'

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
    if (typeof window?.api?.multiSessionLoad !== 'function') return
    const res = await window.api.multiSessionLoad()
    const loaded = res.state

    if (!loaded || loaded.sessions.length === 0) {
      if (typeof window?.api?.multiCmdCreate !== 'function') return
      const cmdRes = await window.api.multiCmdCreate()
      set(mirrorFromState(cmdRes.state))
      return
    }

    set(mirrorFromState(loaded))
  },

  newMultiSession: async () => {
    const res = await window.api.multiCmdCreate()
    set(mirrorFromState(res.state))
  },

  selectMultiSession: async (id: string) => {
    set({ activeMultiSessionId: id })
    const res = await window.api.multiCmdSelect(id)
    set(mirrorFromState(res.state))
  },

  deleteMultiSession: async (id: string) => {
    const res = await window.api.multiCmdDelete(id)
    set(mirrorFromState(res.state))
    disposePanelManagerSessionsByPrefix(panelSlotKeyPrefix(id))
    if (res.ok) pruneMultiSessionScope(id)
  },

  renameMultiSession: async (id: string, title: string) => {
    const res = await window.api.multiCmdRename(id, title)
    set(mirrorFromState(res.state))
  },
})
