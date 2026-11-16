import { BrowserWindow, app } from 'electron'
import { spawn as cpSpawn } from 'node:child_process'
import { readFile as fsReadFile } from 'node:fs/promises'
import { createConversationStore } from '@main/06_Sessions/store'
import type { ConversationStore } from '@main/06_Sessions/store'
import { createPrefsStore } from '@main/11_Settings/prefs'
import type { PrefsStore } from '@main/11_Settings/prefs'
import { createProfileStore } from '@main/11_Settings/profile'
import type { ProfileStore } from '@main/11_Settings/profile'
import { createSkillsStore } from '@main/11_Settings/skills'
import type { SkillsStore } from '@main/11_Settings/skills'
import { createMcpStore } from '@main/11_Settings/mcp'
import type { McpStore } from '@main/11_Settings/mcp'
import { createCommandsStore } from '@main/11_Settings/commands'
import type { CommandsStore } from '@main/11_Settings/commands'
import { createRootRegistry } from '@main/07_Workspace/roots'
import { createRunManager } from '@main/03_Agent/agentRuns'
import { initLspManager } from '@main/09_Lsp/manager'
import { getMultiStorePath } from '@main/06_Sessions/multiStore'
import { join } from 'node:path'
import { getUserDataDir } from '@main/02_Common/userData'
import { getDefaultQueryFn } from '@main/04_Claude/queryFn'
import { ModelListProvider, fetchModelRowsWithoutTurn } from '@main/04_Claude/modelListProvider'

// 모델 목록 공급자 (M06 G4) — 조립 지점이 하나를 쥔다. 첫 요청(앱 시작 때 renderer의 agent.listModels)에서
// 실제 턴을 도는 엔진(getDefaultQueryFn)에 프롬프트 없이 목록만 묻고, userData의 캐시에 남긴다.
const MODEL_LIST_CACHE_FILE = 'model-list.json'
const MODEL_LIST_TIMEOUT_MS = 20_000
let _modelList: ModelListProvider | null = null

export function getModelListProvider(): ModelListProvider {
  if (_modelList) return _modelList
  let userData: string | null = null
  try {
    userData = getUserDataDir()
  } catch {
    userData = null
  }
  _modelList = new ModelListProvider({
    cacheFile: userData ? join(userData, MODEL_LIST_CACHE_FILE) : null,
    fetchRows: async () => {
      const queryFn = (await getDefaultQueryFn()) as unknown as Parameters<typeof fetchModelRowsWithoutTurn>[0]
      return fetchModelRowsWithoutTurn(queryFn, { cwd: userData ?? process.cwd(), timeoutMs: MODEL_LIST_TIMEOUT_MS })
    },
  })
  return _modelList
}

export const ipcState = {
  win: null as BrowserWindow | null,
  multiStorePath: null as string | null,
}

export const roots = createRootRegistry()

export const runManager = createRunManager()

let _store: ConversationStore | null = null
let _prefsStore: PrefsStore | null = null
let _profileStore: ProfileStore | null = null
let _skillsStore: SkillsStore | null = null
let _mcpStore: McpStore | null = null
let _commandsStore: CommandsStore | null = null

// 대화 저장소의 유일한 소유자 — 생성이 throw하면 쥔 값을 바꾸지 않고 호출부로 던진다 (M05 G11)
export function initConversationStore(chatsDir: string): void {
  _store = createConversationStore(chatsDir)
}

export function closeConversationStore(): void {
  _store?.close()
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

export function initStores(): void {
  _prefsStore = createPrefsStore()
  _profileStore = createProfileStore()
  _skillsStore = createSkillsStore()
  _mcpStore = createMcpStore()
  _commandsStore = createCommandsStore()
}

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

export function disposeAllRuns(): number {
  return runManager.closeAll()
}

export function initMultiStore(userData: string): void {
  try {
    ipcState.multiStorePath = getMultiStorePath(userData)
  } catch (err) {
    console.error('[main] multiStore 경로 초기화 실패:', err)
  }
}
