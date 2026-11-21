import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ConversationRecord, PersistedSubAgent } from '../../shared/ipcContract'
import { SUBAGENT_PERSIST_LIMITS } from '../../shared/ipcContract'
import { PERMISSION_MODE_TABLE } from '@main/04_Claude/permissionModes'
import { writeFileAtomicSync } from '@main/05_Loop/realPorts/atomicWrite'
import type { TokenUsage, SubAgentTool, SubAgentTranscriptItem } from '../../shared/agentEvents'

type ConversationSaveInput = Omit<ConversationRecord, 'createdAt' | 'updatedAt'> & {
  id?: string
}

export interface ConversationStore {
  save(record: ConversationSaveInput): string

  load(id: string): ConversationRecord | null

  listRecent(limit?: number): ConversationRecord[]

  delete(id: string): boolean

  rename(id: string, title: string): boolean

  close(): void
}

interface ChatFile extends ConversationRecord {
  custom_title: boolean
}

interface IndexFile {
  version: number
  ids: string[]
}

// `index`는 색인 파일 이름이다 — 대화 파일이 색인을 덮지 않게 받지 않는다(Windows는 대소문자를 가리지 않는다)
const safeId = (id: unknown): id is string =>
  typeof id === 'string' &&
  id !== '..' &&
  id.toLowerCase() !== 'index' &&
  /^[A-Za-z0-9._-]+$/.test(id)

function sanitizeContextWindow(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
}

function sanitizeModel(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function sanitizeMode(v: unknown): string | undefined {
  return typeof v === 'string' && Object.hasOwn(PERMISSION_MODE_TABLE, v) ? v : undefined
}

function sanitizeUsage(v: unknown): TokenUsage | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const u = v as Record<string, unknown>
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  if (!num(u.inputTokens) || !num(u.outputTokens)) return undefined
  const out: TokenUsage = { inputTokens: u.inputTokens, outputTokens: u.outputTokens }
  if (num(u.cacheCreationTokens)) out.cacheCreationTokens = u.cacheCreationTokens
  if (num(u.cacheReadTokens)) out.cacheReadTokens = u.cacheReadTokens
  return out
}

function sanitizeSubagentTool(v: unknown): SubAgentTool | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const t = v as Record<string, unknown>
  const str = (x: unknown): x is string => typeof x === 'string'
  if (!str(t.id) || !str(t.verb) || !str(t.target)) return undefined
  if (t.status !== 'running' && t.status !== 'done' && t.status !== 'queued') return undefined
  return { id: t.id, verb: t.verb, target: t.target, status: t.status }
}

function sanitizeTranscriptItem(v: unknown): SubAgentTranscriptItem | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const item = v as Record<string, unknown>
  if (item.kind !== 'text' && item.kind !== 'thinking' && item.kind !== 'tool') return undefined
  const out: SubAgentTranscriptItem = { kind: item.kind }
  if (typeof item.text === 'string') {
    out.text = item.text.slice(0, SUBAGENT_PERSIST_LIMITS.maxTextChars)
  }
  if (typeof item.verb === 'string') out.verb = item.verb
  if (typeof item.target === 'string') out.target = item.target
  if (item.status === 'running' || item.status === 'done' || item.status === 'queued') {
    out.status = item.status
  }
  if (typeof item.id === 'string') out.id = item.id
  return out
}

function sanitizeSubagentEntry(v: unknown): PersistedSubAgent | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const s = v as Record<string, unknown>
  const str = (x: unknown): x is string => typeof x === 'string'
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

  if (!str(s.id) || !str(s.name) || !str(s.role)) return undefined
  if (s.status !== 'queued' && s.status !== 'running' && s.status !== 'done') return undefined
  if (!Array.isArray(s.tools)) return undefined
  if (!num(s.afterMessageIndex) || !Number.isInteger(s.afterMessageIndex) || s.afterMessageIndex < 0) {
    return undefined
  }

  const tools = s.tools
    .map(sanitizeSubagentTool)
    .filter((x): x is SubAgentTool => x !== undefined)
    .slice(0, SUBAGENT_PERSIST_LIMITS.maxTools)

  const out: PersistedSubAgent = {
    id: s.id,
    name: s.name,
    role: s.role,
    status: s.status,
    tools,
    afterMessageIndex: s.afterMessageIndex
  }

  if (typeof s.activity === 'string') {
    out.activity = s.activity.slice(0, SUBAGENT_PERSIST_LIMITS.maxTextChars)
  }
  if (Array.isArray(s.transcript)) {
    out.transcript = s.transcript
      .map(sanitizeTranscriptItem)
      .filter((x): x is SubAgentTranscriptItem => x !== undefined)
      .slice(0, SUBAGENT_PERSIST_LIMITS.maxTranscriptItems)
  }
  if (typeof s.model === 'string') out.model = s.model
  if (typeof s.displayName === 'string') out.displayName = s.displayName

  return out
}

function sanitizeSubagents(v: unknown): PersistedSubAgent[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v
    .map(sanitizeSubagentEntry)
    .filter((x): x is PersistedSubAgent => x !== undefined)
    .slice(0, SUBAGENT_PERSIST_LIMITS.maxSubagents)
}

export function createConversationStore(dir: string): ConversationStore {
  fs.mkdirSync(dir, { recursive: true })

  const indexPath = path.join(dir, 'index.json')
  const chatFile = (id: string): string => path.join(dir, `${id}.json`)

  const cache = new Map<string, string>()

  // 색인을 못 읽으면 빈 목록으로 두지 않는다 — 다음 저장이 한 건으로 덮는다.
  // 대화 파일들로 다시 짓고, 깨졌으면 `.broken-<시각>`으로 옆에 둔 뒤 다시 짓는다.
  function readIndex(): IndexFile {
    let raw: string | null = null
    try {
      raw = fs.readFileSync(indexPath, 'utf8')
    } catch {
    }
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as IndexFile
        if (parsed && Array.isArray(parsed.ids)) return { ...parsed, ids: parsed.ids.filter(safeId) }
      } catch {
      }
      try { fs.renameSync(indexPath, `${indexPath}.broken-${Date.now()}`) } catch { /* 옆에 두지 못해도 다시 짓는다 */ }
    }
    cache.delete('__index__')
    const ids = rebuildIds()
    const rebuilt = { version: 1, ids }
    if (ids.length > 0 || raw !== null) writeIndex(rebuilt)
    return rebuilt
  }

  function rebuildIds(): string[] {
    const found: Array<{ id: string; createdAt: string }> = []
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue
      const id = name.slice(0, -'.json'.length)
      if (!safeId(id)) continue
      const chat = readChatFile(id)
      if (chat && chat.id === id) found.push({ id, createdAt: String(chat.createdAt ?? '') })
    }
    found.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    return found.map((f) => f.id)
  }

  function writeIndex(index: IndexFile): void {
    const json = JSON.stringify(index)
    if (cache.get('__index__') === json) return
    writeFileAtomicSync(indexPath, json)
    cache.set('__index__', json)
  }

  function readChatFile(id: string): ChatFile | null {
    try {
      const raw = fs.readFileSync(chatFile(id), 'utf8')
      const parsed = JSON.parse(raw) as ChatFile
      cache.set(id, raw)
      return parsed
    } catch {
      return null
    }
  }

  function toRecord(chat: ChatFile): ConversationRecord {
    const cwd = chat.cwd && chat.cwd.length > 0 ? chat.cwd : undefined
    const sessionId = chat.sessionId && chat.sessionId.length > 0 ? chat.sessionId : undefined
    const lastContextWindow = sanitizeContextWindow(chat.lastContextWindow)
    const lastUsage = sanitizeUsage(chat.lastUsage)
    const subagents = sanitizeSubagents(chat.subagents)
    const replMode = typeof chat.replMode === 'boolean' ? chat.replMode : undefined
    const model = sanitizeModel(chat.model)
    const mode = sanitizeMode(chat.mode)
    return {
      id: chat.id,
      title: chat.title,
      messages: chat.messages,
      backendId: chat.backendId,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      ...(cwd !== undefined ? { cwd } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(lastContextWindow !== undefined ? { lastContextWindow } : {}),
      ...(lastUsage !== undefined ? { lastUsage } : {}),
      ...(subagents !== undefined ? { subagents } : {}),
      ...(replMode !== undefined ? { replMode } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(mode !== undefined ? { mode } : {})
    }
  }

  return {
    save(record: ConversationSaveInput): string {
      if (!Array.isArray(record.messages)) {
        throw new Error('messages must be an array')
      }

      if (record.id !== undefined) {
        if (!safeId(record.id)) {
          throw new Error(`save: unsafe id rejected: ${String(record.id)}`)
        }
      }
      const id = record.id || randomUUID()
      const now = new Date().toISOString()

      const existing = readChatFile(id)
      const createdAt = existing ? existing.createdAt : now

      const customTitle = existing?.custom_title ?? false
      const title = customTitle ? existing!.title : (record.title ?? '')

      const cwd = record.cwd && record.cwd.length > 0 ? record.cwd : undefined
      const sessionId = record.sessionId && record.sessionId.length > 0 ? record.sessionId : undefined
      const lastContextWindow = sanitizeContextWindow(record.lastContextWindow)
      const lastUsage = sanitizeUsage(record.lastUsage)
      const subagents = sanitizeSubagents(record.subagents)
      const replMode = typeof record.replMode === 'boolean' ? record.replMode : undefined
      // model이 없는 저장(배경 run의 done/session 저장)은 기존 선택을 지우지 않는다
      const model = sanitizeModel(record.model) ?? sanitizeModel(existing?.model)
      const mode = sanitizeMode(record.mode) ?? sanitizeMode(existing?.mode)

      const chatData: ChatFile = {
        id,
        title,
        messages: record.messages,
        backendId: record.backendId,
        createdAt,
        updatedAt: now,
        custom_title: customTitle,
        ...(cwd !== undefined ? { cwd } : {}),
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(lastContextWindow !== undefined ? { lastContextWindow } : {}),
        ...(lastUsage !== undefined ? { lastUsage } : {}),
        ...(subagents !== undefined ? { subagents } : {}),
        ...(replMode !== undefined ? { replMode } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(mode !== undefined ? { mode } : {})
      }

      const json = JSON.stringify(chatData)
      if (cache.get(id) !== json) {
        writeFileAtomicSync(chatFile(id), json)
        cache.set(id, json)
      }

      const index = readIndex()
      if (!index.ids.includes(id)) {
        index.ids.push(id)
        writeIndex(index)
      }

      return id
    },

    load(id: string): ConversationRecord | null {
      if (!safeId(id)) return null

      const chat = readChatFile(id)
      if (!chat) return null

      return toRecord(chat)
    },

    listRecent(limit = 20): ConversationRecord[] {
      const index = readIndex()

      const records: Array<{ record: ConversationRecord; idsIndex: number }> = []

      for (let i = 0; i < index.ids.length; i++) {
        const id = index.ids[i]
        if (!safeId(id)) continue
        const chat = readChatFile(id)
        if (!chat) continue
        records.push({ record: toRecord(chat), idsIndex: i })
      }

      records.sort((a, b) => {
        const timeDiff = b.record.updatedAt.localeCompare(a.record.updatedAt)
        if (timeDiff !== 0) return timeDiff
        return b.idsIndex - a.idsIndex
      })

      return records.slice(0, limit).map(r => r.record)
    },

    delete(id: string): boolean {
      if (!safeId(id)) return false

      const filePath = chatFile(id)
      if (!fs.existsSync(filePath)) return false

      try {
        fs.unlinkSync(filePath)
      } catch {
        return false
      }
      cache.delete(id)

      const index = readIndex()
      const before = index.ids.length
      index.ids = index.ids.filter(existingId => existingId !== id)
      if (index.ids.length < before) {
        cache.delete('__index__')
        writeIndex(index)
      }

      return true
    },

    rename(id: string, title: string): boolean {
      if (!safeId(id)) return false

      const existing = readChatFile(id)
      if (!existing) return false

      const now = new Date().toISOString()
      const chatData: ChatFile = {
        ...existing,
        title,
        custom_title: true,
        updatedAt: now
      }

      const json = JSON.stringify(chatData)
      cache.delete(id)
      writeFileAtomicSync(chatFile(id), json)
      cache.set(id, json)

      return true
    },

    close(): void {
    }
  }
}
