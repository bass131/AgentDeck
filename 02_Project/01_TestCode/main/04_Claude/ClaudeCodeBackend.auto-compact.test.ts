// M11 G2 — M06 Backlog 27. 「앱에 AutoCompact가 없다」 — 실측(SDK 0.3.325, 앱과 같은 설정 소스):
// getContextUsage({ detail: 'summary' })가 isAutoCompactEnabled=true, autoCompactThreshold=967000(창 1M)을 돌려줬다.
// SDK가 이미 자동 압축을 하고(압축 경계·진행 표시는 앱이 그린다) 앱은 그 사실을 보이지 않았을 뿐이다.
// 첫 턴 결과 뒤 한 번 묻고 compact settings 사건으로 알린다 — done을 늦추지 않는다.
import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import type { QueryFn } from '@main/04_Claude/ClaudeCodeBackend'
import type { AgentEvent } from '../../../../02_Project/00_Source/shared/agentEvents'

function mkResult() {
  return {
    type: 'result' as const, subtype: 'success' as const, is_error: false, duration_ms: 1, duration_api_ms: 1, num_turns: 1,
    result: 'turn', stop_reason: 'end_turn', total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {}, permission_denials: [], errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000027' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-compact',
  }
}

function compactQueryFn(getContextUsage: () => Promise<unknown>, calls: { n: number }, turns = 2): QueryFn {
  return (p) => {
    const gen = (async function* () {
      const inputIter = (p.prompt as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      for (let i = 0; i < turns; i++) {
        const next = await inputIter.next()
        if (next.done) return
        yield mkResult()
      }
      await inputIter.next()
    })()
    return Object.assign(gen, {
      getContextUsage: (opts: unknown): Promise<unknown> => {
        calls.n++
        expect(opts).toEqual({ detail: 'summary' })
        return getContextUsage()
      },
    })
  }
}

async function collect(run: { events: AsyncIterable<AgentEvent> }, until: (e: AgentEvent[]) => boolean, ms = 3000): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  void (async () => { for await (const e of run.events) events.push(e) })()
  const deadline = Date.now() + ms
  while (!until(events) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5))
  return events
}

const settingsOf = (events: AgentEvent[]) => events.filter((e) => e.type === 'compact' && e.kind === 'settings')

describe('자동 압축 상태 알리기', () => {
  it('첫 턴 결과 뒤 getContextUsage로 한 번 묻고 compact settings 사건을 낸다', async () => {
    const calls = { n: 0 }
    const run = new ClaudeCodeBackend(compactQueryFn(async () => ({ isAutoCompactEnabled: true, autoCompactThreshold: 967_000, totalTokens: 1 }), calls)).start({
      messages: [{ role: 'user', content: 'x' }],
      persistent: true,
    })
    try {
      const events = await collect(run, (es) => settingsOf(es).length > 0)
      expect(settingsOf(events)).toEqual([{ type: 'compact', kind: 'settings', autoCompactEnabled: true, thresholdTokens: 967_000 }])
      run.push('두 번째')
      await collect(run, () => false, 50)
      expect(calls.n).toBe(1)
    } finally {
      run.abort()
    }
  })

  it('한 턴짜리 실행도 결과를 받은 자리에서 묻는다', async () => {
    const calls = { n: 0 }
    const queryFn: QueryFn = () => {
      const gen = (async function* () { yield mkResult() })()
      return Object.assign(gen, {
        getContextUsage: async (): Promise<unknown> => { calls.n++; return { isAutoCompactEnabled: true, autoCompactThreshold: 167_000 } },
      })
    }
    const run = new ClaudeCodeBackend(queryFn).start({ messages: [{ role: 'user', content: 'x' }] })
    const events = await collect(run, (es) => es.some((e) => e.type === 'done') && settingsOf(es).length > 0, 500)
    expect(calls.n).toBe(1)
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })

  it('꺼져 있으면 꺼짐을 알리고, 문턱이 없으면 싣지 않는다', async () => {
    const calls = { n: 0 }
    const run = new ClaudeCodeBackend(compactQueryFn(async () => ({ isAutoCompactEnabled: false }), calls, 1)).start({
      messages: [{ role: 'user', content: 'x' }],
      persistent: true,
    })
    try {
      const events = await collect(run, (es) => settingsOf(es).length > 0)
      expect(settingsOf(events)).toEqual([{ type: 'compact', kind: 'settings', autoCompactEnabled: false }])
    } finally {
      run.abort()
    }
  })

  // 시간 상한은 2초 — 영원히 답하지 않는 경우도 done을 막지 않는다
  it('응답이 없거나 거절되거나 모양이 틀리면 아무것도 내지 않고 done은 그대로 온다', async () => {
    for (const reply of [() => new Promise<unknown>(() => {}), () => Promise.reject(new Error('closed')), async () => ({ nope: 1 })]) {
      const calls = { n: 0 }
      const run = new ClaudeCodeBackend(compactQueryFn(reply, calls, 1)).start({
        messages: [{ role: 'user', content: 'x' }],
        persistent: true,
      })
      try {
        const events = await collect(run, (es) => es.some((e) => e.type === 'done'))
        expect(events.some((e) => e.type === 'done')).toBe(true)
        expect(settingsOf(events)).toEqual([])
      } finally {
        run.abort()
      }
    }
  })
})
