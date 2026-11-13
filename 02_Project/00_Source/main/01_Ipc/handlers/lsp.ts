import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  LspStatus,
  LspHoverResult,
  LspLocation,
  LspSemanticTokens,
  LspDocReq,
  LspPosReq,
} from '../../../shared/ipcContract'
import { getLspManager } from '../../03_lsp/manager'

export function registerLspHandlers(): void {

  ipcMain.handle(IPC_CHANNELS.LSP_STATUS, (_e, req: LspDocReq): LspStatus => {
    if (!req?.rootId || typeof req.rootId !== 'string') return 'unsupported'
    if (!req?.relPath || typeof req.relPath !== 'string') return 'unsupported'
    try {
      return getLspManager().status(req)
    } catch {
      return 'error'
    }
  })

  ipcMain.handle(IPC_CHANNELS.LSP_HOVER, async (_e, req: LspPosReq): Promise<LspHoverResult | null> => {
    if (!req?.rootId || typeof req.rootId !== 'string') return null
    if (!req?.relPath || typeof req.relPath !== 'string') return null
    if (typeof req?.pos?.line !== 'number' || typeof req?.pos?.character !== 'number') return null
    try {
      return getLspManager().hover(req)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.LSP_DEFINITION, async (_e, req: LspPosReq): Promise<LspLocation[]> => {
    if (!req?.rootId || typeof req.rootId !== 'string') return []
    if (!req?.relPath || typeof req.relPath !== 'string') return []
    if (typeof req?.pos?.line !== 'number' || typeof req?.pos?.character !== 'number') return []
    try {
      return getLspManager().definition(req)
    } catch {
      return []
    }
  })

  ipcMain.handle(IPC_CHANNELS.LSP_SEMANTIC_TOKENS, async (_e, req: LspDocReq): Promise<LspSemanticTokens | null> => {
    if (!req?.rootId || typeof req.rootId !== 'string') return null
    if (!req?.relPath || typeof req.relPath !== 'string') return null
    try {
      return getLspManager().semanticTokens(req)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.LSP_CACHED_TOKENS, async (_e, req: LspDocReq): Promise<LspSemanticTokens | null> => {
    if (!req?.rootId || typeof req.rootId !== 'string') return null
    if (!req?.relPath || typeof req.relPath !== 'string') return null
    try {
      return getLspManager().cachedTokens(req)
    } catch {
      return null
    }
  })
}
