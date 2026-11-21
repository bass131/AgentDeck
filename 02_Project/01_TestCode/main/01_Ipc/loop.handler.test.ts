import { describe, expect, it, vi } from 'vitest'
import type { LoopStatus } from '@shared/ipcContract'
import type { LoopAlert, LoopSessionEventPayload, MainChatView } from '@shared/13_Loop/loop'

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
  failCount: 0, goals: [], approval: null, milestonePr: null, cards: [], sessionActive: false, lastVerdict: null, latch: null,
  paused: false, mainBusy: false, mainWaiting: false, mainNode: false, recentLines: [], sessions: [], ...over,
})
const view = (over: Partial<MainChatView> = {}): MainChatView => ({
  cwd: CWD, root: CWD, chapter: 'c1', sessionId: null, items: [], cards: [], busy: false, waitingUser: false, brainstorming: false, paused: false, queued: 0, ...over,
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
      mainRead: rec('mainRead', view()),
      mainSend: rec('mainSend', { ok: true, view: view({ busy: true }) }),
      mainNew: rec('mainNew', Promise.resolve({ ok: true, view: view() })),
      lowerFlag: rec('lowerFlag', { ok: true, view: view() }),
      sessionLog: rec('sessionLog', { cwd: CWD, sessions: [] }),
      mainArchives: rec('mainArchives', Promise.resolve({ cwd: CWD, archives: [] })),
      graph: rec('graph', { ok: false, reason: '없음' }),
      listDir: rec('listDir', Promise.resolve({ ok: true, entries: [] })),
    },
  }
}

const ALERT: LoopAlert = { key: 'k1', cwd: CWD, phase: 'halted', node: 'G1/checks', level: 'now', text: '멈췄다' }

function register(driver: LoopDriverApi, alerts?: { list(): LoopAlert[] }): (ch: string, req: unknown) => Promise<unknown> {
  h.handlers.clear()
  registerLoopHandlers({ driver, ...(alerts ? { alerts } : {}) })
  return async (ch, req) => {
    const fn = h.handlers.get(ch)
    if (!fn) throw new Error(`${ch} 핸들러가 등록되지 않았다`)
    return fn({} as never, req)
  }
}

describe('loop IPC 핸들러 (M09 G4)', () => {
  it('그래프 읽기는 cwd만 구동자로 넘기고, 알림 읽기는 알림 목록을 돌려준다(없으면 빈 목록) (M10 G5)', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver, { list: () => [ALERT] })
    expect(await call(IPC_CHANNELS.LOOP_GRAPH, { cwd: CWD, nodes: [] })).toEqual({ ok: false, reason: '없음' })
    await expect(call(IPC_CHANNELS.LOOP_GRAPH, { cwd: 'rel' })).rejects.toThrow(/loop\.graph/)
    expect(calls).toEqual([['graph', CWD]])
    expect(await call(IPC_CHANNELS.LOOP_ALERTS, undefined)).toEqual({ alerts: [ALERT] })
    const bare = register(driver)
    expect(await bare(IPC_CHANNELS.LOOP_ALERTS, undefined)).toEqual({ alerts: [] })
  })

  it('열일곱 채널을 등록하고 구동자로 넘긴다(M10 G2 — 메인 대화 읽기·보내기·새로 열기, M10 G3 — 깃발 내리기, M10 G4 — 세션 기록·지난 메인 대화 읽기, M10 G5 — 그래프·알림 읽기, M11 G4 — 작업 폴더 목록)', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    expect([...h.handlers.keys()].sort()).toEqual([
      'loop.alerts', 'loop.answerCard', 'loop.cancelSession', 'loop.close', 'loop.decide', 'loop.graph', 'loop.listDir', 'loop.lowerFlag', 'loop.mainArchives', 'loop.mainNew', 'loop.mainRead', 'loop.mainSend',
      'loop.open', 'loop.releaseLatch', 'loop.sessionLog', 'loop.start', 'loop.status',
    ])
    expect(await call(IPC_CHANNELS.LOOP_SESSION_LOG, { cwd: CWD, verdict: 'pass' })).toEqual({ cwd: CWD, sessions: [] })
    expect(await call(IPC_CHANNELS.LOOP_MAIN_ARCHIVES, { cwd: CWD })).toEqual({ cwd: CWD, archives: [] })
    await expect(call(IPC_CHANNELS.LOOP_SESSION_LOG, { cwd: 'rel' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_MAIN_ARCHIVES, null)).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_MAIN_ARCHIVES, { cwd: '   ' })).rejects.toThrow(/loop\.mainArchives/)
    expect(calls.splice(0)).toEqual([['sessionLog', CWD], ['mainArchives', CWD]])
    expect(await call(IPC_CHANNELS.LOOP_MAIN_READ, { cwd: CWD })).toMatchObject({ cwd: CWD, items: [] })
    expect(await call(IPC_CHANNELS.LOOP_MAIN_SEND, { cwd: CWD, text: '덧셈으로 하자' })).toMatchObject({ ok: true, view: { busy: true } })
    expect(await call(IPC_CHANNELS.LOOP_MAIN_NEW, { cwd: CWD })).toMatchObject({ ok: true })
    expect(calls.splice(0)).toEqual([['mainRead', CWD], ['mainSend', CWD, '덧셈으로 하자'], ['mainNew', CWD]])
    expect(await call(IPC_CHANNELS.LOOP_OPEN, { cwd: CWD })).toMatchObject({ phase: 'not-started' })
    await call(IPC_CHANNELS.LOOP_START, { cwd: CWD, milestoneId: 'M1' })
    await call(IPC_CHANNELS.LOOP_STATUS, { cwd: CWD })
    await call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: 'a'.repeat(64) })
    expect(await call(IPC_CHANNELS.LOOP_ANSWER_CARD, { cwd: CWD, requestId: 'q1', response: { kind: 'question', answers: [['예']] } })).toEqual({ ok: true })
    expect(await call(IPC_CHANNELS.LOOP_CANCEL_SESSION, { cwd: CWD, target: 'worker' })).toEqual({ ok: true })
    await call(IPC_CHANNELS.LOOP_RELEASE_LATCH, { cwd: CWD, token: 'b'.repeat(64) })
    expect(await call(IPC_CHANNELS.LOOP_CLOSE, { cwd: CWD })).toEqual({ ok: true })
    expect(calls.map((c) => c[0])).toEqual(['open', 'start', 'status', 'decide', 'answerCard', 'cancelSession', 'releaseLatch', 'close'])
    expect(calls[0]).toEqual(['open', { cwd: CWD }])
    expect(calls[3]).toEqual(['decide', { cwd: CWD, verdict: 'pass', evidence: '봤다', specSha256: 'a'.repeat(64) }])
    expect(calls[4]).toEqual(['answerCard', CWD, 'q1', { kind: 'question', answers: [['예']] }])
    expect(calls[5]).toEqual(['cancelSession', CWD, 'worker'])
  })

  it('깃발 내리기는 cwd만 구동자로 넘긴다 — 판정 칸(verdict·evidence·specSha256·expectNode)을 실어도 읽지 않는다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    expect(await call(IPC_CHANNELS.LOOP_LOWER_FLAG, { cwd: CWD })).toMatchObject({ ok: true, view: { cwd: CWD } })
    await call(IPC_CHANNELS.LOOP_LOWER_FLAG, { cwd: CWD, verdict: 'pass', evidence: '이어 간다', specSha256: 'a'.repeat(64), expectNode: 'G1/implement' })
    expect(calls).toEqual([['lowerFlag', CWD], ['lowerFlag', CWD]])
    await expect(call(IPC_CHANNELS.LOOP_LOWER_FLAG, { cwd: 'rel' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_LOWER_FLAG, null)).rejects.toThrow()
    expect(calls).toHaveLength(2)
  })

  it('취소는 대상(메인 턴 main·작업 세션 worker)을 골라야 한다 — 빠지거나 모르는 대상은 구동자에 닿지 않고, 판정 칸은 읽지 않는다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    await call(IPC_CHANNELS.LOOP_CANCEL_SESSION, { cwd: CWD, target: 'main' })
    await call(IPC_CHANNELS.LOOP_CANCEL_SESSION, { cwd: CWD, target: 'worker', verdict: 'fail', evidence: '취소' })
    expect(calls).toEqual([['cancelSession', CWD, 'main'], ['cancelSession', CWD, 'worker']])
    for (const bad of [{ cwd: CWD }, { cwd: CWD, target: 'review' }, { cwd: CWD, target: 'work' }, { cwd: CWD, target: '' }, { cwd: CWD, target: 1 }]) {
      await expect(call(IPC_CHANNELS.LOOP_CANCEL_SESSION, bad)).rejects.toThrow(/target/)
    }
    expect(calls).toHaveLength(2)
  })

  it('입력 꼴이 틀리면 구동자를 부르지 않는다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: '' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: 'relative/path' })).rejects.toThrow()
    // 화면이 필수 검사를 빈 목록으로 보내면 아무 검사나 통과하게 된다
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: CWD, requiredChecks: [] })).rejects.toThrow(/requiredChecks/)
    await expect(call(IPC_CHANNELS.LOOP_OPEN, { cwd: CWD, requiredChecks: ['hard-gates'] })).rejects.toThrow(/requiredChecks/)
    await expect(call(IPC_CHANNELS.LOOP_START, { cwd: CWD })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'stop', evidence: 'x' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'pass', evidence: '  ' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_RELEASE_LATCH, { cwd: CWD, token: 3 })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_STATUS, null)).rejects.toThrow()
    // 스펙 해시는 sha256 16진수 꼴만 — 화면이 본 해시가 아닌 값은 구동자에 닿지 않는다
    await expect(call(IPC_CHANNELS.LOOP_DECIDE, { cwd: CWD, verdict: 'pass', evidence: 'x', specSha256: 'abc' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_MAIN_SEND, { cwd: CWD, text: '   ' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_MAIN_SEND, { cwd: CWD, text: 'x'.repeat(20_001) })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_MAIN_SEND, { cwd: CWD })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_MAIN_READ, { cwd: 'rel' })).rejects.toThrow()
    await expect(call(IPC_CHANNELS.LOOP_MAIN_NEW, null)).rejects.toThrow()
    expect(calls).toEqual([])
  })

  it('메인 대화에 보낸 글은 판정 칸을 실어도 글만 구동자로 간다 (M10 G2)', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    await call(IPC_CHANNELS.LOOP_MAIN_SEND, { cwd: CWD, text: '승인한다', verdict: 'pass', specSha256: 'a'.repeat(64) })
    expect(calls).toEqual([['mainSend', CWD, '승인한다']])
  })

  it('[M11-G4 M10-16] 작업 폴더 목록은 cwd와 상대 경로 글자만 구동자로 넘긴다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    expect(await call(IPC_CHANNELS.LOOP_LIST_DIR, { cwd: CWD, relDir: 'src', rootId: 'ref-1' })).toEqual({ ok: true, entries: [] })
    await expect(call(IPC_CHANNELS.LOOP_LIST_DIR, { cwd: 'rel', relDir: '' })).rejects.toThrow(/loop\.listDir/)
    await expect(call(IPC_CHANNELS.LOOP_LIST_DIR, { cwd: CWD, relDir: 3 })).rejects.toThrow(/loop\.listDir/)
    expect(calls).toEqual([['listDir', CWD, 'src']])
  })

  it('[M11-G4 M10-16] 구동자가 막힘(ok 거짓)으로 답하면 그대로 화면에 넘긴다(빈 목록으로 바꾸지 않는다)', async () => {
    const { driver } = fakeDriver()
    const call = register({ ...driver, listDir: async () => ({ ok: false, entries: [] }) })
    expect(await call(IPC_CHANNELS.LOOP_LIST_DIR, { cwd: CWD, relDir: '..' })).toEqual({ ok: false, entries: [] })
  })

  it('[M11-G4 M06-29] 대리 입력 표지는 proxy가 참일 때만 구동자로 간다', async () => {
    const { driver, calls } = fakeDriver()
    const call = register(driver)
    await call(IPC_CHANNELS.LOOP_MAIN_SEND, { cwd: CWD, text: '합의', proxy: true })
    await call(IPC_CHANNELS.LOOP_MAIN_SEND, { cwd: CWD, text: '합의', proxy: 'yes' })
    expect(calls).toEqual([['mainSend', CWD, '합의', { proxy: true }], ['mainSend', CWD, '합의']])
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

  it('메인 대화 보기와 세션 사건도 창이 있을 때만 보낸다 (M10 G2)', async () => {
    const { pushMainState, pushSessionEvent } = await import('@main/01_Ipc/handlers/loop')
    const send = vi.fn()
    const win = { win: { isDestroyed: () => false, webContents: { send } } as never }
    const v = view({ busy: true })
    const p: LoopSessionEventPayload = { cwd: CWD, session: { key: 'main', kind: 'main', node: null, goal: null, sessionId: 'S1' }, event: { type: 'done' }, seq: 0 }
    pushMainState(win, v)
    pushSessionEvent(win, p)
    pushMainState({ win: null }, v)
    pushSessionEvent({ win: null }, p)
    expect(send.mock.calls).toEqual([['loop.mainState', v], ['loop.sessionEvent', p]])
  })

  it('알림 목록과 알림 열기도 창이 있을 때만 보낸다 (M10 G5)', async () => {
    const { pushAlerts, pushAlertOpen } = await import('@main/01_Ipc/handlers/loop')
    const send = vi.fn()
    const win = { win: { isDestroyed: () => false, webContents: { send } } as never }
    pushAlerts(win, { alerts: [ALERT] })
    pushAlertOpen(win, { cwd: CWD })
    pushAlerts({ win: null }, { alerts: [] })
    pushAlertOpen({ win: null }, { cwd: CWD })
    expect(send.mock.calls).toEqual([['loop.alertsState', { alerts: [ALERT] }], ['loop.alertOpen', { cwd: CWD }]])
  })
})
