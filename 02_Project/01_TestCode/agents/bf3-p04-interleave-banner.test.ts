import { describe, it, expect, beforeEach } from 'vitest'
import { RunEventNormalizer } from '../../../02_Project/00_Source/main/01_agents/eventNormalizer'
import { CronTracker } from '../../../02_Project/00_Source/main/01_agents/progressTrackers'
import { ClaudeCodeBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventLoops, AgentEventDone } from '../../../02_Project/00_Source/shared/agentEvents'

describe('CronTracker.onTurnEnd(origin) — 인터리빙 게이팅 (직접 계층)', () => {
  it('[BF3-P04 RED였던 시나리오] origin=user 턴(재예약 없음)은 armed wakeup을 소거하지 않는다', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    expect(c.onTurnEnd('cron')).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)

    const events = c.onTurnEnd('user')
    expect(events).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)
  })

  it('양방향 단언 (ii) — 인터리빙 이후 실제 cron 턴에서 재예약 없으면 여전히 정상 소거된다', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd('cron')
    c.onTurnEnd('user')

    const events = c.onTurnEnd('cron')
    expect(events.length).toBe(1)
    expect((events[0] as { loops: unknown[] }).loops).toEqual([])
    expect(c.hasActiveLoops()).toBe(false)
  })

  it('연속 사용자 인터리빙 여러 번에도 슬롯이 계속 보존된다(1회 인터리빙 한정 아님)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd('cron')
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)
  })

  it('인터리빙 턴 자체가 재예약(ScheduleWakeup 재호출)하면 그 예약도 정상 반영된다', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd('cron')

    c.recordWakeupPending('id2', { delaySeconds: 600, reason: 'B(사용자 요청 재조정)' })
    const resolveEvents = c.resolveWakeupPending('id2', true)
    expect((resolveEvents[0] as { loops: { summary: string }[] }).loops[0].summary).toBe('B(사용자 요청 재조정)')

    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.hasActiveLoops()).toBe(true)
  })

  it('origin 인자 생략(기본값) — 기존 21건 하위호환: 무조건 cron 취급(기존 거동 그대로)', () => {
    const c = new CronTracker()
    c.recordWakeupPending('id1', { delaySeconds: 270, reason: 'A' })
    c.resolveWakeupPending('id1', true)
    c.onTurnEnd()
    expect(c.hasActiveLoops()).toBe(true)
    const events = c.onTurnEnd()
    expect(events.length).toBe(1)
    expect(c.hasActiveLoops()).toBe(false)
  })

  it('애초에 armed wakeup 없는 상태에서 origin=user 종료 → 무변화(no-op)', () => {
    const c = new CronTracker()
    expect(c.onTurnEnd('user')).toEqual([])
    expect(c.onTurnEnd('cron')).toEqual([])
  })
})

function assistantMsg(contents: unknown[]) {
  return { type: 'assistant', message: { role: 'assistant', content: contents } }
}
function userMsg(contents: unknown[]) {
  return { type: 'user', message: { role: 'user', content: contents } }
}
function toolUse(id: string, name: string, input: unknown) {
  return { type: 'tool_use', id, name, input }
}
function toolResult(id: string, content: unknown[], isError = false) {
  return { type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) }
}
function resultMsg(isError = false) {
  return {
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    is_error: isError,
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

describe('RunEventNormalizer.process(msg, turnOrigin) — eventNormalizer 배선', () => {
  let norm: RunEventNormalizer
  beforeEach(() => { norm = new RunEventNormalizer('r-test') })

  function armWakeup(id: string, summary: string) {
    norm.process(assistantMsg([toolUse(id, 'ScheduleWakeup', { delaySeconds: 270, reason: summary })]), 'cron')
    norm.process(userMsg([toolResult(id, [])]), 'cron')
  }

  it('인터리빙 origin=user done → loops 소거 이벤트 없음 + hasLoopActivity() true 유지(양방향 iii)', () => {
    armWakeup('wk-1', 'A')
    norm.process(resultMsg(), 'cron')

    const r = norm.process(resultMsg(), 'user')
    const loopsEvt = r.events.find(e => e.type === 'loops')
    expect(loopsEvt).toBeUndefined()
    expect(norm.hasLoopActivity()).toBe(true)
  })

  it('양방향 — 실제 cron 턴에서 재예약 없으면 loops:[] 소거 + hasLoopActivity() false(좀비 없음)', () => {
    armWakeup('wk-1', 'A')
    norm.process(resultMsg(), 'cron')
    norm.process(resultMsg(), 'user')

    const r = norm.process(resultMsg(), 'cron')
    const loopsEvt = r.events.find(e => e.type === 'loops') as AgentEventLoops | undefined
    expect(loopsEvt).toBeDefined()
    expect(loopsEvt!.loops).toEqual([])
    expect(norm.hasLoopActivity()).toBe(false)
  })

  it('origin 인자 생략 시 기존 process(msg) 호출부 하위호환(기본 cron 취급)', () => {
    armWakeup('wk-1', 'A')
    norm.process(resultMsg())
    const r = norm.process(resultMsg())
    const loopsEvt = r.events.find(e => e.type === 'loops') as AgentEventLoops | undefined
    expect(loopsEvt).toBeDefined()
    expect(loopsEvt!.loops).toEqual([])
  })
})

function mkResult(turnLabel = 'turn') {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: turnLabel,
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkWakeupToolUse(toolUseId: string, delaySeconds: number, reason: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: `msg_${toolUseId}`,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'tool_use', id: toolUseId, name: 'ScheduleWakeup', input: { delaySeconds, reason, prompt: '' } }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkWakeupToolResult(toolUseId: string, content: string) {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content }]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

function mkAssistant(text: string, msgId: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: msgId,
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-${msgId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

describe('BF3-P04 파이프라인 통합 — ClaudeCodeBackend 지속세션 인터리빙 재현', () => {
  it('턴1 예약 → 턴2(cron 재예약, 체인 확립) → 턴3(사용자 인터리빙, 재예약 없음) → 턴4(cron, 재예약 없음=진짜 종료)', async () => {
    const queryFn: QueryFn = async function* (p) {
      const prompt = (p.prompt as unknown) as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()

      const first = await inputIter.next()
      if (first.done) return
      yield mkWakeupToolUse('wk-1', 270, 'A')
      yield mkWakeupToolResult('wk-1', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn1')

      yield mkWakeupToolUse('wk-2', 270, 'B')
      yield mkWakeupToolResult('wk-2', 'Next wakeup scheduled (in 270s).')
      yield mkResult('turn2')

      const third = await inputIter.next()
      if (third.done) return
      yield mkAssistant('네, 확인했습니다', 'msg_interleave')
      yield mkResult('turn3')

      yield mkAssistant('더 이상 모니터링할 필요 없어 보입니다. 종료합니다.', 'msg_end')
      yield mkResult('turn4')
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '루프 시작' }],
      persistent: true,
    })

    const events: AgentEvent[] = []
    let doneCount = 0
    let pushedInterleave = false

    for await (const e of run.events) {
      events.push(e)
      if (e.type === 'done') {
        doneCount++
        if (doneCount === 2 && !pushedInterleave) {
          pushedInterleave = true
          run.push('중간에 끼어든 사용자 메시지')
        }
      }
    }

    const dones = events.filter((e): e is AgentEventDone => e.type === 'done')
    expect(dones.length).toBe(4)
    expect(dones[0].origin).toBe('user')
    expect(dones[1].origin).toBe('cron')
    expect(dones[2].origin).toBe('user')
    expect(dones[3].origin).toBe('cron')

    const idxDone3 = events.indexOf(dones[2])
    const idxDone4 = events.indexOf(dones[3])

    const loopsBeforeDone3 = events.slice(0, idxDone3).filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsBeforeDone3.length).toBeGreaterThan(0)
    for (const le of loopsBeforeDone3) expect(le.loops.length).toBeGreaterThan(0)

    const before4 = events[idxDone4 - 1]
    expect(before4.type).toBe('loops')
    expect((before4 as AgentEventLoops).loops).toEqual([])

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents[loopsEvents.length - 1].loops).toEqual([])
  })
})
