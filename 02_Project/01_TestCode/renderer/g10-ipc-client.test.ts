// M05 G10 — renderer IPC 클라이언트(01_Ipc)와 「window.api 직접 호출 0」 고정.
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipc, hasBridge } from '../../00_Source/renderer/src/01_Ipc'
import { installFlatWindowApi, installWindowApi } from './helpers/windowApiMock'

const SRC_ROOT = fileURLToPath(new URL('../../00_Source/renderer/src/', import.meta.url))

// G10에서 클라이언트로 옮긴 파일 32개 — 전수 검사가 이 파일들을 실제로 훑는지 함께 본다.
const MIGRATED: string[] = [
  '00_App/AppGate.tsx',
  'main.tsx',
  '00_App/state/system.ts',
  '03_Agent/state/runCore.ts',
  '03_Agent/state/panelSession.ts',
  '03_Agent/state/runtime.ts',
  '03_Agent/state/sessionRegistry.ts',
  '05_Conversation/BackgroundTaskView.tsx',
  '05_Conversation/hooks/useSlashPalette.ts',
  '05_Conversation/imageAttach.ts',
  '05_Conversation/state/composer.ts',
  '06_Sessions/state/conversationPayload.ts',
  '06_Sessions/state/conversation.ts',
  '06_Sessions/state/sessions.ts',
  '06_Sessions/state/multiSession.ts',
  '06_Sessions/hooks/useMultiPersist.ts',
  '07_Workspace/state/viewer.ts',
  '07_Workspace/CodeViewer.tsx',
  '07_Workspace/DiffViewerPane.tsx',
  '07_Workspace/file/FileExplorer.tsx',
  '07_Workspace/state/workspace.ts',
  '08_Git/GitModal.tsx',
  '10_Engine/EngineUpdateNotice.tsx',
  '11_Settings/prefs.ts',
  '11_Settings/SettingsModal.tsx',
  '12_Window/MultiWorkspace.tsx',
  '12_Window/ResizeHandles.tsx',
  '12_Window/Shell.tsx',
  '12_Window/Sidebar.tsx',
  '12_Window/TitleBar.tsx',
  '12_Window/useWindowState.ts',
  '12_Window/useGlobalZoom.ts',
]

// `window.api`·`window?.api`·`typeof window.api.x` 모두 잡는다.
const DIRECT = /window\s*\??\.\s*api\b/

// window.api를 직접 읽어도 되는 곳 — 클라이언트 자신(01_Ipc/)뿐이다.
// 그 밖의 예외는 「파일 → 근거」로 여기에 적는다. 지금은 0개다.
const ALLOWED_PREFIX = '01_Ipc/'
const EXCEPTIONS: Record<string, string> = {}

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8')
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(path.relative(SRC_ROOT, full).split(path.sep).join('/'))
  }
  return acc
}

describe('M05 G10 — window.api 직접 호출 0', () => {
  const files = walk(SRC_ROOT)

  it('renderer/src에서 01_Ipc 밖의 window.api 직접 사용이 0이다 (근거 적힌 예외만 남는다)', () => {
    const offenders = files
      .filter((rel) => !rel.startsWith(ALLOWED_PREFIX) && !(rel in EXCEPTIONS))
      .filter((rel) => DIRECT.test(read(rel)))
    expect(offenders).toEqual([])
  })

  it('전수 검사는 옮긴 32파일을 모두 훑는다', () => {
    expect(MIGRATED).toHaveLength(32)
    for (const rel of MIGRATED) expect(files).toContain(rel)
  })

  it('클라이언트(01_Ipc)는 window.api를 읽는 유일한 거처다', () => {
    expect(DIRECT.test(read('01_Ipc/index.ts'))).toBe(true)
  })
})

type ApiHolder = { api?: unknown }

// 아래 사례는 옛 평면 어휘로 mock을 만들고 공용 어댑터(installFlatWindowApi)로 깐다 —
// 클라이언트의 getter 위임과 어댑터의 평면→묶음 연결을 함께 고정한다.
function setWindowApi(api: object): void {
  Object.assign(globalThis, { window: {} })
  installFlatWindowApi(api)
}

afterEach(() => {
  delete (globalThis as { window?: ApiHolder }).window
})

describe('M05 G10 — 클라이언트', () => {
  it('import만으로는 window.api를 읽지 않는다 (브리지 없는 환경)', () => {
    expect(hasBridge()).toBe(false)
    expect(typeof ipc).toBe('object')
  })

  it('hasBridge는 window.api가 있을 때만 참이다', () => {
    setWindowApi({})
    expect(hasBridge()).toBe(true)
  })

  it('묶음 모양 window.api(실제 preload 모양)에서는 묶음 객체를 그대로 돌려준다 — 감싸지 않는다', () => {
    const onEvent = (): (() => void) => () => {}
    const agent = { onEvent }
    Object.assign(globalThis, { window: { api: { agent } } })
    expect(ipc.agent).toBe(agent)
    expect(ipc.agent.onEvent).toBe(onEvent)
  })

  it('installWindowApi의 기본 stub은 채널 맵의 응답 모양을 따른다 (ack 통일 { ok }·fsDiff {hunks}·pickFolder {folderPath} 정정)', async () => {
    installWindowApi()
    expect(await ipc.agent.setMode({ runId: 'r', mode: 'plan' })).toEqual({ ok: true })
    expect(await ipc.agent.setModel({ runId: 'r', model: 'm' })).toEqual({ ok: true })
    expect(await ipc.agent.interrupt({ runId: 'r' })).toEqual({ ok: true })
    expect(await ipc.workspace.diff({ filePath: 'a' })).toEqual({ filePath: '', lines: [] })
    expect(await ipc.workspace.pickFolder()).toEqual({ path: null })
  })

  it('push 구독 함수는 window.api의 것과 같은 함수 객체다 (세션 레지스트리의 mock 교체 감지)', () => {
    const onAgentEvent = (): (() => void) => () => {}
    setWindowApi({ onAgentEvent })
    expect(ipc.agent.onEvent).toBe(onAgentEvent)
  })

  it('agent 묶음은 같은 함수로 이어진다 (run·abort·interrupt)', () => {
    const agentRun = async (): Promise<{ runId: string }> => ({ runId: 'r' })
    const agentAbort = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const agentInterrupt = async (): Promise<{ ok: boolean }> => ({ ok: true })
    setWindowApi({ agentRun, agentAbort, agentInterrupt })
    expect(ipc.agent.run).toBe(agentRun)
    expect(ipc.agent.abort).toBe(agentAbort)
    expect(ipc.agent.interrupt).toBe(agentInterrupt)
  })

  it('agent 묶음: setMode·setModel·taskStop도 같은 함수로 이어진다', () => {
    const agentSetMode = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const agentSetModel = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const agentTaskStop = async (): Promise<{ ok: boolean }> => ({ ok: true })
    setWindowApi({ agentSetMode, agentSetModel, agentTaskStop })
    expect(ipc.agent.setMode).toBe(agentSetMode)
    expect(ipc.agent.setModel).toBe(agentSetModel)
    expect(ipc.agent.taskStop).toBe(agentTaskStop)
  })

  it('agent 응답 둘(permissionRespond·questionRespond)도 같은 함수로 이어진다', () => {
    const permissionRespond = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const questionRespond = async (): Promise<{ ok: boolean }> => ({ ok: true })
    setWindowApi({ permissionRespond, questionRespond })
    expect(ipc.agent.permissionRespond).toBe(permissionRespond)
    expect(ipc.agent.questionRespond).toBe(questionRespond)
  })

  it('push 구독 함수가 바뀌면 ipc에서도 바뀐 것이 보인다 (레지스트리의 재구독 판단)', () => {
    const first = (): (() => void) => () => {}
    const second = (): (() => void) => () => {}
    setWindowApi({ onAgentEvent: first })
    const seen = ipc.agent.onEvent
    setWindowApi({ onAgentEvent: second })
    expect(ipc.agent.onEvent).not.toBe(seen)
    expect(ipc.agent.onEvent).toBe(second)
  })

  it('workspace 묶음: pathForFile·saveImage·listFiles는 같은 함수로 이어진다', () => {
    const pathForFile = (): string => ''
    const saveImageData = async (): Promise<{ path: string }> => ({ path: '' })
    const listFiles = async (): Promise<{ files: string[] }> => ({ files: [] })
    setWindowApi({ pathForFile, saveImageData, listFiles })
    expect(ipc.workspace.pathForFile).toBe(pathForFile)
    expect(ipc.workspace.saveImage).toBe(saveImageData)
    expect(ipc.workspace.listFiles).toBe(listFiles)
  })

  it('workspace 묶음: diff·read·listDir은 fs* 평면 함수로 이어진다', () => {
    const fsDiff = async (): Promise<{ filePath: string; lines: never[] }> => ({ filePath: '', lines: [] })
    const fsRead = async (): Promise<{ kind: 'not-found' }> => ({ kind: 'not-found' })
    const fsListDir = async (): Promise<{ entries: never[] }> => ({ entries: [] })
    setWindowApi({ fsDiff, fsRead, fsListDir })
    expect(ipc.workspace.diff).toBe(fsDiff)
    expect(ipc.workspace.read).toBe(fsRead)
    expect(ipc.workspace.listDir).toBe(fsListDir)
  })

  it('workspace 묶음: 참조 폴더 셋(referenceAdd·List·Tree)은 같은 함수로 이어진다', () => {
    const referenceAdd = async (): Promise<{ reference: null }> => ({ reference: null })
    const referenceList = async (): Promise<{ references: never[] }> => ({ references: [] })
    const referenceTree = async (): Promise<{ tree: null }> => ({ tree: null })
    setWindowApi({ referenceAdd, referenceList, referenceTree })
    expect(ipc.workspace.referenceAdd).toBe(referenceAdd)
    expect(ipc.workspace.referenceList).toBe(referenceList)
    expect(ipc.workspace.referenceTree).toBe(referenceTree)
  })

  it('sessions 묶음: 대화 load·save·delete·rename은 같은 함수로 이어진다', () => {
    const conversationLoad = async (): Promise<{ conversations: never[] }> => ({ conversations: [] })
    const conversationSave = async (): Promise<{ id: string }> => ({ id: 'c' })
    const conversationDelete = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const conversationRename = async (): Promise<{ ok: boolean }> => ({ ok: true })
    setWindowApi({ conversationLoad, conversationSave, conversationDelete, conversationRename })
    expect(ipc.sessions.load).toBe(conversationLoad)
    expect(ipc.sessions.save).toBe(conversationSave)
    expect(ipc.sessions.delete).toBe(conversationDelete)
    expect(ipc.sessions.rename).toBe(conversationRename)
  })

  it('sessions 묶음: 멀티 명령은 요청 객체를 받아 평면 위치 인자로 넘긴다 (옛 평면 mock 어댑터)', async () => {
    const calls: unknown[][] = []
    const rec = (name: string) => async (...args: unknown[]): Promise<unknown> => {
      calls.push([name, ...args])
      return { ok: true, state: { version: 2, activeSessionId: '', sessions: [] } }
    }
    setWindowApi({ multiCmdDelete: rec('delete'), multiCmdRename: rec('rename'), multiCmdSelect: rec('select') })
    await ipc.sessions.multiDelete({ id: 'a' })
    await ipc.sessions.multiRename({ id: 'a', title: 't' })
    await ipc.sessions.multiSelect({ id: 'b' })
    expect(calls).toEqual([['delete', 'a'], ['rename', 'a', 't'], ['select', 'b']])
  })

  it('sessions 묶음: multiUpsert는 { session }을 받아 평면 multiCmdUpsert(session)으로 넘긴다', async () => {
    const seen: unknown[] = []
    setWindowApi({ multiCmdUpsert: async (s: unknown) => { seen.push(s); return { ok: true } } })
    const session = { id: 's', count: 2, panels: [] }
    await ipc.sessions.multiUpsert({ session })
    expect(seen).toEqual([session])
  })

  it('sessions 묶음: multiLoad·multiCreate는 인자 없는 같은 함수로 이어진다', () => {
    const multiSessionLoad = async (): Promise<{ state: null }> => ({ state: null })
    const multiCmdCreate = async (): Promise<{ ok: boolean }> => ({ ok: true })
    setWindowApi({ multiSessionLoad, multiCmdCreate })
    expect(ipc.sessions.multiLoad).toBe(multiSessionLoad)
    expect(ipc.sessions.multiCreate).toBe(multiCmdCreate)
  })

  it('없는 평면 함수는 묶음에서도 없음이다 (기능 감지가 그대로 동작)', () => {
    setWindowApi({})
    expect(hasBridge()).toBe(true)
    expect(typeof ipc.sessions.multiUpsert).toBe('undefined')
    expect(typeof ipc.sessions.multiLoad).toBe('undefined')
  })

  it('workspace 묶음: open·tree는 workspace* 평면 함수로 이어진다', () => {
    const workspaceOpen = async (): Promise<{ rootPath: null; tree: null }> => ({ rootPath: null, tree: null })
    const workspaceTree = async (): Promise<{ tree: null }> => ({ tree: null })
    setWindowApi({ workspaceOpen, workspaceTree })
    expect(ipc.workspace.open).toBe(workspaceOpen)
    expect(ipc.workspace.tree).toBe(workspaceTree)
  })

  it('git·lsp 묶음은 window.api의 묶음 객체 그대로다', () => {
    const git = { status: async (): Promise<null> => null }
    const lsp = { status: async (): Promise<'ready'> => 'ready' }
    setWindowApi({ git, lsp })
    expect(ipc.git).toBe(git)
    expect(ipc.lsp).toBe(lsp)
  })

  it('engine 묶음: install·setActive는 { version }을 받아 평면 위치 인자로 넘긴다', async () => {
    const calls: unknown[][] = []
    setWindowApi({
      installEngine: async (v: string) => { calls.push(['install', v]); return { ok: true } },
      setActiveEngine: async (v: string) => { calls.push(['setActive', v]); return { ok: true } },
    })
    await ipc.engine.install({ version: '1.1.0' })
    await ipc.engine.setActive({ version: '1.1.0' })
    expect(calls).toEqual([['install', '1.1.0'], ['setActive', '1.1.0']])
  })

  it('engine 묶음: onInstallProgress는 같은 구독 함수다', () => {
    const onEngineInstallProgress = (): (() => void) => () => {}
    setWindowApi({ onEngineInstallProgress })
    expect(ipc.engine.onInstallProgress).toBe(onEngineInstallProgress)
  })

  it('settings 묶음: 개인화 넷(getProfile·setProfile·getUiPrefs·setUiPref)은 같은 함수로 이어진다', () => {
    const getProfile = async (): Promise<null> => null
    const setProfile = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const getUiPrefs = async (): Promise<Record<string, unknown>> => ({})
    const setUiPref = async (): Promise<{ ok: boolean }> => ({ ok: true })
    setWindowApi({ getProfile, setProfile, getUiPrefs, setUiPref })
    expect(ipc.settings.getProfile).toBe(getProfile)
    expect(ipc.settings.setProfile).toBe(setProfile)
    expect(ipc.settings.getUiPrefs).toBe(getUiPrefs)
    expect(ipc.settings.setUiPref).toBe(setUiPref)
  })

  it('settings 묶음: MCP·스킬·명령 목록은 평면 이름에서 이어진다', () => {
    const listMcpServers = async (): Promise<never[]> => []
    const setMcpEnabled = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const listSkills = async (): Promise<never[]> => []
    const setSkillEnabled = async (): Promise<{ ok: boolean }> => ({ ok: true })
    const listSlashCommands = async (): Promise<never[]> => []
    setWindowApi({ listMcpServers, setMcpEnabled, listSkills, setSkillEnabled, listSlashCommands })
    expect(ipc.settings.listMcp).toBe(listMcpServers)
    expect(ipc.settings.setMcpEnabled).toBe(setMcpEnabled)
    expect(ipc.settings.listSkills).toBe(listSkills)
    expect(ipc.settings.setSkillEnabled).toBe(setSkillEnabled)
    expect(ipc.settings.listCommands).toBe(listSlashCommands)
  })

  it('workspace 묶음: pickFolder는 인자 없는 같은 함수다', () => {
    const pickFolder = async (): Promise<{ path: null }> => ({ path: null })
    setWindowApi({ pickFolder })
    expect(ipc.workspace.pickFolder).toBe(pickFolder)
  })

  it('window 묶음: resizeStart는 { edge }를 받아 평면 windowResizeStart(edge)로 넘긴다', async () => {
    const seen: unknown[] = []
    setWindowApi({ windowResizeStart: async (edge: string) => { seen.push(edge) } })
    await ipc.window.resizeStart({ edge: 'se' })
    expect(seen).toEqual(['se'])
  })

  it('window 묶음: 창 동작은 window* 평면 함수로 이어진다', () => {
    const windowMinimize = async (): Promise<void> => {}
    const windowMaximizeToggle = async (): Promise<{ maximized: boolean }> => ({ maximized: true })
    const windowClose = async (): Promise<void> => {}
    const windowDragStart = async (): Promise<void> => {}
    const windowDragEnd = async (): Promise<void> => {}
    setWindowApi({ windowMinimize, windowMaximizeToggle, windowClose, windowDragStart, windowDragEnd })
    expect(ipc.window.minimize).toBe(windowMinimize)
    expect(ipc.window.maximizeToggle).toBe(windowMaximizeToggle)
    expect(ipc.window.close).toBe(windowClose)
    expect(ipc.window.dragStart).toBe(windowDragStart)
    expect(ipc.window.dragEnd).toBe(windowDragEnd)
  })

  it('window 묶음: 창 상태·배율은 같은 함수로 이어진다 (zoom은 IPC가 아닌 preload 노출)', () => {
    const windowIsMaximized = async (): Promise<{ maximized: boolean }> => ({ maximized: false })
    const onWindowState = (): (() => void) => () => {}
    const getZoomFactor = (): number => 1
    const setZoomFactor = (): void => {}
    setWindowApi({ windowIsMaximized, onWindowState, getZoomFactor, setZoomFactor })
    expect(ipc.window.isMaximized).toBe(windowIsMaximized)
    expect(ipc.window.onState).toBe(onWindowState)
    expect(ipc.window.getZoomFactor).toBe(getZoomFactor)
    expect(ipc.window.setZoomFactor).toBe(setZoomFactor)
  })

  it('지운 채널(getBounds·setBounds·versionState)은 옛 평면 mock에 키가 남아 있어도 묶음에 나타나지 않는다', () => {
    setWindowApi({ windowGetBounds: async () => ({ x: 0, y: 0, width: 1, height: 1 }), windowSetBounds: async () => {}, getEngineVersionState: async () => ({}) })
    expect(ipc.window).not.toHaveProperty('getBounds')
    expect(ipc.window).not.toHaveProperty('setBounds')
    expect(ipc.engine).not.toHaveProperty('versionState')
  })

  it('부를 때마다 지금의 window.api를 본다 (mock 교체가 보인다)', async () => {
    setWindowApi({ getUsage: async () => ({ fiveHour: null, weekly: null }) })
    expect(await ipc.engine.usage()).toEqual({ fiveHour: null, weekly: null })
    setWindowApi({ getUsage: async () => ({ fiveHour: { pct: 1, resetsAt: null }, weekly: null }) })
    expect(await ipc.engine.usage()).toEqual({ fiveHour: { pct: 1, resetsAt: null }, weekly: null })
  })
})
