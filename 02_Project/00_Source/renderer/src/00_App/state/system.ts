import type { StateCreator } from 'zustand'
import type { Profile, UsageInfo, BackendStatus } from '@shared/ipcContract'
import type { AppStore } from './types'
import { getReplModeDefault } from '@renderer/05_Conversation/replModeDefault'
import { ipc } from '@renderer/01_Ipc'

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
      const result = await ipc.engine.usage()
      set({ usage: result })
    } catch {
    }
  },

  loadBackends: async () => {
    try {
      const result = await ipc.engine.listBackends()
      set({ backends: result })
    } catch {
    }
  },
})
