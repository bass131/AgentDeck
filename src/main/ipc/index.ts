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

import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, basename, join } from 'node:path'
import {
  IPC_CHANNELS,
  WORKSPACE_ROOT_ID
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
  FsReadRequest,
  FsReadResponse,
  ListFilesRequest,
  ListFilesResponse,
  SaveImageDataRequest,
  SaveImageDataResponse,
  ConversationLoadRequest,
  ConversationLoadResponse,
  ConversationSaveRequest,
  ConversationSaveResponse,
  ConversationDeleteRequest,
  ConversationDeleteResponse,
  ConversationRenameRequest,
  ConversationRenameResponse,
  AgentEventPayload,
  ReferenceAddRequest,
  ReferenceAddResponse,
  ReferenceListRequest,
  ReferenceListResponse,
  ReferenceTreeRequest,
  ReferenceTreeResponse,
  GitRootRequest,
  GitRootResponse,
  GitStatusRequest,
  GitStatusResponse,
  GitLogRequest,
  GitLogResponse,
  GitCommitDetailRequest,
  GitCommitDetailResponse,
  GitFileAtRequest,
  GitFileAtResponse,
  GitWorkingFileRequest,
  GitWorkingFileResponse,
  GitCommitRequest,
  GitCommitResponse,
  GitPushRequest,
  GitPushResponse,
  GitPullRequest,
  GitPullResponse,
  PermissionResponse,
  QuestionResponse,
  UsageInfo,
  LspStatus,
  LspHoverResult,
  LspLocation,
  LspSemanticTokens,
  LspDocReq,
  LspPosReq,
  UiPrefs,
  UiPrefsSetReq,
  Profile,
  EngineState
} from '../../shared/ipc-contract'
import { getUsage } from '../usage'
import { getEngineState } from '../engine-state'
import { createPrefsStore } from '../prefs'
import type { PrefsStore } from '../prefs'
import { createProfileStore } from '../profile'
import type { ProfileStore } from '../profile'
import { buildTree, resolveSafe } from '../fs/workspace'
import { listProjectFiles } from '../fs/listFiles'
import { saveImageBytes } from '../fs/attachments'
import { resolveFsDiffLines } from '../fs/diff'
import { readFileSafe } from '../fs/read'
import { createRootRegistry } from '../fs/roots'
import type { ConversationStore } from '../persistence/store'
import { createRunManager } from './agent-runs'
import { getBackend } from '../agents/registry'
import { registerWindowControls } from '../window/controls'
import * as gitApi from '../git'
import { initLspManager, getLspManager } from '../lsp/manager'
import { readFile as fsReadFile } from 'node:fs/promises'
import { spawn as cpSpawn } from 'node:child_process'

// ── 모듈 상태 (앱 생명주기와 연동) ──────────────────────────────────────────

let _store: ConversationStore | null = null
let _prefsStore: PrefsStore | null = null
let _profileStore: ProfileStore | null = null
let _currentWorkspaceRoot: string | null = null
let _win: BrowserWindow | null = null
let _registered = false
const _runManager = createRunManager()

/**
 * 루트 레지스트리 — 워크스페이스 + 레퍼런스 폴더 ID→경로 매핑.
 *
 * CRITICAL(보안): renderer에서 오는 FsReadRequest.root 는 이 레지스트리에서
 * ID 조회로만 실제 경로를 얻는다. 미등록 ID는 null → not-found (경로 주입 차단).
 */
const _roots = createRootRegistry()

// ── 초기화 API ───────────────────────────────────────────────────────────────

/**
 * ConversationStore 주입.
 * main/index.ts가 app ready 후 store를 생성하여 이 함수로 전달.
 */
export function setStore(store: ConversationStore): void {
  _store = store
}

/**
 * PrefsStore 초기화 (앱 부트 시 1회).
 * userData 경로는 app.getPath('userData') — electron ready 이후에만 유효.
 * main/index.ts가 app.whenReady() + registerIpc() 호출 시 자동 초기화된다.
 *
 * @internal registerIpc 내부에서만 호출.
 */
function initPrefsStore(): PrefsStore {
  // createPrefsStore() — deps 미전달 시 app.getPath('userData')/ui-prefs.json 기본값 사용.
  return createPrefsStore()
}

/**
 * ProfileStore 초기화 (앱 부트 시 1회).
 * userData 경로는 app.getPath('userData') — electron ready 이후에만 유효.
 *
 * @internal registerIpc 내부에서만 호출.
 */
function initProfileStore(): ProfileStore {
  // createProfileStore() — deps 미전달 시 app.getPath('userData')/profile.json 기본값 사용.
  return createProfileStore()
}

// ── 핸들러 등록 ───────────────────────────────────────────────────────────────

/**
 * BrowserWindow에 37개 invoke IPC 핸들러를 등록한다(+ AGENT_EVENT 단방향 푸시).
 * (workspace.open/tree · agent.run/abort · agent.permissionRespond · agent.questionRespond(M4-4)
 *  · fs.diff/read/listFiles · image.saveData
 *  · conversation.load/save/delete/rename · reference.add/list/tree
 *  · git.root/status/log/commitDetail/fileAt/workingFile · git.commit/push/pull
 *  · lsp.status/hover/definition/semanticTokens/cachedTokens(M2-LSP 27b)
 *  · ui.getPrefs/ui.setPref(P1 — UI 환경설정 영속)
 *  · profile.get/profile.set(P2 — 로컬 사용자 프로필 영속)
 *  · engine.state(P3 — 엔진 상태 탐지)
 *  · usage.get(B8))
 * 윈도우 컨트롤 핸들러는 registerWindowControls()가 별도 등록(이 개수에 미포함).
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

  // ── PrefsStore 초기화 (P1 — UI 환경설정 영속) ────────────────────────────────
  // app.getPath('userData')는 electron ready 이후에만 유효 → registerIpc 호출 시점(ready+) 보장.
  _prefsStore = initPrefsStore()

  // ── ProfileStore 초기화 (P2 — 로컬 사용자 프로필 영속) ─────────────────────────
  // app.getPath('userData')는 electron ready 이후에만 유효 → registerIpc 호출 시점(ready+) 보장.
  _profileStore = initProfileStore()

  // ── LSP Manager 초기화 (M2-LSP 27b) ────────────────────────────────────────
  // CRITICAL(신뢰경계): spawn·fs read = main 단독. deps 주입으로 테스트 분리.
  // appPath = app.getAppPath() — shippedModule 경로 계산 기준.
  initLspManager({
    roots: _roots,
    appPath: app.getAppPath(),
    spawn: (cmd, args, opts) => cpSpawn(cmd, args, {
      ...opts,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, ...(opts.env ?? {}) }
    }),
    readFile: (absPath: string) => fsReadFile(absPath, 'utf8')
  })

  // 윈도우 컨트롤(F1-b) — sender로 창 해석하므로 win 인자 불요. 1회 등록.
  registerWindowControls()

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
      _roots.setWorkspace(rootPath) // 루트 레지스트리 갱신 (fs.read root 게이트용)
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

    // model/effort/mode (untrusted) — string만 전달. allowlist 검증/CLI 매핑은
    // run-args.buildRunArgs(agent-backend)가 수행 → 임의 문자열의 플래그 주입 차단. (M4-1)
    const model = typeof req.model === 'string' ? req.model : undefined
    const effort = typeof req.effort === 'string' ? req.effort : undefined
    const mode = typeof req.mode === 'string' ? req.mode : undefined

    // runId는 run-manager가 콜백 인자로 직접 전달한다(소비 전 동기 발급) — 늦은
    // 바인딩 box 불요. 동시 다중 run에서도 각 이벤트가 정확한 runId로 라우팅된다.
    const runId = await _runManager.start(
      backend,
      { messages: req.messages, workspaceRoot, model, effort, mode },
      (event, eventRunId) => {
        const payload: AgentEventPayload = { runId: eventRunId, event }
        if (_win && !_win.isDestroyed()) {
          _win.webContents.send(IPC_CHANNELS.AGENT_EVENT, payload)
        }
      }
    )

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

  // ── agent.permissionRespond (M4-4) ────────────────────────────────────────
  // renderer가 PermissionModal에서 사용자 선택 후 invoke → 대기 중인 에이전트에 전달.
  //
  // CRITICAL(신뢰경계): renderer 입력은 untrusted.
  //   - runId·requestId: 비어있지 않은 string 검증.
  //   - behavior: 'allow'|'allow_always'|'deny' allowlist 검증.
  //   - 불합격 → { ok: false } (throw 금지 — 런타임 크래시 방지).
  //   - 미존재/완료 run → runManager.respond가 false 반환 → { ok: false } (no-op).
  // 검증된 인자만 runManager.respond에 전달 (fs/childproc 직접 X).

  ipcMain.handle(IPC_CHANNELS.PERMISSION_RESPOND, (_e, req: PermissionResponse): { ok: boolean } => {
    // 입력 검증 (untrusted) — 타입 + 비어있음 + allowlist
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
      return { ok: false }
    }
    const allowedBehaviors = ['allow', 'allow_always', 'deny'] as const
    if (!allowedBehaviors.includes(req.behavior as (typeof allowedBehaviors)[number])) {
      return { ok: false }
    }

    const ok = _runManager.respond(req.runId, req.requestId, {
      kind: 'permission',
      behavior: req.behavior
    })
    return { ok }
  })

  // ── agent.questionRespond (M4-4) ─────────────────────────────────────────
  // renderer가 QuestionModal에서 사용자 답변(또는 dismiss) 후 invoke → 대기 중인 에이전트에 전달.
  //
  // CRITICAL(신뢰경계): renderer 입력은 untrusted.
  //   - runId·requestId: 비어있지 않은 string 검증.
  //   - answers: null(사용자 dismiss) 또는 string[][]인지 검증.
  //       null → 통과(dismiss). 배열 → 각 원소가 string[]인지, 각 값이 string인지 검증.
  //       그 외 → { ok: false } (throw 금지 — 런타임 크래시 방지).
  //   - 미존재/완료 run → runManager.respond가 false 반환 → { ok: false } (no-op).
  // 검증된 인자만 runManager.respond에 전달 (fs/childproc 직접 X).

  ipcMain.handle(IPC_CHANNELS.QUESTION_RESPOND, (_e, req: QuestionResponse): { ok: boolean } => {
    // runId 검증 (untrusted)
    if (!req?.runId || typeof req.runId !== 'string' || req.runId.trim() === '') {
      return { ok: false }
    }
    // requestId 검증 (untrusted)
    if (!req?.requestId || typeof req.requestId !== 'string' || req.requestId.trim() === '') {
      return { ok: false }
    }

    // answers 검증: null(dismiss) 또는 string[][] 허용
    const answers = req.answers
    if (answers !== null) {
      // null이 아닌 경우 — string[][]인지 재확인
      if (!Array.isArray(answers)) {
        return { ok: false }
      }
      for (const row of answers) {
        if (!Array.isArray(row)) {
          return { ok: false }
        }
        for (const val of row) {
          if (typeof val !== 'string') {
            return { ok: false }
          }
        }
      }
    }

    const ok = _runManager.respond(req.runId, req.requestId, {
      kind: 'question',
      answers: answers as string[][] | null
    })
    return { ok }
  })

  // ── fs.diff ───────────────────────────────────────────────────────────────
  // 파일 경로를 받아 git HEAD 스냅샷 vs 워크트리 diff 반환.
  // 스냅샷: git HEAD의 파일 내용. HEAD 없음(신규/untracked) 또는 비-git → '' (전부 add).
  // 파일 존재 확인·바이너리 가드·diff 계산은 resolveFsDiffLines에 위임.

  ipcMain.handle(IPC_CHANNELS.FS_DIFF, async (_e, req: FsDiffRequest): Promise<FsDiffResponse> => {
    if (!req?.filePath || typeof req.filePath !== 'string') {
      return { filePath: '', lines: [] }
    }

    // 워크스페이스 미오픈 시 루트 폴백('/') 금지 — 안전한 빈 응답
    if (!_currentWorkspaceRoot) {
      return { filePath: req.filePath, lines: [] }
    }
    const root = _currentWorkspaceRoot

    // 경로 탈출 방어 (untrusted input) — resolveSafe는 탈출 시 null 반환
    const safePath = resolveSafe(root, req.filePath)
    if (!safePath) {
      return { filePath: req.filePath, lines: [] }
    }

    // 순수 로직 위임: git HEAD 기준 diff 계산
    //   - HEAD 있음: HEAD vs disk diff (부분 add/remove)
    //   - HEAD 없음(신규/untracked) 또는 비-git: '' vs disk diff (전부 add)
    //   - 파일 없음·바이너리: []
    try {
      const lines = await resolveFsDiffLines(root, req.filePath)
      return { filePath: req.filePath, lines }
    } catch {
      return { filePath: req.filePath, lines: [] }
    }
  })

  // ── fs.read ───────────────────────────────────────────────────────────────
  // 파일 내용 읽기(텍스트/바이너리).
  //
  // CRITICAL(보안): req.root 는 *등록 루트 ID* 로만 해석한다.
  //   - 레지스트리에서 ID → 실제 경로를 조회. 미등록 ID면 not-found(경로 주입 차단).
  //   - renderer가 절대경로를 root 로 주입해도 ID 조회 실패 → not-found.
  //   - 각 루트 기준으로 독립 resolveSafe 실행 (루트별 containment).

  ipcMain.handle(IPC_CHANNELS.FS_READ, (_e, req: FsReadRequest): FsReadResponse => {
    if (!req?.path || typeof req.path !== 'string') {
      return { kind: 'not-found' }
    }

    // root ID 결정: 미지정이면 WORKSPACE_ROOT_ID 사용
    const rootId = (typeof req.root === 'string' && req.root) ? req.root : WORKSPACE_ROOT_ID

    // 레지스트리에서 ID → 경로 조회 (미등록 ID는 null → not-found)
    const rootEntry = _roots.get(rootId)
    if (!rootEntry) {
      return { kind: 'not-found' }
    }

    // 루트 기준 독립 resolveSafe + 파일 읽기 (경로 탈출 방어 내부 포함)
    return readFileSafe(rootEntry.path, req.path, { asBinary: req.asBinary === true })
  })

  // ── fs.listFiles ──────────────────────────────────────────────────────────
  // @멘션 팔레트용 프로젝트 파일 플랫 목록 반환.
  //
  // CRITICAL(신뢰경계): **경로 인자 없음** — renderer는 경로를 지정할 수 없다.
  //   main의 _currentWorkspaceRoot 만 사용(workspace.tree와 동일 패턴).
  //   워크스페이스 미오픈 → { files: [] } (안전한 빈 응답).

  ipcMain.handle(IPC_CHANNELS.LIST_FILES, async (_e, _req: ListFilesRequest): Promise<ListFilesResponse> => {
    if (!_currentWorkspaceRoot) return { files: [] }
    try {
      return { files: await listProjectFiles(_currentWorkspaceRoot) }
    } catch {
      return { files: [] }
    }
  })

  // ── image.saveData ────────────────────────────────────────────────────────
  // 붙여넣기/드롭 이미지 raw 바이트를 앱 attachments 디렉토리에 저장하고 절대 경로 반환.
  //
  // CRITICAL(신뢰경계):
  //   - renderer는 경로를 지정하지 않는다 — main이 파일명(paste-{uuid}.{ext})을 생성.
  //   - 저장 위치는 app.getPath('userData')/attachments (앱 전용 — 경로 이탈 불가).
  //   - ext는 untrusted → saveImageBytes 내부에서 safeImageExt로 화이트리스트 검증.
  //   - 빈 bytes / 타입 오류 → 빈 경로 { path: '' } 반환 (throw 없음).

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

  // ── conversation.delete ───────────────────────────────────────────────────
  // CRITICAL(신뢰경계): id는 renderer에서 온 untrusted 입력.
  //   타입(string) + 비어있음 검증 후 store.delete에 위임. store가 없으면 ok:false.

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_DELETE, (_e, req: ConversationDeleteRequest): ConversationDeleteResponse => {
    if (!_store || !req?.id || typeof req.id !== 'string') return { ok: false }
    return { ok: _store.delete(req.id) }
  })

  // ── conversation.rename ───────────────────────────────────────────────────
  // CRITICAL(신뢰경계): id·title 모두 untrusted.
  //   - id: string 타입 + 비어있음 검증.
  //   - title: string 타입 검증 + trim() 후 빈 문자열이면 ok:false (무제목 방지).
  //   rename 성공 시 store가 custom_title=1로 표시 → 이후 save()가 title 덮지 않음.

  ipcMain.handle(IPC_CHANNELS.CONVERSATION_RENAME, (_e, req: ConversationRenameRequest): ConversationRenameResponse => {
    if (!_store || !req?.id || typeof req.id !== 'string') return { ok: false }
    const title = typeof req.title === 'string' ? req.title.trim() : ''
    if (!title) return { ok: false }
    return { ok: _store.rename(req.id, title) }
  })

  // ── reference.add ─────────────────────────────────────────────────────────
  // 레퍼런스 폴더를 등록하고 ReferenceFolder 레코드를 반환.
  //
  // 경로 결정 우선순위:
  //   1) req.folderPath (절대경로 + 존재 + 디렉토리 검증 필수)
  //   2) AGENTDECK_E2E_REFERENCE 환경변수 (e2e 테스트 다이얼로그 우회)
  //   3) OS 폴더 선택 다이얼로그
  //
  // CRITICAL(보안): folderPath 는 renderer에서 온 untrusted 값 → 반드시 재검증.
  // 이후 파일 접근은 발급된 id 로만 가능(임의 경로 주입 불가).

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
      // 폴더 선택 다이얼로그 (_win 있으면 모달로)
      const result = _win
        ? await dialog.showOpenDialog(_win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) {
        return { reference: null }
      }
      folderPath = result.filePaths[0].replace(/\\/g, '/')
    }

    // 절대경로 + 존재 + 디렉토리 검증 (untrusted 경로 / 권한 / 비정상 방어)
    try {
      if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
        return { reference: null }
      }
    } catch {
      return { reference: null }
    }

    const name = basename(folderPath)
    const reference = _roots.addReference(folderPath, name)
    return { reference }
  })

  // ── reference.list ────────────────────────────────────────────────────────
  // 현재 세션에 등록된 레퍼런스 폴더 목록 반환 (워크스페이스 제외).

  ipcMain.handle(IPC_CHANNELS.REFERENCE_LIST, (_e, _req: ReferenceListRequest): ReferenceListResponse => {
    return { references: _roots.listReferences() }
  })

  // ── reference.tree ────────────────────────────────────────────────────────
  // 특정 레퍼런스 루트의 파일 트리 반환.
  // id 는 reference.add 가 발급한 등록 루트 ID여야 함 — 미등록이면 tree:null.

  ipcMain.handle(IPC_CHANNELS.REFERENCE_TREE, async (_e, req: ReferenceTreeRequest): Promise<ReferenceTreeResponse> => {
    if (!req?.id || typeof req.id !== 'string') {
      return { tree: null }
    }
    const rootEntry = _roots.get(req.id)
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

  // ── git.root ───────────────────────────────────────────────────────────────
  // CRITICAL(신뢰경계): renderer에서 온 cwd는 untrusted.
  //   isAbsolute 검증 실패 시 null 반환(오류 대신 안전한 빈 응답).
  //   status/log 등 이후 채널은 root가 gitRoot() 출력이라 신뢰.

  ipcMain.handle(IPC_CHANNELS.GIT_ROOT, async (_e, req: GitRootRequest): Promise<GitRootResponse> => {
    if (!req?.cwd || typeof req.cwd !== 'string') {
      return null
    }
    // CRITICAL(🟡-4 신뢰경계 가드): 절대경로만 허용 — 상대경로 주입 차단
    if (!isAbsolute(req.cwd)) {
      return null
    }
    return gitApi.gitRoot(req.cwd, req.force === true)
  })

  // ── git.status ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_STATUS, async (_e, req: GitStatusRequest): Promise<GitStatusResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return null
    }
    return gitApi.gitStatus(req.root)
  })

  // ── git.log ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_LOG, async (_e, req: GitLogRequest): Promise<GitLogResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return []
    }
    const limit = typeof req.limit === 'number' && req.limit > 0 ? req.limit : undefined
    return gitApi.gitLog(req.root, limit)
  })

  // ── git.commitDetail ──────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT_DETAIL, async (_e, req: GitCommitDetailRequest): Promise<GitCommitDetailResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return []
    }
    if (!req?.hash || typeof req.hash !== 'string') {
      return []
    }
    return gitApi.gitCommitDetail(req.root, req.hash)
  })

  // ── git.fileAt ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_FILE_AT, async (_e, req: GitFileAtRequest): Promise<GitFileAtResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { content: null, diff: null }
    }
    if (!req?.hash || typeof req.hash !== 'string') {
      return { content: null, diff: null }
    }
    if (!req?.path || typeof req.path !== 'string') {
      return { content: null, diff: null }
    }
    return gitApi.gitFileAt(req.root, req.hash, req.path)
  })

  // ── git.workingFile ───────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.GIT_WORKING_FILE, async (_e, req: GitWorkingFileRequest): Promise<GitWorkingFileResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { content: null, diff: null }
    }
    if (!req?.path || typeof req.path !== 'string') {
      return { content: null, diff: null }
    }
    return gitApi.gitWorkingFile(req.root, req.path)
  })

  // ── git.commit ────────────────────────────────────────────────────────────
  // CRITICAL(신뢰경계): root는 renderer에서 온 untrusted 입력.
  //   isAbsolute 검증 없이 그대로 git 명령에 전달하지 않는다.
  //   subject/body 길이 상한은 git 자체가 처리하므로 여기선 타입 검증만.

  ipcMain.handle(IPC_CHANNELS.GIT_COMMIT, async (_e, req: GitCommitRequest): Promise<GitCommitResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.commit: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.commit: root는 절대 경로여야 합니다' }
    }
    if (!req?.subject || typeof req.subject !== 'string' || !req.subject.trim()) {
      return { ok: false, error: 'git.commit: subject(커밋 제목)가 필요합니다' }
    }
    const body = typeof req.body === 'string' ? req.body : ''
    return gitApi.gitCommit(req.root, req.subject, body)
  })

  // ── git.push ──────────────────────────────────────────────────────────────
  // CRITICAL: 비가역 작업 — 실제 원격 push는 사용자가 명시적으로 요청할 때만.
  //   main 핸들러가 게이트 역할(root 검증). 실제 push 비가역성은 UI 레이어 확인 게이트.
  //   네트워크 timeout은 gitPush 내부에서 120s로 처리.

  ipcMain.handle(IPC_CHANNELS.GIT_PUSH, async (_e, req: GitPushRequest): Promise<GitPushResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.push: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.push: root는 절대 경로여야 합니다' }
    }
    return gitApi.gitPush(req.root)
  })

  // ── git.pull ──────────────────────────────────────────────────────────────
  // --ff-only: diverge된 브랜치는 실패 → ok:false + error 메시지로 반환.
  // 네트워크 timeout은 gitPull 내부에서 120s로 처리.

  ipcMain.handle(IPC_CHANNELS.GIT_PULL, async (_e, req: GitPullRequest): Promise<GitPullResponse> => {
    if (!req?.root || typeof req.root !== 'string') {
      return { ok: false, error: 'git.pull: root 경로가 필요합니다' }
    }
    if (!isAbsolute(req.root)) {
      return { ok: false, error: 'git.pull: root는 절대 경로여야 합니다' }
    }
    return gitApi.gitPull(req.root)
  })

  // ── ui.getPrefs (P1 — UI 환경설정 전체 읽기) ─────────────────────────────
  // renderer가 부트 시 전체 설정을 로드한다.
  //
  // CRITICAL(신뢰경계):
  //   - 인자 없음: renderer가 경로를 지정할 수 없다. main의 _prefsStore만 사용.
  //   - 반환값: UiPrefs(키-값 blob) — UI 표시 설정(패널 크기·줌·테마 등)만.
  //   - API 키·OAuth 토큰·시크릿 저장 금지 — 호출부(renderer lib/prefs.ts) 책임.
  //   - _prefsStore 미초기화 → {} (graceful, registerIpc 정상 흐름에서는 항상 초기화됨).

  ipcMain.handle(IPC_CHANNELS.UI_PREFS_GET, async (): Promise<UiPrefs> => {
    if (!_prefsStore) return {}
    return _prefsStore.getAll()
  })

  // ── ui.setPref (P1 — UI 환경설정 단일 키 쓰기) ───────────────────────────
  // renderer가 단일 키-값을 저장한다.
  //
  // CRITICAL(신뢰경계):
  //   - req.key: 비어있지 않은 string 검증(untrusted). 실패 → { ok: false } (throw 없음).
  //   - req.key.trim(): 공백 전용 key도 거부 (IPC 계약 명시).
  //   - req.value: JSON 직렬화 가능 무해 설정값 — main은 값 내용을 검증하지 않는다.
  //     민감 자격증명(토큰·시크릿·키) 저장 금지 → 호출부(renderer) 책임.
  //   - _prefsStore 미초기화 → { ok: false } (graceful).
  //   - throw 없음: UI 영속화 실패는 앱 크래시를 유발하면 안 된다(non-critical).

  ipcMain.handle(IPC_CHANNELS.UI_PREFS_SET, async (_e, req: UiPrefsSetReq): Promise<{ ok: boolean }> => {
    if (!_prefsStore) return { ok: false }
    // 입력 검증 (untrusted): key는 trim 후 비어있지 않은 string이어야 한다.
    const key = req?.key
    if (typeof key !== 'string' || key.trim().length === 0) {
      return { ok: false }
    }
    // trim된 key로 저장 (공백 전용 key 거부)
    const ok = await _prefsStore.set(key.trim(), req.value)
    return { ok }
  })

  // ── profile.get (P2 — 로컬 사용자 프로필 읽기) ───────────────────────────
  // 저장된 프로필을 반환. null = 미설정/첫실행 → renderer 온보딩 진입.
  //
  // CRITICAL(신뢰경계·개인화 전용):
  //   - 인자 없음: renderer가 경로를 지정할 수 없다. main의 _profileStore만 사용.
  //   - 반환값: Profile(nickname·color) | null — 토큰·시크릿 0.
  //   - _profileStore 미초기화 → null (graceful, registerIpc 정상 흐름에서는 항상 초기화됨).

  ipcMain.handle(IPC_CHANNELS.PROFILE_GET, async (): Promise<Profile | null> => {
    if (!_profileStore) return null
    return _profileStore.get()
  })

  // ── profile.set (P2 — 로컬 사용자 프로필 쓰기) ───────────────────────────
  // 프로필을 저장한다. 검증 실패 → { ok: false } (throw 없음).
  //
  // CRITICAL(신뢰경계·개인화 전용):
  //   - req.nickname: trim 후 비어있지 않은 string 검증(untrusted). 실패 → { ok: false }.
  //   - req.color: string 검증(untrusted). 실패 → { ok: false }.
  //   - 저장되는 값: nickname(trimmed)·color만 — 토큰·시크릿 절대 저장 금지.
  //   - _profileStore 미초기화 → { ok: false } (graceful).
  //   - throw 없음: 프로필 저장 실패는 앱 크래시를 유발하면 안 된다(non-critical).

  ipcMain.handle(IPC_CHANNELS.PROFILE_SET, async (_e, req: Profile): Promise<{ ok: boolean }> => {
    if (!_profileStore) return { ok: false }
    // 입력 검증 (untrusted): req가 객체인지, nickname·color 타입 확인
    if (!req || typeof req !== 'object') return { ok: false }
    const nickname = req.nickname
    const color = req.color
    // nickname: trim 후 비어있지 않은 string
    if (typeof nickname !== 'string' || nickname.trim().length === 0) {
      return { ok: false }
    }
    // color: string (값 범위 검증은 renderer 책임)
    if (typeof color !== 'string') {
      return { ok: false }
    }
    const ok = await _profileStore.set({ nickname: nickname.trim(), color })
    return { ok }
  })

  // ── engine.state (P3 — 코딩 엔진 상태 탐지) ─────────────────────────────
  // SDK 가용 여부 + 인증 존재 여부 + SDK 버전 조회.
  //
  // CRITICAL(신뢰경계 ADR-008 — 절대 규칙):
  //   - 인자 없음: renderer가 토큰/경로를 주입할 수 없다.
  //   - 반환값: EngineState { available·authed·version } — 불리언+문자열만. 토큰/키 값 0.
  //   - accessToken·ANTHROPIC_API_KEY 값은 getEngineState() 내부 스택에서만.
  //     IPC 응답·로그에 자격증명 평문 절대 포함 금지.
  //   - authed는 불리언만 — 인증 존재 여부. 자격증명 값 전달 불가.
  //   - 모든 오류(파일 없음·SDK import 실패) → graceful(available=false/authed=false/version=null).

  ipcMain.handle(IPC_CHANNELS.ENGINE_STATE, async (): Promise<EngineState> => {
    return getEngineState()
  })

  // ── usage.get (B8) ────────────────────────────────────────────────────────
  // OAuth 레이트리밋 게이지 조회.
  //
  // CRITICAL(신뢰경계 ADR-008):
  //   - 인자 없음: renderer가 경로/토큰을 주입할 수 없다.
  //   - 반환값: UsageInfo { fiveHour·weekly } — pct·resetsAt 파생값만. 토큰/시크릿 0.
  //   - 토큰은 getUsage() 내부 스택에서만 사용하고, IPC 응답에 절대 포함하지 않는다.
  //   - 모든 오류(파일 없음·네트워크·타임아웃) → graceful { fiveHour:null, weekly:null }.
  //   - 5분 TTL 인메모리 캐시(getUsage 내부) — 과도한 API 호출 방지.

  ipcMain.handle(IPC_CHANNELS.USAGE_GET, async (): Promise<UsageInfo> => {
    return getUsage()
  })

  // ── lsp.status (M2-LSP 27b) ──────────────────────────────────────────────────
  // LSP 서버 상태 조회 + lazy spawn 트리거.
  //
  // CRITICAL(신뢰경계 — plan-auditor 🔴):
  //   - req.rootId: roots.ts 게이트로 ID→경로 조회. 미등록 ID → 'unsupported'.
  //   - req.relPath: resolveSafe(rootEntry.path, relPath) 2단 방어.
  //     '..'·절대경로 탈출 → 'unsupported' (fs.read IPC와 동일 게이트).
  //   - cwd·절대경로 직접 입력 필드 없음 — rootId+relPath 조합만 허용.

  ipcMain.handle(IPC_CHANNELS.LSP_STATUS, (_e, req: LspDocReq): LspStatus => {
    if (!req?.rootId || typeof req.rootId !== 'string') return 'unsupported'
    if (!req?.relPath || typeof req.relPath !== 'string') return 'unsupported'
    try {
      return getLspManager().status(req)
    } catch {
      return 'error'
    }
  })

  // ── lsp.hover ─────────────────────────────────────────────────────────────────
  // 호버 정보(마크다운) 조회.
  //
  // CRITICAL(신뢰경계): rootId 게이트 + resolveSafe. pos는 숫자 타입 검증.
  // raw LSP 응답은 LspHoverResult { contents: string } 으로만 정규화 — 누출 0.

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

  // ── lsp.definition ────────────────────────────────────────────────────────────
  // 정의 위치 조회 — 워크스페이스 상대경로만 반환.
  //
  // CRITICAL(신뢰경계): 절대경로 미반환. main이 LSP 서버 반환 절대경로를 역변환.
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

  // ── lsp.semanticTokens ───────────────────────────────────────────────────────
  // 전체 문서 시맨틱 토큰 (라이브 분석).
  //
  // CRITICAL(신뢰경계): rootId 게이트 + resolveSafe.
  // 결과: LspSemanticTokens { data, types, mods } — raw LSP 필드(resultId 등) 누출 0.

  ipcMain.handle(IPC_CHANNELS.LSP_SEMANTIC_TOKENS, async (_e, req: LspDocReq): Promise<LspSemanticTokens | null> => {
    if (!req?.rootId || typeof req.rootId !== 'string') return null
    if (!req?.relPath || typeof req.relPath !== 'string') return null
    try {
      return getLspManager().semanticTokens(req)
    } catch {
      return null
    }
  })

  // ── lsp.cachedTokens ─────────────────────────────────────────────────────────
  // 인메모리 캐시에서 시맨틱 토큰 즉시 반환.
  // renderer가 파일 오픈 직후 캐시를 즉시 색칠(0ms), ready 후 라이브 갱신하는 패턴.
  //
  // CRITICAL(신뢰경계): rootId 게이트 + resolveSafe. 캐시 없으면 null.

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
