/**
 * handlers/lsp.ts — LSP 도메인 핸들러 등록
 *
 * 채널: LSP_STATUS · LSP_HOVER · LSP_DEFINITION · LSP_SEMANTIC_TOKENS · LSP_CACHED_TOKENS
 *
 * CRITICAL(신뢰경계 — plan-auditor 🔴):
 *   - rootId: roots.ts 게이트(getLspManager 내부) — 미등록 ID → 'unsupported'/null/[].
 *   - relPath: getLspManager 내부 resolveSafe 2단 방어.
 *     '..'·절대경로 탈출 → 'unsupported'/null/[].
 *   - cwd·절대경로 직접 입력 필드 없음 — rootId+relPath 조합만 허용.
 *   - pos: 숫자 타입 검증. 비-숫자 → null/[].
 *   - 모든 예외 → graceful 응답 ('error'/null/[]).
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  LspStatus,
  LspHoverResult,
  LspLocation,
  LspSemanticTokens,
  LspDocReq,
  LspPosReq,
} from '../../../shared/ipc-contract'
import { getLspManager } from '../../03_lsp/manager'

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** LSP 도메인 IPC 핸들러를 등록한다. 의존성 없음 (getLspManager 싱글턴 사용). */
export function registerLspHandlers(): void {

  // ── lsp.status ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.LSP_STATUS, (_e, req: LspDocReq): LspStatus => {
    if (!req?.rootId || typeof req.rootId !== 'string') return 'unsupported'
    if (!req?.relPath || typeof req.relPath !== 'string') return 'unsupported'
    try {
      return getLspManager().status(req)
    } catch {
      return 'error'
    }
  })

  // ── lsp.hover ─────────────────────────────────────────────────────────────

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

  // ── lsp.definition ────────────────────────────────────────────────────────
  // CRITICAL: 절대경로 미반환. main이 LSP 서버 반환 절대경로를 역변환.
  // 워크스페이스 밖(node_modules .d.ts) → 결과 제외(graceful no-op).

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

  // ── lsp.semanticTokens ───────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.LSP_SEMANTIC_TOKENS, async (_e, req: LspDocReq): Promise<LspSemanticTokens | null> => {
    if (!req?.rootId || typeof req.rootId !== 'string') return null
    if (!req?.relPath || typeof req.relPath !== 'string') return null
    try {
      return getLspManager().semanticTokens(req)
    } catch {
      return null
    }
  })

  // ── lsp.cachedTokens ─────────────────────────────────────────────────────
  // 인메모리 캐시에서 즉시 반환. renderer가 파일 오픈 직후 즉시 색칠 후 라이브 갱신 패턴.

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
