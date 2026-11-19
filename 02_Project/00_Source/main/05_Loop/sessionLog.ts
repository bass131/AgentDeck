import type { AgentEvent } from '@shared/agentEvents'
import type { LoopSessionLog, LoopSessionRecord, LoopSessionRow, LoopSessionTag } from '@shared/13_Loop/loop'
import { repoKeyOf } from './digestStore'

export const DEFAULT_MAX_EVENTS = 4000
export const DEFAULT_MAX_SESSIONS = 40
export const DEFAULT_MAX_FOLDERS = 16

export interface SessionLogOptions {
  maxEvents?: number
  maxSessions?: number
  maxFolders?: number
}

export interface SessionLog {
  record(cwd: string, tag: LoopSessionTag, event: AgentEvent): { seq: number; isNew: boolean }
  // 꼬리표에는 끝 신호가 없어서, 구동자가 실행기 단계 경계에서 떠 있는 노드 세션을 끝낸다
  endAll(cwd: string): boolean
  rows(cwd: string): LoopSessionRow[]
  read(cwd: string): LoopSessionLog
}

interface Session { tag: LoopSessionTag; events: AgentEvent[]; next: number; truncated: boolean; live: boolean }
interface Folder { sessions: Map<string, Session> }

type TextEvent = Extract<AgentEvent, { type: 'text' }>
type ThinkingDelta = Extract<AgentEvent, { type: 'thinking_delta' }>

// 조각을 하나씩 세면 사건 수 상한이 세션 앞부분을 먼저 지운다. 이미 준 스냅숏을 바꾸지 않도록 새 객체로 돌려준다
function merged(prev: AgentEvent | undefined, ev: AgentEvent): AgentEvent | null {
  if (!prev) return null
  if (prev.type === 'text' && ev.type === 'text') {
    if (prev.messageId !== ev.messageId || prev.parentToolId !== ev.parentToolId) return null
    const out: TextEvent = { ...prev, delta: prev.delta + ev.delta }
    return out
  }
  if (prev.type === 'thinking_delta' && ev.type === 'thinking_delta') {
    const text = prev.text === undefined && ev.text === undefined ? undefined : (prev.text ?? '') + (ev.text ?? '')
    const tokens = ev.estimatedTokens ?? prev.estimatedTokens
    const out: ThinkingDelta = { type: 'thinking_delta', ...(text !== undefined ? { text } : {}), ...(tokens !== undefined ? { estimatedTokens: tokens } : {}) }
    return out
  }
  return null
}

export function createSessionLog(opts: SessionLogOptions = {}): SessionLog {
  const maxEvents = Math.max(1, opts.maxEvents ?? DEFAULT_MAX_EVENTS)
  const maxSessions = Math.max(1, opts.maxSessions ?? DEFAULT_MAX_SESSIONS)
  const maxFolders = Math.max(1, opts.maxFolders ?? DEFAULT_MAX_FOLDERS)
  const foldersByRecentUse = new Map<string, Folder>()

  function folderOf(cwd: string, create: boolean): Folder | undefined {
    const key = repoKeyOf(cwd)
    const found = foldersByRecentUse.get(key)
    if (found) {
      if (create) { foldersByRecentUse.delete(key); foldersByRecentUse.set(key, found) }
      return found
    }
    if (!create) return undefined
    const f: Folder = { sessions: new Map() }
    foldersByRecentUse.set(key, f)
    while (foldersByRecentUse.size > maxFolders) foldersByRecentUse.delete(foldersByRecentUse.keys().next().value as string)
    return f
  }

  function evictEndedNodesFirst(f: Folder, keep: string): void {
    while (f.sessions.size > maxSessions) {
      const nodes = [...f.sessions.entries()].filter(([k, s]) => s.tag.kind !== 'main' && k !== keep)
      const victim = nodes.find(([, s]) => !s.live) ?? nodes[0]
      if (!victim) return
      f.sessions.delete(victim[0])
    }
  }

  return {
    record(cwd, tag, event) {
      const f = folderOf(cwd, true) as Folder
      let s = f.sessions.get(tag.key)
      const isNew = s === undefined
      if (!s) {
        s = { tag, events: [], next: 0, truncated: false, live: true }
        f.sessions.set(tag.key, s)
        evictEndedNodesFirst(f, tag.key)
      }
      s.tag = { ...tag }
      const seq = s.next++
      const joined = merged(s.events[s.events.length - 1], event)
      if (joined) s.events = [...s.events.slice(0, -1), joined]
      else {
        s.events = [...s.events, event]
        if (s.events.length > maxEvents) {
          s.events = s.events.slice(s.events.length - maxEvents)
          s.truncated = true
        }
      }
      return { seq, isNew }
    },

    endAll(cwd) {
      const f = folderOf(cwd, false)
      if (!f) return false
      let changed = false
      for (const s of f.sessions.values()) {
        if (s.tag.kind !== 'main' && s.live) { s.live = false; changed = true }
      }
      return changed
    },

    rows(cwd) {
      const f = folderOf(cwd, false)
      if (!f) return []
      const out: LoopSessionRow[] = []
      for (const s of f.sessions.values()) {
        if (s.tag.kind === 'main') continue
        out.push({ key: s.tag.key, kind: s.tag.kind, node: s.tag.node, goal: s.tag.goal, live: s.live })
      }
      return out
    },

    read(cwd) {
      const f = folderOf(cwd, false)
      const sessions: LoopSessionRecord[] = f
        ? [...f.sessions.values()].map((s) => ({ session: { ...s.tag }, events: s.events.slice(), next: s.next, truncated: s.truncated, live: s.live }))
        : []
      return { cwd, sessions }
    },
  }
}
