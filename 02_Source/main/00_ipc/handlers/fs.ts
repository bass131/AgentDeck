/**
 * handlers/fs.ts — fs 도메인 핸들러 등록
 *
 * 채널: FS_DIFF · FS_READ · LIST_FILES · FS_LIST_DIR · SAVE_IMAGE_DATA · DIALOG_PICK_FOLDER
 *
 * CRITICAL(신뢰경계):
 *   - FS_READ·FS_LIST_DIR: rootId는 레지스트리 ID만 허용 — 임의 절대경로 주입 차단.
 *     미등록 ID → not-found/[] 응답 (경로 주입 불가).
 *   - FS_DIFF: resolveSafe로 경로 탈출 방어. 워크스페이스 미오픈 → [] 반환.
 *   - LIST_FILES: 경로 인자 없음 — main의 currentWorkspaceRoot만 사용.
 *   - SAVE_IMAGE_DATA: 경로를 renderer가 지정할 수 없음 — main이 uuid 파일명 생성.
 *   - DIALOG_PICK_FOLDER: 경로 인자 없음 — OS 다이얼로그만. 전역 워크스페이스 미변경.
 */

import { ipcMain, dialog, app } from 'electron'
import type { BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS, WORKSPACE_ROOT_ID } from '../../../shared/ipc-contract'
import type {
  FsDiffRequest,
  FsDiffResponse,
  FsReadRequest,
  FsReadResponse,
  ListFilesResponse,
  FsListDirRequest,
  FsListDirResponse,
  SaveImageDataRequest,
  SaveImageDataResponse,
  PickFolderResponse,
} from '../../../shared/ipc-contract'
import { resolveSafe, listDir } from '../../02_fs/workspace'
import { listProjectFiles } from '../../02_fs/listFiles'
import { saveImageBytes } from '../../02_fs/attachments'
import { resolveFsDiffLines } from '../../02_fs/diff'
import { readFileSafe } from '../../02_fs/read'
import type { RootRegistry } from '../../02_fs/roots'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface FsHandlerDeps {
  /** win: dialog용. activate 시 갱신 반영. currentWorkspaceRoot: fs 작업 기준. */
  state: {
    win: BrowserWindow | null
    currentWorkspaceRoot: string | null
  }
  /** 루트 레지스트리 — rootId 게이트(fs.read·fs.listDir) */
  roots: RootRegistry
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** fs 도메인 IPC 핸들러를 등록한다. */
export function registerFsHandlers(deps: FsHandlerDeps): void {
  const { state, roots } = deps

  // ── fs.diff ───────────────────────────────────────────────────────────────
  // CRITICAL: resolveSafe로 경로 탈출 방어. 워크스페이스 미오픈 → [] (빈 응답).

  ipcMain.handle(IPC_CHANNELS.FS_DIFF, async (_e, req: FsDiffRequest): Promise<FsDiffResponse> => {
    if (!req?.filePath || typeof req.filePath !== 'string') {
      return { filePath: '', lines: [] }
    }

    if (!state.currentWorkspaceRoot) {
      return { filePath: req.filePath, lines: [] }
    }
    const root = state.currentWorkspaceRoot

    // 경로 탈출 방어 (untrusted input) — resolveSafe는 탈출 시 null 반환
    const safePath = resolveSafe(root, req.filePath)
    if (!safePath) {
      return { filePath: req.filePath, lines: [] }
    }

    try {
      const lines = await resolveFsDiffLines(root, req.filePath)
      return { filePath: req.filePath, lines }
    } catch {
      return { filePath: req.filePath, lines: [] }
    }
  })

  // ── fs.read ───────────────────────────────────────────────────────────────
  // CRITICAL(보안): req.root는 등록 루트 ID로만 해석 — 레지스트리 조회.
  //   미등록 ID(임의 절대경로 포함) → null → not-found (경로 주입 차단).

  ipcMain.handle(IPC_CHANNELS.FS_READ, (_e, req: FsReadRequest): FsReadResponse => {
    if (!req?.path || typeof req.path !== 'string') {
      return { kind: 'not-found' }
    }

    // root ID 결정: 미지정이면 WORKSPACE_ROOT_ID 사용
    const rootId = (typeof req.root === 'string' && req.root) ? req.root : WORKSPACE_ROOT_ID

    // 레지스트리에서 ID → 경로 조회 (미등록 ID는 null → not-found)
    const rootEntry = roots.get(rootId)
    if (!rootEntry) {
      return { kind: 'not-found' }
    }

    // 루트 기준 독립 resolveSafe + 파일 읽기 (경로 탈출 방어 내부 포함)
    return readFileSafe(rootEntry.path, req.path, { asBinary: req.asBinary === true })
  })

  // ── fs.listFiles ──────────────────────────────────────────────────────────
  // CRITICAL(신뢰경계): 경로 인자 없음 — currentWorkspaceRoot만 사용. renderer 경로 주입 불가.

  ipcMain.handle(IPC_CHANNELS.LIST_FILES, async (): Promise<ListFilesResponse> => {
    if (!state.currentWorkspaceRoot) return { files: [] }
    try {
      return { files: await listProjectFiles(state.currentWorkspaceRoot) }
    } catch {
      return { files: [] }
    }
  })

  // ── fs.listDir ────────────────────────────────────────────────────────────
  // CRITICAL(신뢰경계):
  //   - rootId: 레지스트리 ID만 허용. 임의 절대경로 주입 차단.
  //   - relDir: untrusted → listDir 내부 resolveSafe 검증.

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIR, async (_e, req: FsListDirRequest): Promise<FsListDirResponse> => {
    if (!req || typeof req.relDir !== 'string') {
      return { entries: [] }
    }

    // rootId 게이트: 레지스트리 ID만 허용
    let rootPath: string | null = null
    if (typeof req.rootId === 'string' && req.rootId) {
      const rootEntry = roots.get(req.rootId)
      if (!rootEntry) {
        return { entries: [] }
      }
      rootPath = rootEntry.path
    } else {
      rootPath = state.currentWorkspaceRoot
    }

    if (!rootPath) {
      return { entries: [] }
    }

    try {
      const entries = await listDir(rootPath, req.relDir)
      return { entries }
    } catch {
      return { entries: [] }
    }
  })

  // ── image.saveData ────────────────────────────────────────────────────────
  // CRITICAL(신뢰경계): renderer가 경로를 지정하지 않는다 — main이 uuid 파일명 생성.
  //   저장 위치: app.getPath('userData')/attachments (경로 이탈 불가).
  //   ext: untrusted → saveImageBytes 내부에서 이미지 화이트리스트 검증.

  ipcMain.handle(IPC_CHANNELS.SAVE_IMAGE_DATA, async (_e, req: SaveImageDataRequest): Promise<SaveImageDataResponse> => {
    if (!req || !(req.bytes instanceof ArrayBuffer) || req.bytes.byteLength === 0) {
      return { path: '' }
    }
    try {
      const dir = join(app.getPath('userData'), 'attachments')
      const path = await saveImageBytes(dir, req.bytes, typeof req.ext === 'string' ? req.ext : 'png')
      return { path }
    } catch {
      return { path: '' }
    }
  })

  // ── dialog.pickFolder (P15 — 멀티 패널별 cwd 폴더 선택) ──────────────────
  // CRITICAL(신뢰경계): 경로 인자 없음 — OS 다이얼로그만. 전역 워크스페이스 미변경.
  //   AGENTDECK_E2E_PICK_FOLDER: e2e 하네스만 설정 (workspace.open 동일 패턴).

  ipcMain.handle(IPC_CHANNELS.DIALOG_PICK_FOLDER, async (): Promise<PickFolderResponse> => {
    let folderPath: string | null = null

    if (process.env.AGENTDECK_E2E_PICK_FOLDER) {
      folderPath = process.env.AGENTDECK_E2E_PICK_FOLDER.replace(/\\/g, '/')
    } else {
      const result = state.win
        ? await dialog.showOpenDialog(state.win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return { path: null }
      folderPath = result.filePaths[0].replace(/\\/g, '/')
    }

    // 존재·디렉토리 검증 (untrusted 경로/권한 방어)
    try {
      if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) return { path: null }
    } catch {
      return { path: null }
    }

    return { path: folderPath }
  })
}
