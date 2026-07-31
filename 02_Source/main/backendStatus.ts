import type { BackendStatus, BackendId } from '../shared/ipcContract'
import { BACKEND_LABELS } from '../shared/ipcContract'
import { listBackends } from './01_agents/registry'
import { getEngineState, ENGINE_STATE_BACKEND_ID } from './engineState'

export interface BackendLike {
  readonly id: BackendId
  isAvailable(): Promise<boolean>
  version(): Promise<string | null>
  latestVersion(): Promise<string | null>
}

export interface BackendStatusDeps {
  backends?: BackendLike[]
  getAuthed?: (id: BackendId) => Promise<boolean>
}

async function defaultGetAuthed(id: BackendId): Promise<boolean> {
  if (id === ENGINE_STATE_BACKEND_ID) {
    const state = await getEngineState()
    return state.authed
  }
  return false
}

export async function buildBackendStatuses(deps?: BackendStatusDeps): Promise<BackendStatus[]> {
  const backends: BackendLike[] = deps?.backends ?? listBackends()
  const getAuthed = deps?.getAuthed ?? defaultGetAuthed

  return Promise.all(
    backends.map(async (b): Promise<BackendStatus> => {
      let available = false
      try {
        available = await b.isAvailable()
      } catch {
        available = false
      }

      let version: string | null = null
      try {
        const v = await b.version()
        version = typeof v === 'string' && v.length > 0 ? v : null
      } catch {
        version = null
      }

      let latestVersion: string | null = null
      try {
        const lv = await b.latestVersion()
        latestVersion = typeof lv === 'string' && lv.length > 0 ? lv : null
      } catch {
        latestVersion = null
      }

      let authed = false
      try {
        authed = await getAuthed(b.id)
      } catch {
        authed = false
      }

      return {
        id: b.id,
        name: BACKEND_LABELS[b.id] ?? b.id,
        available,
        version,
        latestVersion,
        authed
      }
    })
  )
}
