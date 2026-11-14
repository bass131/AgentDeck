import type { AgentEvent } from '../../../../shared/agentEvents'
import type { ThreadItem } from '../threadTypes'
import type { AppState, HookRun } from './types'

type HookLifecycleEvent = Extract<AgentEvent, { type: 'hook_lifecycle' }>
type InformationalEvent = Extract<AgentEvent, { type: 'informational' }>
type PermissionDeniedEvent = Extract<AgentEvent, { type: 'permission_denied' }>

const HOOK_RUNS_CAP = 200

export function handleHookLifecycle(state: AppState, event: HookLifecycleEvent, time?: string, runId?: string): AppState {
  const { phase, hookId, hookName, hookEvent } = event
  const idx = state.hookRuns.findIndex((r) => r.hookId === hookId)

  if (phase === 'started') {
    if (idx !== -1) return state
    const entry: HookRun = {
      hookId,
      hookName,
      hookEvent,
      status: 'running',
      ...(time !== undefined ? { time } : {}),
      ...(runId !== undefined ? { runId } : {}),
    }
    const nextRuns = [...state.hookRuns, entry]
    const trimmed = nextRuns.length > HOOK_RUNS_CAP ? nextRuns.slice(nextRuns.length - HOOK_RUNS_CAP) : nextRuns
    return { ...state, hookRuns: trimmed }
  }

  if (phase === 'response') {
    if (idx === -1) {
      const entry: HookRun = {
        hookId,
        hookName,
        hookEvent,
        status: event.outcome ?? 'success',
        ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
        ...(event.stdout !== undefined ? { stdout: event.stdout } : {}),
        ...(event.stderr !== undefined ? { stderr: event.stderr } : {}),
        ...(event.output !== undefined ? { output: event.output } : {}),
        ...(time !== undefined ? { time } : {}),
        ...(runId !== undefined ? { runId } : {}),
      }
      const nextRuns = [...state.hookRuns, entry]
      const trimmed = nextRuns.length > HOOK_RUNS_CAP ? nextRuns.slice(nextRuns.length - HOOK_RUNS_CAP) : nextRuns
      return { ...state, hookRuns: trimmed }
    }
    const updated: HookRun = {
      ...state.hookRuns[idx],
      status: event.outcome ?? 'success',
      ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
      ...(event.stdout !== undefined ? { stdout: event.stdout } : {}),
      ...(event.stderr !== undefined ? { stderr: event.stderr } : {}),
      ...(event.output !== undefined ? { output: event.output } : {}),
      ...(runId !== undefined ? { runId } : {}),
    }
    const nextRuns = [...state.hookRuns]
    nextRuns[idx] = updated
    return { ...state, hookRuns: nextRuns }
  }

  if (idx === -1) return state
  const updated: HookRun = {
    ...state.hookRuns[idx],
    ...(event.stdout !== undefined ? { stdout: event.stdout } : {}),
    ...(event.stderr !== undefined ? { stderr: event.stderr } : {}),
    ...(event.output !== undefined ? { output: event.output } : {}),
  }
  const nextRuns = [...state.hookRuns]
  nextRuns[idx] = updated
  return { ...state, hookRuns: nextRuns }
}

export function handleInformational(state: AppState, event: InformationalEvent, time?: string): AppState {
  const nextSeq = state.seq + 1
  const item: ThreadItem = {
    kind: 'informational',
    id: `inf${nextSeq}`,
    content: event.content,
    level: event.level,
    ...(event.preventContinuation !== undefined ? { preventContinuation: event.preventContinuation } : {}),
    ...(event.toolUseId !== undefined ? { toolUseId: event.toolUseId } : {}),
    ...(time !== undefined ? { time } : {}),
  }
  return {
    ...state,
    thread: [...state.thread, item],
    seq: nextSeq,
  }
}

export function handlePermissionDenied(state: AppState, event: PermissionDeniedEvent, time?: string): AppState {
  const nextSeq = state.seq + 1
  const item: ThreadItem = {
    kind: 'permission-denied',
    id: `pd${nextSeq}`,
    toolName: event.toolName,
    ...(event.decisionReasonType !== undefined ? { decisionReasonType: event.decisionReasonType } : {}),
    ...(event.decisionReason !== undefined ? { decisionReason: event.decisionReason } : {}),
    ...(time !== undefined ? { time } : {}),
  }
  return {
    ...state,
    thread: [...state.thread, item],
    seq: nextSeq,
  }
}
