import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventDone } from '../../../02_Project/00_Source/shared/agentEvents'
import { mkResult as mkResultFixture } from './helpers/sdkFixtures'

const mkResult = (turnLabel = 'turn') => mkResultFixture({ result: turnLabel })

describe('BF3-P03 — push μs창 경합: idle-close 판정 이후·입력 gen 종료 이전 도착한 push', () => {
  it('경합 창에 도착한 push가 유실되지 않고 turn2로 처리된다(게이트로 순서 고정, setTimeout 없음)', async () => {
    let releaseSecondPull: (() => void) | null = null
    const secondPullGate = new Promise<void>((resolve) => {
      releaseSecondPull = resolve
    })
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      await secondPullGate

      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('turn2-raced')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '활동 없는 대화(경합 유도)' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let pushedOnce = false
    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'done' && !pushedOnce) {
        pushedOnce = true
        run.push('경합 중 도착한 push')
        releaseSecondPull!()
      }
    }

    expect(secondPullDone).toBe(false)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(2)
    expect((dones[0] as AgentEventDone).origin).toBe('user')
    expect((dones[1] as AgentEventDone).origin).toBe('user')
  })

  it('회귀 — 잔여 push 없는 정상 idle-close는 여전히 자연종료된다(경합 없음, abort 불필요)', async () => {
    let secondPullDone: boolean | undefined = undefined

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkResult('turn1')

      const second = await inputIter.next()
      secondPullDone = second.done
      if (!second.done) yield mkResult('unexpected-turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '활동 없는 대화(정상 종료)' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    expect(secondPullDone).toBe(true)
    const dones = events.filter((e) => e.type === 'done')
    expect(dones.length).toBe(1)
    expect((dones[0] as AgentEventDone).origin).toBe('user')
  })
})
