import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipcContract'
import type {
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  ConversationDeleteRequest,
  ConversationDeleteResponse,
  ConversationRenameRequest,
  ConversationRenameResponse,
} from '../../../shared/ipcContract'
import type { ConversationStore } from '../../04_persistence/store'

export interface ConversationHandlerDeps {
  getStore: () => ConversationStore | null
}

export function registerConversationHandlers(deps: ConversationHandlerDeps): void {
  const { getStore } = deps

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LOAD, (_e, req: ConversationLoadRequest): ConversationLoadResponse => {
    const store = getStore()
    if (!store) {
      return { conversations: [] }
    }

    if (req?.id) {
      if (typeof req.id !== 'string' || req.id.length === 0) {
        return { conversations: [] }
      }
      const record = store.load(req.id)
      return { conversations: record ? [record] : [] }
    }

    const limit = typeof req?.limit === 'number' && req.limit > 0 ? req.limit : 20
    const conversations = store.listRecent(limit)
    return { conversations }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_SAVE, (_e, req: ConversationSaveRequest): ConversationSaveResponse => {
    const store = getStore()
    if (!store) {
      throw new Error('conversation.save: store not initialized')
    }

    const conv = req?.conversation
    if (!conv) {
      throw new Error('conversation.save: conversation is required')
    }

    if (!Array.isArray(conv.messages)) {
      throw new Error('conversation.save: messages must be an array')
    }

    const cwd = typeof conv.cwd === 'string' ? conv.cwd : undefined
    const sessionId = typeof conv.sessionId === 'string' ? conv.sessionId : undefined
    const subagents = Array.isArray(conv.subagents) ? conv.subagents : undefined
    const replMode = typeof conv.replMode === 'boolean' ? conv.replMode : undefined

    const id = store.save({
      id: conv.id,
      title: conv.title ?? '',
      messages: conv.messages,
      backendId: conv.backendId,
      cwd,
      sessionId,
      lastContextWindow: conv.lastContextWindow,
      lastUsage: conv.lastUsage,
      subagents,
      replMode
    })

    return { id }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, (_e, req: ConversationDeleteRequest): ConversationDeleteResponse => {
    const store = getStore()
    if (!store || !req?.id || typeof req.id !== 'string') return { ok: false }
    return { ok: store.delete(req.id) }
  })

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_RENAME, (_e, req: ConversationRenameRequest): ConversationRenameResponse => {
    const store = getStore()
    if (!store || !req?.id || typeof req.id !== 'string') return { ok: false }
    const title = typeof req.title === 'string' ? req.title.trim() : ''
    if (!title) return { ok: false }
    return { ok: store.rename(req.id, title) }
  })
}
