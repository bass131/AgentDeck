import type { AgentEvent, SubAgentTranscriptItem } from '../../../../shared/agentEvents'
import { CMD_CARDS } from '../../lib/cmdCards'
import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'

type TextEvent = Extract<AgentEvent, { type: 'text' }>
type ThinkingEvent = Extract<AgentEvent, { type: 'thinking' }>
type ThinkingDeltaEvent = Extract<AgentEvent, { type: 'thinking_delta' }>

export function handleText(state: AppState, event: TextEvent, time?: string): AppState {
  if (event.parentToolId) {
    const saId = event.parentToolId
    const transcriptItem: SubAgentTranscriptItem = {
      kind: 'text',
      text: event.delta,
    }
    const updatedSubagents = state.subagents.map((sa) => {
      if (sa.id !== saId) return sa
      const prev = sa.transcript ?? []
      return { ...sa, transcript: [...prev, transcriptItem] }
    })
    return {
      ...state,
      subagents: updatedSubagents,
      isRunning: true,
      apiRetry: null,
    }
  }

  const msgId: string = event.messageId ?? state.openMsgId ?? `m${state.seq + 1}`
  const isNewId = !event.messageId && !state.openMsgId

  const existsInThread = state.thread.some(
    (item) => item.kind === 'msg' && item.id === msgId
  )

  let nextThread: ThreadItem[]
  let nextSeq = state.seq

  if (existsInThread) {
    nextThread = state.thread.map((item) => {
      if (item.kind === 'msg' && item.id === msgId) {
        return { ...item, text: item.text + event.delta }
      }
      return item
    })
  } else {
    if (isNewId) nextSeq = state.seq + 1
    nextThread = [
      ...state.thread,
      {
        kind: 'msg' as const,
        role: 'assistant' as const,
        id: msgId,
        text: event.delta,
        ...(time !== undefined ? { time } : {}),
      },
    ]
  }

  let nextPendingCommand = state.pendingCommand
  if (!existsInThread && state.pendingCommand?.name === 'goal') {
    const pc = state.pendingCommand
    const turns = (pc.turns ?? 0) + 1
    nextPendingCommand = { ...pc, turns }
    const goalCfg = CMD_CARDS['goal']
    nextThread = nextThread.map((item) =>
      item.kind === 'cmdresult' && item.id === pc.cardId && item.running
        ? { ...item, title: `${goalCfg.running} · ${turns}턴` }
        : item
    )
  }

  let nextGoalRun = state.goalRun
  if (!existsInThread && state.goalRun !== null) {
    nextGoalRun = { ...state.goalRun, turns: state.goalRun.turns + 1 }
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    pendingCommand: nextPendingCommand,
    goalRun: nextGoalRun,
    openGroupId: null,
    openMsgId: msgId,
    thinkingText: null,
    thinkingStartedAt: null,
    isRunning: true,
    apiRetry: null,
  }
}

export function handleThinking(state: AppState, event: ThinkingEvent, nowMs?: number): AppState {
  if (event.parentToolId) {
    const saId = event.parentToolId
    const transcriptItem: SubAgentTranscriptItem = {
      kind: 'thinking',
      text: event.text,
    }
    const updatedSubagents = state.subagents.map((sa) => {
      if (sa.id !== saId) return sa
      const prev = sa.transcript ?? []
      return { ...sa, transcript: [...prev, transcriptItem] }
    })
    return {
      ...state,
      subagents: updatedSubagents,
      isRunning: true,
    }
  }

  const lastItem = state.thread[state.thread.length - 1]
  let nextThread: ThreadItem[]
  let nextSeq = state.seq
  let nextThinkingStartedAt = state.thinkingStartedAt

  if (lastItem && lastItem.kind === 'thinking') {
    nextThread = [...state.thread.slice(0, -1), { ...lastItem, text: event.text }]
  } else {
    nextSeq = state.seq + 1
    nextThread = [...state.thread, { kind: 'thinking' as const, id: `th${nextSeq}`, text: event.text }]
    nextThinkingStartedAt = nowMs ?? null
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    thinkingText: event.text,
    thinkingStartedAt: nextThinkingStartedAt,
    isRunning: true,
  }
}

export function handleThinkingDelta(state: AppState, event: ThinkingDeltaEvent, nowMs?: number): AppState {
  const lastItem = state.thread[state.thread.length - 1]
  let nextThread: ThreadItem[]
  let nextSeq = state.seq
  let nextThinkingStartedAt = state.thinkingStartedAt

  if (lastItem && lastItem.kind === 'thinking') {
    const updated: ThreadItem = {
      ...lastItem,
      ...(event.text !== undefined ? { text: lastItem.text + event.text } : {}),
      ...(event.estimatedTokens !== undefined ? { estimatedTokens: event.estimatedTokens } : {}),
    }
    nextThread = [...state.thread.slice(0, -1), updated]
  } else {
    nextSeq = state.seq + 1
    nextThread = [
      ...state.thread,
      {
        kind: 'thinking' as const,
        id: `th${nextSeq}`,
        text: event.text ?? '',
        ...(event.estimatedTokens !== undefined ? { estimatedTokens: event.estimatedTokens } : {}),
      },
    ]
    nextThinkingStartedAt = nowMs ?? null
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    thinkingStartedAt: nextThinkingStartedAt,
    isRunning: true,
  }
}

export function handleThinkingClear(state: AppState): AppState {
  return {
    ...state,
    thinkingText: null,
    thinkingStartedAt: null,
  }
}
