import type { StateCreator } from 'zustand'
import type { ConversationMessage } from '../../../../shared/ipcContract'
import { applyAgentEvent, applyBeginCommand } from '../reducer'
import type { AppState } from '../reducer'
import type { ThreadItem } from '../threadTypes'
import { commandOf, goalDetailOf } from '../../lib/cmdCards'
import { nowTimeKo } from '../../lib/time'
import { closeAbortedCommandCard, closeAbortedOrchestrationCards, markInterruptedOpenMsg, terminalResetFields } from '../reducer/helpers'
import { handleError } from '../reducer/lifecycle'
import { createStaleTimer, isStaleNow, remainingStaleMs } from '../staleWatchdog'
import { nextMsgId } from './ids'
import { buildConversationSavePayload } from './conversationPayload'
import {
  syncConversationLoopDisplayAndRouting,
  syncConversationLoopDisplay,
  registerConversationRun,
  lookupConversationForRun,
  unregisterConversationRun,
  unregisterConversationRunsFor,
  applyLoopDisplayEventFallback,
  sessionLoopDisplayRegistry,
} from './loopDisplay'
import type { AppStore, ConversationRunState } from './types'

export interface RuntimeState {
  runGeneration: string | null
}

export interface RuntimeActions {
  sendMessage: (text: string, pickerValues?: { model: string; effort: string; mode: string }, promptForEngine?: string, displayImages?: string[], orchestration?: boolean) => Promise<void>
  abortRun: () => Promise<void>
  dismissLoopsStopped: () => void
  interruptRun: () => Promise<void>
  subscribeAgentEvents: () => () => void
  respondPermission: (behavior: 'allow' | 'allow_always' | 'deny') => Promise<void>
  respondQuestion: (answers: string[][] | null) => Promise<void>
  refreshStaleWatchdog: () => void
  dismissGoalStale: () => void
}

function closeDeadRunState<T extends AppState>(state: T): T {
  return {
    ...state,
    ...terminalResetFields(state),
    runGeneration: null,
    thread: closeAbortedOrchestrationCards(
      closeAbortedCommandCard(state.thread, state.pendingCommand?.cardId)
    ),
  }
}

export const createRuntimeSlice: StateCreator<AppStore, [], [], RuntimeState & RuntimeActions> = (set, get) => {
  const pendingRunGenerations = new Set<string>()

  const foregroundStaleTimer = createStaleTimer(() => {
    set({ bannerStale: true })
  })

  return ({
    runGeneration: null,

  sendMessage: async (text: string, pickerValues?: { model: string; effort: string; mode: string }, promptForEngine?: string, displayImages?: string[], orchestration?: boolean) => {
    const state = get()
    if (state.isRunning) return
    const runGeneration = crypto.randomUUID()

    const cmdName = commandOf(text)
    if (cmdName) {
      const cardId = `cmd-${nextMsgId()}`
      const time = nowTimeKo()
      const cmdDetail = goalDetailOf(cmdName, text)
      set((s) => ({
        ...applyBeginCommand(s as AppState, {
          type: 'begin-command',
          name: cmdName,
          cardId,
          time,
          nowMs: Date.now(),
          ...(cmdDetail ? { detail: cmdDetail } : {}),
        }),
        errorMessage: undefined,
        isRunning: true,
        runGeneration,
      }))
    } else {
      const userThreadItem: ThreadItem = {
        kind: 'msg',
        id: nextMsgId(),
        role: 'user',
        text,
        time: nowTimeKo(),
        ...(displayImages && displayImages.length > 0 ? { images: displayImages } : {}),
      }

      set((s) => ({
        thread: [...s.thread, userThreadItem],
        errorMessage: undefined,
        isRunning: true,
        runGeneration,
      }))
    }

    const history: ConversationMessage[] = get().thread
      .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
      .map((m) => ({
        role: m.role,
        content: m.text,
      }))

    if (cmdName) {
      history.push({ role: 'user', content: text })
    }

    if (promptForEngine && history.length > 0) {
      history[history.length - 1] = { ...history[history.length - 1], content: promptForEngine }
    }

    pendingRunGenerations.add(runGeneration)
    const { replMode, conversationId: convId, currentSessionKey } = get()

    if (replMode && convId === null) {
      await get().saveConversation().catch(() => {})
    }
    const resolvedSessionKey = get().conversationId ?? currentSessionKey

    let res: Awaited<ReturnType<typeof window.api.agentRun>>
    try {
      res = await window.api.agentRun({
        messages: history,
        workspaceRoot: get().workspaceRoot ?? undefined,
        model: pickerValues?.model,
        effort: pickerValues?.effort,
        mode: pickerValues?.mode,
        orchestration,
        resumeSessionId: get().sessionId,
        ...(replMode ? { persistent: true, sessionKey: resolvedSessionKey } : {}),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set((s) => ({
        ...handleError(s as AppState, { type: 'error', message }),
        runGeneration: s.runGeneration === runGeneration ? state.runGeneration : s.runGeneration,
      } as Partial<AppStore>))
      return
    } finally {
      pendingRunGenerations.delete(runGeneration)
    }

    set({ currentRunId: res.runId, loopsStoppedNotice: false })

    const convIdForRouting = get().conversationId
    if (convIdForRouting !== null) {
      registerConversationRun(res.runId, convIdForRouting)
    }

    void get().saveConversation()
  },

  abortRun: async () => {
    const abortState = get()
    const { currentRunId, runGeneration, pendingCommand, thread, openMsgId } = abortState
    if (!currentRunId || (runGeneration !== null && pendingRunGenerations.has(runGeneration))) return
    set({
      ...terminalResetFields(abortState),
      queue: [],
      runGeneration: null,
      thread: closeAbortedOrchestrationCards(
        closeAbortedCommandCard(markInterruptedOpenMsg(thread, openMsgId), pendingCommand?.cardId)
      ),
    })
    get().refreshStaleWatchdog()
    await window.api.agentAbort({ runId: currentRunId })
  },

  dismissLoopsStopped: () => {
    set({ loopsStoppedNotice: false })
  },

  refreshStaleWatchdog: () => {
    const { goalRun, lastActivityAt } = get()
    if (!goalRun || lastActivityAt === null) {
      foregroundStaleTimer.dispose()
      return
    }
    const now = Date.now()
    if (isStaleNow(lastActivityAt, now)) {
      foregroundStaleTimer.dispose()
      if (!get().bannerStale) set({ bannerStale: true })
      return
    }
    set({ bannerStale: false })
    foregroundStaleTimer.arm(remainingStaleMs(lastActivityAt, now))
  },

  dismissGoalStale: () => {
    set({ staleDismissed: true })
  },

  interruptRun: async () => {
    const {
      currentRunId,
      runGeneration,
      conversationId: targetConversationId,
    } = get()
    if (!currentRunId || (runGeneration !== null && pendingRunGenerations.has(runGeneration))) return
    const { accepted } = await window.api.agentInterrupt({ runId: currentRunId })
    if (accepted) {
      const after = get()
      if (
        after.conversationId === targetConversationId
        && after.currentRunId === currentRunId
        && after.runGeneration === runGeneration
      ) {
        const marked = markInterruptedOpenMsg(after.thread, after.openMsgId)
        if (marked !== after.thread) set({ thread: marked })
      }
      return
    }

    const state = get()
    const foreground = (
      state.conversationId === targetConversationId
      && state.currentRunId === currentRunId
      && state.runGeneration === runGeneration
    ) ? closeDeadRunState(state) : null
    const background = targetConversationId !== null
      ? state.bgRuns[targetConversationId]
      : undefined
    const cleanedBackground = (
      background?.currentRunId === currentRunId
      && background.runGeneration === runGeneration
    ) ? closeDeadRunState(background) : null

    if (foreground && targetConversationId !== null && cleanedBackground) {
      set({
        ...foreground,
        bgRuns: {
          ...state.bgRuns,
          [targetConversationId]: cleanedBackground,
        },
      })
    } else if (foreground) {
      set(foreground)
    } else if (targetConversationId !== null && cleanedBackground) {
      set({
        bgRuns: {
          ...state.bgRuns,
          [targetConversationId]: cleanedBackground,
        },
      })
    }

    const cleaned: AppState | null = cleanedBackground ?? foreground
    const newerForegroundOwnsSameConversation = (
      cleanedBackground !== null
      && foreground === null
      && state.conversationId === targetConversationId
      && state.runGeneration !== null
      && state.runGeneration !== runGeneration
    )
    if (cleaned && targetConversationId !== null && !newerForegroundOwnsSameConversation) {
      syncConversationLoopDisplay(targetConversationId, {
        activeLoops: cleaned.activeLoops,
        loopsStoppedNotice: cleaned.loopsStoppedNotice,
        pendingCommand: cleaned.pendingCommand,
        autonomyActive: cleaned.autonomyActive,
        lastActivityAt: cleaned.lastActivityAt,
      })
      unregisterConversationRunsFor(targetConversationId)
    }
    get().refreshStaleWatchdog()
  },

  subscribeAgentEvents: () => {
    const unsubscribe = window.api.onAgentEvent((payload) => {
      const t = nowTimeKo()
      const nowMs = Date.now()

      if (payload.runId === get().currentRunId) {
        if (payload.event.type === 'permission_mode') {
          set({ pickerMode: payload.event.mode })
          return
        }
        set((state) => applyAgentEvent(state as AppState, payload, t, nowMs) as Partial<AppStore>)

        get().refreshStaleWatchdog()

        if (payload.event.type === 'session') {
          void get().saveConversation()
        }

        if (payload.event.type === 'done') {
          void get().saveConversation()
          void get().refreshFileTree()
        }
        if (payload.event.type === 'error') {
          void get().refreshFileTree()
        }
        if ((payload.event.type === 'done' || payload.event.type === 'error') && get().conversationId !== null) {
          if (sessionLoopDisplayRegistry.read(get().conversationId as string) === undefined) {
            unregisterConversationRun(payload.runId)
          }
        }
        return
      }

      const bgEntries = Object.entries(get().bgRuns)
      const bgHit = bgEntries.find(([, s]) => s.currentRunId === payload.runId)
      if (bgHit) {
        const [bgConvId, bgState] = bgHit
        const nextBg = applyAgentEvent(bgState as AppState, payload, t, nowMs) as unknown as ConversationRunState

        set((state) => ({
          bgRuns: { ...state.bgRuns, [bgConvId]: nextBg },
        }))

        syncConversationLoopDisplayAndRouting(bgConvId, payload.runId, {
          activeLoops: nextBg.activeLoops,
          loopsStoppedNotice: nextBg.loopsStoppedNotice,
          pendingCommand: nextBg.pendingCommand,
          autonomyActive: nextBg.autonomyActive,
          lastActivityAt: nextBg.lastActivityAt,
          goalRun: nextBg.goalRun,
        })

        if (payload.event.type === 'done' || payload.event.type === 'session') {
          const convPayload = buildConversationSavePayload(
            {
              thread: nextBg.thread,
              workspaceRoot: nextBg.workspaceRoot,
              sessionId: nextBg.sessionId,
              lastContextWindow: nextBg.lastContextWindow,
              lastUsage: nextBg.lastUsage,
              subagents: nextBg.subagents,
              replMode: nextBg.replMode,
            },
            bgConvId
          )
          if (convPayload) {
            void window.api.conversationSave({ conversation: convPayload }).then(() => {
              void get().listConversations()
            })
          }
        }
        return
      }

      const routedConvId = lookupConversationForRun(payload.runId)
      if (routedConvId !== undefined) {
        applyLoopDisplayEventFallback(routedConvId, payload.event, nowMs)
        if (sessionLoopDisplayRegistry.read(routedConvId) === undefined) {
          unregisterConversationRun(payload.runId)
        }
        return
      }

    })
    return unsubscribe
  },

  respondPermission: async (behavior) => {
    const { pendingPermission } = get()
    if (!pendingPermission) return

    set({ pendingPermission: null })

    try {
      await window.api.permissionRespond({
        runId: pendingPermission.runId,
        requestId: pendingPermission.requestId,
        behavior,
      })
    } catch {
    }
  },

  respondQuestion: async (answers) => {
    const { pendingQuestion } = get()
    if (!pendingQuestion) return

    set({ pendingQuestion: null })

    try {
      await window.api.questionRespond({
        runId: pendingQuestion.runId,
        requestId: pendingQuestion.requestId,
        answers,
      })
    } catch {
    }
  },
  })
}
