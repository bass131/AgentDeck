// 작업 ID: g10 · 옛 이름 g10-ipc-typemap.test.ts
// M05 G10 — IPC 채널 타입 맵 고정. 어긋난 타입은 `@ts-expect-error`로 고정한다:
// 그 줄이 타입 오류를 내지 않게 되면(맵이 느슨해지면) typecheck:node가 「안 쓰인 @ts-expect-error」로 실패한다.
import { describe, it, expect, vi } from 'vitest'
import { IPC_CHANNELS, sendPush } from '../../../../02_Project/00_Source/shared/ipcContract'
import type {
  ReqOf,
  ResOf,
  PayloadOf,
  ArgsOf,
  SameKeys,
  InvokeChannel,
  PushChannel,
  PushTarget,
} from '../../../../02_Project/00_Source/shared/ipcContract'

// 실행하지 않는 타입 전용 사례 모음 — 함수 본문은 타입 검사만 받는다.
function typeCases(target: PushTarget): void {
  // 맞는 모양은 통과한다
  const run: ResOf<'agent.run'> = { runId: 'r1' }
  const req: ReqOf<'agent.setMode'> = { runId: 'r1', mode: 'plan' }
  const state: PayloadOf<'window.state'> = { maximized: true }
  const noArgs: ArgsOf<'window.minimize'> = []
  const optional: ArgsOf<'settings.listSkills'> = []
  const optionalWithReq: ArgsOf<'settings.listSkills'> = [{ root: '/w' }]
  sendPush(target, 'window.state', { maximized: false })
  // ack 통일 — 확인 응답 채널은 모두 Ack { ok, error? } 하나를 받는다 (multi는 state를 더 싣는다)
  const acks: Array<ResOf<'agent.interrupt' | 'agent.setMode' | 'git.push' | 'engine.install' | 'settings.setUiPref'>> = [
    { ok: true },
    { ok: false, error: 'why' },
  ]
  const multiAck: ResOf<'multi.cmdDelete'> = { ok: false, error: 'locked', state: { version: 2, activeSessionId: '', sessions: [] } }
  void [run, req, state, noArgs, optional, optionalWithReq, acks, multiAck]

  // 응답 모양이 맵과 다르면 실패한다
  // @ts-expect-error agent.abort의 응답은 G10 ack 통일로 { ok }다 — 옛 { accepted }는 거부된다
  const badRes: ResOf<'agent.abort'> = { accepted: true }
  // @ts-expect-error 맵에 없는 채널
  type BadChannel = ReqOf<'agent.nope'>
  // @ts-expect-error push 채널은 invoke 맵에 없다
  type PushAsInvoke = ResOf<'agent.event'>
  // @ts-expect-error push payload 모양이 다르다
  sendPush(target, 'window.state', { maximized: 'yes' })
  // @ts-expect-error agent.event payload에는 runId가 있어야 한다
  sendPush(target, 'agent.event', { event: { type: 'done' } })
  // @ts-expect-error engine.installProgress payload에는 version이 있어야 한다
  sendPush(target, 'engine.installProgress', { line: 'x' })
  // @ts-expect-error invoke 채널로 push를 보낼 수 없다
  sendPush(target, 'agent.run', { runId: 'r1' })
  // @ts-expect-error 요청이 필요한 채널은 빈 인자 목록이 안 된다
  const missingReq: ArgsOf<'agent.run'> = []
  // @ts-expect-error 인자 없는 채널에 요청을 실을 수 없다
  const extraReq: ArgsOf<'window.minimize'> = [{}]
  // @ts-expect-error 키 집합이 어긋나면 일치 검사가 true를 거부한다
  const mismatch: SameKeys<'a' | 'b', 'a'> = true
  void [badRes, missingReq, extraReq, mismatch]
  void (null as unknown as [BadChannel, PushAsInvoke])
}
void typeCases

// main 등록 사례 — `handle`은 타입만 가져온다(런타임 import 없음, electron 불필요).
declare const handle: typeof import('../../../../02_Project/00_Source/main/01_Ipc/handle').handle
function handleCases(): void {
  handle('agent.abort', (_e, req) => ({ ok: req.runId.length > 0 }))
  handle('engine.install', async () => ({ ok: false, error: 'bad version' }))
  handle('window.minimize', () => {})
  handle('settings.listSkills', async (_e, req?: { root?: string }) => (req?.root ? [] : []))
  // @ts-expect-error 핸들러 반환이 맵의 응답과 다르다
  handle('agent.abort', () => ({ accepted: true }))
  // @ts-expect-error 비동기 핸들러도 응답 모양을 검사받는다
  handle('agent.run', async () => ({ id: 'r1' }))
  // @ts-expect-error 맵에 없는 채널은 등록할 수 없다
  handle('agent.nope', () => ({}))
  // @ts-expect-error push 채널은 invoke 핸들러로 등록할 수 없다
  handle('window.state', () => ({ maximized: true }))
  // @ts-expect-error 요청 타입이 맵과 다른 핸들러는 거부된다
  handle('agent.setMode', (_e, req: { runId: number }) => ({ ok: req.runId > 0 }))
  // @ts-expect-error conversation.delete는 { ok }를 돌려준다
  handle('conversation.delete', () => ({ deleted: true }))
  // @ts-expect-error engine.state는 EngineState를 돌려준다
  handle('engine.state', async () => ({ available: true }))
  // @ts-expect-error workspace.pickFolder는 { path }를 돌려준다 (옛 mock의 folderPath가 아니다)
  handle('workspace.pickFolder', async () => ({ folderPath: null }))
  // @ts-expect-error git.commit은 { ok, error? }를 돌려준다
  handle('git.commit', async () => ({ ok: 'yes' }))
  // @ts-expect-error lsp.definition은 위치 배열을 돌려준다
  handle('lsp.definition', async () => null)
  // @ts-expect-error multi.cmdCreate는 인자 없는 채널이다 — 요청을 받는 핸들러는 맞지 않는다
  handle('multi.cmdCreate', (_e, req: { id: string }) => ({ ok: req.id.length > 0, state: { version: 2, activeSessionId: '', sessions: [] } }))
  // @ts-expect-error multi.cmd*는 state를 함께 돌려준다
  handle('multi.cmdSelect', () => ({ ok: true }))
  // @ts-expect-error settings.getProfile은 Profile | null을 돌려준다
  handle('settings.getProfile', async () => ({ nickname: 'n' }))
  // @ts-expect-error reference.list는 { references }를 돌려준다
  handle('reference.list', () => ({ refs: [] }))
  // @ts-expect-error settings.listSkills는 반환 선언이 없던 채널이다 — 이제 SkillInfo[]로 검사받는다
  handle('settings.listSkills', async () => [{ name: 'x' }])
  // @ts-expect-error workspace.open은 { rootPath, tree }를 돌려준다
  handle('workspace.open', async () => ({ rootPath: null }))
}
void handleCases

// preload 노출 사례 — 노출 함수의 타입이 맵에서 유도된다(타입 전용 import, preload 실행 없음).
type PreloadApi = import('../../../../02_Project/00_Source/preload/index').Api
function preloadCases(api: PreloadApi): void {
  const abort: PreloadApi['agent']['abort'] = async () => ({ ok: true })
  const skills: Promise<unknown> = api.settings.listSkills()
  const path: string = api.workspace.pathForFile(null as unknown as File)
  void [abort, skills, path]
  // @ts-expect-error preload의 agent.abort 응답은 맵의 { ok }다 (옛 { accepted } 거부)
  const badAbort: PreloadApi['agent']['abort'] = async () => ({ accepted: true })
  // @ts-expect-error agent.run은 요청 없이 부를 수 없다
  void api.agent.run()
  // @ts-expect-error 인자 없는 채널(window.minimize)에 요청을 실을 수 없다
  void api.window.minimize({})
  // @ts-expect-error git.status의 요청에는 root가 있어야 한다
  void api.git.status({ cwd: '/w' })
  // @ts-expect-error agent.onEvent 콜백의 payload는 AgentEventPayload다
  api.agent.onEvent((p: { maximized: boolean }) => void p)
  // @ts-expect-error 평면 이름은 더 없다 (평면 별칭을 두지 않는다)
  void api.agentRun
  // @ts-expect-error 위치 인자는 요청 객체로 바뀌었다
  void api.sessions.multiDelete('id-1')
  void badAbort
}
void preloadCases

// 라우트 표 사례 — 표의 항목이 채널 맵과 어긋나면 실패한다(preload/route 불일치).
declare const routes: typeof import('../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes')
type RoutedApiOf<T extends Record<string, Record<string, import('../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes').ApiRoute>>> =
  import('../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes').RoutedApi<T>
function routeCases(): void {
  const okRoutes = { x: { run: routes.call('agent.run'), min: routes.call0('window.minimize'), on: routes.push('window.state') } }
  const fns: RoutedApiOf<typeof okRoutes> = null as unknown as RoutedApiOf<typeof okRoutes>
  void fns.x.run({ messages: [] })
  void fns.x.min()
  // @ts-expect-error 요청이 필요한 채널을 인자 없는 라우트(call0)로 둘 수 없다
  routes.call0('agent.run')
  // @ts-expect-error 인자 없는 채널을 요청 라우트(call)로 둘 수 없다
  routes.call('window.minimize')
  // @ts-expect-error invoke 채널을 push 라우트로 둘 수 없다
  routes.push('agent.run')
  // @ts-expect-error 라우트 표가 유도한 함수도 응답 모양을 지킨다
  const badMin: RoutedApiOf<typeof okRoutes>['x']['min'] = async () => ({ maximized: true })
  void badMin
}
void routeCases

describe('M05 G10 — IPC 채널 타입 맵', () => {
  // M06 G4: 70 → 71. 모델 목록 채널 agent.listModels(invoke)를 더했다.
  // M07 G5: 71 → 74. 컨트롤 패널 채널 settings.controlsState·setControlEnabled·confirmControls(invoke)를 더했다.
  // M09 G4: 76 → 85. 앱 안 루프 묶음 loop의 invoke 여덟(open·start·status·decide·answerCard·cancelSession·releaseLatch·close)과
  // push 하나(loop.state)를 더했다.
  it('채널 수는 재실측 기준에서 미사용 3개를 빼고 M06 G4의 agent.listModels, M07 G5의 컨트롤 셋, M07 G8의 PR 카드 둘, M09 G4의 loop 아홉을 더한 수다 (invoke 67+1+3+2+8=81 + push 3+1)', () => {
    expect(Object.values(IPC_CHANNELS)).toHaveLength(85)
    expect(new Set(Object.values(IPC_CHANNELS)).size).toBe(85)
    const values = Object.values(IPC_CHANNELS) as string[]
    for (const gone of ['window.getBounds', 'window.setBounds', 'engine.versionState']) expect(values).not.toContain(gone)
  })

  it('재분류 14채널은 새 접두로만 존재하고 옛 문자열은 남지 않는다', () => {
    const renamed: Array<[string, InvokeChannel]> = [
      ['image.saveData', 'workspace.saveImage'],
      ['dialog.pickFolder', 'workspace.pickFolder'],
      ['app.getVersion', 'engine.appVersion'],
      ['backend.list', 'engine.listBackends'],
      ['usage.get', 'engine.usage'],
      ['command.list', 'settings.listCommands'],
      ['mcp.list', 'settings.listMcp'],
      ['mcp.setEnabled', 'settings.setMcpEnabled'],
      ['skill.list', 'settings.listSkills'],
      ['skill.setEnabled', 'settings.setSkillEnabled'],
      ['profile.get', 'settings.getProfile'],
      ['profile.set', 'settings.setProfile'],
      ['ui.getPrefs', 'settings.getUiPrefs'],
      ['ui.setPref', 'settings.setUiPref'],
    ]
    expect(renamed).toHaveLength(14)
    const values = Object.values(IPC_CHANNELS) as string[]
    for (const [before, after] of renamed) {
      expect(values).toContain(after)
      expect(values).not.toContain(before)
    }
  })

  it('push 채널은 넷이다(M09 G4 loop.state)', () => {
    const push: PushChannel[] = ['agent.event', 'engine.installProgress', 'window.state', 'loop.state']
    const values = Object.values(IPC_CHANNELS) as string[]
    for (const ch of push) expect(values).toContain(ch)
  })

  it('sendPush는 감싸지 않고 send(채널, payload) 한 번으로 보낸다', () => {
    const send = vi.fn()
    sendPush({ send }, 'window.state', { maximized: true })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('window.state', { maximized: true })
  })

  it('main handle은 핸들러를 감싸지 않고 같은 함수 객체를 ipcMain.handle에 넘긴다', async () => {
    vi.resetModules()
    const registered = new Map<string, unknown>()
    vi.doMock('electron', () => ({ ipcMain: { handle: (ch: string, fn: unknown) => registered.set(ch, fn) } }))
    const mod = await import('../../../../02_Project/00_Source/main/01_Ipc/handle')
    const fn = (): { ok: boolean } => ({ ok: true })
    mod.handle('agent.abort', fn)
    expect(registered.get('agent.abort')).toBe(fn)
    vi.doUnmock('electron')
  })

  it('engine.usage는 engine 핸들러가 등록하고 getUsage 결과를 그대로 돌려준다', async () => {
    vi.resetModules()
    const registered = new Map<string, (...a: unknown[]) => unknown>()
    const usage = { fiveHour: null, weekly: null }
    const src = '../../../../02_Project/00_Source/main'
    vi.doMock('electron', () => ({
      app: { getVersion: () => '0.0.0' },
      ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => registered.set(ch, fn) },
    }))
    vi.doMock(`${src}/10_Engine/engineVersions`, () => ({ getVersionState: vi.fn(), setActive: vi.fn(), installVersion: vi.fn() }))
    vi.doMock(`${src}/10_Engine/engineState`, () => ({ getEngineState: vi.fn() }))
    vi.doMock(`${src}/00_App/backendStatus`, () => ({ buildBackendStatuses: vi.fn() }))
    vi.doMock(`${src}/10_Engine/engineCheckUpdate`, () => ({ checkEngineUpdate: vi.fn() }))
    vi.doMock(`${src}/00_App/registry`, () => ({ getBackend: vi.fn() }))
    vi.doMock(`${src}/10_Engine/usage`, () => ({ getUsage: vi.fn(async () => usage) }))
    const mod = await import('../../../../02_Project/00_Source/main/01_Ipc/handlers/engine')
    mod.registerEngineHandlers()
    const fn = registered.get(IPC_CHANNELS.USAGE_GET)
    expect(fn).toBeTypeOf('function')
    await expect(fn?.({})).resolves.toBe(usage)
    expect(registered.has('engine.versionState')).toBe(false)
    vi.doUnmock('electron')
    vi.doUnmock(`${src}/10_Engine/engineVersions`)
    vi.doUnmock(`${src}/10_Engine/engineState`)
    vi.doUnmock(`${src}/00_App/backendStatus`)
    vi.doUnmock(`${src}/10_Engine/engineCheckUpdate`)
    vi.doUnmock(`${src}/00_App/registry`)
    vi.doUnmock(`${src}/10_Engine/usage`)
  })

  it('invoke 채널 타입은 문자열 채널 이름이다', () => {
    const ch: InvokeChannel = 'agent.run'
    expect(ch).toBe(IPC_CHANNELS.AGENT_RUN)
  })
})
