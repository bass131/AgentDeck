/**
 * handlers/workspace.ts — workspace 도메인 핸들러 등록
 *
 * 채널: WORKSPACE_OPEN · WORKSPACE_TREE
 *
 * CRITICAL(신뢰경계):
 *   - folderPath는 renderer untrusted 입력 — isAbsolute·존재·디렉토리 재검증
 *     (02_fs/workspace.ts validateWorkspaceRoot 공통 헬퍼, CP1 P02 — settings.ts의
 *     skill.list·command.list root 재검증과 동일 관례 공유).
 *   - resolveSafe 미사용: workspace.open은 루트 자체 설정이므로 containment 불필요.
 *   - 권한 검증 우회·약화 절대 금지.
 */

import { ipcMain, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { isAbsolute } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/ipc-contract'
import type {
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeResponse,
} from '../../../shared/ipc-contract'
import { buildTree, validateWorkspaceRoot } from '../../02_fs/workspace'
import type { RootRegistry } from '../../02_fs/roots'

// ── 의존성 타입 ──────────────────────────────────────────────────────────────

/**
 * workspace 핸들러 의존성.
 * state: win(다이얼로그용) + currentWorkspaceRoot(읽기/쓰기) — 공유 가변 ref.
 * registerIpc가 activate 시 win을 갱신하면 핸들러에 자동 반영.
 */
export interface WorkspaceHandlerDeps {
  state: {
    win: BrowserWindow | null
    currentWorkspaceRoot: string | null
  }
  roots: RootRegistry
}

// ── 핸들러 등록 ──────────────────────────────────────────────────────────────

/** workspace 도메인 IPC 핸들러를 등록한다. */
export function registerWorkspaceHandlers(deps: WorkspaceHandlerDeps): void {
  const { state, roots } = deps

  // ── workspace.open ────────────────────────────────────────────────────────
  // renderer가 folderPath 미지정 시 OS 폴더 선택 다이얼로그 표시.
  // CRITICAL: folderPath는 untrusted — 절대경로·존재·디렉토리 재검증.

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_OPEN, async (_e, req: WorkspaceOpenRequest): Promise<WorkspaceOpenResponse> => {
    let rootPath: string | null = null

    if (req?.folderPath) {
      // renderer에서 온 경로(untrusted) — 절대경로만 허용
      if (!isAbsolute(req.folderPath)) {
        return { rootPath: null, tree: null }
      }
      rootPath = req.folderPath.replace(/\\/g, '/')
    } else if (process.env.AGENTDECK_E2E_WORKSPACE) {
      // e2e: 네이티브 폴더 다이얼로그 우회(환경변수, 하네스만 설정)
      rootPath = process.env.AGENTDECK_E2E_WORKSPACE.replace(/\\/g, '/')
    } else {
      const result = state.win
        ? await dialog.showOpenDialog(state.win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { rootPath: null, tree: null }
      }
      rootPath = result.filePaths[0].replace(/\\/g, '/')
    }

    // 존재·디렉토리 검증(공통 헬퍼, CP1 P02) + buildTree 실패 방어 (untrusted 경로 / 권한 / 비정상)
    try {
      if (!validateWorkspaceRoot(rootPath)) {
        return { rootPath: null, tree: null }
      }
      const tree = await buildTree(rootPath)
      state.currentWorkspaceRoot = rootPath
      roots.setWorkspace(rootPath) // 루트 레지스트리 갱신 (fs.read root 게이트용)
      return { rootPath, tree }
    } catch {
      return { rootPath: null, tree: null }
    }
  })

  // ── workspace.tree ────────────────────────────────────────────────────────
  // 현재 열린 워크스페이스의 트리를 반환.

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_TREE, async (): Promise<WorkspaceTreeResponse> => {
    if (!state.currentWorkspaceRoot) {
      return { tree: null }
    }
    const tree = await buildTree(state.currentWorkspaceRoot)
    return { tree }
  })
}
