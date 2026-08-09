import type { StateCreator } from 'zustand'
import type { ThreadItem } from '../threadTypes'
import { makeInitialState } from '../reducer'
import { setPref } from '../../lib/prefs'
import { nextMsgId } from './ids'
import { buildConversationSavePayload, rebuildThreadWithSubagents, freezePersistedSubagents } from './conversationPayload'
import { getReplModeDefault } from '../../lib/replModeDefault'
import { DEFAULT_MODEL } from '../../lib/pickerOptions'
import type { AppStore } from './types'

export interface ConversationState {
  conversationId: string | null
  backendLabel: string
  restoredSession: boolean
}

export interface ConversationActions {
  loadConversation: () => Promise<void>
  saveConversation: () => Promise<void>
  clearConversation: () => void
}

export const createConversationSlice: StateCreator<AppStore, [], [], ConversationState & ConversationActions> = (set, get) => ({
  conversationId: null,
  backendLabel: 'Claude Code',
  restoredSession: false,

  loadConversation: async () => {
    const res = await window.api.conversationLoad({ limit: 1 })
    if (res.conversations.length === 0) return
    const conv = res.conversations[0]
    const loadedMessages = conv.messages.map((m) => ({
      id: nextMsgId(),
      role: m.role,
      content: m.content,
    }))
    const loadedThread: Extract<ThreadItem, { kind: 'msg' }>[] = loadedMessages.map((m) => ({
      kind: 'msg' as const,
      id: m.id,
      role: m.role,
      text: m.content,
    }))
    set({
      conversationId: conv.id,
      thread: rebuildThreadWithSubagents(loadedThread, conv.subagents),
      openGroupId: null,
      openMsgId: null,
      seq: 0,
      runGeneration: null,
      sessionId: conv.sessionId,
      restoredSession: Boolean(conv.sessionId) && loadedMessages.length > 0,
      subagents: freezePersistedSubagents(conv.subagents),
      replMode: conv.replMode ?? getReplModeDefault(),
      selectedModel: conv.model ?? DEFAULT_MODEL,
    })
  },

  saveConversation: async () => {
    const { conversationId, workspaceRoot, sessionId, lastContextWindow, lastUsage, thread, subagents, replMode, selectedModel } = get()
    const convPayload = buildConversationSavePayload(
      { thread, workspaceRoot, sessionId, lastContextWindow, lastUsage, subagents, replMode, model: selectedModel },
      conversationId ?? undefined
    )
    if (!convPayload) return
    const res = await window.api.conversationSave({
      conversation: convPayload,
    })
    if (!conversationId) {
      set({ conversationId: res.id })
      setPref('conversation.lastActiveId', res.id)
    }
    void get().listConversations()
  },

  clearConversation: () => {
    set((s) => {
      const clearedId = s.conversationId
      const restBgRuns = clearedId !== null && clearedId in s.bgRuns
        ? (() => { const rest = { ...s.bgRuns }; delete rest[clearedId]; return rest })()
        : s.bgRuns
      return {
        ...makeInitialState(),
        conversationId: null,
        attachedImages: [],
        queue: [],
        runGeneration: null,
        currentSessionKey: crypto.randomUUID(),
        restoredSession: false,
        bgRuns: restBgRuns,
        replMode: getReplModeDefault(),
      }
    })
    get().refreshStaleWatchdog()
  },
})
