import { vi } from 'vitest'
import type { Api } from '../../../../02_Source/preload'
import type { AgentEventPayload } from '../../../../02_Source/shared/ipcContract'

const API_KEYS = [
  'workspaceOpen', 'workspaceTree',
  'agentRun', 'agentAbort', 'agentInterrupt', 'agentTaskStop', 'agentSetMode', 'agentSetModel',
  'permissionRespond', 'questionRespond', 'onAgentEvent',
  'fsDiff', 'fsRead', 'listFiles', 'fsListDir', 'saveImageData', 'pathForFile',
  'conversationLoad', 'conversationSave', 'conversationDelete', 'conversationRename',
  'referenceAdd', 'referenceList', 'referenceTree',
  'windowMinimize', 'windowMaximizeToggle', 'windowClose', 'windowIsMaximized',
  'windowGetBounds', 'windowSetBounds', 'windowDragStart', 'windowDragEnd',
  'windowResizeStart', 'windowResizeEnd', 'onWindowState',
  'getUsage', 'git', 'lsp',
  'getProfile', 'setProfile', 'getUiPrefs', 'setUiPref',
  'getZoomFactor', 'setZoomFactor', 'getAppVersion',
  'getEngineState', 'checkEngineUpdate', 'listBackends', 'installEngine',
  'setActiveEngine', 'getEngineVersionState', 'onEngineInstallProgress',
  'listSkills', 'setSkillEnabled', 'listSlashCommands', 'listMcpServers', 'setMcpEnabled',
  'pickFolder',
  'multiSessionLoad', 'multiCmdUpsert', 'multiCmdCreate', 'multiCmdDelete',
  'multiCmdRename', 'multiCmdSelect',
] as const

type _SurfaceIsComplete = Exclude<keyof Api, (typeof API_KEYS)[number]> extends never
  ? true
  : ['preload api 에 있는데 API_KEYS 에 빠진 키', Exclude<keyof Api, (typeof API_KEYS)[number]>]
const _surfaceIsComplete: _SurfaceIsComplete = true
void _surfaceIsComplete

const GIT_KEYS = [
  'root', 'status', 'log', 'commitDetail', 'fileAt', 'workingFile', 'commit', 'push', 'pull',
] as const
const LSP_KEYS = ['status', 'hover', 'definition', 'semanticTokens', 'cachedTokens'] as const

const DEFAULT_RESULTS: Record<string, unknown> = {
  workspaceOpen: { rootPath: null, tree: null },
  workspaceTree: { tree: null },
  agentRun: { runId: 'run-mock' },
  agentAbort: { accepted: true },
  agentInterrupt: { accepted: true },
  agentTaskStop: { accepted: true },
  agentSetMode: { ok: true },
  agentSetModel: { ok: true },
  permissionRespond: { ok: true },
  questionRespond: { ok: true },
  fsDiff: { hunks: [] },
  fsRead: { kind: 'not-found' },
  listFiles: { files: [] },
  fsListDir: { entries: [] },
  saveImageData: { path: '' },
  conversationLoad: { conversations: [] },
  conversationSave: { id: 'cv-mock' },
  conversationDelete: { ok: true },
  conversationRename: { ok: true },
  referenceAdd: { reference: null },
  referenceList: { references: [] },
  referenceTree: { tree: null },
  setProfile: { ok: true },
  getProfile: null,
  getUiPrefs: {},
  setUiPref: { ok: true },
  getAppVersion: '0.0.0-test',
  listBackends: [],
  listSkills: [],
  setSkillEnabled: { ok: true },
  listSlashCommands: [],
  listMcpServers: [],
  setMcpEnabled: { ok: true },
  pickFolder: { folderPath: null },
  multiSessionLoad: { state: null },
}

const SUBSCRIPTION_KEYS = new Set<string>(['onWindowState', 'onEngineInstallProgress'])

const SYNC_RESULTS: Record<string, unknown> = {
  pathForFile: '',
  getZoomFactor: 1,
  setZoomFactor: undefined,
}

function makeStub(key: string): unknown {
  if (SUBSCRIPTION_KEYS.has(key)) return vi.fn(() => () => {})
  if (key in SYNC_RESULTS) return vi.fn(() => SYNC_RESULTS[key])
  if (key in DEFAULT_RESULTS) return vi.fn(async () => DEFAULT_RESULTS[key])
  return vi.fn(async () => undefined)
}

export interface InstalledWindowApi<O> {
  api: Api & O
  emitAgentEvent: (payload: AgentEventPayload) => void
  isAgentEventSubscribed: () => boolean
  uninstall: () => void
}

export function installWindowApi<O extends Record<string, unknown> = Record<string, never>>(
  overrides?: O
): InstalledWindowApi<O> {
  const handlers = new Set<(payload: AgentEventPayload) => void>()

  const base: Record<string, unknown> = {}
  for (const key of API_KEYS) {
    if (key === 'git') {
      const git: Record<string, unknown> = {}
      for (const g of GIT_KEYS) git[g] = makeStub(`git.${g}`)
      base[key] = git
      continue
    }
    if (key === 'lsp') {
      const lsp: Record<string, unknown> = {}
      for (const l of LSP_KEYS) lsp[l] = makeStub(`lsp.${l}`)
      base[key] = lsp
      continue
    }
    if (key === 'onAgentEvent') {
      base[key] = vi.fn((cb: (payload: AgentEventPayload) => void) => {
        handlers.add(cb)
        return () => {
          handlers.delete(cb)
        }
      })
      continue
    }
    base[key] = makeStub(key)
  }

  const api = { ...base, ...(overrides ?? {}) } as unknown as Api & O

  const hadWindow = 'window' in globalThis
  const previousWindow = hadWindow ? (globalThis as { window?: unknown }).window : undefined

  if (hadWindow && previousWindow && typeof previousWindow === 'object') {
    Object.defineProperty(previousWindow, 'api', { value: api, writable: true, configurable: true })
  } else {
    Object.defineProperty(globalThis, 'window', {
      value: { api },
      writable: true,
      configurable: true,
    })
  }

  return {
    api,
    emitAgentEvent: (payload) => {
      for (const h of [...handlers]) h(payload)
    },
    isAgentEventSubscribed: () => handlers.size > 0,
    uninstall: () => {
      handlers.clear()
      if (hadWindow && previousWindow && typeof previousWindow === 'object') {
        delete (previousWindow as { api?: unknown }).api
      } else if (!hadWindow) {
        delete (globalThis as { window?: unknown }).window
      }
    },
  }
}
