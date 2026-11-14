import type { LoopInfo } from '../../../shared/agentEvents'
import type { GoalPendingLike } from './loopStatus'

export type StopAction = 'interrupt' | 'abort'

export function decideStopAction(
  replMode: boolean,
  activeLoops: LoopInfo[],
  pendingCommand?: GoalPendingLike | null,
): StopAction {
  if (activeLoops.length > 0 || pendingCommand?.name === 'goal') {
    return 'abort'
  }
  return replMode ? 'interrupt' : 'abort'
}
