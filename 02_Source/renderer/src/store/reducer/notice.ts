import type { AgentEvent, SubAgentInfo } from '../../../../shared/agentEvents'
import type { ThreadItem } from '../threadTypes'
import type { AppState, FileDiffEntry } from './types'
import { copyForOrchestrationDenied } from '../../lib/orchestrationDeniedCopy'

type FileChangedEvent = Extract<AgentEvent, { type: 'file_changed' }>
type ModelFallbackEvent = Extract<AgentEvent, { type: 'model-fallback' }>
type SubagentEvent = Extract<AgentEvent, { type: 'subagent' }>
type OrchestrationDeniedEvent = Extract<AgentEvent, { type: 'orchestration_denied' }>

export function handleFileChanged(state: AppState, event: FileChangedEvent): AppState {
  const nextFiles = new Set(state.changedFiles)
  nextFiles.add(event.path)

  const diffKey = event.toolId ?? event.path
  if (event.diff && event.diff.length > 0) {
    const nextDiffs: Record<string, FileDiffEntry> = {
      ...state.fileDiffs,
      [diffKey]: {
        add: event.add ?? 0,
        del: event.del ?? 0,
        lines: event.diff,
      },
    }
    return {
      ...state,
      changedFiles: nextFiles,
      fileDiffs: nextDiffs,
    }
  }

  return {
    ...state,
    changedFiles: nextFiles,
  }
}

export function handleModelFallback(state: AppState, event: ModelFallbackEvent, time?: string): AppState {
  const retractId = event.retractMessageId
  const shouldRetract = typeof retractId === 'string' && retractId.length > 0

  const withoutRetracted: typeof state.thread = shouldRetract
    ? state.thread.filter(
        (item) => !(item.kind === 'msg' && item.id === retractId)
      )
    : state.thread

  const nextSeq = state.seq + 1
  const noticeId = `fb${nextSeq}`
  const nextThread: typeof state.thread = [
    ...withoutRetracted,
    {
      kind: 'notice',
      id: noticeId,
      text: event.text,
      ...(time !== undefined ? { time } : {}),
    },
  ]

  const nextOpenMsgId =
    shouldRetract && state.openMsgId === retractId ? null : state.openMsgId

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    openMsgId: nextOpenMsgId,
  }
}

export function handleSubagent(state: AppState, event: SubagentEvent): AppState {
  const incoming = event.subagent
  const existing = state.subagents.find((sa) => sa.id === incoming.id)
  if (existing) {
    const merged: SubAgentInfo = {
      ...existing,
      ...incoming,
      tools: existing.tools,
    }
    return {
      ...state,
      subagents: state.subagents.map((sa) => (sa.id === incoming.id ? merged : sa)),
    }
  }
  const saMarker: ThreadItem = { kind: 'subagent', id: incoming.id }
  return {
    ...state,
    subagents: [...state.subagents, incoming],
    thread: [...state.thread, saMarker],
    openMsgId: null,
    openGroupId: null,
  }
}

export function handleOrchestrationDenied(
  state: AppState,
  event: OrchestrationDeniedEvent,
  time?: string
): AppState {
  const last = state.thread[state.thread.length - 1]
  const isDuplicate = last?.kind === 'notice' && last.denyReason === event.reason
  if (isDuplicate) return state

  const nextSeq = state.seq + 1
  const noticeId = `dn${nextSeq}`
  const text = copyForOrchestrationDenied(event.reason)

  return {
    ...state,
    thread: [
      ...state.thread,
      {
        kind: 'notice',
        id: noticeId,
        text,
        denyReason: event.reason,
        ...(time !== undefined ? { time } : {}),
      },
    ],
    seq: nextSeq,
  }
}
