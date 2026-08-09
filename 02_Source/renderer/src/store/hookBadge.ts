import type { ThreadItem } from './threadTypes'

function isHookBlockItem(item: ThreadItem): boolean {
  if (item.kind === 'permission-denied') {
    return item.decisionReasonType === 'hook'
  }
  if (item.kind === 'informational') {
    return item.level === 'warning' || item.preventContinuation === true
  }
  return false
}

function isUserMsg(item: ThreadItem): boolean {
  return item.kind === 'msg' && item.role === 'user'
}

function isAssistantMsg(item: ThreadItem): boolean {
  return item.kind === 'msg' && item.role === 'assistant'
}

export function deriveHookTurnBadges(thread: ThreadItem[]): Set<string> {
  const badges = new Set<string>()

  for (let i = 0; i < thread.length; i++) {
    const item = thread[i]
    if (!isHookBlockItem(item)) continue

    let start = 0
    for (let k = i; k >= 0; k--) {
      if (isUserMsg(thread[k])) {
        start = k
        break
      }
    }
    let end = thread.length
    for (let k = i + 1; k < thread.length; k++) {
      if (isUserMsg(thread[k])) {
        end = k
        break
      }
    }

    let attributedId: string | null = null
    for (let k = i + 1; k < end; k++) {
      if (isAssistantMsg(thread[k])) {
        attributedId = thread[k].id
        break
      }
    }

    if (attributedId === null) {
      for (let k = i - 1; k >= start; k--) {
        if (isAssistantMsg(thread[k])) {
          attributedId = thread[k].id
          break
        }
      }
    }

    if (attributedId !== null) {
      badges.add(attributedId)
    }
  }

  return badges
}
