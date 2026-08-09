import type { ThreadItem } from '../threadTypes'
import type { AppState } from './types'

export type TerminalResetFields = Pick<
  AppState,
  | 'activeLoops'
  | 'loopsStoppedNotice'
  | 'isRunning'
  | 'currentRunId'
  | 'thinkingText'
  | 'thinkingStartedAt'
  | 'pendingPermission'
  | 'pendingQuestion'
  | 'openMsgId'
  | 'openGroupId'
  | 'pendingCommand'
  | 'autonomyActive'
  | 'lastActivityAt'
  | 'bannerStale'
  | 'staleDismissed'
  | 'goalRun'
>

export function terminalResetFields(
  state: Pick<AppState, 'activeLoops' | 'pendingCommand' | 'loopsStoppedNotice'>
): TerminalResetFields {
  const goalStopping = state.pendingCommand?.name === 'goal'
  return {
    activeLoops: [],
    loopsStoppedNotice: (state.activeLoops.length > 0 || goalStopping) ? true : state.loopsStoppedNotice,
    isRunning: false,
    currentRunId: null,
    thinkingText: null,
    thinkingStartedAt: null,
    pendingPermission: null,
    pendingQuestion: null,
    openMsgId: null,
    openGroupId: null,
    pendingCommand: null,
    autonomyActive: false,
    lastActivityAt: null,
    bannerStale: false,
    staleDismissed: false,
    goalRun: null,
  }
}

export function extractTarget(input: unknown): string {
  if (input === null || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  const candidate = obj['file_path'] ?? obj['path'] ?? obj['command'] ?? obj['pattern']
  if (candidate === undefined || candidate === null) return ''
  return String(candidate)
}

export function isMetaBlockText(t: string): boolean {
  const s = t.trim()
  return s.startsWith('agentId:') || s.includes('<usage>') || s.includes('use SendMessage with to:')
}

export function closeAbortedCommandCard(thread: ThreadItem[], cardId?: string | null): ThreadItem[] {
  if (!cardId) return thread
  return thread.map((item) =>
    item.kind === 'cmdresult' && item.id === cardId
      ? { ...item, running: false, title: '중단했어요' }
      : item
  )
}

export function closeAbortedOrchestrationCards(thread: ThreadItem[]): ThreadItem[] {
  const hasRunningOrchestration = thread.some((item) => item.kind === 'orchestration' && item.running)
  if (!hasRunningOrchestration) return thread
  return thread.map((item) =>
    item.kind === 'orchestration' && item.running ? { ...item, running: false } : item
  )
}

export function markInterruptedOpenMsg(thread: ThreadItem[], openMsgId: string | null): ThreadItem[] {
  if (!openMsgId) return thread
  const hasTarget = thread.some((item) => item.kind === 'msg' && item.id === openMsgId)
  if (!hasTarget) return thread
  return thread.map((item) =>
    item.kind === 'msg' && item.id === openMsgId ? { ...item, interrupted: true } : item
  )
}

export function extractSubagentText(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const texts = output
      .map((b) =>
        b !== null && typeof b === 'object' &&
        (b as Record<string, unknown>)['type'] === 'text' &&
        typeof (b as Record<string, unknown>)['text'] === 'string'
          ? ((b as Record<string, unknown>)['text'] as string)
          : ''
      )
      .filter((t) => t.length > 0 && !isMetaBlockText(t))
    if (texts.length > 0) return texts.join('\n\n')
    return JSON.stringify(output)
  }
  if (output !== null && typeof output === 'object') {
    const t = (output as Record<string, unknown>)['text']
    if (typeof t === 'string' && t.length > 0) return t
  }
  return JSON.stringify(output)
}
