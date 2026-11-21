import { handle } from '../handle'
import type { BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, basename } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  ReferenceAddRequest,
  ReferenceAddResponse,
  ReferenceListResponse,
  ReferenceTreeRequest,
  ReferenceTreeResponse,
} from '../../../shared/ipcContract'
import { buildTree } from '@main/07_Workspace/workspace'
import { pickDirectory } from '@main/07_Workspace/pickFolder'
import type { RootRegistry } from '@main/07_Workspace/roots'

interface ReferenceHandlerDeps {
  state: { win: BrowserWindow | null }
  roots: RootRegistry
}

export function registerReferenceHandlers(deps: ReferenceHandlerDeps): void {
  const { state, roots } = deps

  handle(IPC_CHANNELS.REFERENCE_ADD, async (_e, req: ReferenceAddRequest): Promise<ReferenceAddResponse> => {
    let folderPath: string | null = null

    if (req?.folderPath) {
      if (!isAbsolute(req.folderPath)) {
        return { reference: null }
      }
      folderPath = req.folderPath.replace(/\\/g, '/')
    } else {
      const picked = await pickDirectory(state.win, 'AGENTDECK_E2E_REFERENCE')
      if (picked === null) {
        return { reference: null }
      }
      folderPath = picked
    }

    try {
      if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
        return { reference: null }
      }
    } catch {
      return { reference: null }
    }

    const name = basename(folderPath)
    const reference = roots.addReference(folderPath, name)
    return { reference }
  })

  handle(IPC_CHANNELS.REFERENCE_LIST, (): ReferenceListResponse => {
    return { references: roots.listReferences() }
  })

  handle(IPC_CHANNELS.REFERENCE_TREE, async (_e, req: ReferenceTreeRequest): Promise<ReferenceTreeResponse> => {
    if (!req?.id || typeof req.id !== 'string') {
      return { tree: null }
    }
    const rootEntry = roots.get(req.id)
    if (!rootEntry) {
      return { tree: null }
    }
    try {
      const tree = await buildTree(rootEntry.path)
      return { tree }
    } catch {
      return { tree: null }
    }
  })
}
