import type { AgentEvent, SubAgentTool, SubAgentTranscriptItem } from '../../../../shared/agentEvents'
import type { ThreadItem } from '../threadTypes'
import type { AppState, BgTaskState, ToolCard, ToolCardStatus } from './types'
import { extractTarget, extractSubagentText } from './helpers'

type ToolCallEvent = Extract<AgentEvent, { type: 'tool_call' }>
type ToolResultEvent = Extract<AgentEvent, { type: 'tool_result' }>
type SearchResultEvent = Extract<AgentEvent, { type: 'search_result' }>
type BgTaskEvent = Extract<AgentEvent, { type: 'bg_task' }>

export function handleToolCall(state: AppState, event: ToolCallEvent, time?: string): AppState {
  if (event.parentToolId) {
    const saId = event.parentToolId
    const verb = event.name.toLowerCase()
    const target = extractTarget(event.input)
    const childTool: SubAgentTool = {
      id: event.id,
      verb,
      target,
      status: 'running',
    }
    const transcriptItem: SubAgentTranscriptItem = {
      kind: 'tool',
      verb,
      target,
      status: 'running',
      id: event.id,
    }
    const updatedSubagents = state.subagents.map((sa) => {
      if (sa.id !== saId) return sa
      const prev = sa.transcript ?? []
      return { ...sa, tools: [...sa.tools, childTool], transcript: [...prev, transcriptItem] }
    })
    return {
      ...state,
      subagents: updatedSubagents,
      isRunning: true,
    }
  }

  const newCard: ToolCard = {
    id: event.id,
    name: event.name,
    input: event.input,
    status: 'running',
    ...(event.background !== undefined ? { background: event.background } : {}),
  }

  const hasOpen = state.openGroupId !== null &&
    state.thread.some((item) => item.kind === 'toolgroup' && item.id === state.openGroupId)

  let nextThread: ThreadItem[]
  let nextOpenGroupId: string | null
  let nextSeq = state.seq

  if (hasOpen) {
    nextOpenGroupId = state.openGroupId
    nextThread = state.thread.map((item) => {
      if (item.kind === 'toolgroup' && item.id === state.openGroupId) {
        return { ...item, tools: [...item.tools, newCard] }
      }
      return item
    })
  } else {
    nextSeq = state.seq + 1
    nextOpenGroupId = `tg${nextSeq}`
    nextThread = [
      ...state.thread,
      {
        kind: 'toolgroup' as const,
        id: nextOpenGroupId,
        tools: [newCard],
        ...(time !== undefined ? { time } : {}),
      },
    ]
  }

  return {
    ...state,
    thread: nextThread,
    seq: nextSeq,
    openGroupId: nextOpenGroupId,
    openMsgId: null,
    isRunning: true,
  }
}

export function handleToolResult(state: AppState, event: ToolResultEvent): AppState {
  const resultId = event.id

  const hasOrch = state.thread.some((item) => item.kind === 'orchestration' && item.id === resultId)
  if (hasOrch) {
    const rawOutput = event.output
    let resultStr: string
    if (typeof rawOutput === 'string') {
      resultStr = rawOutput
    } else if (rawOutput !== null && typeof rawOutput === 'object' && 'text' in (rawOutput as object)) {
      resultStr = String((rawOutput as { text: unknown }).text)
    } else {
      resultStr = JSON.stringify(rawOutput)
    }
    if (resultStr.length > 4096) resultStr = resultStr.slice(0, 4096)

    const nextThread = state.thread.map((item) => {
      if (item.kind === 'orchestration' && item.id === resultId) {
        return {
          ...item,
          running: false,
          failed: !event.ok,
          result: resultStr,
        }
      }
      return item
    })
    return {
      ...state,
      thread: nextThread,
    }
  }

  const matchedSubagent = state.subagents.find((sa) => sa.id === resultId)
  if (matchedSubagent) {
    const activity = extractSubagentText(event.output)
    const updatedSubagents = state.subagents.map((sa) =>
      sa.id === resultId ? { ...sa, status: 'done' as const, activity } : sa
    )
    return {
      ...state,
      subagents: updatedSubagents,
    }
  }

  let childMatched = false
  const updatedSubagentsForChild = state.subagents.map((sa) => {
    const hasChild = sa.tools.some((t) => t.id === resultId)
    if (!hasChild) return sa
    childMatched = true
    return {
      ...sa,
      tools: sa.tools.map((t) =>
        t.id === resultId ? { ...t, status: 'done' as const } : t
      ),
      ...(sa.transcript ? {
        transcript: sa.transcript.map((it) =>
          it.kind === 'tool' && it.id === resultId ? { ...it, status: 'done' as const } : it
        ),
      } : {}),
    }
  })
  if (childMatched) {
    return {
      ...state,
      subagents: updatedSubagentsForChild,
    }
  }

  const nextThread = state.thread.map((item) => {
    if (item.kind !== 'toolgroup') return item
    const hasCard = item.tools.some((t) => t.id === resultId)
    if (!hasCard) return item
    return {
      ...item,
      tools: item.tools.map((card) => {
        if (card.id !== resultId) return card
        return {
          ...card,
          status: (event.ok ? 'done' : 'error') as ToolCardStatus,
          result: event.output,
        }
      }),
    }
  })

  return {
    ...state,
    thread: nextThread,
  }
}

export function handleSearchResult(state: AppState, event: SearchResultEvent): AppState {
  const targetId = event.toolUseId
  if (!targetId) return state

  const hasCard = state.thread.some(
    (item) => item.kind === 'toolgroup' && item.tools.some((t) => t.id === targetId)
  )
  if (!hasCard) return state

  const nextThread = state.thread.map((item) => {
    if (item.kind !== 'toolgroup') return item
    if (!item.tools.some((t) => t.id === targetId)) return item
    return {
      ...item,
      tools: item.tools.map((card) =>
        card.id === targetId ? { ...card, searchResult: event } : card
      ),
    }
  })

  return {
    ...state,
    thread: nextThread,
  }
}

export const MAX_BG_TAIL_CHARS = 100_000

function updateCardInThread(
  state: AppState,
  match: (card: ToolCard) => boolean,
  update: (card: ToolCard) => ToolCard
): AppState {
  const hasCard = state.thread.some(
    (item) => item.kind === 'toolgroup' && item.tools.some(match)
  )
  if (!hasCard) return state

  const nextThread = state.thread.map((item) => {
    if (item.kind !== 'toolgroup') return item
    if (!item.tools.some(match)) return item
    return {
      ...item,
      tools: item.tools.map((card) => (match(card) ? update(card) : card)),
    }
  })
  return { ...state, thread: nextThread }
}

export function handleBgTask(state: AppState, event: BgTaskEvent): AppState {
  if (event.kind === 'started') {
    const targetId = event.toolUseId
    if (!targetId) return state
    const bgTask: BgTaskState = {
      taskId: event.taskId,
      toolUseId: event.toolUseId,
      ...(event.description !== undefined ? { description: event.description } : {}),
      status: event.status ?? 'running',
      tail: '',
    }
    return updateCardInThread(
      state,
      (card) => card.id === targetId,
      (card) => ({ ...card, bgTask })
    )
  }

  const byTaskId = (card: ToolCard): boolean => card.bgTask?.taskId === event.taskId

  if (event.kind === 'output') {
    return updateCardInThread(state, byTaskId, (card) => {
      const bg = card.bgTask as BgTaskState
      let tail = bg.tail + (event.outputChunk ?? '')
      let localCut = false
      if (tail.length > MAX_BG_TAIL_CHARS) {
        tail = tail.slice(tail.length - MAX_BG_TAIL_CHARS)
        localCut = true
      }
      const truncated = bg.truncated === true || event.outputTruncated === true || localCut
      return {
        ...card,
        bgTask: { ...bg, tail, ...(truncated ? { truncated: true } : {}) },
      }
    })
  }

  const nextStatus = event.kind === 'updated' ? event.patch?.status : event.status
  if (nextStatus === undefined) return state
  return updateCardInThread(state, byTaskId, (card) => ({
    ...card,
    bgTask: { ...(card.bgTask as BgTaskState), status: nextStatus },
  }))
}
