/**
 * ipc/context.ts — IPC 핸들러 공유 컨텍스트 + 인프라 초기화 (Phase 04 분리)
 *
 * registerIpc()가 도메인 핸들러에 주입하는 *공유 가변 상태 + 도메인 스토어*와,
 * 그 스토어/LSP 매니저를 생성하는 *초기화 로직*을 소유한다. index.ts는 이 컨텍스트를
 * 조립해 핸들러를 배선하는 *오케스트레이션*만 담당한다.
 *
 * CRITICAL(신뢰경계): spawn·fs read = main 단독(initLsp 클로저가 캡슐화).
 *   API 키·시크릿는 절대 IPC 응답·로그에 평문 노출 금지.
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
import { getMultiStorePath } from '../multiStore'

// ── 공유 가변 상태 ────────────────────────────────────────────────────────────

/**
 * IPC 핸들러 간 공유 가변 상태.
 * win: activate 시 registerIpc 재호출로 갱신 — 핸들러가 이 객체 참조로 최신 win 접근.
 * currentWorkspaceRoot: workspace.open 시 workspace 핸들러가 갱신.
 * multiStorePath: initMultiStore() 호출 시 갱신.
 */
export const ipcState = {
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
export const roots = createRootRegistry()

/** 에이전트 실행 관리자 — 앱 생명주기 단일 인스턴스. */
export const runManager = createRunManager()

// ── 도메인 스토어 (electron ready 이후 initStores에서 초기화) ──────────────────

let _store: ConversationStore | null = null
let _prefsStore: PrefsStore | null = null
let _profileStore: ProfileStore | null = null
let _skillsStore: SkillsStore | null = null
let _mcpStore: McpStore | null = null
let _commandsStore: CommandsStore | null = null

/**
 * ConversationStore 주입.
 * main/index.ts가 app ready 후 store를 생성하여 이 함수로 전달.
 */
export function setStore(store: ConversationStore): void {
  _store = store
}

export function getStore(): ConversationStore | null {
  return _store
}

export function getPrefsStore(): PrefsStore | null {
  return _prefsStore
}

export function getProfileStore(): ProfileStore | null {
  return _profileStore
}

export function getSkillsStore(): SkillsStore | null {
  return _skillsStore
}

export function getMcpStore(): McpStore | null {
  return _mcpStore
}

export function getCommandsStore(): CommandsStore | null {
  return _commandsStore
}

// ── 인프라 초기화 ─────────────────────────────────────────────────────────────

/**
 * 도메인 스토어 초기화 (electron ready 이후 getPath 유효).
 * registerIpc의 _registered 가드 안에서 1회 호출.
 */
export function initStores(): void {
  _prefsStore = createPrefsStore()
  _profileStore = createProfileStore()
  _skillsStore = createSkillsStore()
  _mcpStore = createMcpStore()
  _commandsStore = createCommandsStore()
}

/**
 * LSP Manager 초기화 (M2-LSP 27b).
 * CRITICAL(신뢰경계): spawn·fs read = main 단독.
 */
export function initLsp(): void {
  initLspManager({
    roots,
    appPath: app.getAppPath(),
    spawn: (cmd, args, opts) => cpSpawn(cmd, args, {
      ...opts,
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, ...(opts.env ?? {}) }
    }),
    readFile: (absPath: string) => fsReadFile(absPath, 'utf8')
  })
}

// ── 라이프사이클 API ──────────────────────────────────────────────────────────

/**
 * 모든 활성 run 종료 — main/index.ts의 before-quit에서 호출(ADR-024 (4a)).
 *
 * @returns 종료한 run 수(로깅·검증용)
 */
export function disposeAllRuns(): number {
  return runManager.closeAll()
}

/**
 * multiStore 파일 경로 초기화. main/index.ts가 app.whenReady() 후
 * app.getPath('userData')로 계산하여 전달. best-effort — 실패 시 핸들러가
 * null 경로로 graceful 처리.
 */
export function initMultiStore(userData: string): void {
  try {
    ipcState.multiStorePath = getMultiStorePath(userData)
  } catch (err) {
    console.error('[main] multiStore 경로 초기화 실패:', err)
  }
}
