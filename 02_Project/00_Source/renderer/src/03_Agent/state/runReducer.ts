import type { AgentEventPayload } from '@shared/ipcContract'
import { applyAgentEvent, applyBeginCommand } from '@renderer/05_Conversation/state/reducer'
import type { AppState } from '@renderer/05_Conversation/state/reducer'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import {
  closeAbortedCommandCard,
  closeAbortedOrchestrationCards,
  markInterruptedOpenMsg,
  terminalResetFields,
} from '@renderer/05_Conversation/state/reducer/helpers'
import { handleError } from '@renderer/05_Conversation/state/reducer/lifecycle'

// 단일(store)과 멀티(패널) 실행 상태가 공유하는 순수 reducer.
// 시각·id는 액션에 실려 오고, 이 파일은 시계·id 생성기를 부르지 않는다.

export interface RunCoreState extends AppState {
  runGeneration?: string | null
  replMode: boolean
}

interface SendStartFields {
  runGeneration?: string
  clearError?: boolean
}

export type RunAction =
  | { type: 'SET_RUN_ID'; runId: string }
  | ({
      type: 'ADD_USER_MESSAGE'
      id: string
      content: string
      time?: string
      images?: string[]
    } & SendStartFields)
  | ({
      type: 'ADD_COMMAND_CARD'
      name: string
      cardId: string
      time: string
      detail?: string | null
      nowMs?: number
    } & SendStartFields)
  | { type: 'RUN_FAILED'; message: string; runGeneration?: string; restoreGeneration?: string | null }
  | { type: 'CLEAR_LOOPS'; markInterrupted?: boolean }
  | { type: 'MARK_INTERRUPTED' }
  | { type: 'CLOSE_DEAD_RUN' }
  | { type: 'CLEAR_PENDING_PERMISSION' }
  | { type: 'CLEAR_PENDING_QUESTION' }
  | { type: 'MARK_GOAL_STALE' }
  | { type: 'APPLY_EVENT'; payload: AgentEventPayload; time?: string; nowMs?: number }

function sendStartPatch(fields: SendStartFields): Partial<RunCoreState> {
  return {
    ...(fields.clearError ? { errorMessage: undefined } : {}),
    ...(fields.runGeneration !== undefined ? { runGeneration: fields.runGeneration } : {}),
  }
}

export function closeDeadRunState<T extends AppState & { runGeneration?: string | null }>(state: T): T {
  return {
    ...state,
    ...terminalResetFields(state),
    runGeneration: null,
    thread: closeAbortedOrchestrationCards(
      closeAbortedCommandCard(state.thread, state.pendingCommand?.cardId)
    ),
  }
}

export function isEventForCurrentRun(state: Pick<AppState, 'currentRunId'>, payload: AgentEventPayload): boolean {
  return state.currentRunId !== null && payload.runId === state.currentRunId
}

export function runReducer<S extends RunCoreState>(state: S, action: RunAction): S {
  switch (action.type) {
    case 'SET_RUN_ID':
      return { ...state, currentRunId: action.runId, loopsStoppedNotice: false }

    case 'ADD_USER_MESSAGE': {
      const userThreadItem: ThreadItem = {
        kind: 'msg',
        id: action.id,
        role: 'user',
        text: action.content,
        ...(action.time !== undefined ? { time: action.time } : {}),
        ...(action.images && action.images.length > 0 ? { images: action.images } : {}),
      }
      return {
        ...state,
        thread: [...state.thread, userThreadItem],
        isRunning: true,
        ...sendStartPatch(action),
      }
    }

    case 'ADD_COMMAND_CARD': {
      const next = applyBeginCommand(state, {
        type: 'begin-command',
        name: action.name,
        cardId: action.cardId,
        time: action.time,
        ...(action.nowMs !== undefined ? { nowMs: action.nowMs } : {}),
        ...(action.detail ? { detail: action.detail } : {}),
      })
      return {
        ...state,
        ...next,
        isRunning: true,
        ...sendStartPatch(action),
      }
    }

    case 'RUN_FAILED': {
      const next: S = { ...state, ...handleError(state, { type: 'error', message: action.message }) }
      if (action.runGeneration === undefined) return next
      return {
        ...next,
        runGeneration: state.runGeneration === action.runGeneration
          ? (action.restoreGeneration ?? null)
          : state.runGeneration,
      }
    }

    case 'CLEAR_LOOPS': {
      const thread = action.markInterrupted
        ? markInterruptedOpenMsg(state.thread, state.openMsgId)
        : state.thread
      return {
        ...state,
        ...terminalResetFields(state),
        runGeneration: null,
        thread: closeAbortedOrchestrationCards(
          closeAbortedCommandCard(thread, state.pendingCommand?.cardId)
        ),
      }
    }

    case 'MARK_INTERRUPTED': {
      const marked = markInterruptedOpenMsg(state.thread, state.openMsgId)
      return marked === state.thread ? state : { ...state, thread: marked }
    }

    case 'CLOSE_DEAD_RUN':
      return closeDeadRunState(state)

    case 'CLEAR_PENDING_PERMISSION':
      return { ...state, pendingPermission: null }

    case 'CLEAR_PENDING_QUESTION':
      return { ...state, pendingQuestion: null }

    case 'MARK_GOAL_STALE':
      return { ...state, bannerStale: true }

    case 'APPLY_EVENT': {
      if (!isEventForCurrentRun(state, action.payload)) return state
      const next = applyAgentEvent(state, action.payload, action.time, action.nowMs)
      return next === state ? state : { ...state, ...next }
    }

    default:
      return state
  }
}
