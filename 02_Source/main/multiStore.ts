import path from 'node:path'
import fs from 'node:fs'
import type { PersistedMultiState, PersistedMultiSession } from '../shared/ipcContract'

const MULTI_VERSION = 2

export function readMulti(filePath: string): PersistedMultiState | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      (parsed as { version: unknown }).version !== MULTI_VERSION
    ) {
      return null
    }
    return parsed as PersistedMultiState
  } catch {
    return null
  }
}

export function writeMulti(filePath: string, data: PersistedMultiState): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data))
  } catch {
  }
}

export function validatePanelCwd(cwd: string | undefined): string | undefined {
  if (!cwd || typeof cwd !== 'string') return undefined
  try {
    if (!path.isAbsolute(cwd)) return undefined
    if (!fs.existsSync(cwd)) return undefined
    if (!fs.statSync(cwd).isDirectory()) return undefined
    return cwd
  } catch {
    return undefined
  }
}

export function getMultiStorePath(userData: string): string {
  return path.join(userData, 'multi-agent.json')
}

export interface MergeResult {
  ok: boolean
  state: PersistedMultiState
}

export function upsertSession(
  state: PersistedMultiState,
  session: Omit<PersistedMultiSession, 'title'>
): MergeResult {
  const idx = state.sessions.findIndex((s) => s.id === session.id)
  if (idx === -1) {
    return { ok: false, state }
  }
  const existing = state.sessions[idx]
  const merged: PersistedMultiSession = { ...existing, ...session, title: existing.title }
  const sessions = state.sessions.map((s, i) => (i === idx ? merged : s))
  return { ok: true, state: { ...state, sessions } }
}

export function createSession(
  state: PersistedMultiState,
  newSession: PersistedMultiSession
): MergeResult {
  return {
    ok: true,
    state: {
      ...state,
      sessions: [...state.sessions, newSession],
      activeSessionId: newSession.id,
    },
  }
}

export function deleteSession(
  state: PersistedMultiState,
  id: string,
  makeFresh: () => PersistedMultiSession
): MergeResult {
  const exists = state.sessions.some((s) => s.id === id)
  if (!exists) {
    return { ok: false, state }
  }
  const remaining = state.sessions.filter((s) => s.id !== id)
  if (remaining.length === 0) {
    const fresh = makeFresh()
    return { ok: true, state: { ...state, sessions: [fresh], activeSessionId: fresh.id } }
  }
  const activeSessionId = state.activeSessionId === id ? remaining[0].id : state.activeSessionId
  return { ok: true, state: { ...state, sessions: remaining, activeSessionId } }
}

const RENAME_TITLE_MAX_LENGTH = 200

export function renameSession(state: PersistedMultiState, id: string, title: string): MergeResult {
  const idx = state.sessions.findIndex((s) => s.id === id)
  if (idx === -1) {
    return { ok: false, state }
  }
  const sanitized = title.trim().slice(0, RENAME_TITLE_MAX_LENGTH)
  const sessions = state.sessions.map((s, i) => (i === idx ? { ...s, title: sanitized } : s))
  return { ok: true, state: { ...state, sessions } }
}

export function selectSession(state: PersistedMultiState, id: string): MergeResult {
  const exists = state.sessions.some((s) => s.id === id)
  if (!exists) {
    return { ok: false, state }
  }
  return { ok: true, state: { ...state, activeSessionId: id } }
}
