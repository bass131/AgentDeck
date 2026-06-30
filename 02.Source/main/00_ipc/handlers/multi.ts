/**
 * handlers/multi.ts — multi-session 도메인 핸들러 등록 (M3 — 멀티 에이전트 세션 영속)
 *
 * 채널: MULTI_SESSION_SAVE · MULTI_SESSION_LOAD
 *
 * CRITICAL(신뢰경계):
 *   - MULTI_SESSION_SAVE: state는 renderer untrusted 입력 — best-effort 저장, 검증 최소.
 *     읽기(LOAD) 시 cwd 재검증으로 보호(B2).
 *   - MULTI_SESSION_LOAD: 인자 없음 — main이 고정 경로에서 읽는다.
 *     반환 전 각 panel.cwd를 validatePanelCwd(isAbsolute+existsSync+isDirectory)로 재검증.
 *     검증 실패 → undefined drop (임의 경로 무확인 통과 0).
 *     손상 JSON / version≠2 → state:null (graceful).
 *   - ADR-008: blob은 워크스페이스 메타만 — API 키·시크릿 저장 금지(호출부 책임).
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  MultiSessionSaveRequest,
  MultiSessionSaveResponse,
  MultiSessionLoadResponse,
} from '../../../shared/ipc-contract'
import { readMulti, writeMulti, validatePanelCwd } from '../../multiStore'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface MultiHandlerDeps {
  /**
   * multiStorePath getter.
   * initMultiStore()는 registerIpc() 이후 호출되므로 getter 패턴 필수.
   * null이면 ok:false/state:null graceful 처리.
   */
  getMultiStorePath: () => string | null
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** multi-session 도메인 IPC 핸들러를 등록한다. */
export function registerMultiHandlers(deps: MultiHandlerDeps): void {
  const { getMultiStorePath } = deps

  // ── multiSession.save ─────────────────────────────────────────────────────
  // CRITICAL: state는 untrusted — best-effort 저장. 검증은 LOAD 시 cwd 재검증으로.

  ipcMain.handle(IPC_CHANNELS.MULTI_SESSION_SAVE, (_e, req: MultiSessionSaveRequest): MultiSessionSaveResponse => {
    try {
      const path = getMultiStorePath()
      if (!path) return { ok: false }
      const state = req?.state
      if (!state || typeof state !== 'object') return { ok: false }
      writeMulti(path, state)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  // ── multiSession.load ─────────────────────────────────────────────────────
  // CRITICAL(신뢰경계·B2): 인자 없음. 반환 전 panel.cwd 재검증 — 실패 시 undefined drop.

  ipcMain.handle(IPC_CHANNELS.MULTI_SESSION_LOAD, (): MultiSessionLoadResponse => {
    try {
      const path = getMultiStorePath()
      if (!path) return { state: null }
      const loaded = readMulti(path)
      if (!loaded) return { state: null }

      // cwd 재검증 (B2 신뢰경계 CRITICAL):
      // 각 세션의 각 패널 cwd를 isAbsolute+existsSync+isDirectory로 검증
      // → 실패 시 undefined drop
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
}
