import type { LoopInfo } from '../../../shared/agentEvents'

export interface GoalPendingLike {
  name: string
  turns?: number
  detail?: string | null
}

export interface GoalRunLike {
  turns: number
  detail: string | null
}

export type LoopStatus =
  | { kind: 'none' }
  | { kind: 'sdk'; loops: LoopInfo[] }
  | { kind: 'goal'; turns: number; detail: string | null }
  | { kind: 'goal-stale'; turns: number; detail: string | null }
  | { kind: 'stopped' }

export function resolveLoopStatus(
  activeLoops: LoopInfo[],
  goalRun?: GoalRunLike | null,
  stoppedNotice?: boolean,
  bannerStale?: boolean,
  staleDismissed?: boolean,
): LoopStatus {
  if (activeLoops.length > 0) {
    return { kind: 'sdk', loops: activeLoops }
  }
  if (goalRun) {
    if (!staleDismissed) {
      if (bannerStale) {
        return { kind: 'goal-stale', turns: goalRun.turns, detail: goalRun.detail }
      }
      return { kind: 'goal', turns: goalRun.turns, detail: goalRun.detail }
    }
  }
  if (stoppedNotice) {
    return { kind: 'stopped' }
  }
  return { kind: 'none' }
}
