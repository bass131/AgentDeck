/**
 * persistent-session.test.ts — Phase 2 (2) run-manager 지속세션 모델 (REPL, ADR-024).
 *
 * run-manager가 persistent run을 단발과 다르게 다룬다:
 *   - done(=turn 경계)에 break/delete 안 함 — 세션 유지(held-open).
 *   - 같은 sessionKey의 후속 start()는 새 backend.start가 아니라 기존 run.push()로 라우팅.
 *   - persistent runId = sessionKey(안정 — (5) cron-turn 라우팅 토대).
 *   - abort(sessionKey) / 스트림 종료 시 정리.
 *
 * 검증(PS1 단발 회귀 가드 포함):
 *   PS1: 비-persistent run은 done에 break/delete (기존 동작 불변).
 *   PS2: persistent run은 done(turn 경계)에 삭제 안 함 — 후속 done도 forward.
 *   PS3: 같은 sessionKey 2번째 start → 기존 run.push(마지막 user content) + 같은 runId, backend.start 1회만.
 *   PS4: persistent runId === sessionKey.
 *   PS5: abort(sessionKey) → run.abort + 정리.
 *   PS6: persistent run 스트림 종료(input close) → 레지스트리 정리.
 */
import { describe, it, expect } from 'vitest'
import { createRunManager } from '../../src/main/00_ipc/agent-runs'
import type { AgentBackend, AgentRun, AgentRunInput } from '../../src/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../src/shared/agent-events'

/** 제어가능한 held-open fake run: emit()로 이벤트 주입, end()로 스트림 종료. push 기록. */
function makeControllableRun() {
  const queue: AgentEvent[] = []
  let resolveNext: (() => void) | null = null
  let closed = false
  const pushes: string[] = []
  let aborted = false
  let interrupted = 0

  function emit(ev: AgentEvent) {
    queue.push(ev)
    if (resolveNext) { const r = resolveNext; resolveNext = null; r() }
  }
  function end() {
    closed = true
    if (resolveNext) { const r = resolveNext; resolveNext = null; r() }
  }

  const events: AsyncIterable<AgentEvent> = {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length > 0) yield queue.shift()!
        if (closed) return
        await new Promise<void>((resolve) => { resolveNext = resolve })
      }
    },
  }

  const run: AgentRun = {
    events,
    abort() { aborted = true; end() },
    interrupt() { interrupted++ },
    push(content: string) { pushes.push(content) },
    respond() {},
  }
  return { run, emit, end, pushes, get aborted() { return aborted }, get interrupted() { return interrupted } }
}

function makeBackend(run: AgentRun): { backend: AgentBackend; startCount: () => number; lastReq: () => AgentRunInput | null } {
  let startCount = 0
  let lastReq: AgentRunInput | null = null
  const backend: AgentBackend = {
    id: 'claude-code',
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    start: (req: AgentRunInput) => { startCount++; lastReq = req; return run },
    listSupportedCommands: () => [],
  }
  return { backend, startCount: () => startCount, lastReq: () => lastReq }
}

const wait = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms))

describe('(2) run-manager — 단발 회귀 가드', () => {
  it('PS1: 비-persistent run은 done에 break/delete (기존 동작 불변)', async () => {
    const ctrl = makeControllableRun()
    const { backend } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const seen: AgentEvent[] = []
    const runId = await manager.start(backend, { messages: [{ role: 'user', content: 'hi' }] }, (e) => seen.push(e))
    ctrl.emit({ type: 'done' })
    await wait()
    // done 후 run 삭제 → 후속 abort는 false(이미 done)
    expect(manager.abort(runId)).toBe(false)
    expect(seen.some((e) => e.type === 'done')).toBe(true)
  })
})

describe('(2) run-manager — 지속세션(persistent)', () => {
  it('PS2: persistent run은 done(turn 경계)에 삭제 안 함 — 후속 done forward', async () => {
    const ctrl = makeControllableRun()
    const { backend } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const dones: AgentEvent[] = []
    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hi' }], persistent: true, sessionKey: 'conv-1' },
      (e) => { if (e.type === 'done') dones.push(e) },
    )
    ctrl.emit({ type: 'done', origin: 'user' })
    await wait()
    // 첫 done 후에도 run 살아있음 → abort 가능(true)
    expect(manager.abort(runId)).toBe(true)
    // 두 번째 done도 forward됐어야(삭제 전까지)
    expect(dones.length).toBeGreaterThanOrEqual(1)
  })

  it('PS2b: persistent run은 done 2회를 모두 forward (세션 유지)', async () => {
    const ctrl = makeControllableRun()
    const { backend } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const dones: AgentEvent[] = []
    await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hi' }], persistent: true, sessionKey: 'conv-2' },
      (e) => { if (e.type === 'done') dones.push(e) },
    )
    ctrl.emit({ type: 'done', origin: 'user' })
    await wait()
    ctrl.emit({ type: 'done', origin: 'cron' })
    await wait()
    expect(dones.length).toBe(2)
    expect((dones[1] as { origin?: string }).origin).toBe('cron')
  })

  it('PS3: 같은 sessionKey 2번째 start → 기존 run.push + 같은 runId + backend.start 1회만', async () => {
    const ctrl = makeControllableRun()
    const { backend, startCount } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const runId1 = await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'first' }], persistent: true, sessionKey: 'conv-3' },
      () => {},
    )
    const runId2 = await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'second turn' }], persistent: true, sessionKey: 'conv-3' },
      () => {},
    )
    expect(runId2).toBe(runId1)
    expect(startCount()).toBe(1)              // 새 세션 안 염
    expect(ctrl.pushes).toContain('second turn')   // 기존 세션에 push
  })

  it('PS4: persistent runId === sessionKey (안정 라우팅)', async () => {
    const ctrl = makeControllableRun()
    const { backend } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hi' }], persistent: true, sessionKey: 'conv-stable-9' },
      () => {},
    )
    expect(runId).toBe('conv-stable-9')
  })

  it('PS5: abort(sessionKey) → run.abort + 정리', async () => {
    const ctrl = makeControllableRun()
    const { backend } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hi' }], persistent: true, sessionKey: 'conv-4' },
      () => {},
    )
    expect(manager.abort(runId)).toBe(true)
    await wait()
    expect(ctrl.aborted).toBe(true)
    // 정리 후 재abort는 false
    expect(manager.abort(runId)).toBe(false)
  })

  it('IT1: interrupt(runId) → run.interrupt 호출 + 세션 유지(삭제 안 함)', async () => {
    const ctrl = makeControllableRun()
    const { backend } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hi' }], persistent: true, sessionKey: 'conv-i1' },
      () => {},
    )
    expect(manager.interrupt(runId)).toBe(true)
    expect(ctrl.interrupted).toBe(1)
    // interrupt는 턴만 중단 — 세션 유지 → abort 여전히 가능
    expect(manager.abort(runId)).toBe(true)
  })

  it('IT2: 미존재 runId interrupt → false (no-op)', () => {
    const manager = createRunManager()
    expect(manager.interrupt('nope')).toBe(false)
  })

  it('PS6: persistent run 스트림 종료(input close) → 레지스트리 정리', async () => {
    const ctrl = makeControllableRun()
    const { backend } = makeBackend(ctrl.run)
    const manager = createRunManager()
    const runId = await manager.start(
      backend,
      { messages: [{ role: 'user', content: 'hi' }], persistent: true, sessionKey: 'conv-5' },
      () => {},
    )
    ctrl.emit({ type: 'done', origin: 'user' })
    await wait()
    ctrl.end()                                // 세션 스트림 자연 종료
    await wait()
    expect(manager.abort(runId)).toBe(false)  // 정리됨
  })
})
