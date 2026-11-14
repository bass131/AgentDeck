import type { AgentEventPayload } from '../../../shared/ipcContract'
import type { AppState, BeginCommandAction } from './reducer/types'
import type { ThreadItem } from './threadTypes'
import { CMD_CARDS } from '../lib/cmdCards'

import { handleText, handleThinking, handleThinkingClear, handleThinkingDelta } from './reducer/text'
import { handleToolCall, handleToolResult, handleSearchResult, handleBgTask } from './reducer/tool'
import { handleOrchestration, handleOrchestrationProgress } from './reducer/orchestration'
import { handleDone, handleError, handleSession, handleLoops, handleTodos, handleAutonomyStatus } from './reducer/lifecycle'
import { handlePermissionRequest, handleQuestionRequest } from './reducer/permission'
import { handleFileChanged, handleModelFallback, handleSubagent, handleOrchestrationDenied } from './reducer/notice'
import { handleApiRetry, handleCompact, handleSessionState } from './reducer/reliability'
import { handleHookLifecycle, handleInformational, handlePermissionDenied } from './reducer/cockpit'
import { isActivityEvent } from './staleWatchdog'

export type { ThreadItem } from './threadTypes'
export type {
  AppState,
  FileDiffEntry,
  PendingPermission,
  PendingQuestion,
  ToolCard,
  ToolCardStatus,
  BgTaskState,
  BeginCommandAction,
  HookRun,
} from './reducer/types'

export function makeInitialState(): AppState {
  return {
    currentRunId: null,
    thread: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    changedFiles: new Set<string>(),
    fileDiffs: {},
    isRunning: false,
    lastUsage: undefined,
    lastContextWindow: undefined,
    sessionId: undefined,
    activeLoops: [],
    loopsStoppedNotice: false,
    errorMessage: undefined,
    thinkingText: null,
    thinkingStartedAt: null,
    todos: [],
    subagents: [],
    pendingPermission: null,
    pendingQuestion: null,
    autonomyActive: false,
    lastActivityAt: null,
    bannerStale: false,
    staleDismissed: false,
    goalRun: null,
    apiRetry: null,
    compacting: null,
    sdkSessionState: null,
    hookRuns: [],
  }
}

export function applyBeginCommand(state: AppState, action: BeginCommandAction): AppState {
  const cfg = CMD_CARDS[action.name]
  if (!cfg) return state

  const cmdresultItem: Extract<ThreadItem, { kind: 'cmdresult' }> = {
    kind: 'cmdresult',
    id: action.cardId,
    name: action.name,
    title: cfg.running,
    sub: action.detail ?? null,
    running: true,
    time: action.time,
  }

  const beforeMsgs = state.thread.filter((m) => m.kind === 'msg').length

  return {
    ...state,
    thread: [...state.thread, cmdresultItem],
    pendingCommand: { name: action.name, cardId: action.cardId, beforeMsgs, turns: 0, detail: action.detail ?? null },
    openMsgId: null,
    openGroupId: null,
    ...(action.name === 'goal'
      ? { goalRun: { detail: action.detail ?? null, turns: 0, startedAt: action.nowMs ?? 0 } }
      : {}),
  }
}

export function applyAgentEvent(state: AppState, payload: AgentEventPayload | BeginCommandAction, time?: string, nowMs?: number): AppState {
  if ((payload as BeginCommandAction).type === 'begin-command') {
    return applyBeginCommand(state, payload as BeginCommandAction)
  }

  const agentPayload = payload as AgentEventPayload
  const { event } = agentPayload

  const next = ((): AppState => {
    switch (event.type) {
    case 'text':
      return handleText(state, event, time)
    case 'thinking':
      return handleThinking(state, event, nowMs)
    case 'thinking_delta':
      return handleThinkingDelta(state, event, nowMs)
    case 'thinking_clear':
      return handleThinkingClear(state)
    case 'todos':
      return handleTodos(state, event)
    case 'subagent':
      return handleSubagent(state, event)
    case 'tool_call':
      return handleToolCall(state, event, time)
    case 'orchestration':
      return handleOrchestration(state, event, time)
    case 'orchestration_progress':
      return handleOrchestrationProgress(state, event)
    case 'orchestration_denied':
      return handleOrchestrationDenied(state, event, time)
    case 'tool_result':
      return handleToolResult(state, event)
    case 'search_result':
      return handleSearchResult(state, event)
    case 'bg_task':
      return handleBgTask(state, event)
    case 'file_changed':
      return handleFileChanged(state, event)
    case 'model-fallback':
      return handleModelFallback(state, event, time)
    case 'permission_request':
      return handlePermissionRequest(state, event, agentPayload.runId)
    case 'question_request':
      return handleQuestionRequest(state, event, agentPayload.runId)
    case 'done':
      return handleDone(state, event)
    case 'error':
      return handleError(state, event)
    case 'session':
      return handleSession(state, event)
    case 'loops':
      return handleLoops(state, event)
    case 'autonomy_status':
      return handleAutonomyStatus(state, event)
    case 'api_retry':
      return handleApiRetry(state, event)
    case 'compact':
      return handleCompact(state, event, time)
    case 'session_state':
      return handleSessionState(state, event)
    case 'hook_lifecycle':
      return handleHookLifecycle(state, event, time, agentPayload.runId)
    case 'informational':
      return handleInformational(state, event, time)
    case 'permission_denied':
      return handlePermissionDenied(state, event, time)
    default:
      return state
    }
  })()

  if (nowMs !== undefined && isActivityEvent(event.type)) {
    return { ...next, lastActivityAt: nowMs, bannerStale: false, staleDismissed: false }
  }
  return next
}
