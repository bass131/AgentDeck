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
import { createRunCore } from './runCore'
import type { InterruptTarget, RunTarget } from './runCore'
import { closeDeadRunState, runReducer } from './runReducer'
import type { RunAction } from './runReducer'
import { convKey } from './sessionKeys'
import { sessionRegistry } from './sessionRegistry'
import type { AgentEventPayload } from '@shared/ipcContract'
import type { AppStore, ConversationRunState } from '@renderer/00_App/state/types'

// 단일(전경 대화) 어댑터 — 실행 동작은 runCore에, 라우팅·루프 표시·stale 타이머·이벤트 구독은 세션 레지스트리에
// 있다(G9c). 여기는 대화 종류의 정책과 store 읽기·쓰기, 단일 전용 부수효과만 넘긴다.

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

// 전경 대화의 stale 타이머는 대화가 바뀌어도 하나다(대화 정책) — 활성 키가 아니라 고정 키에 둔다.
const FOREGROUND_STALE_KEY = convKey('@foreground')

export const createRuntimeSlice: StateCreator<AppStore, [], [], RuntimeState & RuntimeActions> = (set, get) => {
  // 대기열(E9)도 공용 reducer가 다룬다(G9b) — 중단(CLEAR_LOOPS)이 같은 갱신에서 비운다.
  const dispatch = (action: RunAction): void => {
    set((s) => runReducer(s, action))
  }

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

  // 대화 종류의 이벤트 정책 — 전경 run이면 코어가, 배경 대화 run이면 그 항목이, 축출된 run이면 루프 표시 대체
  // 처리가 받는다.
  const handleConversationEvent = (payload: AgentEventPayload): void => {
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
    }
  }

  sessionRegistry.defineKind('conv', {
    markStale: () => dispatch({ type: 'MARK_GOAL_STALE' }),
    // stale이 아니면 전경 배너를 끈다(대화 정책). 패널 종류는 이 포트가 없다.
    onFresh: () => set({ bannerStale: false }),
    handleEvent: handleConversationEvent,
    // 활성 키의 저장 칸 = store 평탄화 필드(안 A).
    active: {
      key: () => convKey(get().conversationId),
      read: () => get(),
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
      sessionRegistry.refreshStale(FOREGROUND_STALE_KEY, get())
    },

    dismissGoalStale: () => {
      set({ staleDismissed: true })
    },

    interruptRun: async () => {
      await core.interrupt()
    },

    // 대화 몫의 이벤트 구독 — Shell 마운트마다 잡고, 그때의 window.api로 실제 구독을 다시 붙인다.
    subscribeAgentEvents: () => sessionRegistry.acquireEvents('conv', { rebind: true }),

    respondPermission: async (behavior) => {
      await core.respondPermission(behavior)
    },

    respondQuestion: async (answers) => {
      await core.respondQuestion(answers)
    },
  })
}
