/**
 * handlers/multi.ts — multi-session 도메인 핸들러 등록 (M3 — 멀티 에이전트 세션 영속)
 *
 * 채널: MULTI_SESSION_SAVE · MULTI_SESSION_LOAD (현행 유지 — 제거는 RMW1-P05)
 *       MULTI_CMD_UPSERT · MULTI_CMD_CREATE · MULTI_CMD_DELETE · MULTI_CMD_RENAME ·
 *       MULTI_CMD_SELECT (ADR-031, RMW1-P03 — 신규 명령 5종)
 *
 * CRITICAL(신뢰경계):
 *   - MULTI_SESSION_SAVE: state는 renderer untrusted 입력 — best-effort 저장, 검증 최소.
 *     읽기(LOAD) 시 cwd 재검증으로 보호(B2).
 *   - MULTI_SESSION_LOAD: 인자 없음 — main이 고정 경로에서 읽는다.
 *     반환 전 각 panel.cwd를 validatePanelCwd(isAbsolute+existsSync+isDirectory)로 재검증.
 *     검증 실패 → undefined drop (임의 경로 무확인 통과 0).
 *     손상 JSON / version≠2 → state:null (graceful).
 *   - ADR-008: blob은 워크스페이스 메타만 — API 키·시크릿 저장 금지(호출부 책임).
 *
 * CRITICAL(ADR-031 — 명령 5종 원자성):
 *   각 MULTI_CMD_* 핸들러는 `readMulti → 병합함수(multiStore.ts) → writeMulti`를
 *   **await 없는 동기 블록**으로 실행한다. JS 이벤트루프는 시작한 동기 블록을 끝까지
 *   실행(run-to-completion)하므로, 이 블록 안에는 다른 IPC 호출이 절대 끼어들 수 없다 —
 *   이것이 "락(lock)을 코드로 짜지 않고도" 읽기~쓰기 사이 원자성을 보장하는 방법이다.
 *   fs.promises나 async 콜백을 쓰는 순간 이 보장이 깨진다 — readFileSync/writeFileSync
 *   기반 동기 함수(multiStore.ts)를 그대로 사용해야 하는 이유.
 *   renderer 입력(session/id/title)은 untrusted — 형태 검증(shape validation) 실패는
 *   디스크 병합 없이 ok:false + 현재 권위 상태를 반환한다(의미 판단은 병합 함수가 담당).
 */

import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  MultiSessionSaveRequest,
  MultiSessionSaveResponse,
  MultiSessionLoadResponse,
  MultiCmdUpsertRequest,
  MultiCmdCreateRequest,
  MultiCmdDeleteRequest,
  MultiCmdRenameRequest,
  MultiCmdSelectRequest,
  MultiCmdResponse,
  PersistedMultiState,
  PersistedMultiSession,
} from '../../../shared/ipc-contract'
import {
  readMulti,
  writeMulti,
  validatePanelCwd,
  upsertSession,
  createSession,
  deleteSession,
  renameSession,
  selectSession,
} from '../../multiStore'
import type { MergeResult } from '../../multiStore'

// ── 명령 핸들러 공용 헬퍼 ────────────────────────────────────────────────────

/** 디스크에 파일이 없거나 손상됐을 때(readMulti가 null) 병합의 출발점이 되는 기본 상태. */
function emptyMultiState(): PersistedMultiState {
  return { version: 2, activeSessionId: '', sessions: [] }
}

/** 명령 핸들러용 새 세션 메타 — 기존 renderer newMultiSession()과 동형(title/count/panels). */
function makeFreshSession(): PersistedMultiSession {
  return { id: randomUUID(), title: '', count: 2, panels: [] }
}

/** id 형태 검증 — renderer untrusted 입력이므로 비어있지 않은 string만 통과. */
function isValidId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * upsert 요청의 session 필드 형태 검증(shape validation).
 * CRITICAL(신뢰경계): id/count/panels 타입만 확인 — 의미 판단(존재 여부 등)은 병합 함수 담당.
 */
function isValidUpsertSession(value: unknown): value is Omit<PersistedMultiSession, 'title'> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { id?: unknown; count?: unknown; panels?: unknown }
  return (
    isValidId(candidate.id) &&
    typeof candidate.count === 'number' &&
    Array.isArray(candidate.panels)
  )
}

/**
 * 명령 핸들러 공통 골격 — readMulti(1회) → mergeFn(검증+병합) → (ok일 때만) writeMulti.
 *
 * CRITICAL(ADR-031 — 동기 원자성): 이 함수와 그 호출부 전체에 await/async가 없다.
 * getMultiStorePath()가 null(스토어 미초기화)이면 읽기/쓰기 모두 건너뛰고 ok:false +
 * 빈 상태를 반환한다(기존 SAVE/LOAD 핸들러의 "null이면 graceful" 패턴과 동일).
 * mergeFn 안에서 입력 형태(shape) 검증까지 수행 — current를 두 번 읽지 않기 위해서다.
 */
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

  // ── multi.cmdUpsert ────────────────────────────────────────────────────────
  // CRITICAL(ADR-031): readMulti → upsertSession → writeMulti, await 0.

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

  // ── multi.cmdCreate ────────────────────────────────────────────────────────
  // CRITICAL(ADR-031): id는 main이 randomUUID로 생성(단일 기록자 소유), await 0.

  ipcMain.handle(
    IPC_CHANNELS.MULTI_CMD_CREATE,
    (_e, _req: MultiCmdCreateRequest): MultiCmdResponse => {
      return runMultiCmd(getMultiStorePath(), (current) => createSession(current, makeFreshSession()))
    }
  )

  // ── multi.cmdDelete ────────────────────────────────────────────────────────
  // CRITICAL(ADR-031): 활성 재계산 포함, await 0.

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

  // ── multi.cmdRename ────────────────────────────────────────────────────────
  // CRITICAL(ADR-031): title trim+cap은 renameSession(multiStore.ts)이 담당, await 0.

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

  // ── multi.cmdSelect ────────────────────────────────────────────────────────
  // CRITICAL(ADR-031): await 0.

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
