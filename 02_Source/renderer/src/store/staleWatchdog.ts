import type { AgentEvent } from '../../../shared/agentEvents'

export const GOAL_BANNER_STALE_THRESHOLD_MS = 5 * 60 * 1000

export const ACTIVITY_EVENT_TYPES: ReadonlySet<AgentEvent['type']> = new Set<AgentEvent['type']>([
  'text',
  'tool_call',
  'tool_result',
  'file_changed',
  'thinking',
  'thinking_clear',
  'orchestration',
  'orchestration_progress',
  'orchestration_denied',
  'subagent',
  'todos',
  'permission_request',
  'question_request',
  'model-fallback',
  'done',
  'error',
  'session',
  'loops',
  'autonomy_status',
])

export function isActivityEvent(type: AgentEvent['type']): boolean {
  return ACTIVITY_EVENT_TYPES.has(type)
}

export function isStaleNow(
  lastActivityAt: number | null,
  nowMs: number,
  thresholdMs: number = GOAL_BANNER_STALE_THRESHOLD_MS,
): boolean {
  if (lastActivityAt === null) return false
  return nowMs - lastActivityAt >= thresholdMs
}

export function remainingStaleMs(
  lastActivityAt: number,
  nowMs: number,
  thresholdMs: number = GOAL_BANNER_STALE_THRESHOLD_MS,
): number {
  return thresholdMs - (nowMs - lastActivityAt)
}

export interface StaleTimerHandle {
  arm: (ms: number) => void
  dispose: () => void
}

export function createStaleTimer(onStale: () => void): StaleTimerHandle {
  let handle: ReturnType<typeof setTimeout> | null = null
  return {
    arm(ms: number) {
      if (handle !== null) {
        clearTimeout(handle)
        handle = null
      }
      if (ms <= 0) {
        onStale()
        return
      }
      handle = setTimeout(() => {
        handle = null
        onStale()
      }, ms)
    },
    dispose() {
      if (handle !== null) {
        clearTimeout(handle)
        handle = null
      }
    },
  }
}
