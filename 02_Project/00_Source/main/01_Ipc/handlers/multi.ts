import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  MultiSessionLoadResponse,
  MultiCmdUpsertRequest,
  MultiCmdCreateRequest,
  MultiCmdDeleteRequest,
  MultiCmdRenameRequest,
  MultiCmdSelectRequest,
  MultiCmdResponse,
  PersistedMultiState,
  PersistedMultiSession,
} from '../../../shared/ipcContract'
import {
  readMulti,
  writeMulti,
  validatePanelCwd,
  upsertSession,
  createSession,
  deleteSession,
  renameSession,
  selectSession,
} from '../../04_persistence/multiStore'
import type { MergeResult } from '../../04_persistence/multiStore'

function emptyMultiState(): PersistedMultiState {
  return { version: 2, activeSessionId: '', sessions: [] }
}

function makeFreshSession(): PersistedMultiSession {
  return { id: randomUUID(), title: '', count: 2, panels: [] }
}

function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidUpsertSession(value: unknown): value is Omit<PersistedMultiSession, 'title'> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { id?: unknown; count?: unknown; panels?: unknown }
  return (
    isValidId(candidate.id) &&
    typeof candidate.count === 'number' &&
    Array.isArray(candidate.panels)
  )
}

function runMultiCmd(
  path: string | null,
  mergeFn: (current: PersistedMultiState) => MergeResult
): MultiCmdResponse {
  const current = path ? readMulti(path) ?? emptyMultiState() : emptyMultiState()
  if (!path) {
    return { ok: false, state: current }
  }
  try {
    const result = mergeFn(current)
    if (result.ok) {
      writeMulti(path, result.state)
    }
    return result
  } catch {
    return { ok: false, state: current }
  }
}

export interface MultiHandlerDeps {
  getMultiStorePath: () => string | null
}

export function registerMultiHandlers(deps: MultiHandlerDeps): void {
  const { getMultiStorePath } = deps

  ipcMain.handle(IPC_CHANNELS.MULTI_SESSION_LOAD, (): MultiSessionLoadResponse => {
    try {
      const path = getMultiStorePath()
      if (!path) return { state: null }
      const loaded = readMulti(path)
      if (!loaded) return { state: null }

      const validatedSessions = loaded.sessions.map(session => ({
        ...session,
        panels: session.panels.map(panel => ({
          ...panel,
          cwd: validatePanelCwd(panel.cwd),
        })),
      }))

      return {
        state: {
          ...loaded,
          sessions: validatedSessions,
        },
      }
    } catch {
      return { state: null }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.MULTI_CMD_UPSERT,
    (_e, req: MultiCmdUpsertRequest): MultiCmdResponse => {
      const session = req?.session
      return runMultiCmd(getMultiStorePath(), (current) => {
        if (!isValidUpsertSession(session)) return { ok: false, state: current }
        return upsertSession(current, session)
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MULTI_CMD_CREATE,
    (_e, _req: MultiCmdCreateRequest): MultiCmdResponse => {
      return runMultiCmd(getMultiStorePath(), (current) => createSession(current, makeFreshSession()))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MULTI_CMD_DELETE,
    (_e, req: MultiCmdDeleteRequest): MultiCmdResponse => {
      const id = req?.id
      return runMultiCmd(getMultiStorePath(), (current) => {
        if (!isValidId(id)) return { ok: false, state: current }
        return deleteSession(current, id, makeFreshSession)
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MULTI_CMD_RENAME,
    (_e, req: MultiCmdRenameRequest): MultiCmdResponse => {
      const id = req?.id
      const title = req?.title
      return runMultiCmd(getMultiStorePath(), (current) => {
        if (!isValidId(id) || typeof title !== 'string') return { ok: false, state: current }
        return renameSession(current, id, title)
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.MULTI_CMD_SELECT,
    (_e, req: MultiCmdSelectRequest): MultiCmdResponse => {
      const id = req?.id
      return runMultiCmd(getMultiStorePath(), (current) => {
        if (!isValidId(id)) return { ok: false, state: current }
        return selectSession(current, id)
      })
    }
  )
}
