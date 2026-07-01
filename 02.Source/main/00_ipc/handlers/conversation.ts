/**
 * handlers/conversation.ts — conversation 도메인 핸들러 등록
 *
 * 채널: CONVERSATION_LOAD · CONVERSATION_SAVE · CONVERSATION_DELETE · CONVERSATION_RENAME
 *
 * CRITICAL(신뢰경계):
 *   - id·title 모두 renderer untrusted 입력 — 타입+비어있음 검증.
 *   - API 키·시크릿는 저장하지 않음 (ADR-008). ConversationRecord 타입에 시크릿 필드 없음.
 *   - store 미초기화 → 빈 응답·throw (각 핸들러 정책 동일).
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  ConversationDeleteRequest,
  ConversationDeleteResponse,
  ConversationRenameRequest,
  ConversationRenameResponse,
} from '../../../shared/ipc-contract'
import type { ConversationStore } from '../../04_persistence/store'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface ConversationHandlerDeps {
  /**
   * ConversationStore getter.
   * setStore()는 registerIpc() 이후 호출되므로 getter 패턴 필수.
   * 핸들러 호출 시점에는 항상 초기화되어 있어야 한다(graceful null 처리 포함).
   */
  getStore: () => ConversationStore | null
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** conversation 도메인 IPC 핸들러를 등록한다. */
export function registerConversationHandlers(deps: ConversationHandlerDeps): void {
  const { getStore } = deps

  // ── conversation.load ─────────────────────────────────────────────────────

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

  // ── conversation.save ─────────────────────────────────────────────────────

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

    // CRITICAL: API 키·시크릿는 저장하지 않음 (ADR-008)
    // cwd: 경로 문자열(시크릿 아님, ADR-020). string 타입만 허용.
    const cwd = typeof conv.cwd === 'string' ? conv.cwd : undefined
    // LR1 수정: 이 핸들러가 sessionId·게이지 메타를 store.save로 전달하지 않아
    //   단일채팅 대화가 session_id를 영속하지 못했다(재시작/다음날 resume 불가 = "새 대화처럼").
    //   renderer는 보내고 store.save는 저장 준비돼 있었으나 중간 핸들러가 필드를 drop.
    //   불투명 토큰(ADR-003) — string만 허용. store.save가 빈/undefined 정규화.
    const sessionId = typeof conv.sessionId === 'string' ? conv.sessionId : undefined

    const id = store.save({
      id: conv.id,
      title: conv.title ?? '',
      messages: conv.messages,
      backendId: conv.backendId,
      cwd,
      sessionId,
      lastContextWindow: conv.lastContextWindow,
      lastUsage: conv.lastUsage
    })

    return { id }
  })

  // ── conversation.delete ───────────────────────────────────────────────────
  // CRITICAL(신뢰경계): id는 untrusted — 타입·비어있음 검증 후만 위임.

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, (_e, req: ConversationDeleteRequest): ConversationDeleteResponse => {
    const store = getStore()
    if (!store || !req?.id || typeof req.id !== 'string') return { ok: false }
    return { ok: store.delete(req.id) }
  })

  // ── conversation.rename ───────────────────────────────────────────────────
  // CRITICAL(신뢰경계): id·title 모두 untrusted.
  //   title: trim 후 빈 문자열이면 ok:false (무제목 방지).

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_RENAME, (_e, req: ConversationRenameRequest): ConversationRenameResponse => {
    const store = getStore()
    if (!store || !req?.id || typeof req.id !== 'string') return { ok: false }
    const title = typeof req.title === 'string' ? req.title.trim() : ''
    if (!title) return { ok: false }
    return { ok: store.rename(req.id, title) }
  })
}
