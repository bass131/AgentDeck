import type { ThreadItem } from '../threadTypes'
import type { TokenUsage, PersistedSubAgent } from '../../../../shared/ipcContract'
import type { SubAgentInfo } from '../../../../shared/agentEvents'

export type ConversationSavePayload = Parameters<typeof window.api.conversationSave>[0]['conversation']

export interface ConversationPayloadSource {
  thread: ThreadItem[]
  workspaceRoot: string | null
  sessionId?: string
  lastContextWindow?: number
  lastUsage?: TokenUsage
  subagents?: SubAgentInfo[]
  replMode?: boolean
  model?: string
}

function computeSubagentAnchors(
  thread: ThreadItem[],
  subagents: SubAgentInfo[] | undefined
): PersistedSubAgent[] {
  if (!subagents || subagents.length === 0) return []
  let msgCount = 0
  const result: PersistedSubAgent[] = []
  for (const item of thread) {
    if (item.kind === 'msg') {
      msgCount++
      continue
    }
    if (item.kind === 'subagent') {
      const info = subagents.find((s) => s.id === item.id)
      if (info) {
        result.push({ ...info, afterMessageIndex: msgCount })
      }
    }
  }
  return result
}

export function rebuildThreadWithSubagents(
  messages: Extract<ThreadItem, { kind: 'msg' }>[],
  persisted: PersistedSubAgent[] | undefined
): ThreadItem[] {
  if (!persisted || persisted.length === 0) return messages
  const result: ThreadItem[] = []
  for (let k = 0; k <= messages.length; k++) {
    for (const p of persisted) {
      if (p.afterMessageIndex === k) {
        result.push({ kind: 'subagent', id: p.id })
      }
    }
    if (k < messages.length) {
      result.push(messages[k])
    }
  }
  return result
}

export function freezePersistedSubagents(persisted: PersistedSubAgent[] | undefined): SubAgentInfo[] {
  if (!persisted || persisted.length === 0) return []
  return persisted.map((p) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { afterMessageIndex, ...info } = p
    return {
      ...info,
      status: 'done',
      tools: info.tools.map((t) => ({ ...t, status: 'done' as const })),
      transcript: info.transcript?.map((t) =>
        t.kind === 'tool' ? { ...t, status: 'done' as const } : t
      ),
    }
  })
}

export function buildConversationSavePayload(
  source: ConversationPayloadSource,
  id: string | undefined
): ConversationSavePayload | null {
  const threadMsgs = source.thread
    .filter((item): item is Extract<ThreadItem, { kind: 'msg' }> => item.kind === 'msg')
  if (threadMsgs.length === 0) return null
  const messages = threadMsgs.map((m) => ({ role: m.role, content: m.text }))
  const subagentAnchors = computeSubagentAnchors(source.thread, source.subagents)
  return {
    id: id ?? (undefined as unknown as string),
    title: (threadMsgs[0]?.text ?? '').slice(0, 40) || 'untitled',
    messages,
    backendId: 'claude-code',
    ...(source.workspaceRoot != null ? { cwd: source.workspaceRoot } : {}),
    ...(source.sessionId ? { sessionId: source.sessionId } : {}),
    ...(source.lastContextWindow !== undefined ? { lastContextWindow: source.lastContextWindow } : {}),
    ...(source.lastUsage !== undefined ? { lastUsage: source.lastUsage } : {}),
    ...(subagentAnchors.length > 0 ? { subagents: subagentAnchors } : {}),
    ...(source.replMode !== undefined ? { replMode: source.replMode } : {}),
    ...(source.model !== undefined ? { model: source.model } : {}),
  }
}
