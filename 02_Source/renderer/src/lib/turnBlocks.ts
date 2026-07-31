import type { ThreadItem } from '../store/threadTypes'

export type TurnBlockKind = 'user' | 'agent' | 'standalone'

export interface TurnBlock {
  kind: TurnBlockKind
  items: ThreadItem[]
}

function classify(item: ThreadItem): TurnBlockKind {
  if (item.kind === 'msg') return item.role === 'user' ? 'user' : 'agent'
  switch (item.kind) {
    case 'thinking':
    case 'toolgroup':
    case 'subagent':
      return 'agent'
    case 'notice':
    case 'compact-boundary':
    case 'informational':
    case 'permission-denied':
    case 'cmdresult':
    case 'orchestration':
      return 'standalone'
    default: {
      const exhaustive: never = item
      return exhaustive
    }
  }
}

export function groupIntoTurnBlocks(thread: ThreadItem[]): TurnBlock[] {
  const blocks: TurnBlock[] = []
  let openAgent: TurnBlock | null = null

  for (const item of thread) {
    const kind = classify(item)
    if (kind === 'agent') {
      if (openAgent) {
        openAgent.items.push(item)
      } else {
        openAgent = { kind: 'agent', items: [item] }
        blocks.push(openAgent)
      }
      continue
    }
    openAgent = null
    blocks.push({ kind, items: [item] })
  }

  return blocks
}
