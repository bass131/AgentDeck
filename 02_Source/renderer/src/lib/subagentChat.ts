import type { SubAgentInfo, SubAgentTranscriptItem } from '../../../shared/agentEvents'

export interface SubagentTaskItem {
  kind: 'task'
  id: string
  text: string
}

export interface SubagentToolItem {
  kind: 'tool'
  id: string
  verb: string
  target: string
  status: 'running' | 'done' | 'queued'
}

export interface SubagentTextItem {
  kind: 'text'
  id: string
  text: string
}

export interface SubagentThinkingItem {
  kind: 'thinking'
  id: string
  text: string
}

export type SubagentChatItem =
  | SubagentTaskItem
  | SubagentToolItem
  | SubagentTextItem
  | SubagentThinkingItem

function toToolItem(entry: SubAgentTranscriptItem, idx: number): SubagentToolItem {
  return {
    kind: 'tool',
    id: entry.id ?? `tool-${idx}`,
    verb: entry.verb ?? '',
    target: entry.target ?? '',
    status: entry.status ?? 'running',
  }
}

export function buildSubagentChatItems(agent: SubAgentInfo): SubagentChatItem[] {
  const items: SubagentChatItem[] = []

  if (agent.role && agent.role.trim().length > 0) {
    items.push({ kind: 'task', id: 'task', text: agent.role })
  }

  const transcript = agent.transcript ?? []

  transcript.forEach((entry, idx) => {
    if (entry.kind === 'tool') {
      items.push(toToolItem(entry, idx))
      return
    }

    const kind = entry.kind
    const text = entry.text ?? ''
    const last = items[items.length - 1]

    if (last !== undefined && last.kind === kind) {
      items[items.length - 1] = { kind: last.kind, id: last.id, text: last.text + text }
      return
    }

    items.push(
      kind === 'text'
        ? { kind: 'text', id: `text-${idx}`, text }
        : { kind: 'thinking', id: `thinking-${idx}`, text }
    )
  })

  const lastItem = items[items.length - 1]
  const lastMergedText = lastItem?.kind === 'text' ? lastItem.text : undefined
  const finalAnswer =
    agent.activity && agent.activity.trim() && agent.activity !== lastMergedText
      ? agent.activity
      : ''
  if (finalAnswer) {
    items.push({ kind: 'text', id: 'final', text: finalAnswer })
  }

  return items
}

export function hasSubagentConversation(items: SubagentChatItem[]): boolean {
  return items.some((it) => it.kind !== 'task')
}

export type SubagentRenderGroup =
  | { kind: 'toolgroup'; id: string; tools: SubagentToolItem[] }
  | { kind: 'single'; item: Exclude<SubagentChatItem, SubagentToolItem> }

export function groupSubagentToolRuns(items: SubagentChatItem[]): SubagentRenderGroup[] {
  const groups: SubagentRenderGroup[] = []

  for (const item of items) {
    if (item.kind === 'tool') {
      const last = groups[groups.length - 1]
      if (last?.kind === 'toolgroup') {
        last.tools.push(item)
      } else {
        groups.push({ kind: 'toolgroup', id: `tg-${item.id}`, tools: [item] })
      }
      continue
    }
    groups.push({ kind: 'single', item })
  }

  return groups
}
