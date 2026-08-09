import type { StateCreator } from 'zustand'
import type { Profile, UsageInfo, BackendStatus } from '../../../../shared/ipcContract'
import type { AppStore } from './types'
import { getReplModeDefault } from '../../lib/replModeDefault'

export interface SystemState {
  profile: Profile | null

  replMode: boolean
  currentSessionKey: string

  usage: UsageInfo

  backends: BackendStatus[]
}

export interface SystemActions {
  applyProfile: (profile: Profile | null) => void
  setReplMode: (on: boolean) => void
  loadUsage: () => Promise<void>
  loadBackends: () => Promise<void>
}

export const createSystemSlice: StateCreator<AppStore, [], [], SystemState & SystemActions> = (set) => ({
  profile: null,
  replMode: getReplModeDefault(),
  currentSessionKey: crypto.randomUUID(),
  usage: { fiveHour: null, weekly: null } as UsageInfo,
  backends: [],

  applyProfile: (profile) => {
    set({ profile })
  },

  setReplMode: (on) => {
    set({ replMode: on })
  },

  loadUsage: async () => {
    try {
      const result = await window.api.getUsage()
      set({ usage: result })
    } catch {
    }
  },

  loadBackends: async () => {
    try {
      const result = await window.api.listBackends()
      set({ backends: result })
    } catch {
    }
  },
})
