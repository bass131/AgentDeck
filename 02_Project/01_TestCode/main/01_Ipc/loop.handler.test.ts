// M09 G4 — loop IPC 핸들러. ipcMain.handle을 가로채 registerLoopHandlers가 등록한 채널을 직접 부른다.
// 고정하는 것: 여덟 채널이 등록되고 구동자로 그대로 넘어간다, 입력 꼴이 틀리면 구동자를 부르지 않는다(cwd·verdict·카드 응답·token),
// 카드 응답에 「항상 허용」은 받지 않는다, 구동자가 내는 상태 변화는 창이 있을 때만 loop.state로 push한다.
import { describe, expect, it, vi } from 'vitest'
import type { LoopStatus } from '@shared/ipcContract'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))

import { registerLoopHandlers, type LoopDriverApi } from '@main/01_Ipc/handlers/loop'
import { IPC_CHANNELS } from '@shared/ipcContract'

const CWD = 'C:/work/practice'
const status = (over: Partial<LoopStatus> = {}): LoopStatus => ({
  cwd: CWD, root: CWD, phase: 'closed', milestoneId: null, node: null, nodeTitle: null, reason: null, base: null, ghRepo: null,
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null, ...over,
})

function fakeDriver(): { driver: LoopDriverApi; calls: unknown[][] } {
  const calls: unknown[][] = []
  const rec = <T>(name: string, value: T) => (...args: unknown[]): T => { calls.push([name, ...args]); return value }
  return {
    calls,
    driver: {
      open: rec('open', Promise.resolve(status({ phase: 'not-started' }))),
      start: rec('start', Promise.resolve(status({ phase: 'running' }))),
      status: rec('status', status()),
      decide: rec('decide', Promise.resolve({ ok: true, status: status() })),
      answerCard: rec('answerCard', true),
      cancelSession: rec('cancelSession', true),
      releaseLatch: rec('releaseLatch', Promise.resolve({ ok: true, status: status() })),
      close: rec('close', Promise.resolve()),
    },
  }
}

function register(driver: LoopDriverApi): (ch: string, req: unknown) => Promise<unknown> {
  h.handlers.clear()
  registerLoopHandlers({ driver })
  return async (ch, req) => {
    const fn = h.handlers.get(ch)
    if (!fn) throw new Error(`${ch} 핸들러가 등록되지 않았다`)
    return fn({} as never, req)
  }
}

describe('loop IPC 핸들러 (M09 G4)', () => {
  it('여덟 채널을 등록하고 구동자로 넘긴다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    expect([...h.handlers.keys()].sort()).toEqual([
      'loop.answerCard', 'loop.cancelSession', 'loop.close', 'loop.decide', 'loop.open', 'loop.releaseLatch', 'loop.start', 'loop.status',
    ])
    expect(await call(IPC_CHANNELS.LOOP_OPEN, { cwd: CWD })).toMatchObject({ phase: 'not-started' })
    await call(IPC_CHANNELS.LOOP_START, { cwd: CWD, milestoneId: 'M1' })
    await call(IPC_CHANNELS.LOOP_STATUS, { cwd: CWD })
    await call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: 'a'.repeat(64) })
    expect(await call(IPC_CHANNELS.LOOP_ANSWER_CARD, { cwd: CWD, requestId: 'q1', response: { kind: 'question', answers: [['예']] } })).toEqual({ ok: true })
    expect(await call(IPC_CHANNELS.LOOP_CANCEL_SESSION, { cwd: CWD })).toEqual({ ok: true })
    await call(IPC_CHANNELS.LOOP_RELEASE_LATCH, { cwd: CWD, token: 'b'.repeat(64) })
    expect(await call(IPC_CHANNELS.LOOP_CLOSE, { cwd: CWD })).toEqual({ ok: true })
    expect(calls.map((c) => c[0])).toEqual(['open', 'start', 'status', 'decide', 'answerCard', 'cancelSession', 'releaseLatch', 'close'])
    expect(calls[0]).toEqual(['open', { cwd: CWD }])
    expect(calls[3]).toEqual(['decide', { cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: 'a'.repeat(64) }])
    expect(calls[4]).toEqual(['answerCard', CWD, 'q1', { kind: 'question', answers: [['예']] }])
  })

  it('입력 꼴이 틀리면 구동자를 부르지 않는다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: '' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: 'relative/path' })).rejects.toThrow()
    // G4 검수 중요 I5 — CI 정책(필수 검사 이름)은 화면 입력으로 바꾸지 못한다. 그 칸이 오면 거부한다(빈 목록으로 아무 검사 통과를 여는 길)
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: CWD, requiredChecks: [] })).rejects.toThrow(/requiredChecks/)
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: CWD, requiredChecks: ['hard-gates'] })).rejects.toThrow(/requiredChecks/)
    await expect(call(IPC_CHANNELS.LOOP_START, { cwd: CWD })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'stop', evidence: 'x' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'pass', evidence: '  ' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_RELEASE_LATCH, { cwd: CWD, token: 3 })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_STATUS, null)).rejects.toThrow()
    // 스펙 해시는 sha256 16진수 꼴만 — 화면이 본 해시가 아닌 값은 구동자에 닿지 않는다
    await expect(call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'pass', evidence: 'x', specSha256: 'abc' })).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('카드 응답은 허용·거부와 질문 답만 받는다 — 「항상 허용」과 꼴이 틀린 답은 ok:false로 넘기지 않는다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    for (const response of [
      { kind: 'permission', behavior: 'allow_always' }, { kind: 'permission', behavior: 'yes' }, { kind: 'question', answers: 'x' },
      { kind: 'question', answers: [[1]] }, { kind: 'other' }, null,
    ]) expect(await call(IPC_CHANNELS.LOOP_ANSWER_CARD, { cwd: CWD, requestId: 'p1', response })).toEqual({ ok: false })
    expect(await call(IPC_CHANNELS.LOOP_ANSWER_CARD, { cwd: CWD, requestId: '', response: { kind: 'permission', behavior: 'deny' } })).toEqual({ ok: false })
    expect(calls).toEqual([])
    expect(await call(IPC_CHANNELS.LOOP_ANSWER_CARD, { cwd: CWD, requestId: 'p1', response: { kind: 'question', answers: null } })).toEqual({ ok: true })
  })
})

describe('loop.state push 배선 (M09 G4)', () => {
  it('창이 있으면 상태를 loop.state로 보내고, 없거나 닫혔으면 보내지 않는다', async () => {
    const { pushLoopState } = await import('@main/01_Ipc/handlers/loop')
    const send = vi.fn()
    const s = status({ phase: 'running' })
    pushLoopState({ win: { isDestroyed: () => false, webContents: { send } } as never }, s)
    expect(send).toHaveBeenCalledWith('loop.state', s)
    pushLoopState({ win: null }, s)
    pushLoopState({ win: { isDestroyed: () => true, webContents: { send } } as never }, s)
    expect(send).toHaveBeenCalledTimes(1)
  })
})
