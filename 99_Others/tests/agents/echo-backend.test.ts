import { describe, it, expect } from 'vitest'
import { EchoBackend } from '../../../02.Source/main/01_agents/EchoBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// EchoBackend: e2e 결정론 전용 백엔드(실 claude CLI 없이 핵심 루프 검증).
// 스크립트된 AgentEvent 시퀀스를 emit한다.

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = []
  for await (const e of events) out.push(e)
  return out
}

describe('EchoBackend', () => {
  it('isAvailable=true, version 반환', async () => {
    const be = new EchoBackend()
    expect(await be.isAvailable()).toBe(true)
    expect(await be.version()).toBeTruthy()
  })

  it('스크립트 이벤트 시퀀스를 순서대로 emit한다', async () => {
    const be = new EchoBackend()
    const run = be.start({ messages: [{ role: 'user', content: 'hello' }] })
    const events = await collect(run.events)
    expect(events.map((e) => e.type)).toEqual([
      'text',
      'text',
      'tool_call',
      'tool_result',
      'file_changed',
      'done'
    ])
    // 사용자 입력을 echo
    const text = events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta).join('')
    expect(text).toContain('hello')
    // file_changed가 sample.ts 가리킴
    const fc = events.find((e) => e.type === 'file_changed') as { path: string } | undefined
    expect(fc?.path).toBe('sample.ts')
  })

  it('abort 시 조기 종료(좀비 없음)', async () => {
    const be = new EchoBackend()
    const run = be.start({ messages: [{ role: 'user', content: 'x' }] })
    run.abort()
    const events = await collect(run.events)
    expect(events.length).toBeLessThan(6)
  })
})
