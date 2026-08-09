import type { StateCreator } from 'zustand'
import type { ConversationRecord } from '../../../../shared/ipcContract'
import type { ThreadItem } from '../threadTypes'
import { getPref, setPref } from '../../lib/prefs'
import { nextMsgId } from './ids'
import { rebuildThreadWithSubagents, freezePersistedSubagents } from './conversationPayload'
import { getReplModeDefault } from '../../lib/replModeDefault'
import { DEFAULT_MODEL } from '../../lib/pickerOptions'
import { pruneConversationScope } from '../ultracodeToggle'
import {
  sessionLoopDisplayRegistry,
  syncConversationLoopDisplayAndRouting,
  unregisterConversationRun,
  unregisterConversationRunsFor,
} from './loopDisplay'
import type { AppStore, ConversationRunState } from './types'

const BG_RUNS_CAP = 8

function buildConversationRunSnapshot(state: AppStore): ConversationRunState {
  return {
    currentRunId: state.currentRunId,
    runGeneration: state.runGeneration,
    thread: state.thread,
    openGroupId: state.openGroupId,
    openMsgId: state.openMsgId,
    seq: state.seq,
    changedFiles: state.changedFiles,
    fileDiffs: state.fileDiffs,
    isRunning: state.isRunning,
    lastUsage: state.lastUsage,
    lastContextWindow: state.lastContextWindow,
    sessionId: state.sessionId,
    activeLoops: state.activeLoops,
    loopsStoppedNotice: state.loopsStoppedNotice,
    autonomyActive: state.autonomyActive,
    lastActivityAt: state.lastActivityAt,
    bannerStale: state.bannerStale,
    staleDismissed: state.staleDismissed,
    goalRun: state.goalRun,
    apiRetry: state.apiRetry,
    compacting: state.compacting,
    sdkSessionState: state.sdkSessionState,
    hookRuns: state.hookRuns,
    errorMessage: state.errorMessage,
    thinkingText: state.thinkingText,
    thinkingStartedAt: state.thinkingStartedAt,
    todos: state.todos,
    subagents: state.subagents,
    pendingPermission: state.pendingPermission,
    pendingQuestion: state.pendingQuestion,
    pendingCommand: state.pendingCommand,
    workspaceRoot: state.workspaceRoot,
    attachedImages: state.attachedImages,
    restoredSession: state.restoredSession,
    replMode: state.replMode,
  }
}

function capBgRuns(bgRuns: Record<string, ConversationRunState>): Record<string, ConversationRunState> {
  const keys = Object.keys(bgRuns)
  if (keys.length <= BG_RUNS_CAP) return bgRuns
  const capped = { ...bgRuns }
  delete capped[keys[0]]
  return capped
}

export interface SessionListState {
  conversations: ConversationRecord[]
  bgRuns: Record<string, ConversationRunState>
}

export interface SessionListActions {
  listConversations: () => Promise<void>
  selectConversation: (id: string) => Promise<void>
  renameConversation: (id: string, title: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  newConversation: () => void
  restoreLastActiveConversation: () => Promise<void>
}

export const createSessionListSlice: StateCreator<AppStore, [], [], SessionListState & SessionListActions> = (set, get) => ({
  conversations: [],
  bgRuns: {},

  listConversations: async () => {
    const res = await window.api.conversationLoad({ limit: 20 })
    set({ conversations: res?.conversations ?? [] })
  },

  selectConversation: async (id: string) => {
    const leaving = get().conversationId

    if (leaving !== null && leaving === id) return

    if (leaving !== null && leaving !== id) {
      const cur = get()
      if (cur.currentRunId !== null) {
        const snapshot = buildConversationRunSnapshot(cur)
        set((s) => ({ bgRuns: capBgRuns({ ...s.bgRuns, [leaving]: snapshot }) }))
        syncConversationLoopDisplayAndRouting(leaving, snapshot.currentRunId, {
          activeLoops: snapshot.activeLoops,
          loopsStoppedNotice: snapshot.loopsStoppedNotice,
          pendingCommand: snapshot.pendingCommand,
          autonomyActive: snapshot.autonomyActive,
          lastActivityAt: snapshot.lastActivityAt,
          goalRun: snapshot.goalRun,
        })
      }
    }

    const bg = get().bgRuns[id]
    if (bg) {
      const bgWorkspaceRoot = bg.workspaceRoot
      set((s) => {
        const restBgRuns = { ...s.bgRuns }
        delete restBgRuns[id]
        return {
          ...bg,
          conversationId: id,
          workspaceRoot: s.workspaceRoot,
          bgRuns: restBgRuns,
        }
      })
      if (bgWorkspaceRoot && bgWorkspaceRoot !== get().workspaceRoot) {
        await get().restoreWorkspaceFromCwd(bgWorkspaceRoot)
      }
      get().refreshStaleWatchdog()
      unregisterConversationRun(bg.currentRunId)
      setPref('conversation.lastActiveId', id)
      return
    }

    const res = await window.api.conversationLoad({ id })
    if (!res?.conversations?.length) return
    const conv = res.conversations[0]

    const savedLoopDisplay = sessionLoopDisplayRegistry.read(conv.id)

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
      currentRunId: null,
      runGeneration: null,
      errorMessage: undefined,
      isRunning: false,
      attachedImages: [],
      sessionId: conv.sessionId,
      restoredSession: Boolean(conv.sessionId) && loadedMessages.length > 0,
      lastContextWindow: conv.lastContextWindow,
      lastUsage: conv.lastUsage,
      activeLoops: savedLoopDisplay?.activeLoops ?? [],
      loopsStoppedNotice: savedLoopDisplay?.loopsStoppedNotice ?? false,
      pendingCommand: savedLoopDisplay?.pendingCommand ?? null,
      autonomyActive: savedLoopDisplay?.autonomyActive ?? false,
      lastActivityAt: savedLoopDisplay?.lastActivityAt ?? null,
      bannerStale: false,
      staleDismissed: false,
      goalRun: savedLoopDisplay?.goalRun ?? null,
      subagents: freezePersistedSubagents(conv.subagents),
      replMode: conv.replMode ?? getReplModeDefault(),
      selectedModel: conv.model ?? DEFAULT_MODEL,
    })

    get().refreshStaleWatchdog()

    if (conv.cwd && conv.cwd !== get().workspaceRoot) {
      await get().restoreWorkspaceFromCwd(conv.cwd)
    }

    setPref('conversation.lastActiveId', conv.id)
  },

  renameConversation: async (id: string, title: string) => {
    const res = await window.api.conversationRename({ id, title })
    if (!res.ok) return
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    }))
  },

  deleteConversation: async (id: string) => {
    const res = await window.api.conversationDelete({ id })
    if (!res.ok) return
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
    }))
    sessionLoopDisplayRegistry.clear(id)
    unregisterConversationRunsFor(id)
    pruneConversationScope(id)
    set((s) => {
      if (!(id in s.bgRuns)) return s
      const restBgRuns = { ...s.bgRuns }
      delete restBgRuns[id]
      return { ...s, bgRuns: restBgRuns }
    })
    if (get().conversationId === id) {
      get().clearConversation()
      setPref('conversation.lastActiveId', null)
    }
  },

  newConversation: () => {
    const leaving = get()
    const leavingId = leaving.conversationId
    if (leavingId !== null && leaving.currentRunId !== null) {
      const snapshot = buildConversationRunSnapshot(leaving)
      get().clearConversation()
      set((s) => ({ bgRuns: capBgRuns({ ...s.bgRuns, [leavingId]: snapshot }) }))
      syncConversationLoopDisplayAndRouting(leavingId, snapshot.currentRunId, {
        activeLoops: snapshot.activeLoops,
        loopsStoppedNotice: snapshot.loopsStoppedNotice,
        pendingCommand: snapshot.pendingCommand,
        autonomyActive: snapshot.autonomyActive,
        lastActivityAt: snapshot.lastActivityAt,
        goalRun: snapshot.goalRun,
      })
      return
    }
    get().clearConversation()
  },

  restoreLastActiveConversation: async () => {
    const lastId = getPref<string | null>('conversation.lastActiveId', null)
    if (!lastId) return
    await get().selectConversation(lastId)
  },
})
