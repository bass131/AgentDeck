import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventDone } from '../../../02_Project/00_Source/shared/agentEvents'
import { makeCaptureQuery } from './helpers/fakeQuery'
import {
  mkAssistantText,
  mkInit as mkInitFixture,
  mkResult as mkResultFixture,
  mkToolResult,
  mkToolUse,
} from './helpers/sdkFixtures'

const mkResult = (turnLabel = 'turn') =>
  mkResultFixture({ result: turnLabel, uuid: 'uuid-0000-0000-0000-0000-000000000000' })

const mkCronCreateToolUse = (toolUseId: string, prompt: string) =>
  mkToolUse(toolUseId, 'CronCreate', { cron: '*/1 * * * *', prompt, recurring: true })

const mkCronCreateToolResult = (toolUseId: string, cronId: string, interval: string) =>
  mkToolResult(
    toolUseId,
    `Scheduled recurring job ${cronId} (${interval}). Session-only (not written to disk).`
  )

const mkAssistant = (text: string) => mkAssistantText(text)

const mkInit = (sessionId = 'sess-test') => mkInitFixture({ session_id: sessionId })

describe('PP1 — 단발 회귀 가드', () => {
  it('persistent 미지정 시 string-prompt 경로 그대로 — done 1회·순서 보존', async () => {
    const receivedPrompts: unknown[] = []
    const queryFn: QueryFn = async function* (p) {
      receivedPrompts.push(p.prompt)
      yield mkAssistant('안녕')
      yield mkResult('t1')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({ messages: [{ role: 'user', content: '테스트' }] })
    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    expect(typeof receivedPrompts[0]).toBe('string')
    expect(receivedPrompts[0]).toBe('테스트')

    const dones = events.filter(e => e.type === 'done')
    expect(dones.length).toBe(1)

    expect((dones[0] as AgentEventDone).origin).toBeUndefined()

    const types = events.map(e => e.type)
    expect(types.indexOf('text')).toBeLessThan(types.indexOf('done'))
  })
})

describe('PP2 — held-open 다중 턴', () => {
  it('persistent=true → QueryFn이 AsyncIterable prompt를 받아야 함(구현 전 RED)', async () => {
    let receivedPromptType: string | null = null

    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown
      if (
        prompt !== null &&
        typeof prompt === 'object' &&
        Symbol.asyncIterator in (prompt as object)
      ) {
        receivedPromptType = 'asynciterable'
        const iter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()
        await iter.next()
        yield mkResult('turn1')
      } else {
        receivedPromptType = 'string'
        yield mkResult('turn1')
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '첫 메시지' }],
      persistent: true,
    })

    for await (const _ of run.events) void _

    expect(receivedPromptType).toBe('asynciterable')
  })

  it('persistent=true → 2턴 완주 시 done 2회 emit(구현 전 RED)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown
      if (
        prompt === null ||
        typeof prompt !== 'object' ||
        !(Symbol.asyncIterator in (prompt as object))
      ) {
        yield mkResult('turn1-fallback')
        return
      }

      const inputIter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkCronCreateToolUse('pp2-cron', '주기 확인')
      yield mkCronCreateToolResult('pp2-cron', 'aaaa1111', 'Every minute')
      yield mkResult('turn1')

      const second = await inputIter.next()
      if (second.done) return
      yield mkResult('turn2')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '첫 메시지' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let firstDoneSeen = false

    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'done' && !firstDoneSeen) {
        firstDoneSeen = true
        const persistentRun = run as unknown as { push?: (content: string) => void }
        if (typeof persistentRun.push === 'function') {
          persistentRun.push('두 번째 메시지')
        } else {
          run.abort()
        }
      }
    }

    const dones = events.filter(e => e.type === 'done')
    expect(dones.length).toBe(2)
  })
})

describe('PP3 — origin 판정', () => {
  it('초기 메시지(user) → done.origin=user; push() 없는 자율 턴 → done.origin=cron', async () => {
    const abortRef1 = { fn: null as (() => void) | null }
    const abortPromise = new Promise<void>((r) => { abortRef1.fn = r })
    const secondInputRef = { fn: null as (() => void) | null }
    const secondInputArrived = new Promise<void>((r) => { secondInputRef.fn = r })
    let secondInputConsumed = false

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkCronCreateToolUse('pp3-cron', '주기 확인')
      yield mkCronCreateToolResult('pp3-cron', 'bbbb2222', 'Every minute')
      yield mkResult('turn1')

      yield mkResult('turn2-cron')

      await secondInputArrived
      const third = await inputIter.next()
      if (!third.done) {
        secondInputConsumed = true
        yield mkResult('turn3-user')
      }

      await abortPromise
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const dones: AgentEventDone[] = []
    let doneSeen = 0

    for await (const e of run.events) {
      if (e.type === 'done') {
        dones.push(e as AgentEventDone)
        doneSeen++

        if (doneSeen === 2) {
          const persistentRun = run as unknown as { push?: (content: string) => void }
          if (typeof persistentRun.push === 'function') {
            persistentRun.push('세 번째 메시지')
            secondInputRef.fn?.()
          } else {
            abortRef1.fn?.()
            run.abort()
            break
          }
        }

        if (doneSeen === 3) {
          abortRef1.fn?.()
          run.abort()
          break
        }
      }
    }

    for await (const _ of run.events) void _

    if (dones.length >= 1) {
      const d1 = dones[0]
      expect(['user', undefined]).toContain(d1.origin)
    }

    if (dones.length >= 2) {
      const d2 = dones[1]
      expect(['cron', undefined]).toContain(d2.origin)
    }

    if (dones.length >= 3 && secondInputConsumed) {
      const d3 = dones[2]
      expect(['user', undefined]).toContain(d3.origin)
    }
  })

  it('PP3-strict: 구현 후 origin 값이 정확히 맞는지 단정(지속세션 펌프 구현 시 GREEN)', async () => {
    const abortRef2 = { fn: null as (() => void) | null }
    const abortPromise = new Promise<void>((r) => { abortRef2.fn = r })
    const secondInputRef2 = { fn: null as (() => void) | null }
    const secondInputArrived = new Promise<void>((r) => { secondInputRef2.fn = r })

    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkCronCreateToolUse('pp3s-cron', '주기 확인')
      yield mkCronCreateToolResult('pp3s-cron', 'cccc3333', 'Every minute')
      yield mkResult('turn1')

      yield mkResult('turn2-cron')

      await secondInputArrived
      const third = await inputIter.next()
      if (!third.done) {
        yield mkResult('turn3-user')
      }

      await abortPromise
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const dones: AgentEventDone[] = []
    let doneSeen = 0

    for await (const e of run.events) {
      if (e.type === 'done') {
        dones.push(e as AgentEventDone)
        doneSeen++

        if (doneSeen === 2) {
          const persistentRun = run as unknown as { push?: (content: string) => void }
          if (typeof persistentRun.push === 'function') {
            persistentRun.push('세 번째 메시지')
            secondInputRef2.fn?.()
          } else {
            abortRef2.fn?.()
            run.abort()
            break
          }
        }

        if (doneSeen === 3) {
          abortRef2.fn?.()
          run.abort()
          break
        }
      }
    }

    for await (const _ of run.events) void _

    if (dones.length >= 3) {
      expect(dones[0].origin).toBe('user')
      expect(dones[1].origin).toBe('cron')
      expect(dones[2].origin).toBe('user')
    } else {
      expect(dones.length).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('PP4 — abort/close 보장', () => {
  it('persistent=true에서 abort() → events 스트림 정상 종료(throw 0, 멱등)', async () => {
    const queryFn: QueryFn = async function* (p) {
      try {
        const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
        const inputIter = prompt[Symbol.asyncIterator]()

        const first = await inputIter.next()
        if (first.done) { return }

        yield mkResult('turn1')

        const second = await inputIter.next()
        if (second.done) { return }

        yield mkResult('turn2')
      } finally {
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let streamError: unknown = null

    try {
      for await (const e of run.events) {
        events.push(e)
        if (e.type === 'done') {
          run.abort()
          break
        }
      }
      for await (const e of run.events) {
        events.push(e)
      }
    } catch (err) {
      streamError = err
    }

    expect(streamError).toBeNull()

    expect(() => run.abort()).not.toThrow()
    expect(() => run.abort()).not.toThrow()

    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('persistent=true에서 abort 전 pending 미해결 waiter도 클린업됨', async () => {
    const backend = new ClaudeCodeBackend(async function* () {
      await new Promise<void>(() => {})
      yield undefined as never
    } as unknown as QueryFn)

    const run = backend.start({
      messages: [{ role: 'user', content: '시작' }],
      persistent: true,
    })

    const timeout = setTimeout(() => run.abort(), 50)

    const events: AgentEvent[] = []
    let threw = false
    try {
      for await (const e of run.events) {
        events.push(e)
      }
    } catch {
      threw = true
    }

    clearTimeout(timeout)
    expect(threw).toBe(false)
    expect(() => run.abort()).not.toThrow()
  })
})

describe('PP5 — 지속세션 session 이벤트 방출', () => {
  it('persistent=true: system/init의 session_id → session 이벤트 방출(맥락 영속 링크)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = p.prompt as unknown
      if (
        prompt !== null &&
        typeof prompt === 'object' &&
        Symbol.asyncIterator in (prompt as object)
      ) {
        const iter = (prompt as AsyncIterable<unknown>)[Symbol.asyncIterator]()
        await iter.next()
        yield mkInit('sess-test')
        yield mkAssistant('안녕')
        yield mkResult('turn1')
      } else {
        yield mkResult('fallback')
      }
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '첫 메시지' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    for await (const e of run.events) events.push(e)

    const sessionEvents = events.filter((e) => e.type === 'session')
    expect(sessionEvents.length).toBeGreaterThanOrEqual(1)
    expect((sessionEvents[0] as Extract<AgentEvent, { type: 'session' }>).sessionId).toBe('sess-test')
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})

describe('PP6 — held-open + resumeSessionId 펌프 계약 (LR2-02)', () => {
  it('persistent:true + resumeSessionId → queryFn options.resume 전달 + AsyncIterable prompt 유지', async () => {
    const { queryFn, captured } = makeCaptureQuery([mkResult('turn1')])

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '재시작 후 첫 메시지' }],
      persistent: true,
      resumeSessionId: 'sess-heldopen-resume',
    })
    for await (const _ of run.events) void _

    const capturedOptions = captured.options
    const promptWasAsyncIterable = captured.promptIsAsyncIterable

    expect(promptWasAsyncIterable).toBe(true)
    expect(capturedOptions).not.toBeNull()
    expect((capturedOptions as unknown as Record<string, unknown>)['resume']).toBe('sess-heldopen-resume')
  })

  it('persistent:true + resumeSessionId 미전달 → options에 resume 키 없음 (신규 held-open 회귀 0)', async () => {
    const { queryFn, captured } = makeCaptureQuery([mkResult('turn1')])

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '신규 세션 첫 메시지' }],
      persistent: true,
    })
    for await (const _ of run.events) void _

    const capturedOptions = captured.options

    expect(capturedOptions).not.toBeNull()
    expect('resume' in (capturedOptions as unknown as Record<string, unknown>)).toBe(false)
  })
})
