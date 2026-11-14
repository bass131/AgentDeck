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

  it('invoke 채널 타입은 문자열 채널 이름이다', () => {
    const ch: InvokeChannel = 'agent.run'
    expect(ch).toBe(IPC_CHANNELS.AGENT_RUN)
  })
})
