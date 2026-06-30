/**
 * ipc/index.ts — IPC 핸들러 등록 집계자 (Phase 10 리팩토링)
 *
 * 이 파일은 도메인별 핸들러 등록 모듈을 조립하고
 * 공유 의존성(상태·스토어·런매니저)을 주입하는 *집계자*다.
 * 실제 핸들러 로직은 handlers/ 하위 모듈에 있다.
 *
 *   handlers/workspace.ts    — workspace.open / workspace.tree
 *   handlers/agent.ts        — agent.run / abort / interrupt / permission / question
 *   handlers/fs.ts           — fs.diff / read / listFiles / listDir / saveData / pickFolder
 *   handlers/conversation.ts — conversation.load / save / delete / rename
 *   handlers/reference.ts    — reference.add / list / tree
 *   handlers/git.ts          — git 9채널 (root·status·log·commitDetail·fileAt·workingFile·commit·push·pull)
 *   handlers/lsp.ts          — lsp 5채널 (status·hover·definition·semanticTokens·cachedTokens)
 *   handlers/engine.ts       — engine 7채널 (state·backendList·checkUpdate·appVersion·install·setActive·versionState)
 *   handlers/settings.ts     — skill / mcp / command 5채널
 *   handlers/personalization.ts — profile / prefs / usage 5채널
 *   handlers/multi.ts        — multiSession.save / load
 *
 * 윈도우 컨트롤(F1-b) — registerWindowControls() 별도 등록(이 목록 미포함).
 *
 * CRITICAL(헌법 신뢰경계):
 *   - 모든 renderer 입력 검증은 각 핸들러 모듈에서 수행한다.
 *   - API 키·시크릿는 절대 IPC 응답·로그에 평문 노출 금지.
 *   - 채널명은 IPC_CHANNELS import만 — 하드코딩 0.
 */

import { BrowserWindow, app } from 'electron'
import { spawn as cpSpawn } from 'node:child_process'
import { readFile as fsReadFile } from 'node:fs/promises'
import type { ConversationStore } from '../04_persistence/store'
import { createPrefsStore } from '../prefs'
import type { PrefsStore } from '../prefs'
import { createProfileStore } from '../profile'
import type { ProfileStore } from '../profile'
import { createSkillsStore } from '../05_settings/skills'
import type { SkillsStore } from '../05_settings/skills'
import { createMcpStore } from '../05_settings/mcp'
import type { McpStore } from '../05_settings/mcp'
import { createCommandsStore } from '../05_settings/commands'
import type { CommandsStore } from '../05_settings/commands'
import { createRootRegistry } from '../02_fs/roots'
import { createRunManager } from './agent-runs'
import { initLspManager } from '../03_lsp/manager'
import { registerWindowControls } from '../06_window/controls'
import { getMultiStorePath } from '../multiStore'
import { registerWorkspaceHandlers } from './handlers/workspace'
import { registerAgentHandlers } from './handlers/agent'
import { registerFsHandlers } from './handlers/fs'
import { registerConversationHandlers } from './handlers/conversation'
import { registerReferenceHandlers } from './handlers/reference'
import { registerGitHandlers } from './handlers/git'
import { registerLspHandlers } from './handlers/lsp'
import { registerEngineHandlers } from './handlers/engine'
import { registerSettingsHandlers } from './handlers/settings'
import { registerPersonalizationHandlers } from './handlers/personalization'
import { registerMultiHandlers } from './handlers/multi'

// ── 공유 가변 상태 ────────────────────────────────────────────────────────────

/**
 * IPC 핸들러 간 공유 가변 상태.
 * win: activate 시 registerIpc 재호출로 갱신 — 핸들러가 이 객체 참조로 최신 win 접근.
 * currentWorkspaceRoot: workspace.open 시 workspace 핸들러가 갱신.
 * multiStorePath: initMultiStore() 호출 시 갱신.
 */
const _state = {
  win: null as BrowserWindow | null,
  currentWorkspaceRoot: null as string | null,
  multiStorePath: null as string | null,
}

/**
 * 루트 레지스트리 — 워크스페이스 + 레퍼런스 폴더 ID→경로 매핑.
 *
 * CRITICAL(보안): renderer에서 오는 root ID는 이 레지스트리에서 조회로만 실제 경로를 얻는다.
 * 미등록 ID는 null → not-found (경로 주입 차단).
 */
const _roots = createRootRegistry()

/** 에이전트 실행 관리자 — 앱 생명주기 단일 인스턴스. */
const _runManager = createRunManager()

// ── 도메인 스토어 (electron ready 이후 registerIpc에서 초기화) ──────────────────

let _store: ConversationStore | null = null
let _prefsStore: PrefsStore | null = null
let _profileStore: ProfileStore | null = null
let _skillsStore: SkillsStore | null = null
let _mcpStore: McpStore | null = null
let _commandsStore: CommandsStore | null = null

/** 핸들러 등록 중복 방지 플래그 (ipcMain.handle 중복 등록 시 throw 방지). */
let _registered = false

// ── 초기화 API ───────────────────────────────────────────────────────────────

/**
 * ConversationStore 주입.
 * main/index.ts가 app ready 후 store를 생성하여 이 함수로 전달.
 */
export function setStore(store: ConversationStore): void {
  _store = store
}

/**
 * 모든 활성 run 종료 — main/index.ts의 before-quit에서 호출(ADR-024 (4a)).
 *
 * @returns 종료한 run 수(로깅·검증용)
 */
export function disposeAllRuns(): number {
  return _runManager.closeAll()
}

/**
 * multiStore 파일 경로 초기화.
 * main/index.ts가 app.whenReady() 후 app.getPath('userData')로 계산하여 전달.
 * best-effort — 초기화 실패 시 핸들러가 null 경로로 graceful 처리.
 *
 * @param userData app.getPath('userData') 결과
 */
export function initMultiStore(userData: string): void {
  try {
    _state.multiStorePath = getMultiStorePath(userData)
  } catch (err) {
    console.error('[main] multiStore 경로 초기화 실패:', err)
  }
}

// ── 핸들러 등록 집계자 ────────────────────────────────────────────────────────

/**
 * BrowserWindow에 모든 도메인 IPC 핸들러를 등록한다.
 *
 * 호출 시점: app.whenReady() + createWindow() 이후.
 * activate 재호출 시 _state.win만 갱신하고 핸들러 재등록은 생략(_registered 플래그).
 * 핸들러들이 _state 객체 참조를 통해 갱신된 win을 자동 반영한다.
 *
 * @param win BrowserWindow 인스턴스 (AGENT_EVENT 스트리밍 + dialog용)
 */
export function registerIpc(win: BrowserWindow): void {
  _state.win = win  // activate 시 항상 갱신 (핸들러에 자동 반영)
  if (_registered) return
  _registered = true

  // ── 스토어 초기화 (electron ready 이후 getPath 유효) ──────────────────────
  _prefsStore = createPrefsStore()
  _profileStore = createProfileStore()
  _skillsStore = createSkillsStore()
  _mcpStore = createMcpStore()
  _commandsStore = createCommandsStore()

  // ── LSP Manager 초기화 (M2-LSP 27b) ──────────────────────────────────────
  // CRITICAL(신뢰경계): spawn·fs read = main 단독.
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

  // ── 윈도우 컨트롤 (F1-b) ─────────────────────────────────────────────────
  registerWindowControls()

  // ── 도메인 핸들러 등록 ────────────────────────────────────────────────────
  registerWorkspaceHandlers({ state: _state, roots: _roots })
  registerAgentHandlers({ state: _state, runManager: _runManager })
  registerFsHandlers({ state: _state, roots: _roots })
  registerConversationHandlers({ getStore: () => _store })
  registerReferenceHandlers({ state: _state, roots: _roots })
  registerGitHandlers()
  registerLspHandlers()
  registerEngineHandlers()
  registerSettingsHandlers({
    getCurrentWorkspaceRoot: () => _state.currentWorkspaceRoot,
    getSkillsStore: () => _skillsStore,
    getMcpStore: () => _mcpStore,
    getCommandsStore: () => _commandsStore,
  })
  registerPersonalizationHandlers({
    getPrefsStore: () => _prefsStore,
    getProfileStore: () => _profileStore,
  })
  registerMultiHandlers({
    getMultiStorePath: () => _state.multiStorePath,
  })
}
