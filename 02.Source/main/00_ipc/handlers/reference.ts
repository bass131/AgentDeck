/**
 * handlers/reference.ts — reference 도메인 핸들러 등록
 *
 * 채널: REFERENCE_ADD · REFERENCE_LIST · REFERENCE_TREE
 *
 * CRITICAL(신뢰경계):
 *   - REFERENCE_ADD: folderPath는 untrusted — isAbsolute·existsSync·statSync 재검증.
 *     검증 후 _roots에 등록하고 발급된 id로만 이후 접근 가능 (임의 경로 주입 불가).
 *   - REFERENCE_TREE: id는 untrusted — _roots.get(id) 레지스트리 조회로 경로 획득.
 *     미등록 id → { tree: null } (not-found 은닉).
 */

import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, basename } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  ReferenceAddRequest,
  ReferenceAddResponse,
  ReferenceListResponse,
  ReferenceTreeRequest,
  ReferenceTreeResponse,
} from '../../../shared/ipc-contract'
import { buildTree } from '../../02_fs/workspace'
import type { RootRegistry } from '../../02_fs/roots'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

export interface ReferenceHandlerDeps {
  /** win: OS 폴더 다이얼로그 모달용. activate 시 갱신 반영. */
  state: { win: BrowserWindow | null }
  /** 루트 레지스트리 — 레퍼런스 폴더 등록 + ID 조회 */
  roots: RootRegistry
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** reference 도메인 IPC 핸들러를 등록한다. */
export function registerReferenceHandlers(deps: ReferenceHandlerDeps): void {
  const { state, roots } = deps

  // ── reference.add ─────────────────────────────────────────────────────────
  // CRITICAL(보안): folderPath는 untrusted — 반드시 재검증.
  // 이후 파일 접근은 발급된 id 로만 가능 (임의 경로 주입 불가).

  ipcMain.handle(IPC_CHANNELS.REFERENCE_ADD, async (_e, req: ReferenceAddRequest): Promise<ReferenceAddResponse> => {
    let folderPath: string | null = null

    if (req?.folderPath) {
      // renderer에서 온 경로(untrusted) — 절대경로만 허용
      if (!isAbsolute(req.folderPath)) {
        return { reference: null }
      }
      folderPath = req.folderPath.replace(/\\/g, '/')
    } else if (process.env.AGENTDECK_E2E_REFERENCE) {
      // e2e: 네이티브 폴더 다이얼로그 우회 (하네스만 설정)
      folderPath = process.env.AGENTDECK_E2E_REFERENCE.replace(/\\/g, '/')
    } else {
      const result = state.win
        ? await dialog.showOpenDialog(state.win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { reference: null }
      }
      folderPath = result.filePaths[0].replace(/\\/g, '/')
    }

    // 절대경로 + 존재 + 디렉토리 검증
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

  // ── reference.list ────────────────────────────────────────────────────────
  // 현재 세션에 등록된 레퍼런스 폴더 목록 반환 (워크스페이스 제외).

  ipcMain.handle(IPC_CHANNELS.REFERENCE_LIST, (): ReferenceListResponse => {
    return { references: roots.listReferences() }
  })

  // ── reference.tree ────────────────────────────────────────────────────────
  // CRITICAL: id는 untrusted — 레지스트리 조회로만 경로 획득. 미등록 → { tree: null }.

  ipcMain.handle(IPC_CHANNELS.REFERENCE_TREE, async (_e, req: ReferenceTreeRequest): Promise<ReferenceTreeResponse> => {
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
