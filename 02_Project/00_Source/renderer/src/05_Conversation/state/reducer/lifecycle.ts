import type { AgentEvent } from '../../../../shared/agentEvents'
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'
import { CMD_CARDS } from '../../lib/cmdCards'

type DoneEvent = Extract<AgentEvent, { type: 'done' }>
type ErrorEvent = Extract<AgentEvent, { type: 'error' }>
type SessionEvent = Extract<AgentEvent, { type: 'session' }>
type LoopsEvent = Extract<AgentEvent, { type: 'loops' }>
type TodosEvent = Extract<AgentEvent, { type: 'todos' }>
type AutonomyStatusEvent = Extract<AgentEvent, { type: 'autonomy_status' }>

export function handleTodos(state: AppState, event: TodosEvent): AppState {
  return {
    ...state,
    todos: event.todos,
  }
}

export function handleSession(state: AppState, event: SessionEvent): AppState {
  return { ...state, sessionId: event.sessionId }
}

export function handleLoops(state: AppState, event: LoopsEvent): AppState {
  return {
    ...state,
    activeLoops: event.loops,
    loopsStoppedNotice: event.loops.length > 0 ? false : state.loopsStoppedNotice,
  }
}

export function handleAutonomyStatus(state: AppState, event: AutonomyStatusEvent): AppState {
  const active = event.status === 'active'
  return {
    ...state,
    autonomyActive: active,
    ...(active ? {} : { goalRun: null }),
  }
}

export function handleDone(state: AppState, event: DoneEvent): AppState {
  const closeOrch = (items: ThreadItem[]): ThreadItem[] =>
    items.map((item) =>
      item.kind === 'orchestration' && item.running ? { ...item, running: false } : item
    )

  const markCronOrigin = (items: ThreadItem[]): ThreadItem[] => {
    if (event.origin !== 'cron') return items
    let lastAssistantIdx = -1
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (it.kind === 'msg' && it.role === 'assistant') {
        lastAssistantIdx = i
        break
      }
    }
    if (lastAssistantIdx === -1) return items
    return items.map((it, idx) => {
      if (idx !== lastAssistantIdx) return it
      return { ...it, origin: 'cron' as const }
    })
  }

  const base = {
    ...state,
    isRunning: false,
    lastUsage: event.usage,
    lastContextWindow: event.contextWindow,
    thinkingText: null,
    thinkingStartedAt: null,
    pendingPermission: null,
    pendingQuestion: null,
    openMsgId: null,
    openGroupId: null,
    pendingCommand: null,
    apiRetry: null,
    compacting: null,
    sdkSessionState: null,
    thread: markCronOrigin(closeOrch(state.thread)),
  }

  const pc = state.pendingCommand
  if (pc) {
    const cfg = CMD_CARDS[pc.name]
    if (cfg) {
      const goalTurns = pc.name === 'goal' ? (pc.turns ?? 0) : 0
      const doneTitle = goalTurns > 0 ? `${cfg.title} · ${goalTurns}턴` : cfg.title
      return {
        ...base,
        thread: markCronOrigin(closeOrch(state.thread)).map((item) => {
          if (item.kind !== 'cmdresult' || item.id !== pc.cardId) return item
          const sub = pc.name === 'compact'
            ? (pc.beforeMsgs > 0
                ? `이전 ${pc.beforeMsgs}개 메시지를 핵심 요약으로 압축했습니다.`
                : '대화를 핵심 요약으로 압축했습니다.')
            : pc.name === 'goal'
              ? item.sub ?? null
              : cfg.sub
          return {
            ...item,
            running: false,
            title: doneTitle,
            sub,
          }
        }),
      }
    }
  }

  return base
}

export function handleError(state: AppState, event: ErrorEvent): AppState {
  const closeOrchFailed = (items: ThreadItem[]): ThreadItem[] =>
    items.map((item) =>
      item.kind === 'orchestration' && item.running
        ? { ...item, running: false, failed: true as const }
        : item
    )

  const errBase = {
    ...state,
    isRunning: false,
    errorMessage: event.message,
    thinkingText: null,
    thinkingStartedAt: null,
    pendingPermission: null,
    pendingQuestion: null,
    openMsgId: null,
    openGroupId: null,
    pendingCommand: null,
    autonomyActive: false,
    goalRun: null,
    apiRetry: null,
    compacting: null,
    sdkSessionState: null,
    thread: closeOrchFailed(state.thread),
  }

  const pc = state.pendingCommand
  if (pc) {
    return {
      ...errBase,
      thread: closeOrchFailed(state.thread).map((item) =>
        item.kind === 'cmdresult' && item.id === pc.cardId
          ? {
              ...item,
              running: false,
              failed: true as const,
              title: '명령을 완료하지 못했어요',
              sub: event.message || null,
            }
          : item
      ),
    }
  }

  return errBase
}
