// window.api 테스트 mock 공용 헬퍼 (M05 G10).
// preload는 api.<묶음>.<동작>으로 묶였지만, 테스트 136파일은 옛 평면 어휘(agentRun, onAgentEvent …)로 mock을 만든다.
// 그 어휘는 여기 「옛 평면 키 어댑터」가 받아 묶음으로 잇는다 — 어휘 정리는 G12 몫이다.
//   installFlatWindowApi(flat) — 평면 mock을 묶음 모양 window.api로 깐다(빠진 함수는 빠진 그대로)
//   installWindowApi(overrides) — 모든 평면 키에 기본 stub을 채운 뒤 덮어쓰기를 얹어 깐다
// G10 계약 커밋에서 지운 채널(windowGetBounds·windowSetBounds·getEngineVersionState)의 평면 키가
// 옛 mock에 남아 있어도 묶음에는 나타나지 않는다(표에 없는 키는 무시) — 남은 키 정리는 G12 어휘 정리 몫이다.
import { vi } from 'vitest'
import type { Api } from '../../../../02_Project/00_Source/preload'
import { API_ROUTES } from '@shared/01_Ipc/apiRoutes'
import type { ApiRoute } from '@shared/01_Ipc/apiRoutes'
import type {
  AgentEventPayload,
  InvokeChannel,
  ReqOf,
  ResOf,
} from '@shared/ipcContract'

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
  agentSetEffort: { group: 'agent', action: 'setEffort' },
  agentListModels: { group: 'agent', action: 'listModels' },
  permissionRespond: { group: 'agent', action: 'permissionRespond' },
  questionRespond: { group: 'agent', action: 'questionRespond' },
  onAgentEvent: { group: 'agent', action: 'onEvent' },

  conversationLoad: { group: 'sessions', action: 'load' },
  conversationSave: { group: 'sessions', action: 'save' },
  conversationDelete: { group: 'sessions', action: 'delete' },
  conversationRename: { group: 'sessions', action: 'rename' },

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
  onEngineInstallProgress: { group: 'engine', action: 'onInstallProgress' },
  getUsage: { group: 'engine', action: 'usage' },

  listSlashCommands: { group: 'settings', action: 'listCommands' },
  listMcpServers: { group: 'settings', action: 'listMcp' },
  setMcpEnabled: { group: 'settings', action: 'setMcpEnabled' },
  listSkills: { group: 'settings', action: 'listSkills' },
  setSkillEnabled: { group: 'settings', action: 'setSkillEnabled' },
  getControlsState: { group: 'settings', action: 'controlsState' },
  setControlEnabled: { group: 'settings', action: 'setControlEnabled' },
  confirmControls: { group: 'settings', action: 'confirmControls' },
  getProfile: { group: 'settings', action: 'getProfile' },
  setProfile: { group: 'settings', action: 'setProfile' },
  getUiPrefs: { group: 'settings', action: 'getUiPrefs' },
  setUiPref: { group: 'settings', action: 'setUiPref' },

  windowMinimize: { group: 'window', action: 'minimize' },
  windowMaximizeToggle: { group: 'window', action: 'maximizeToggle' },
  windowClose: { group: 'window', action: 'close' },
  windowIsMaximized: { group: 'window', action: 'isMaximized' },
  windowDragStart: { group: 'window', action: 'dragStart' },
  windowDragEnd: { group: 'window', action: 'dragEnd' },
  windowResizeStart: { group: 'window', action: 'resizeStart', args: (req: ReqOf<'window.resizeStart'>) => [req.edge] as const },
  windowResizeEnd: { group: 'window', action: 'resizeEnd' },
  onWindowState: { group: 'window', action: 'onState' },
  getZoomFactor: { group: 'window', action: 'getZoomFactor' },
  setZoomFactor: { group: 'window', action: 'setZoomFactor' },

  // M09 G4 — 앱 안 루프 묶음(화면은 2차분)
  loopOpen: { group: 'loop', action: 'open' },
  loopStart: { group: 'loop', action: 'start' },
  loopStatus: { group: 'loop', action: 'status' },
  loopDecide: { group: 'loop', action: 'decide' },
  loopAnswerCard: { group: 'loop', action: 'answerCard' },
  loopCancelSession: { group: 'loop', action: 'cancelSession' },
  loopReleaseLatch: { group: 'loop', action: 'releaseLatch' },
  loopClose: { group: 'loop', action: 'close' },
  onLoopState: { group: 'loop', action: 'onState' },
  // M10 G2 — 메인 대화(화면은 G3)
  loopMainRead: { group: 'loop', action: 'mainRead' },
  loopMainSend: { group: 'loop', action: 'mainSend' },
  loopMainNew: { group: 'loop', action: 'mainNew' },
  onLoopMainState: { group: 'loop', action: 'onMainState' },
  onLoopSessionEvent: { group: 'loop', action: 'onSessionEvent' },
  // M10 G3 — 사람이 일시 정지 깃발을 내린다
  loopLowerFlag: { group: 'loop', action: 'lowerFlag' },
  loopSessionLog: { group: 'loop', action: 'sessionLog' },
  loopMainArchives: { group: 'loop', action: 'mainArchives' },
  // M10 G5 — 그래프 읽기와 알림
  loopGraph: { group: 'loop', action: 'graph' },
  loopAlerts: { group: 'loop', action: 'alerts' },
  onLoopAlerts: { group: 'loop', action: 'onAlerts' },
  onLoopAlertOpen: { group: 'loop', action: 'onAlertOpen' },
  // M11 G4 — 작업 폴더 목록
  loopListDir: { group: 'loop', action: 'listDir' },
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
// G10에서 바로잡은 것: fs.diff는 { filePath, lines }(옛 { hunks }), workspace.pickFolder는 { path }(옛 { folderPath }).
// agent 5채널(abort·interrupt·taskStop·setMode·setModel)은 ack 통일로 { ok }다(옛 { accepted }).
const DEFAULT_RESULTS: { [C in InvokeChannel]?: ResOf<C> } = {
  'workspace.open': { rootPath: null, tree: null },
  'workspace.tree': { tree: null },
  'agent.run': { runId: 'run-mock' },
  'agent.abort': { ok: true },
  'agent.interrupt': { ok: true },
  'agent.taskStop': { ok: true },
  'agent.setMode': { ok: true },
  'agent.setModel': { ok: true },
  // 빈 목록이면 store는 최소 목록을 그대로 둔다(M06 G4).
  'agent.listModels': { models: [], source: 'builtin' },
  'agent.permissionRespond': { ok: true },
  'agent.questionRespond': { ok: true },
  'workspace.diff': { filePath: '', lines: [] },
  'workspace.read': { kind: 'not-found' },
  'workspace.listFiles': { files: [] },
  'workspace.listDir': { entries: [] },
  'workspace.saveImage': { path: '' },
  'workspace.pickFolder': { path: null },
  'sessions.load': { conversations: [] },
  'sessions.save': { id: 'cv-mock' },
  'sessions.delete': { ok: true },
  'sessions.rename': { ok: true },
  'workspace.referenceAdd': { reference: null },
  'workspace.referenceList': { references: [] },
  'workspace.referenceTree': { tree: null },
  'settings.setProfile': { ok: true },
  'settings.getProfile': null,
  'settings.getUiPrefs': {},
  'settings.setUiPref': { ok: true },
  'engine.appVersion': '0.0.0-test',
  'engine.listBackends': [],
  'settings.listSkills': [],
  'settings.setSkillEnabled': { ok: true },
  'settings.listCommands': [],
  'settings.listMcp': [],
  'settings.setMcpEnabled': { ok: true },
  'settings.controlsState': { status: 'none', fileReadable: false, nodes: [], engine: { seal: 'none', active: null } },
  'settings.setControlEnabled': { ok: true },
  'settings.confirmControls': { ok: true },
  'loop.graph': { ok: false, reason: '시험 기본값 — 그래프 없음' },
  'loop.alerts': { alerts: [] },
  'loop.listDir': { ok: false, entries: [] },
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
