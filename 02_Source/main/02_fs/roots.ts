import { basename } from 'node:path'
import { WORKSPACE_ROOT_ID } from '../../shared/ipcContract'
import type { ReferenceFolder } from '../../shared/ipcContract'

interface RootEntry {
  id: string
  path: string
  readOnly: boolean
  name: string
}

export interface RootRegistry {
  setWorkspace(path: string): void

  addReference(path: string, name?: string): ReferenceFolder

  get(id: string): RootEntry | null

  listReferences(): ReferenceFolder[]
}

export function createRootRegistry(): RootRegistry {
  const _map = new Map<string, RootEntry>()
  const _pathIndex = new Map<string, string>()
  let _refCounter = 0

  return {
    setWorkspace(path: string): void {
      const name = basename(path) || path
      const entry: RootEntry = {
        id: WORKSPACE_ROOT_ID,
        path,
        readOnly: false,
        name
      }
      _map.set(WORKSPACE_ROOT_ID, entry)
    },

    addReference(path: string, name?: string): ReferenceFolder {
      const existingId = _pathIndex.get(path)
      if (existingId !== undefined) {
        const existing = _map.get(existingId)!
        return {
          id: existing.id,
          name: existing.name,
          rootPath: existing.path,
          readOnly: true
        }
      }

      _refCounter += 1
      const id = `ref-${_refCounter}`
      const resolvedName = name ?? basename(path) ?? path
      const entry: RootEntry = {
        id,
        path,
        readOnly: true,
        name: resolvedName
      }
      _map.set(id, entry)
      _pathIndex.set(path, id)

      return {
        id,
        name: resolvedName,
        rootPath: path,
        readOnly: true
      }
    },

    get(id: string): RootEntry | null {
      if (!id) return null
      return _map.get(id) ?? null
    },

    listReferences(): ReferenceFolder[] {
      const result: ReferenceFolder[] = []
      for (const entry of _map.values()) {
        if (entry.id === WORKSPACE_ROOT_ID) continue
        result.push({
          id: entry.id,
          name: entry.name,
          rootPath: entry.path,
          readOnly: true
        })
      }
      return result
    }
  }
}
