import { vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  upsertSession,
  createSession,
  deleteSession,
  renameSession,
  selectSession,
} from '../../../../02_Project/00_Source/main/04_persistence/multiStore'
import type { MergeResult } from '../../../../02_Project/00_Source/main/04_persistence/multiStore'
import type {
  PersistedMultiState,
  PersistedMultiSession,
  MultiCmdResponse,
} from '../../../../02_Project/00_Source/shared/ipcContract'

function emptyMultiState(): PersistedMultiState {
  return { version: 2, activeSessionId: '', sessions: [] }
}

export function makeFreshSession(): PersistedMultiSession {
  return { id: randomUUID(), title: '', count: 2, panels: [] }
}

export function makeMultiCmdMocks(
  getDisk: () => PersistedMultiState | null,
  setDisk: (state: PersistedMultiState) => void
) {
  function run(mergeFn: (current: PersistedMultiState) => MergeResult): MultiCmdResponse {
    const current = getDisk() ?? emptyMultiState()
    const result = mergeFn(current)
    if (result.ok) setDisk(result.state)
    return result
  }

  return {
    multiCmdUpsert: vi.fn(
      (session: Omit<PersistedMultiSession, 'title'>): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => upsertSession(current, session)))
    ),
    multiCmdCreate: vi.fn(
      (): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => createSession(current, makeFreshSession())))
    ),
    multiCmdDelete: vi.fn(
      (id: string): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => deleteSession(current, id, makeFreshSession)))
    ),
    multiCmdRename: vi.fn(
      (id: string, title: string): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => renameSession(current, id, title)))
    ),
    multiCmdSelect: vi.fn(
      (id: string): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => selectSession(current, id)))
    ),
    run,
  }
}

export type MultiCmdMocks = ReturnType<typeof makeMultiCmdMocks>

export function makeCmdGate(): { promise: Promise<void>; open: () => void } {
  let openFn!: () => void
  const promise = new Promise<void>((resolve) => {
    openFn = resolve
  })
  return { promise, open: openFn }
}
