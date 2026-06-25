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
  FsListDirRequest,
  FsListDirResponse,
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
  EngineState,
  EngineUpdateInfo,
  BackendStatus,
  SkillSetEnabledReq,
  McpSetEnabledReq,
  McpServerInfo,
  PickFolderResponse,
  EngineInstallRequest,
  EngineInstallResult,
  EngineInstallProgress,
  EngineSetActiveRequest,
  EngineVersionState,
  MultiSessionSaveRequest,
  MultiSessionSaveResponse,
  MultiSessionLoadResponse,
} from '../../shared/ipc-contract'
import { getVersionState, setActive, installVersion } from '../engine-versions'
import { getUsage } from '../usage'
import { getEngineState } from '../engine-state'
import { buildBackendStatuses } from '../backend-status'
import { checkEngineUpdate } from './engine-check-update'
import { createPrefsStore } from '../prefs'
import type { PrefsStore } from '../prefs'
import { createProfileStore } from '../profile'
import type { ProfileStore } from '../profile'
import { createSkillsStore } from '../settings/skills'
import type { SkillsStore } from '../settings/skills'
import { createMcpStore } from '../settings/mcp'
import type { McpStore } from '../settings/mcp'
import { createCommandsStore } from '../settings/commands'
import type { CommandsStore } from '../settings/commands'
import { mergeSlashCommands } from '../settings/merge-slash-commands'
import { buildTree, listDir, resolveSafe } from '../fs/workspace'
import { listProjectFiles } from '../fs/listFiles'
import { saveImageBytes } from '../fs/attachments'
import { resolveFsDiffLines } from '../fs/diff'
import { readFileSafe } from '../fs/read'
import { createRootRegistry } from '../fs/roots'
import type { ConversationStore } from '../persistence/store'
import { createRunManager } from './agent-runs'
import { normalizeSystemPrompt } from './normalize'
import { getBackend } from '../agents/registry'
import { registerWindowControls } from '../window/controls'
import * as gitApi from '../git'
import { initLspManager, getLspManager } from '../lsp/manager'
import { readFile as fsReadFile } from 'node:fs/promises'
import { spawn as cpSpawn } from 'node:child_process'
import { readMulti, writeMulti, validatePanelCwd, getMultiStorePath } from '../multiStore'

// ── 모듈 상태 (앱 생명주기와 연동) ──────────────────────────────────────────

let _store: ConversationStore | null = null
let _prefsStore: PrefsStore | null = null
let _profileStore: ProfileStore | null = null
let _skillsStore: SkillsStore | null = null
let _mcpStore: McpStore | null = null
let _commandsStore: CommandsStore | null = null
let _currentWorkspaceRoot: string | null = null
let _win: BrowserWindow | null = null
let _registered = false
const _runManager = createRunManager()

/** multiStore 파일 경로 (app.getPath('userData') ready 후 초기화) */
let _multiStorePath: string | null = null

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
 * multiStore 파일 경로 초기화.
 * main/index.ts가 app.whenReady() 후 app.getPath('userData')로 계산하여 전달.
 * electron ready 이후에만 getPath('userData')가 유효하므로 여기서 주입.
 * best-effort — 초기화 실패 시 핸들러가 null 경로로 graceful 처리.
 *
 * @param userData app.getPath('userData') 결과
 */
export function initMultiStore(userData: string): void {
  try {
    _multiStorePath = getMultiStorePath(userData)
  } catch (err) {
    console.error('[main] multiStore 경로 초기화 실패:', err)
  }
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

/**
 * SkillsStore 초기화 (앱 부트 시 1회).
 * homedir·userData 경로는 electron ready 이후에만 유효.
 *
 * @internal registerIpc 내부에서만 호출.
 */
function initSkillsStore(): SkillsStore {
  // createSkillsStore() — deps 미전달 시 실 os.homedir()/app.getPath('userData') 기본값 사용.
  return createSkillsStore()
}

/**
 * McpStore 초기화 (앱 부트 시 1회).
 * homedir·userData 경로는 electron ready 이후에만 유효.
 *
 * @internal registerIpc 내부에서만 호출.
 */
function initMcpStore(): McpStore {
  // createMcpStore() — deps 미전달 시 실 os.homedir()/app.getPath('userData') 기본값 사용.
  return createMcpStore()
}

/**
 * CommandsStore 초기화 (앱 부트 시 1회).
 * homedir 경로는 electron ready 이후에만 유효.
 *
 * @internal registerIpc 내부에서만 호출.
 */
function initCommandsStore(): CommandsStore {
  // createCommandsStore() — deps 미전달 시 실 os.homedir() 기본값 사용.
  return createCommandsStore()
}

// ── 핸들러 등록 ───────────────────────────────────────────────────────────────

/**
 * BrowserWindow에 48개 invoke IPC 핸들러를 등록한다(+ AGENT_EVENT·ENGINE_INSTALL_PROGRESS 단방향 푸시).
 * (workspace.open/tree · agent.run/abort · agent.permissionRespond · agent.questionRespond(M4-4)
 *  · fs.diff/read/listFiles/listDir(Phase35) · image.saveData
 *  · conversation.load/save/delete/rename · reference.add/list/tree
 *  · git.root/status/log/commitDetail/fileAt/workingFile · git.commit/push/pull
 *  · lsp.status/hover/definition/semanticTokens/cachedTokens(M2-LSP 27b)
 *  · ui.getPrefs/ui.setPref(P1 — UI 환경설정 영속)
 *  · profile.get/profile.set(P2 — 로컬 사용자 프로필 영속)
 *  · engine.state(P3 — 엔진 상태 탐지)
 *  · usage.get(B8)
 *  · app.getVersion(P4 — WhatsNew/UpdateNotes 자동 표시 판정)
 *  · skill.list/skill.setEnabled(P5a — Settings Skill 탭 실동작)
 *  · mcp.list/mcp.setEnabled(P5b — Settings MCP 탭 실동작)
 *  · command.list(P10 — Composer 슬래시 자동완성 팔레트)
 *  · dialog.pickFolder(P15 — 멀티 패널별 cwd 폴더 선택))
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

  // ── SkillsStore 초기화 (P5a — Settings Skill 탭 실동작) ────────────────────────
  // homedir·userData는 electron ready 이후에만 유효 → registerIpc 호출 시점(ready+) 보장.
  _skillsStore = initSkillsStore()

  // ── McpStore 초기화 (P5b — Settings MCP 탭 실동작) ─────────────────────────────
  // homedir·userData는 electron ready 이후에만 유효 → registerIpc 호출 시점(ready+) 보장.
  _mcpStore = initMcpStore()

  // ── CommandsStore 초기화 (P10 — Composer 슬래시 자동완성 팔레트) ─────────────────
  // homedir는 electron ready 이후에만 유효 → registerIpc 호출 시점(ready+) 보장.
  _commandsStore = initCommandsStore()

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

    // systemPrompt 정규화 (Phase 30 M2, S1):
    //   untrusted renderer 입력 → trim → 빈 체크 → cap(16000자).
    // CRITICAL(신뢰경계): 정규화 결과를 로그에 출력하지 않는다.
    // CRITICAL(ADR-003): string만 전달 — SDK 형상(preset/append)은 backend 내부에만.
    const systemPrompt = normalizeSystemPrompt(req.systemPrompt)

    // orchestration 정규화 (Phase 37 #4a): untrusted renderer boolean → === true 강제.
    // CRITICAL(신뢰경계): truthy 아무 값이나 통과 금지 — 엄격히 boolean true만 허용.
    const orchestration = req.orchestration === true

    // resumeSessionId 정규화 (Phase 1 맥락 복구): untrusted → string만, 아니면 undefined.
    // CRITICAL(신뢰경계): 불투명 토큰만 운반 — resume 옵션 매핑은 backend 내부(ADR-003).
    const resumeSessionId = typeof req.resumeSessionId === 'string' && req.resumeSessionId.length > 0
      ? req.resumeSessionId
      : undefined

    // 지속세션(REPL, ADR-024) 정규화: untrusted → boolean true만, sessionKey는 비어있지 않은 string만.
    // CRITICAL(신뢰경계): 엔진별 매핑(held-open streamInput)은 backend 내부(ADR-003). (Phase 2)
    const persistent = req.persistent === true
    const sessionKey = typeof req.sessionKey === 'string' && req.sessionKey.length > 0
      ? req.sessionKey
      : undefined

    // runId는 run-manager가 콜백 인자로 직접 전달한다(소비 전 동기 발급) — 늦은
    // 바인딩 box 불요. 동시 다중 run에서도 각 이벤트가 정확한 runId로 라우팅된다.
    const runId = await _runManager.start(
      backend,
      // B1(Phase 30): systemPrompt 키 명시 추가 — 없으면 backend 미도달.
      // Phase 37 #4a: orchestration 키 추가 — 없으면 어댑터 미도달(Workflow 차단 고착).
      // Phase 2(ADR-024): persistent/sessionKey 추가 — 없으면 어댑터가 단발로 degrade.
      { messages: req.messages, workspaceRoot, model, effort, mode, systemPrompt, orchestration, resumeSessionId, persistent, sessionKey },
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

  // ── fs.listDir ────────────────────────────────────────────────────────────
  // 탐색기 lazy 폴더 열기 — 1폴더 1레벨 entries 반환 (Phase 35 M7).
  //
  // CRITICAL(신뢰경계):
  //   - rootId: 레지스트리 ID만 허용(_roots.get(rootId)?.path).
  //     임의 절대경로 문자열 주입 차단 — 미등록 ID → { entries: [] }.
  //     미지정 → _currentWorkspaceRoot 폴백 (워크스페이스 미오픈 → []).
  //   - relDir: renderer untrusted → workspace.ts listDir 내부 resolveSafe 검증.
  //     탈출('../'·절대경로) → listDir 이 [] 반환.
  //   - 응답 entries: shallow(name/path/kind — children 없음).

  ipcMain.handle(IPC_CHANNELS.FS_LIST_DIR, async (_e, req: FsListDirRequest): Promise<FsListDirResponse> => {
    // relDir 타입 검증 (untrusted)
    if (!req || typeof req.relDir !== 'string') {
      return { entries: [] }
    }

    // rootId 게이트: 레지스트리 ID만 허용 (B3 CRITICAL)
    let rootPath: string | null = null
    if (typeof req.rootId === 'string' && req.rootId) {
      // 명시적 rootId → 레지스트리 조회 (임의 경로 주입 차단)
      const rootEntry = _roots.get(req.rootId)
      if (!rootEntry) {
        // 미등록 rootId → [] (not-found 은닉)
        return { entries: [] }
      }
      rootPath = rootEntry.path
    } else {
      // rootId 미지정 → _currentWorkspaceRoot 폴백
      rootPath = _currentWorkspaceRoot
    }

    if (!rootPath) {
      return { entries: [] }
    }

    // relDir containment 검증 + 1레벨 목록 반환 (workspace.ts listDir 내부 resolveSafe)
    try {
      const entries = await listDir(rootPath, req.relDir)
      return { entries }
    } catch {
      return { entries: [] }
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

    // cwd: 경로 문자열(시크릿 아님, ADR-020). renderer 입력(untrusted) →
    //   string 타입만 허용, 그 외(undefined/null/비-string)은 undefined로 정규화.
    //   isAbsolute 재검증은 자동복원 시(workspace.open 재호출)에 수행.
    //   DB 영속 단계에서는 타입만 게이트하고 경로 유효성은 main 상태에서 보증된 값을 그대로 저장.
    const cwd = typeof conv.cwd === 'string' ? conv.cwd : undefined

    const id = _store.save({
      id: conv.id,
      title: conv.title ?? '',
      messages: conv.messages,
      backendId: conv.backendId,
      cwd
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

  // ── backend.list (B1 — 듀얼 프로바이더 상태 패널) ───────────────────────────
  // registry.listBackends() 순회로 각 백엔드(claude-code·codex …)의
  // 가용/버전/최신버전/인증을 조합한 BackendStatus[] 를 반환한다.
  //
  // CRITICAL(신뢰경계 ADR-008 — 절대 규칙):
  //   - 인자 없음: renderer가 토큰/경로를 주입할 수 없다.
  //   - 반환 BackendStatus[]: id·name·available·version·latestVersion·authed 6개 필드만.
  //     OAuth 토큰·API 키·시크릿·자격증명 0. authed 는 불리언만(engine-state 가 환원).
  //   - 모든 오류 → graceful(buildBackendStatuses 내부에서 백엔드별 안전 기본값).
  // CRITICAL(ADR-003): 구체 엔진 분기는 registry/engine-state 내부에만 — 핸들러는 순수 호출.
  ipcMain.handle(IPC_CHANNELS.BACKEND_LIST, async (): Promise<BackendStatus[]> => {
    return buildBackendStatuses()
  })

  // ── engine.checkUpdate — 엔진 버전 업데이트 체크 ─────────────────────────
  // 활성 backend의 version()(현재) + latestVersion()(최신)을 병렬 호출해
  // EngineUpdateInfo { current, latest, updateAvailable }를 반환한다.
  //
  // CRITICAL(ADR-003 — 구체 엔진 미인지):
  //   - getBackend()로 활성 backend를 얻는다. 구체 클래스를 직접 import하지 않는다.
  //   - registry 경유: getBackend(undefined) → 기본 'claude-code' 폴백.
  //   - npm registry URL·패키지명은 어댑터(ClaudeCodeBackend) 내부에만 격리.
  //   - 핸들러는 version()/latestVersion() 메서드만 호출한다.
  //
  // CRITICAL(ADR-008 — 신뢰경계):
  //   - 인자 없음: renderer가 경로/토큰을 주입할 수 없다.
  //   - 반환 EngineUpdateInfo: 버전 문자열·boolean 3개 필드만 — 시크릿 0.
  //
  // graceful(앱 부트 블록 방지):
  //   - backend 메서드 throw / null 반환 / 오프라인 → graceful null 반환.
  //   - 로직은 checkEngineUpdate 순수 모듈에 위임(테스트 가능).

  ipcMain.handle(IPC_CHANNELS.ENGINE_CHECK_UPDATE, async (): Promise<EngineUpdateInfo> => {
    // e2e 결정성 게이트: 새 SDK 버전 알림 팝업(EngineUpdateNotice)이 npm registry
    // 비동기 조회 결과로 떠 다른 e2e의 클릭을 모달로 가로채는 비결정성을 차단한다.
    // (engine-update.e2e.ts는 이 게이트를 *미설정* → 실 팝업/설치 흐름을 그대로 검증.)
    // 다른 AGENTDECK_E2E_* 게이트(WORKSPACE·PICK_FOLDER·ENGINE_INSTALL)와 동형.
    if (process.env.AGENTDECK_E2E_NO_ENGINE_UPDATE) {
      return { current: null, latest: null, updateAvailable: false }
    }
    // ADR-003: registry 경유로 활성 backend 획득. 인자 없이 호출 → 기본 backend(claude-code) 사용.
    const backend = getBackend()
    return checkEngineUpdate(backend)
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

  // ── app.getVersion (P4 — 실행 중 앱 버전) ─────────────────────────────────
  // 원본 AgentCodeGUI `ipcMain.handle(IPC.appGetVersion, () => app.getVersion())` 미러.
  // renderer가 WhatsNew(첫 실행)·UpdateNotes(마이너 업데이트) 자동 표시 판정에 사용.
  //
  // CRITICAL(신뢰경계):
  //   - 인자 없음: renderer가 경로/값을 주입할 수 없다.
  //   - 반환값: package.json version 문자열(예 "1.0.0")만 — 시크릿/경로 0.
  //   - app.getVersion()은 동기 — async 핸들러로 감싸 Promise<string> 계약 일치.

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async (): Promise<string> => {
    return app.getVersion()
  })

  // ── skill.list (P5a — Settings Skill 탭 스킬 목록 조회) ───────────────────────
  // global(~/.claude/skills) + local(workspaceRoot/.claude/skills) 스캔 후 SkillInfo[] 반환.
  //
  // CRITICAL(신뢰경계):
  //   - 인자 없음: renderer가 경로를 지정할 수 없다.
  //     main의 _currentWorkspaceRoot만 사용 (workspace.tree·listFiles와 동일 패턴).
  //   - 반환값: SkillInfo[] — name/description/scope/enabled 4개 필드만.
  //     path·시크릿·API 키 미포함.
  //   - _skillsStore 미초기화 → [] (graceful, registerIpc 정상 흐름에서는 항상 초기화됨).
  //   - ~/.claude/skills는 읽기만 — 수정 금지(신뢰경계).

  ipcMain.handle(IPC_CHANNELS.SKILL_LIST, async () => {
    if (!_skillsStore) return []
    return _skillsStore.listSkills(_currentWorkspaceRoot)
  })

  // ── skill.setEnabled (P5a — Settings Skill 탭 스킬 토글) ─────────────────────
  // 스킬 활성화/비활성화. 오버레이 userData/skills-disabled.json 갱신.
  //
  // CRITICAL(신뢰경계):
  //   - req는 untrusted — 타입/비어있음 검증 후만 사용.
  //   - name: 비어있지 않은 string 검증. 빈 name → { ok: false } (throw 0).
  //   - enabled: boolean 타입 검증. 비-boolean → { ok: false } (throw 0).
  //   - path·시크릿 필드 없음 — name·enabled 2개만.
  //   - ~/.claude/skills 수정 금지 — userData 오버레이만 기록.
  //   - 쓰기 실패 → graceful { ok: false } (크래시 방지).

  ipcMain.handle(IPC_CHANNELS.SKILL_SET_ENABLED, async (_e, req: SkillSetEnabledReq): Promise<{ ok: boolean }> => {
    if (!_skillsStore) return { ok: false }
    // 입력 검증 (untrusted): name이 비어있지 않은 string, enabled가 boolean
    const name = req?.name
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false }
    }
    const enabled = req?.enabled
    if (typeof enabled !== 'boolean') {
      return { ok: false }
    }
    const ok = _skillsStore.setSkillEnabled(name, enabled)
    return { ok }
  })

  // ── mcp.list (P5b — Settings MCP 탭 MCP 서버 목록 조회) ─────────────────────────
  // 3출처(user·project·local) MCP 서버를 발견하여 McpServerInfo[] 반환.
  //
  // CRITICAL(신뢰경계 — 절대 규칙):
  //   - 인자 없음: renderer가 경로를 지정할 수 없다.
  //     main의 _currentWorkspaceRoot만 사용 (workspace.tree·skill.list와 동일 패턴).
  //   - 반환값: McpServerInfo[] — 6개 필드만(name/scope/origin/transport/detail/enabled).
  //     env/args/url 전체/headers/command 전체 절대 미포함.
  //   - detail은 mcpStore 내부에서 화이트리스트 마스킹 후 반환 — 시크릿 0.
  //   - ~/.claude.json·.mcp.json는 읽기만 — 수정 금지(신뢰경계).
  //   - _mcpStore 미초기화 → [] (graceful).

  ipcMain.handle(IPC_CHANNELS.MCP_LIST, async (): Promise<McpServerInfo[]> => {
    if (!_mcpStore) return []
    return _mcpStore.listMcpServers(_currentWorkspaceRoot)
  })

  // ── mcp.setEnabled (P5b — Settings MCP 탭 MCP 서버 토글) ─────────────────────
  // MCP 서버 활성화/비활성화. 오버레이 userData/mcp-disabled.json 갱신.
  //
  // CRITICAL(신뢰경계):
  //   - req는 untrusted — 타입/비어있음 검증 후만 사용.
  //   - name: 비어있지 않은 string 검증. 빈 name → { ok: false } (throw 0).
  //   - enabled: boolean 타입 검증. 비-boolean → { ok: false } (throw 0).
  //   - path·시크릿·토큰 필드 없음 — name·enabled 2개만.
  //   - ~/.claude.json·.mcp.json 수정 금지 — userData 오버레이만 기록.
  //   - 쓰기 실패 → graceful { ok: false } (크래시 방지).

  ipcMain.handle(IPC_CHANNELS.MCP_SET_ENABLED, async (_e, req: McpSetEnabledReq): Promise<{ ok: boolean }> => {
    if (!_mcpStore) return { ok: false }
    // 입력 검증 (untrusted): name이 비어있지 않은 string, enabled가 boolean
    const name = req?.name
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false }
    }
    const enabled = req?.enabled
    if (typeof enabled !== 'boolean') {
      return { ok: false }
    }
    const ok = _mcpStore.setMcpEnabled(name, enabled)
    return { ok }
  })

  // ── command.list (P10 — Composer 슬래시 자동완성 팔레트) ──────────────────────────
  // 빌트인 + 커스텀(user·project) 슬래시 커맨드 목록 반환.
  //
  // CRITICAL(신뢰경계 — 절대 규칙):
  //   - 인자 없음: renderer가 경로를 지정할 수 없다.
  //     main의 _currentWorkspaceRoot만 사용 (skill.list·mcp.list와 동일 패턴).
  //   - 반환값: SlashCommandInfo[] — name/description/argHint/scope 4개 필드만.
  //     .md 본문·파일 경로·allowed-tools·!bash·시크릿·API 키 절대 미포함.
  //   - _commandsStore 미초기화 → [] (graceful, registerIpc 정상 흐름에서는 항상 초기화됨).
  //   - ~/.claude/commands·<ws>/.claude/commands는 읽기만 — 수정 금지.
  //
  // ADR-019 확장: commandsStore(큐레이션) + backend.listSupportedCommands(캡처) 머지.
  //   - getBackend()는 registry 경유 — 구체 엔진 클래스 미인지 (ADR-003 준수).
  //   - backend 호출 실패(throw) → store만 반환 (graceful try/catch).
  //   - 머지 규칙: store 우선 dedup → builtin→project→user 알파벳 정렬.
  //   - 캡처 sanitize는 backend(ClaudeCodeBackend)가 수행 완료 — 이 핸들러는 머지만.

  ipcMain.handle(IPC_CHANNELS.COMMAND_LIST, async (): Promise<import('../../shared/ipc-contract').SlashCommandInfo[]> => {
    if (!_commandsStore) return []
    const store = _commandsStore.listSlashCommands(_currentWorkspaceRoot)
    let captured: import('../../shared/ipc-contract').SlashCommandInfo[] = []
    try {
      captured = getBackend().listSupportedCommands(_currentWorkspaceRoot)
    } catch {
      // backend 호출 실패(엔진 미초기화·예외) → captured 빈 배열 유지, store만 사용 (graceful)
    }
    return mergeSlashCommands(store, captured)
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

  // ── dialog.pickFolder (P15 — 멀티 패널별 cwd 폴더 선택) ──────────────────────
  // OS 폴더 선택 다이얼로그를 열고 사용자가 선택한 절대경로를 반환한다.
  // 선택한 경로는 패널별 agent.run workspaceRoot 인자로 전달된다.
  //
  // CRITICAL(신뢰경계 — 절대 규칙):
  //   - 인자 없음: renderer가 경로를 주입할 수 없다. OS 다이얼로그(사용자 명시 선택)만.
  //   - AGENTDECK_E2E_PICK_FOLDER 환경변수: e2e 하네스가 설정할 때만 네이티브 다이얼로그 우회.
  //     (workspace.open의 AGENTDECK_E2E_WORKSPACE · reference.add의 AGENTDECK_E2E_REFERENCE 동일 패턴)
  //   - 반환 전 existsSync + isDirectory() 재검증 — 환경변수 경로도 untrusted로 취급.
  //   - 전역 상태(_currentWorkspaceRoot·_roots) 절대 미변경 — 경로 반환만(workspace.open과 핵심 차이).
  //   - 취소·빈 선택·존재 실패·권한 오류 → { path: null } (throw 없음, 앱 크래시 방지).

  ipcMain.handle(IPC_CHANNELS.DIALOG_PICK_FOLDER, async (): Promise<PickFolderResponse> => {
    let folderPath: string | null = null

    if (process.env.AGENTDECK_E2E_PICK_FOLDER) {
      // e2e: 네이티브 다이얼로그 우회(하네스만 설정) — workspace.open/reference.add 동일 패턴
      folderPath = process.env.AGENTDECK_E2E_PICK_FOLDER.replace(/\\/g, '/')
    } else {
      // 폴더 선택 다이얼로그 (_win 있으면 모달로)
      const result = _win
        ? await dialog.showOpenDialog(_win, { properties: ['openDirectory'] })
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

  // ── engine.install (폴리싱 #2b — ADR-018) ────────────────────────────────────
  // npm으로 특정 엔진 버전을 설치하고 진행을 ENGINE_INSTALL_PROGRESS 이벤트로 스트리밍한다.
  //
  // CRITICAL(신뢰경계, ADR-008 — 절대 규칙):
  //   - version: untrusted → strict semver(^\\d+\\.\\d+\\.\\d+) 검증 먼저.
  //     검증 실패 → {ok:false,error} 즉시 반환(spawn 미호출 — npm 인자 주입 차단).
  //   - e2e 스텁 게이트(auditor 🔴): AGENTDECK_E2E_ENGINE_INSTALL 환경변수 설정 시
  //     실 npm spawn 대신 가짜 progress 2~3개 + done(ok:true) → {ok:true} 반환.
  //     네트워크 무의존 결정성 테스트 보장.
  //   - progress 라인: maskSecrets로 시크릿 마스킹 후 전달.
  //   - webContents: event.sender 사용(요청 보낸 창만 — 전역 _win 대신 송신창 특정).

  ipcMain.handle(IPC_CHANNELS.ENGINE_INSTALL, async (event, req: EngineInstallRequest): Promise<EngineInstallResult> => {
    const version = typeof req?.version === 'string' ? req.version.trim() : ''

    // strict semver 검증 (untrusted — auditor 🔴)
    const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/
    if (!SEMVER_RE.test(version)) {
      return { ok: false, error: `invalid version: "${version}" — strict semver(X.Y.Z) 형식만 허용됩니다.` }
    }

    // e2e 스텁 게이트 (auditor 🔴) — 실 npm 대신 가짜 progress
    if (process.env.AGENTDECK_E2E_ENGINE_INSTALL) {
      const sender = event.sender
      const sendProgress = (p: EngineInstallProgress): void => {
        if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, p)
      }
      sendProgress({ version, line: '[e2e stub] 가짜 npm 설치 시작' })
      sendProgress({ version, line: '[e2e stub] npm http fetch GET 200 OK' })
      sendProgress({ version, line: '[e2e stub] 완료' })
      sendProgress({ version, done: true, ok: true })
      return { ok: true }
    }

    // 실 설치 — progress는 요청 창(event.sender)으로만 전달
    const sender = event.sender
    const result = await installVersion(version, (p) => {
      if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.ENGINE_INSTALL_PROGRESS, p)
    })
    return result
  })

  // ── engine.setActive (폴리싱 #2b — ADR-018) ──────────────────────────────────
  // 활성 엔진 버전 전환. sdkCache를 무효화하여 다음 loadActiveQuery가 새 버전을 로드한다.
  //
  // CRITICAL(신뢰경계):
  //   - version: untrusted → setActive 내부에서 installed 목록 검증.
  //     미설치 버전 → throw → {ok:false} graceful 반환.
  //   - 반환: {ok:boolean} 만 — 시크릿·경로 0.

  ipcMain.handle(IPC_CHANNELS.ENGINE_SET_ACTIVE, (_e, req: EngineSetActiveRequest): { ok: boolean } => {
    try {
      const version = typeof req?.version === 'string' ? req.version.trim() : null
      setActive(version || null)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  // ── engine.versionState (폴리싱 #2b — ADR-018) ───────────────────────────────
  // 설치 목록·활성 버전·번들 버전·패키지명 반환.
  //
  // CRITICAL(신뢰경계):
  //   - 인자 없음: renderer가 경로/버전을 주입할 수 없다.
  //   - 반환 EngineVersionState: 버전 문자열·목록·패키지명만 — 토큰·시크릿 0.
  //   - 기존 EngineState(authed 불리언)와 **완전히 별개** — 혼동 금지.

  ipcMain.handle(IPC_CHANNELS.ENGINE_VERSION_STATE, (): EngineVersionState => {
    return getVersionState()
  })

  // ── multiSession.save (M3 — 멀티 세션 영속) ───────────────────────────────────
  // 멀티 에이전트 워크스페이스 blob 저장 (best-effort).
  //
  // CRITICAL(신뢰경계):
  //   - state는 renderer untrusted 입력 — 저장 시 검증 최소 (읽기 시 cwd 재검증으로 보호).
  //   - 반환: {ok:boolean} 만 — 시크릿·경로 0.
  //   - 경로 초기화 실패(_multiStorePath=null) 시 ok:false graceful.
  //   - ADR-008: blob은 워크스페이스 메타만 — API 키·시크릿 저장 금지(호출부 책임).

  ipcMain.handle(IPC_CHANNELS.MULTI_SESSION_SAVE, (_e, req: MultiSessionSaveRequest): MultiSessionSaveResponse => {
    try {
      if (!_multiStorePath) return { ok: false }
      const state = req?.state
      if (!state || typeof state !== 'object') return { ok: false }
      writeMulti(_multiStorePath, state)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })

  // ── multiSession.load (M3 — 멀티 세션 영속) ───────────────────────────────────
  // 멀티 에이전트 워크스페이스 blob 로드 + cwd 재검증.
  //
  // CRITICAL(신뢰경계·B2):
  //   - 인자 없음: renderer가 경로를 주입할 수 없다 — main이 고정 경로에서 읽는다.
  //   - 반환 전 각 panel.cwd를 validatePanelCwd(isAbsolute+existsSync+isDirectory)로 재검증.
  //     검증 실패 → undefined drop (임의 경로 무확인 통과 0).
  //   - 손상 JSON / version≠2 → state:null (readMulti 내부에서 graceful 처리).
  //   - 경로 초기화 실패(_multiStorePath=null) 시 state:null graceful.
  //   - resolveSafe 미사용: panel.cwd는 자체 루트 독립 절대경로 (containment 검증 불필요).

  ipcMain.handle(IPC_CHANNELS.MULTI_SESSION_LOAD, (): MultiSessionLoadResponse => {
    try {
      if (!_multiStorePath) return { state: null }
      const loaded = readMulti(_multiStorePath)
      if (!loaded) return { state: null }

      // cwd 재검증 (B2 신뢰경계 CRITICAL):
      // 각 세션의 각 패널 cwd를 isAbsolute+existsSync+isDirectory로 검증
      // → 실패 시 undefined drop (renderer는 전역 workspaceRoot 폴백 사용)
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
