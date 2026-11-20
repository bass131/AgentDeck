// M11 G2 — M06 Backlog 24. effort가 세션을 만들 때 정해져 대화 중에 바뀌지 않았다.
// 공개 타입 Query.applyFlagSettings({ effortLevel })로 지속 세션의 effort를 바꾼다.
// 실측(SDK 0.3.325, haiku): 첫 턴 뒤 applyFlagSettings({effortLevel:'low'}) → 다음 턴 CLAUDE_EFFORT=low,
// 같은 세션의 settings.permissions.deny 규칙(Bash(echo denyprobe*))은 그대로 막았다(최상위 키 얕은 병합).
// 단계 고르기는 시작 때와 같은 규칙(runArgs.runEffortFor)이다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ handlers: new Map<string, (...args: unknown[]) => unknown>() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (...a: unknown[]) => unknown): void => {
      h.handlers.set(ch, fn)
    },
  },
}))

vi.mock('@main/00_App/registry', () => ({
  getBackend: (): unknown => ({}),
}))

import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import type { QueryFn } from '@main/04_Claude/ClaudeCodeBackend'
import type { AgentBackend, AgentRun, AgentRunInput } from '@main/03_Agent/AgentBackend'
import { createRunManager, type RunManager } from '@main/03_Agent/agentRuns'
import { registerAgentHandlers } from '@main/01_Ipc/handlers/agent'
import { setCurrentModelRows } from '@main/04_Claude/modelListProvider'
import { FALLBACK_MODELS } from '@shared/03_Agent/models/knownModels'
import { IPC_CHANNELS } from '../../../../02_Project/00_Source/shared/ipcContract'
import { API_ROUTES } from '../../../../02_Project/00_Source/shared/01_Ipc/apiRoutes'
import type { AgentEvent } from '../../../../02_Project/00_Source/shared/agentEvents'
import type { BackendId } from '../../../../02_Project/00_Source/shared/ipcContract'
import { SDK_MODEL_ROWS } from '../../shared/00_Helpers/sdkModelRows'

beforeEach(() => setCurrentModelRows(SDK_MODEL_ROWS))
afterEach(() => setCurrentModelRows(FALLBACK_MODELS))

function mkResult() {
  return {
    type: 'result' as const, subtype: 'success' as const, is_error: false, duration_ms: 1, duration_api_ms: 1, num_turns: 1,
    result: 'turn', stop_reason: 'end_turn', total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {}, permission_denials: [], errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000024' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-effort',
  }
}

function effortQueryFn(calls: unknown[], opts: { rejecting?: boolean } = {}): QueryFn {
  return (p) => {
    const gen = (async function* () {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkResult()
      await inputIter.next()
    })()
    return Object.assign(gen, {
      setModel: (): unknown => Promise.resolve(),
      applyFlagSettings: (s: unknown): unknown => {
        calls.push(s)
        return opts.rejecting ? Promise.reject(new Error('거부(모의)')) : Promise.resolve()
      },
    })
  }
}

type RunWithEffort = AgentRun & { setEffort?: (effort: string) => void }

async function startPersistent(calls: unknown[], req: Partial<AgentRunInput> = {}, opts: { rejecting?: boolean } = {}) {
  const run = new ClaudeCodeBackend(effortQueryFn(calls, opts)).start({
    messages: [{ role: 'user', content: 'effort' }],
    persistent: true,
    model: 'claude-opus-5-5',
    effort: 'max',
    ...req,
  }) as RunWithEffort
  const events: AgentEvent[] = []
  void (async () => { for await (const e of run.events) events.push(e) })()
  const deadline = Date.now() + 3000
  while (!events.some((e) => e.type === 'done') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5))
  return run
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

describe('ClaudeAgentRun.setEffort — 지속 세션의 effort 전환', () => {
  it('바뀐 단계를 applyFlagSettings({ effortLevel })로 보낸다 — 같은 단계는 다시 보내지 않는다', async () => {
    const calls: unknown[] = []
    const run = await startPersistent(calls)
    try {
      expect(typeof run.setEffort).toBe('function')
      run.setEffort!('max')
      run.setEffort!('low')
      run.setEffort!('low')
      await tick()
      expect(calls).toEqual([{ effortLevel: 'low' }])
    } finally {
      run.abort()
    }
  })

  it('모델이 받지 않는 단계는 아래로 내리고, 단계가 없는 모델에는 보내지 않는다', async () => {
    const calls: unknown[] = []
    const run = await startPersistent(calls, { model: 'claude-opus-4-6', effort: 'low' })
    try {
      run.setEffort!('xhigh')
      await tick()
      expect(calls).toEqual([{ effortLevel: 'high' }])
    } finally {
      run.abort()
    }
    const none: unknown[] = []
    const haiku = await startPersistent(none, { model: 'claude-haiku-4-5-20251001', effort: 'low' })
    try {
      haiku.setEffort!('max')
      await tick()
      expect(none).toEqual([])
    } finally {
      haiku.abort()
    }
  })

  it('실행 중 모델을 바꾸면 새 모델의 단계로 내린다', async () => {
    const calls: unknown[] = []
    const run = await startPersistent(calls) as RunWithEffort & { setModel?: (m: string) => void }
    try {
      run.setModel?.('claude-opus-4-6')
      run.setEffort!('xhigh')
      await tick()
      expect(calls).toEqual([{ effortLevel: 'high' }])
    } finally {
      run.abort()
    }
  })

  it('거절되면 되돌려 같은 단계를 다시 보낼 수 있다', async () => {
    const calls: unknown[] = []
    const run = await startPersistent(calls, {}, { rejecting: true })
    try {
      run.setEffort!('low')
      await tick()
      run.setEffort!('low')
      await tick()
      expect(calls).toEqual([{ effortLevel: 'low' }, { effortLevel: 'low' }])
    } finally {
      run.abort()
    }
  })

  // 한 턴짜리 실행은 턴마다 새 query를 effort와 함께 연다 — 전환할 세션이 없다
  it('지속 세션이 아니면 아무것도 보내지 않는다', async () => {
    const calls: unknown[] = []
    const run = await startPersistent(calls, { persistent: false })
    try {
      run.setEffort?.('low')
      await tick()
      expect(calls).toEqual([])
    } finally {
      run.abort()
    }
  })
})

function spyBackend(effortCalls: string[], order: string[]): AgentBackend {
  return {
    id: 'claude-code' as BackendId,
    isAvailable: async () => true,
    version: async () => null,
    latestVersion: async () => null,
    listSupportedCommands: () => [],
    start: (): AgentRun & { setEffort: (e: string) => void } => ({
      events: (async function* () {
        await new Promise<void>((r) => setTimeout(r, 300))
        yield { type: 'done' } as AgentEvent
      })(),
      abort: () => {},
      interrupt: () => {},
      push: (c) => { order.push(`push:${String(c)}`) },
      respond: () => {},
      setEffort: (e) => { effortCalls.push(e); order.push(`effort:${e}`) },
    }),
  }
}

describe('RunManager — effort 라우팅', () => {
  it('재사용 턴의 req.effort를 push보다 먼저 setEffort로 넘긴다(턴 사이 전환)', async () => {
    const manager = createRunManager()
    const calls: string[] = []
    const order: string[] = []
    const backend = spyBackend(calls, order)
    try {
      const base = { persistent: true, sessionKey: 'cv-effort', model: 'claude-opus-5-5' }
      await manager.start(backend, { ...base, messages: [{ role: 'user', content: 'first' }], effort: 'max' }, () => {})
      await manager.start(backend, { ...base, messages: [{ role: 'user', content: 'second' }], effort: 'low' }, () => {})
      expect(calls).toEqual(['low'])
      expect(order.indexOf('effort:low')).toBeLessThan(order.indexOf('push:second'))
      // effort가 없는 재사용 턴은 건드리지 않는다
      await manager.start(backend, { ...base, messages: [{ role: 'user', content: 'third' }] }, () => {})
      expect(calls).toEqual(['low'])
    } finally {
      manager.closeAll()
    }
  })

  it('setEffort(runId)는 활성 실행에만 닿는다', async () => {
    const manager = createRunManager()
    const calls: string[] = []
    try {
      const runId = await manager.start(spyBackend(calls, []), { messages: [{ role: 'user', content: 'x' }] }, () => {})
      expect(manager.setEffort(runId, 'medium')).toBe(true)
      expect(manager.setEffort('nope', 'medium')).toBe(false)
      expect(calls).toEqual(['medium'])
      manager.abort(runId)
      expect(manager.setEffort(runId, 'low')).toBe(false)
      expect(calls).toEqual(['medium'])
    } finally {
      manager.closeAll()
    }
  })
})

describe('agent.setEffort IPC', () => {
  function register(setEffort: (runId: string, effort: string) => boolean) {
    h.handlers.clear()
    registerAgentHandlers({ state: { win: null }, runManager: { setEffort } as unknown as RunManager })
    return h.handlers.get(IPC_CHANNELS.AGENT_SET_EFFORT)!
  }

  it('채널 이름이 계약과 preload 라우트 표에 있다', () => {
    expect(IPC_CHANNELS.AGENT_SET_EFFORT).toBe('agent.setEffort')
    expect(API_ROUTES.agent.setEffort.channel).toBe('agent.setEffort')
  })

  it('effort 단계만 받아 실행 관리자에 넘긴다', () => {
    const setEffort = vi.fn(() => true)
    const handler = register(setEffort)
    expect(handler({}, { runId: 'r1', effort: 'medium' })).toEqual({ ok: true })
    expect(setEffort).toHaveBeenCalledWith('r1', 'medium')
    for (const bad of [{ runId: 'r1', effort: 'turbo' }, { runId: 'r1', effort: 'minimal' }, { runId: '', effort: 'low' }, { runId: 'r1' }, null]) {
      expect(handler({}, bad), JSON.stringify(bad)).toEqual({ ok: false })
    }
    expect(setEffort).toHaveBeenCalledTimes(1)
  })

  it('끝난 실행이면 ok:false를 그대로 돌려준다', () => {
    const handler = register(() => false)
    expect(handler({}, { runId: 'gone', effort: 'low' })).toEqual({ ok: false })
  })
})
