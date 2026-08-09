import type { ThreadItem } from './threadTypes'

export interface ContinuityOptions {
  ignoreToolgroups?: boolean
}

export function findContinuationTarget(
  thread: ThreadItem[],
  index: number,
  options?: ContinuityOptions
): number {
  const item = thread[index]
  if (!item || item.kind !== 'thinking') return -1

  const ignoreToolgroups = options?.ignoreToolgroups === true
  let j = index + 1
  while (j < thread.length) {
    const cur = thread[j]
    if (ignoreToolgroups && cur.kind === 'toolgroup') {
      j += 1
      continue
    }
    break
  }

  const target = thread[j]
  if (target !== undefined && target.kind === 'msg' && target.role === 'assistant') {
    return j
  }
  return -1
}

export function isThinkingContinuous(
  thread: ThreadItem[],
  index: number,
  options?: ContinuityOptions
): boolean {
  return findContinuationTarget(thread, index, options) !== -1
}
