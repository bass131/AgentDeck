/**
 * windowApiMock.ts — renderer 유닛테스트 공용 `window.api` 목업 (RS1 P02)
 *
 * ── 왜 이 파일이 생겼나 ────────────────────────────────────────────────────────
 *   renderer store 계약 테스트는 거의 전부 아래 두 덩어리로 시작한다.
 *
 *       const mockApi = { conversationLoad: …, conversationSave: …, onAgentEvent: …, … }
 *       Object.defineProperty(globalThis, 'window', { value: { api: mockApi }, … })
 *
 *   그런데 파일마다 **깔아두는 IPC 메서드 집합이 다르다**. 테스트가 건드리는 store 액션이
 *   조금만 넓어져도 "그 파일 mockApi 에는 없는 메서드"를 호출해 `TypeError: … is not a
 *   function` 으로 죽는다 — 실제 앱 버그가 아니라 목업 결손이다. 그래서 매번 "또 하나
 *   추가"가 반복되고, 파일 사이 목업 표면이 제각각으로 벌어졌다.
 *
 *   이 헬퍼는 **preload 가 실제로 노출하는 전 표면**을 기본 스텁으로 깔고, 각 테스트는
 *   자기가 검증할 메서드만 override 한다. 결손 때문에 죽는 일이 없어지고, 파일별 차이는
 *   "override 목록"이라는 한눈에 보이는 형태로 남는다.
 *
 * ── trade-off (알고 쓰자) ────────────────────────────────────────────────────
 *   전 표면을 깔면 "목업에 없어서 죽는" 신호가 사라진다. 그 신호는 사실 *유용할 때도*
 *   있었다(테스트가 의도 밖 경로를 타는 걸 시끄럽게 알려줬다). 대신 얻는 건 결정론과
 *   신호 대 잡음비다 — 목업 결손으로 인한 빨간불은 앱 회귀가 아니라 잡음이니까.
 *   의도 밖 경로 진입을 잡고 싶으면 그 메서드를 `vi.fn(() => { throw … })` 로 override 하면 된다.
 *
 * ── 이관 호환 경로 ──────────────────────────────────────────────────────────
 *   기존 테스트 다수는 로컬 `capturedHandler` 변수를 두고 `expect(capturedHandler)…` 로
 *   **구독 자체를 단언**한다. 그 단언을 건드리지 않으려면 `onAgentEvent` 를 override 로
 *   그대로 넘기면 된다(그 경우 아래 `emitAgentEvent` 대신 자기 변수를 계속 쓴다).
 *   새로 쓰는 테스트라면 override 없이 기본 구독을 쓰고 `emitAgentEvent` 를 부르는 쪽이 짧다.
 */

import { vi } from 'vitest'
import type { Api } from '../../../../02_Source/preload'
import type { AgentEventPayload } from '../../../../02_Source/shared/ipcContract'

/**
 * preload `api` 의 최상위 키 전수 목록.
 *
 * 아래 `_SurfaceIsComplete` 타입이 이 목록과 실제 `Api` 를 대조한다 — preload 에 새 IPC 를
 * 추가하고 여기 이름을 빠뜨리면 **typecheck 가 실패**한다(고칠 곳: 이 배열에 이름 추가 +
 * 필요하면 DEFAULT_RESULTS 에 기본 반환값). 목업 표면이 조용히 뒤처지는 걸 막는 적합도
 * 함수(fitness function) 성격의 장치다.
 */
const API_KEYS = [
  // Workspace
  'workspaceOpen', 'workspaceTree',
  // Agent
  'agentRun', 'agentAbort', 'agentInterrupt', 'agentTaskStop', 'agentSetMode', 'agentSetModel',
  'permissionRespond', 'questionRespond', 'onAgentEvent',
  // FileSystem
  'fsDiff', 'fsRead', 'listFiles', 'fsListDir', 'saveImageData', 'pathForFile',
  // Conversation
  'conversationLoad', 'conversationSave', 'conversationDelete', 'conversationRename',
  // Reference
  'referenceAdd', 'referenceList', 'referenceTree',
  // Window chrome
  'windowMinimize', 'windowMaximizeToggle', 'windowClose', 'windowIsMaximized',
  'windowGetBounds', 'windowSetBounds', 'windowDragStart', 'windowDragEnd',
  'windowResizeStart', 'windowResizeEnd', 'onWindowState',
  // Usage / Git / LSP
  'getUsage', 'git', 'lsp',
  // Profile / Prefs / Zoom / Version
  'getProfile', 'setProfile', 'getUiPrefs', 'setUiPref',
  'getZoomFactor', 'setZoomFactor', 'getAppVersion',
  // Engine
  'getEngineState', 'checkEngineUpdate', 'listBackends', 'installEngine',
  'setActiveEngine', 'getEngineVersionState', 'onEngineInstallProgress',
  // Settings: skills / commands / mcp
  'listSkills', 'setSkillEnabled', 'listSlashCommands', 'listMcpServers', 'setMcpEnabled',
  // Dialog
  'pickFolder',
  // Multi-session
  'multiSessionLoad', 'multiCmdUpsert', 'multiCmdCreate', 'multiCmdDelete',
  'multiCmdRename', 'multiCmdSelect',
] as const

/**
 * 전수성 검사(컴파일 타임). `never` 가 아니면 preload 에 있는데 API_KEYS 에 없는 키가 있다는 뜻 —
 * 그 키 이름이 그대로 에러 메시지에 찍힌다.
 */
type _SurfaceIsComplete = Exclude<keyof Api, (typeof API_KEYS)[number]> extends never
  ? true
  : ['preload api 에 있는데 API_KEYS 에 빠진 키', Exclude<keyof Api, (typeof API_KEYS)[number]>]
const _surfaceIsComplete: _SurfaceIsComplete = true
void _surfaceIsComplete

const GIT_KEYS = [
  'root', 'status', 'log', 'commitDetail', 'fileAt', 'workingFile', 'commit', 'push', 'pull',
] as const
const LSP_KEYS = ['status', 'hover', 'definition', 'semanticTokens', 'cachedTokens'] as const

/**
 * 기본 반환값 — 호출부가 **구조분해하는 응답**만 채운다.
 *
 * 여기 없는 메서드는 `vi.fn()`(→ undefined) 이다. "undefined 를 await 하면 어차피 깨지지
 * 않느냐"는 지적은 맞지만, 그 경로는 **이관 전에도 `is not a function` 으로 깨지던 경로**다
 * — 즉 지금 통과 중인 테스트의 거동을 바꾸지 않는다.
 */
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

/** 구독형 API(콜백을 받고 해제 함수를 돌려주는 것) — 기본 스텁이 no-op 해제자를 돌려줘야 한다. */
const SUBSCRIPTION_KEYS = new Set<string>(['onWindowState', 'onEngineInstallProgress'])

/** 동기 반환 API — Promise 로 감싸면 안 되는 것들. */
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

/** {@link installWindowApi} 반환값. */
export interface InstalledWindowApi<O> {
  /** 설치된 목업 api 객체(기본 스텁 + overrides). */
  api: Api & O
  /**
   * 기본 `onAgentEvent` 로 구독한 핸들러들에게 main → renderer push 를 흉내 낸다.
   * `onAgentEvent` 를 override 했다면 이 함수는 아무도 깨우지 못한다(그 경우 자기 변수를 쓴다).
   */
  emitAgentEvent: (payload: AgentEventPayload) => void
  /** 기본 `onAgentEvent` 로 구독 중인 핸들러가 하나라도 있는가. */
  isAgentEventSubscribed: () => boolean
  /** 설치 전 `window` 상태로 되돌린다(afterEach 위생용 — 선택). */
  uninstall: () => void
}

/**
 * `window.api` 에 목업을 설치한다.
 *
 * jsdom 환경이면 기존 `window` 를 유지한 채 `api` 프로퍼티만 얹고, node 환경이면
 * `globalThis.window` 를 최소 객체로 정의한다 — 두 환경에서 같은 호출로 쓰이게 하기 위함.
 *
 * @param overrides 이 테스트가 검증할 메서드만. 나머지는 전부 기본 스텁.
 */
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

  // 기본 스텁 형상(vi.fn → undefined)은 실 Api 시그니처와 구조적으로 같지 않다 —
  // 목업의 본질이므로 여기서 한 번만 캐스트하고, 호출부는 정상 타입으로 쓴다.
  const api = { ...base, ...(overrides ?? {}) } as unknown as Api & O

  const hadWindow = 'window' in globalThis
  const previousWindow = hadWindow ? (globalThis as { window?: unknown }).window : undefined

  if (hadWindow && previousWindow && typeof previousWindow === 'object') {
    // jsdom 등 이미 window 가 있는 환경 — window 자체를 갈아치우면 document 가 날아간다.
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
