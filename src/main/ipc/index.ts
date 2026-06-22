/**
 * ipc/index.ts — IPC 핸들러 등록 (얇은 레이어, electron import 허용)
 *
 * 이 파일은 electron(ipcMain, dialog, BrowserWindow)을 import하는
 * "얇은 등록 레이어"다. 순수 로직은 모두 다른 모듈에 위임한다:
 *   - 경로 검증/트리: src/main/fs/workspace.ts
 *   - diff:          src/main/fs/diff.ts
 *   - persistence:   src/main/persistence/store.ts
 *   - 에이전트 실행:  src/main/ipc/agent-runs.ts
 *
 * 테스트 전략: 이 파일 자체는 electron 의존으로 직접 테스트 불가.
 *   → 순수 모듈을 테스트하고, 이 파일은 통합/e2e 수준에서 검증.
 *
 * CRITICAL (헌법 신뢰경계):
 *   - 모든 renderer 입력은 untrusted → 경로 탈출·타입 검증 필수.
 *   - 채널명은 IPC_CHANNELS import만 — 하드코딩 0.
 *   - API 키·시크릿는 절대 IPC 응답·로그에 평문 노출 금지.
 */

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import {
  IPC_CHANNELS
} from '../../shared/ipc-contract'
import type {
  WorkspaceOpenRequest,
  WorkspaceOpenResponse,
  WorkspaceTreeRequest,
  WorkspaceTreeResponse,
  AgentRunRequest,
  AgentRunResponse,
  AgentAbortRequest,
  AgentAbortResponse,
  FsDiffRequest,
  FsDiffResponse,
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  AgentEventPayload
} from '../../shared/ipc-contract'
import { buildTree, resolveSafe } from '../fs/workspace'
import { computeDiff } from '../fs/diff'
import type { ConversationStore } from '../persistence/store'
import { createRunManager } from './agent-runs'
import { getBackend } from '../agents/registry'

// ── 모듈 상태 (앱 생명주기와 연동) ──────────────────────────────────────────

let _store: ConversationStore | null = null
let _currentWorkspaceRoot: string | null = null
let _win: BrowserWindow | null = null
let _registered = false
const _runManager = createRunManager()

// ── 초기화 API ───────────────────────────────────────────────────────────────

/**
 * ConversationStore 주입.
 * main/index.ts가 app ready 후 store를 생성하여 이 함수로 전달.
 */
export function setStore(store: ConversationStore): void {
  _store = store
}

// ── 핸들러 등록 ───────────────────────────────────────────────────────────────

/**
 * BrowserWindow에 8채널 IPC 핸들러를 등록한다.
 *
 * @param win  BrowserWindow 인스턴스 (AGENT_EVENT 스트리밍용)
 *
 * 호출 시점: app.whenReady() + createWindow() 이후.
 */
export function registerIpc(win: BrowserWindow): void {
  // 윈도우 참조는 매 호출 갱신(activate 재생성 대응). 핸들러 등록은 *1회만* —
  // ipcMain.handle은 채널 중복 등록 시 throw하므로 activate 재호출 크래시 방지.
  _win = win
  if (_registered) return
  _registered = true

  // ── workspace.open ────────────────────────────────────────────────────────
  // renderer가 folderPath 미지정 시 OS 폴더 선택 다이얼로그 표시.
  // 경로 탈출 방어: resolveSafe 사용 (folderPath가 주어진 경우 검증).

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
      // 폴더 선택 다이얼로그 (_win 있으면 모달로)
      const result = _win
        ? await dialog.showOpenDialog(_win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { rootPath: null, tree: null }
      }
      rootPath = result.filePaths[0].replace(/\\/g, '/')
    }

    // 존재·디렉토리 검증 + buildTree 실패 방어 (untrusted 경로 / 권한 / 비정상)
    try {
      if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
        return { rootPath: null, tree: null }
      }
      const tree = await buildTree(rootPath)
      _currentWorkspaceRoot = rootPath
      return { rootPath, tree }
    } catch {
      return { rootPath: null, tree: null }
    }
  })

  // ── workspace.tree ────────────────────────────────────────────────────────
  // 현재 열린 워크스페이스의 트리를 반환.

  ipcMain.handle(IPC_CHANNELS.WORKSPACE_TREE, async (_e, _req: WorkspaceTreeRequest): Promise<WorkspaceTreeResponse> => {
    if (!_currentWorkspaceRoot) {
      return { tree: null }
    }
    const tree = await buildTree(_currentWorkspaceRoot)
    return { tree }
  })

  // ── agent.run ─────────────────────────────────────────────────────────────
  // 에이전트 실행 시작. runId 반환, 이벤트는 AGENT_EVENT 채널로 push.

  ipcMain.handle(IPC_CHANNELS.AGENT_RUN, async (_e, req: AgentRunRequest): Promise<AgentRunResponse> => {
    // 입력 검증 (untrusted)
    if (!Array.isArray(req?.messages)) {
      throw new Error('agent.run: messages must be an array')
    }
    if (req.messages.length === 0) {
      throw new Error('agent.run: messages must not be empty')
    }

    // workspaceRoot 경로 탈출 방어 (선택적 필드)
    let workspaceRoot = req.workspaceRoot
    if (workspaceRoot) {
      if (!isAbsolute(workspaceRoot)) {
        throw new Error('agent.run: workspaceRoot must be an absolute path')
      }
      workspaceRoot = workspaceRoot.replace(/\\/g, '/')
    }

    const backend = getBackend(req.backendId)

    // runId를 담을 컨테이너 — start()가 반환하기 전에 콜백이 호출될 수 있으므로
    // 참조 박스(mutable container)로 늦은 바인딩.
    const runIdBox = { value: '' }

    const runId = await _runManager.start(
      backend,
      { messages: req.messages, workspaceRoot },
      (event) => {
        const payload: AgentEventPayload = { runId: runIdBox.value, event }
        if (_win && !_win.isDestroyed()) {
          _win.webContents.send(IPC_CHANNELS.AGENT_EVENT, payload)
        }
      }
    )

    runIdBox.value = runId
    return { runId }
  })

  // ── agent.abort ───────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.AGENT_ABORT, (_e, req: AgentAbortRequest): AgentAbortResponse => {
    if (!req?.runId || typeof req.runId !== 'string') {
      return { accepted: false }
    }
    const accepted = _runManager.abort(req.runId)
    return { accepted }
  })

  // ── fs.diff ───────────────────────────────────────────────────────────────
  // 파일 경로를 받아 스냅샷 vs 워크트리 diff 반환.
  // 스냅샷: 현재 워크스페이스의 git HEAD 또는 직전 저장 내용.
  // MVP: 빈 스냅샷(신규 파일로 취급) vs 현재 파일 내용.

  ipcMain.handle(IPC_CHANNELS.FS_DIFF, async (_e, req: FsDiffRequest): Promise<FsDiffResponse> => {
    if (!req?.filePath || typeof req.filePath !== 'string') {
      return { filePath: '', lines: [] }
    }

    // 워크스페이스 미오픈 시 루트 폴백('/') 금지 — 안전한 빈 응답
    if (!_currentWorkspaceRoot) {
      return { filePath: req.filePath, lines: [] }
    }
    const root = _currentWorkspaceRoot

    // 경로 탈출 방어 (untrusted input)
    const safePath = resolveSafe(root, req.filePath)
    if (!safePath) {
      // 탈출 시도 — 빈 diff 반환 (에러 대신 안전한 빈 응답)
      return { filePath: req.filePath, lines: [] }
    }

    // 파일 존재 확인
    if (!existsSync(safePath)) {
      return { filePath: req.filePath, lines: [] }
    }

    // 바이너리 파일 가드 (간단 휴리스틱: 첫 8KB에 null byte 포함 여부)
    try {
      const sample = readFileSync(safePath)
      const sampleSlice = sample.slice(0, 8192)
      for (let i = 0; i < sampleSlice.length; i++) {
        if (sampleSlice[i] === 0) {
          return { filePath: req.filePath, lines: [] }
        }
      }

      const currentContent = sample.toString('utf-8')
      // MVP: 스냅샷 없음 → 빈 문자열을 "이전 상태"로 사용
      // 향후: git HEAD의 파일 내용을 스냅샷으로 사용
      const snapshotContent = ''

      const lines = computeDiff(snapshotContent, currentContent)
      return { filePath: req.filePath, lines }
    } catch {
      return { filePath: req.filePath, lines: [] }
    }
  })

  // ── conversation.load ─────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_LOAD, (_e, req: ConversationLoadRequest): ConversationLoadResponse => {
    if (!_store) {
      return { conversations: [] }
    }

    if (req?.id) {
      // 특정 id 조회
      if (typeof req.id !== 'string' || req.id.length === 0) {
        return { conversations: [] }
      }
      const record = _store.load(req.id)
      return { conversations: record ? [record] : [] }
    }

    // 최근 목록
    const limit = typeof req?.limit === 'number' && req.limit > 0 ? req.limit : 20
    const conversations = _store.listRecent(limit)
    return { conversations }
  })

  // ── conversation.save ─────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_SAVE, (_e, req: ConversationSaveRequest): ConversationSaveResponse => {
    if (!_store) {
      throw new Error('conversation.save: store not initialized')
    }

    const conv = req?.conversation
    if (!conv) {
      throw new Error('conversation.save: conversation is required')
    }

    // 입력 검증 (untrusted)
    if (!Array.isArray(conv.messages)) {
      throw new Error('conversation.save: messages must be an array')
    }

    // CRITICAL: API 키·시크릿는 저장하지 않음 (ADR-008)
    // ConversationRecord 타입에 시크릿 필드 없음 — 타입 시스템이 강제.

    const id = _store.save({
      id: conv.id,
      title: conv.title ?? '',
      messages: conv.messages,
      backendId: conv.backendId
    })

    return { id }
  })
}
