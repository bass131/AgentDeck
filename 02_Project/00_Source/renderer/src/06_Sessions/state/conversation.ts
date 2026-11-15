import type { StateCreator } from 'zustand'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import { makeInitialState } from '@renderer/05_Conversation/state/reducer'
import { setPref } from '@renderer/11_Settings/prefs'
import { nextMsgId } from '@renderer/00_App/state/ids'
import { buildConversationSavePayload, rebuildThreadWithSubagents, freezePersistedSubagents } from './conversationPayload'
import { getReplModeDefault } from '@renderer/05_Conversation/replModeDefault'
import { DEFAULT_MODEL } from '@renderer/03_Agent/pickerOptions'
import { deleteBackgroundRun } from '@renderer/03_Agent/state/backgroundRuns'
import type { AppStore } from '@renderer/00_App/state/types'

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
    // 지우는 대화가 배경 레지스트리에도 있으면 함께 지운다(전경·배경에 같은 대화가 겹친 경우).
    const clearedId = get().conversationId
    if (clearedId !== null) deleteBackgroundRun(clearedId)
    set({
      ...makeInitialState(),
      conversationId: null,
      attachedImages: [],
      queue: [],
      runGeneration: null,
      currentSessionKey: crypto.randomUUID(),
      restoredSession: false,
      replMode: getReplModeDefault(),
    })
    get().refreshStaleWatchdog()
  },
})
