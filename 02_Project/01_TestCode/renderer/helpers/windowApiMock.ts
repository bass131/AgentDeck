// window.api 테스트 mock 공용 헬퍼 (M05 G10).
// preload는 api.<묶음>.<동작>으로 묶였지만, 테스트 136파일은 옛 평면 어휘(agentRun, onAgentEvent …)로 mock을 만든다.
// 그 어휘는 여기 「옛 평면 키 어댑터」가 받아 묶음으로 잇는다 — 어휘 정리는 G12 몫이다.
//   installFlatWindowApi(flat) — 평면 mock을 묶음 모양 window.api로 깐다(빠진 함수는 빠진 그대로)
//   installWindowApi(overrides) — 모든 평면 키에 기본 stub을 채운 뒤 덮어쓰기를 얹어 깐다
import { vi } from 'vitest'
import type { Api } from '../../../../02_Project/00_Source/preload'
import { API_ROUTES } from '../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes'
import type { ApiRoute } from '../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes'
import type {
  AgentEventPayload,
  InvokeChannel,
  ReqOf,
  ResOf,
} from '../../../../02_Project/00_Source/shared/ipcContract'

type Group = keyof Api
type ActionOf<G extends Group> = Extract<keyof Api[G], string>

interface FlatRouteOf<G extends Group> {
  readonly group: G
  readonly action: ActionOf<G>
  // 옛 평면 함수가 위치 인자를 받던 경우 — 요청 객체를 평면 인자 목록으로 푼다.
  readonly args?: (req: never) => readonly unknown[]
}
type FlatRoute = { [G in Group]: FlatRouteOf<G> }[Group]

// git·lsp는 옛 preload에서도 묶음 객체였다 — 평면 키가 아니라 묶음 그대로 잇는다.
const PASSTHROUGH_GROUPS = ['git', 'lsp'] as const satisfies readonly Group[]

export const FLAT_ROUTES = {
  agentRun: { group: 'agent', action: 'run' },
  agentAbort: { group: 'agent', action: 'abort' },
  agentInterrupt: { group: 'agent', action: 'interrupt' },
  agentTaskStop: { group: 'agent', action: 'taskStop' },
  agentSetMode: { group: 'agent', action: 'setMode' },
  agentSetModel: { group: 'agent', action: 'setModel' },
  permissionRespond: { group: 'agent', action: 'permissionRespond' },
  questionRespond: { group: 'agent', action: 'questionRespond' },
  onAgentEvent: { group: 'agent', action: 'onEvent' },

  conversationLoad: { group: 'sessions', action: 'load' },
  conversationSave: { group: 'sessions', action: 'save' },
  conversationDelete: { group: 'sessions', action: 'delete' },
  conversationRename: { group: 'sessions', action: 'rename' },
  multiSessionLoad: { group: 'sessions', action: 'multiLoad' },
  multiCmdUpsert: { group: 'sessions', action: 'multiUpsert', args: (req: ReqOf<'multi.cmdUpsert'>) => [req.session] as const },
  multiCmdCreate: { group: 'sessions', action: 'multiCreate' },
  multiCmdDelete: { group: 'sessions', action: 'multiDelete', args: (req: ReqOf<'multi.cmdDelete'>) => [req.id] as const },
  multiCmdRename: { group: 'sessions', action: 'multiRename', args: (req: ReqOf<'multi.cmdRename'>) => [req.id, req.title] as const },
  multiCmdSelect: { group: 'sessions', action: 'multiSelect', args: (req: ReqOf<'multi.cmdSelect'>) => [req.id] as const },

  workspaceOpen: { group: 'workspace', action: 'open' },
  workspaceTree: { group: 'workspace', action: 'tree' },
  fsDiff: { group: 'workspace', action: 'diff' },
  fsRead: { group: 'workspace', action: 'read' },
  listFiles: { group: 'workspace', action: 'listFiles' },
  fsListDir: { group: 'workspace', action: 'listDir' },
  saveImageData: { group: 'workspace', action: 'saveImage' },
  pathForFile: { group: 'workspace', action: 'pathForFile' },
  pickFolder: { group: 'workspace', action: 'pickFolder' },
  referenceAdd: { group: 'workspace', action: 'referenceAdd' },
  referenceList: { group: 'workspace', action: 'referenceList' },
  referenceTree: { group: 'workspace', action: 'referenceTree' },

  getAppVersion: { group: 'engine', action: 'appVersion' },
  getEngineState: { group: 'engine', action: 'state' },
  checkEngineUpdate: { group: 'engine', action: 'checkUpdate' },
  listBackends: { group: 'engine', action: 'listBackends' },
  installEngine: { group: 'engine', action: 'install', args: (req: ReqOf<'engine.install'>) => [req.version] as const },
  setActiveEngine: { group: 'engine', action: 'setActive', args: (req: ReqOf<'engine.setActive'>) => [req.version] as const },
  getEngineVersionState: { group: 'engine', action: 'versionState' },
  onEngineInstallProgress: { group: 'engine', action: 'onInstallProgress' },
  getUsage: { group: 'engine', action: 'usage' },

  listSlashCommands: { group: 'settings', action: 'listCommands' },
  listMcpServers: { group: 'settings', action: 'listMcp' },
  setMcpEnabled: { group: 'settings', action: 'setMcpEnabled' },
  listSkills: { group: 'settings', action: 'listSkills' },
  setSkillEnabled: { group: 'settings', action: 'setSkillEnabled' },
  getProfile: { group: 'settings', action: 'getProfile' },
  setProfile: { group: 'settings', action: 'setProfile' },
  getUiPrefs: { group: 'settings', action: 'getUiPrefs' },
  setUiPref: { group: 'settings', action: 'setUiPref' },

  windowMinimize: { group: 'window', action: 'minimize' },
  windowMaximizeToggle: { group: 'window', action: 'maximizeToggle' },
  windowClose: { group: 'window', action: 'close' },
  windowIsMaximized: { group: 'window', action: 'isMaximized' },
  windowGetBounds: { group: 'window', action: 'getBounds' },
  windowSetBounds: { group: 'window', action: 'setBounds' },
  windowDragStart: { group: 'window', action: 'dragStart' },
  windowDragEnd: { group: 'window', action: 'dragEnd' },
  windowResizeStart: { group: 'window', action: 'resizeStart', args: (req: ReqOf<'window.resizeStart'>) => [req.edge] as const },
  windowResizeEnd: { group: 'window', action: 'resizeEnd' },
  onWindowState: { group: 'window', action: 'onState' },
  getZoomFactor: { group: 'window', action: 'getZoomFactor' },
  setZoomFactor: { group: 'window', action: 'setZoomFactor' },
} as const satisfies Record<string, FlatRoute>

export type FlatKey = keyof typeof FLAT_ROUTES

// 묶음의 모든 동작이 평면 키 하나로 덮이는지 — 빠지면 타입 오류다 (git·lsp는 묶음 그대로).
type RoutedPair = { [G in Exclude<Group, (typeof PASSTHROUGH_GROUPS)[number]>]: `${G}.${ActionOf<G>}` }[Exclude<Group, (typeof PASSTHROUGH_GROUPS)[number]>]
type FlatPair = { [K in FlatKey]: `${(typeof FLAT_ROUTES)[K]['group']}.${(typeof FLAT_ROUTES)[K]['action']}` }[FlatKey]
const _flatCoversApi: [Exclude<RoutedPair, FlatPair>] extends [never] ? true : false = true
void _flatCoversApi

// 옛 평면 함수의 모양 — 위치 인자 맞춤이 있으면 그 인자 목록, 없으면 묶음 함수 그대로.
type FlatFn<K extends FlatKey> = (typeof FLAT_ROUTES)[K] extends { group: infer G extends Group; action: infer A }
  ? A extends keyof Api[G]
    ? (typeof FLAT_ROUTES)[K] extends { args: (req: never) => infer P extends readonly unknown[] }
      ? (...args: P) => ReturnType<Extract<Api[G][A], (...a: never[]) => unknown>>
      : Api[G][A]
    : never
  : never

export type FlatApi = { [K in FlatKey]: FlatFn<K> } & { git: Api['git']; lsp: Api['lsp'] }

// 평면 mock → 묶음 모양 window.api. 평면 객체를 원형(prototype)으로 삼아,
// 깐 뒤에 평면 키를 고쳐 써도(mockApi.x = …, (window.api as …).x = …) 묶음 쪽에서 바로 보인다.
// 함수는 감싸지 않는다(위치 인자 맞춤만 예외) — onAgentEvent 함수 동일성이 그대로 지켜진다.
export function adaptFlatApi(flat: object): Api {
  const api = Object.create(flat) as Record<string, unknown>
  const groups = Object.keys(API_ROUTES) as Group[]
  for (const group of groups) {
    if ((PASSTHROUGH_GROUPS as readonly Group[]).includes(group)) {
      Object.defineProperty(api, group, {
        enumerable: true,
        configurable: true,
        get: () => (flat as Record<string, unknown>)[group] ?? {},
      })
      continue
    }
    const view: Record<string, unknown> = {}
    for (const [key, route] of Object.entries(FLAT_ROUTES) as [FlatKey, FlatRoute][]) {
      if (route.group !== group) continue
      const toArgs = route.args as ((req: unknown) => readonly unknown[]) | undefined
      Object.defineProperty(view, route.action, {
        enumerable: true,
        configurable: true,
        get: () => {
          const fn = api[key]
          if (typeof fn !== 'function' || !toArgs) return fn
          return (req: unknown) => (fn as (...a: readonly unknown[]) => unknown)(...toArgs(req))
        },
      })
    }
    Object.defineProperty(api, group, { enumerable: true, configurable: true, value: view })
  }
  return api as unknown as Api
}

// 평면 mock을 window.api로 깐다 — 기존 `Object.defineProperty(window, 'api', { value, writable, configurable })`와
// 같은 서술자로 둔다(spyOn(window, 'api', 'get') 같은 기존 사용이 그대로 동작). window가 없으면 만든다.
export function installFlatWindowApi<T extends object>(flat: T): Api {
  const api = adaptFlatApi(flat)
  const g = globalThis as { window?: unknown }
  if (g.window && typeof g.window === 'object') {
    Object.defineProperty(g.window, 'api', { value: api, writable: true, configurable: true })
  } else {
    Object.defineProperty(globalThis, 'window', { value: { api }, writable: true, configurable: true })
  }
  return api
}

// 채널별 기본 응답 — 타입이 채널 맵에서 나온다(어긋나면 typecheck:web 실패).
// G10에서 바로잡은 것: setMode·setModel은 { accepted }(옛 기본값 { ok }), fs.diff는 { filePath, lines }(옛 { hunks }),
// dialog.pickFolder는 { path }(옛 { folderPath }).
const DEFAULT_RESULTS: { [C in InvokeChannel]?: ResOf<C> } = {
  'workspace.open': { rootPath: null, tree: null },
  'workspace.tree': { tree: null },
  'agent.run': { runId: 'run-mock' },
  'agent.abort': { accepted: true },
  'agent.interrupt': { accepted: true },
  'agent.taskStop': { accepted: true },
  'agent.setMode': { accepted: true },
  'agent.setModel': { accepted: true },
  'agent.permissionRespond': { ok: true },
  'agent.questionRespond': { ok: true },
  'fs.diff': { filePath: '', lines: [] },
  'fs.read': { kind: 'not-found' },
  'fs.listFiles': { files: [] },
  'fs.listDir': { entries: [] },
  'image.saveData': { path: '' },
  'dialog.pickFolder': { path: null },
  'conversation.load': { conversations: [] },
  'conversation.save': { id: 'cv-mock' },
  'conversation.delete': { ok: true },
  'conversation.rename': { ok: true },
  'reference.add': { reference: null },
  'reference.list': { references: [] },
  'reference.tree': { tree: null },
  'profile.set': { ok: true },
  'profile.get': null,
  'ui.getPrefs': {},
  'ui.setPref': { ok: true },
  'app.getVersion': '0.0.0-test',
  'backend.list': [],
  'skill.list': [],
  'skill.setEnabled': { ok: true },
  'command.list': [],
  'mcp.list': [],
  'mcp.setEnabled': { ok: true },
  'multi.load': { state: null },
}

const SYNC_RESULTS: Partial<Record<FlatKey, unknown>> = {
  pathForFile: '',
  getZoomFactor: 1,
  setZoomFactor: undefined,
}

function routeOf(group: Group, action: string): ApiRoute | undefined {
  return (API_ROUTES as unknown as Record<string, Record<string, ApiRoute>>)[group]?.[action]
}

function makeStub(route: ApiRoute | undefined, key: string): unknown {
  if (key in SYNC_RESULTS) return vi.fn(() => SYNC_RESULTS[key as FlatKey])
  if (route?.kind === 'push') return vi.fn(() => () => {})
  const ch = route?.channel as InvokeChannel | undefined
  if (ch && ch in DEFAULT_RESULTS) return vi.fn(async () => DEFAULT_RESULTS[ch])
  return vi.fn(async () => undefined)
}

export interface InstalledWindowApi<O> {
  api: FlatApi & O
  emitAgentEvent: (payload: AgentEventPayload) => void
  isAgentEventSubscribed: () => boolean
  uninstall: () => void
}

export function installWindowApi<O extends Record<string, unknown> = Record<string, never>>(
  overrides?: O
): InstalledWindowApi<O> {
  const handlers = new Set<(payload: AgentEventPayload) => void>()

  const base: Record<string, unknown> = {}
  for (const [key, route] of Object.entries(FLAT_ROUTES) as [FlatKey, FlatRoute][]) {
    if (key === 'onAgentEvent') {
      base[key] = vi.fn((cb: (payload: AgentEventPayload) => void) => {
        handlers.add(cb)
        return () => {
          handlers.delete(cb)
        }
      })
      continue
    }
    base[key] = makeStub(routeOf(route.group, route.action), key)
  }
  for (const group of PASSTHROUGH_GROUPS) {
    const fns: Record<string, unknown> = {}
    for (const action of Object.keys(API_ROUTES[group])) fns[action] = makeStub(routeOf(group, action), `${group}.${action}`)
    base[group] = fns
  }

  const flat = { ...base, ...(overrides ?? {}) } as unknown as FlatApi & O

  const hadWindow = 'window' in globalThis
  const previousWindow = hadWindow ? (globalThis as { window?: unknown }).window : undefined

  installFlatWindowApi(flat)

  return {
    api: flat,
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
