// M05 G10 — IPC 채널 타입 맵 고정. 어긋난 타입은 `@ts-expect-error`로 고정한다:
// 그 줄이 타입 오류를 내지 않게 되면(맵이 느슨해지면) typecheck:node가 「안 쓰인 @ts-expect-error」로 실패한다.
import { describe, it, expect, vi } from 'vitest'
import { IPC_CHANNELS, sendPush } from '../../../02_Project/00_Source/shared/ipcContract'
import type {
  ReqOf,
  ResOf,
  PayloadOf,
  ArgsOf,
  SameKeys,
  InvokeChannel,
  PushChannel,
  PushTarget,
} from '../../../02_Project/00_Source/shared/ipcContract'

// 실행하지 않는 타입 전용 사례 모음 — 함수 본문은 타입 검사만 받는다.
function typeCases(target: PushTarget): void {
  // 맞는 모양은 통과한다
  const run: ResOf<'agent.run'> = { runId: 'r1' }
  const req: ReqOf<'agent.setMode'> = { runId: 'r1', mode: 'plan' }
  const state: PayloadOf<'window.state'> = { maximized: true }
  const noArgs: ArgsOf<'window.minimize'> = []
  const optional: ArgsOf<'skill.list'> = []
  const optionalWithReq: ArgsOf<'skill.list'> = [{ root: '/w' }]
  sendPush(target, 'window.state', { maximized: false })
  void [run, req, state, noArgs, optional, optionalWithReq]

  // 응답 모양이 맵과 다르면 실패한다
  // @ts-expect-error agent.abort의 응답은 { accepted }다
  const badRes: ResOf<'agent.abort'> = { ok: true }
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
declare const handle: typeof import('../../../02_Project/00_Source/main/01_Ipc/handle').handle
function handleCases(): void {
  handle('agent.abort', (_e, req) => ({ accepted: req.runId.length > 0 }))
  handle('window.minimize', () => {})
  handle('skill.list', async (_e, req?: { root?: string }) => (req?.root ? [] : []))
  // @ts-expect-error 핸들러 반환이 맵의 응답과 다르다
  handle('agent.abort', () => ({ ok: true }))
  // @ts-expect-error 비동기 핸들러도 응답 모양을 검사받는다
  handle('agent.run', async () => ({ id: 'r1' }))
  // @ts-expect-error 맵에 없는 채널은 등록할 수 없다
  handle('agent.nope', () => ({}))
  // @ts-expect-error push 채널은 invoke 핸들러로 등록할 수 없다
  handle('window.state', () => ({ maximized: true }))
  // @ts-expect-error 요청 타입이 맵과 다른 핸들러는 거부된다
  handle('agent.setMode', (_e, req: { runId: number }) => ({ accepted: req.runId > 0 }))
  // @ts-expect-error conversation.delete는 { ok }를 돌려준다
  handle('conversation.delete', () => ({ deleted: true }))
  // @ts-expect-error engine.state는 EngineState를 돌려준다
  handle('engine.state', async () => ({ available: true }))
  // @ts-expect-error dialog.pickFolder는 { path }를 돌려준다 (옛 mock의 folderPath가 아니다)
  handle('dialog.pickFolder', async () => ({ folderPath: null }))
  // @ts-expect-error git.commit은 { ok, error? }를 돌려준다
  handle('git.commit', async () => ({ ok: 'yes' }))
  // @ts-expect-error lsp.definition은 위치 배열을 돌려준다
  handle('lsp.definition', async () => null)
  // @ts-expect-error multi.cmdCreate는 인자 없는 채널이다 — 요청을 받는 핸들러는 맞지 않는다
  handle('multi.cmdCreate', (_e, req: { id: string }) => ({ ok: req.id.length > 0, state: { version: 2, activeSessionId: '', sessions: [] } }))
  // @ts-expect-error multi.cmd*는 state를 함께 돌려준다
  handle('multi.cmdSelect', () => ({ ok: true }))
  // @ts-expect-error profile.get은 Profile | null을 돌려준다
  handle('profile.get', async () => ({ nickname: 'n' }))
  // @ts-expect-error reference.list는 { references }를 돌려준다
  handle('reference.list', () => ({ refs: [] }))
  // @ts-expect-error skill.list는 반환 선언이 없던 채널이다 — 이제 SkillInfo[]로 검사받는다
  handle('skill.list', async () => [{ name: 'x' }])
  // @ts-expect-error workspace.open은 { rootPath, tree }를 돌려준다
  handle('workspace.open', async () => ({ rootPath: null }))
}
void handleCases

// preload 노출 사례 — 노출 함수의 타입이 맵에서 유도된다(타입 전용 import, preload 실행 없음).
type PreloadApi = import('../../../02_Project/00_Source/preload/index').Api
function preloadCases(api: PreloadApi): void {
  const abort: PreloadApi['agentAbort'] = async () => ({ accepted: true })
  const skills: Promise<unknown> = api.listSkills()
  void [abort, skills]
  // @ts-expect-error preload의 agentAbort 응답은 맵의 { accepted }다
  const badAbort: PreloadApi['agentAbort'] = async () => ({ ok: true })
  // @ts-expect-error agentRun은 요청 없이 부를 수 없다
  void api.agentRun()
  // @ts-expect-error 인자 없는 채널(windowMinimize)에 요청을 실을 수 없다
  void api.windowMinimize({})
  // @ts-expect-error git.status의 요청에는 root가 있어야 한다
  void api.git.status({ cwd: '/w' })
  // @ts-expect-error onAgentEvent 콜백의 payload는 AgentEventPayload다
  api.onAgentEvent((p: { maximized: boolean }) => void p)
  void badAbort
}
void preloadCases

describe('M05 G10 — IPC 채널 타입 맵', () => {
  it('채널 수는 재실측 기준과 같다 (invoke 70 + push 3)', () => {
    expect(Object.values(IPC_CHANNELS)).toHaveLength(73)
    expect(new Set(Object.values(IPC_CHANNELS)).size).toBe(73)
  })

  it('push 채널은 셋이다', () => {
    const push: PushChannel[] = ['agent.event', 'engine.installProgress', 'window.state']
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
    const mod = await import('../../../02_Project/00_Source/main/01_Ipc/handle')
    const fn = (): { accepted: boolean } => ({ accepted: true })
    mod.handle('agent.abort', fn)
    expect(registered.get('agent.abort')).toBe(fn)
    vi.doUnmock('electron')
  })

  it('invoke 채널 타입은 문자열 채널 이름이다', () => {
    const ch: InvokeChannel = 'agent.run'
    expect(ch).toBe(IPC_CHANNELS.AGENT_RUN)
  })
})
