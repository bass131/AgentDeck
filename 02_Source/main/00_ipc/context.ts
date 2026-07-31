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
import { createRunManager } from './agentRuns'
import { initLspManager } from '../03_lsp/manager'
import { getMultiStorePath } from '../multiStore'

export const ipcState = {
  win: null as BrowserWindow | null,
  currentWorkspaceRoot: null as string | null,
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
