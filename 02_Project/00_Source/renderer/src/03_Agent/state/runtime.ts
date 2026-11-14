import type { StateCreator } from 'zustand'
import { applyAgentEvent } from '@renderer/05_Conversation/state/reducer'
import type { AppState } from '@renderer/05_Conversation/state/reducer'
import { nowTimeKo } from '../time'
import { buildConversationSavePayload } from '@renderer/06_Sessions/state/conversationPayload'
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
import { createRunCore, createStaleWatchdogs } from './runCore'
import type { InterruptTarget, RunTarget } from './runCore'
import { closeDeadRunState, runReducer } from './runReducer'
import type { RunAction } from './runReducer'
import type { AppStore, ConversationRunState } from '@renderer/00_App/state/types'

// 단일(전경 대화) 어댑터 — 실행 동작은 runCore에 있고, 여기는 store 읽기·쓰기와 단일 전용 부수효과만 넘긴다.
// 배경 대화(bgRuns)로의 이벤트 분배는 상태 거처 문제라 G9c까지 여기 남는다.

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

const FOREGROUND_KEY = 'foreground'

export const createRuntimeSlice: StateCreator<AppStore, [], [], RuntimeState & RuntimeActions> = (set, get) => {
  // 대기열(E9)도 공용 reducer가 다룬다(G9b) — 중단(CLEAR_LOOPS)이 같은 갱신에서 비운다.
  const dispatch = (action: RunAction): void => {
    set((s) => runReducer(s, action))
  }

  const watchdogs = createStaleWatchdogs({
    markStale: () => dispatch({ type: 'MARK_GOAL_STALE' }),
    onFresh: () => set({ bannerStale: false }),
  })

  const onInterruptRejected = (target: InterruptTarget, foregroundClosed: boolean): void => {
    const state = get()
    const targetConversationId = target.owner
    const background = targetConversationId !== null
      ? state.bgRuns[targetConversationId]
      : undefined
    const cleanedBackground = (
      background?.currentRunId === target.runId
      && background.runGeneration === target.runGeneration
    ) ? closeDeadRunState(background) : null

    if (targetConversationId !== null && cleanedBackground) {
      set({
        bgRuns: {
          ...state.bgRuns,
          [targetConversationId]: cleanedBackground,
        },
      })
    }

    const cleaned: AppState | null = cleanedBackground ?? (foregroundClosed ? state : null)
    const newerForegroundOwnsSameConversation = (
      cleanedBackground !== null
      && !foregroundClosed
      && state.conversationId === targetConversationId
      && state.runGeneration !== null
      && state.runGeneration !== target.runGeneration
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
  }

  const core = createRunCore<AppStore>({
    readState: get,
    dispatch,
    refreshStale: () => get().refreshStaleWatchdog(),
    owner: () => get().conversationId,
    resolveRunTarget: () => {
      const { replMode, conversationId: convId, currentSessionKey } = get()
      const finish = (): RunTarget => {
        const resolvedSessionKey = get().conversationId ?? currentSessionKey
        return {
          workspaceRoot: get().workspaceRoot ?? undefined,
          resumeSessionId: get().sessionId,
          ...(replMode ? { persistent: true, sessionKey: resolvedSessionKey } : {}),
        }
      }
      if (replMode && convId === null) {
        return get().saveConversation().catch(() => {}).then(finish)
      }
      return finish()
    },
    onRunStarted: (runId) => {
      const convIdForRouting = get().conversationId
      if (convIdForRouting !== null) {
        registerConversationRun(runId, convIdForRouting)
      }
      void get().saveConversation()
    },
    onInterruptRejected,
    onPermissionMode: (mode) => set({ pickerMode: mode }),
    onEvent: (payload) => {
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
    },
  })

  return ({
    runGeneration: null,

    sendMessage: async (text, pickerValues, promptForEngine, displayImages, orchestration) => {
      await core.send({
        text,
        engineText: promptForEngine,
        displayImages,
        options: { picker: pickerValues, orchestration },
      })
    },

    abortRun: async () => {
      await core.abort()
    },

    dismissLoopsStopped: () => {
      set({ loopsStoppedNotice: false })
    },

    refreshStaleWatchdog: () => {
      watchdogs.refresh(FOREGROUND_KEY, get())
    },

    dismissGoalStale: () => {
      set({ staleDismissed: true })
    },

    interruptRun: async () => {
      await core.interrupt()
    },

    subscribeAgentEvents: () => {
      const unsubscribe = window.api.onAgentEvent((payload) => {
        if (core.handleEvent(payload)) return

        const t = nowTimeKo()
        const nowMs = Date.now()

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
      await core.respondPermission(behavior)
    },

    respondQuestion: async (answers) => {
      await core.respondQuestion(answers)
    },
  })
}
