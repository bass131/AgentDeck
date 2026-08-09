import { describe, it, expect, beforeEach } from 'vitest'
import {
  nextRunTag,
  modelDisplay,
  REFUSAL_CATEGORY_LABEL,
  fallbackNotice,
  RunEventNormalizer,
} from '../../../02_Project/00_Source/main/01_agents/eventNormalizer'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

describe('nextRunTag()', () => {
  it('호출마다 고유 태그를 반환한다', () => {
    const a = nextRunTag()
    const b = nextRunTag()
    expect(a).not.toBe(b)
  })

  it("반환값은 'r'로 시작하고 정수가 이어진다", () => {
    const tag = nextRunTag()
    expect(tag).toMatch(/^r\d+$/)
  })

  it('연속 호출 시 값이 단조 증가한다', () => {
    const t1 = nextRunTag()
    const t2 = nextRunTag()
    const n1 = parseInt(t1.slice(1), 10)
    const n2 = parseInt(t2.slice(1), 10)
    expect(n2).toBeGreaterThan(n1)
  })
})

describe('modelDisplay()', () => {
  it("'claude-opus-4-8' → 'Opus 4.8'", () => {
    expect(modelDisplay('claude-opus-4-8')).toBe('Opus 4.8')
  })

  it("'claude-sonnet-4-6' → 'Sonnet 4.6'", () => {
    expect(modelDisplay('claude-sonnet-4-6')).toBe('Sonnet 4.6')
  })

  it("'claude-haiku-4-5' → 'Haiku 4.5'", () => {
    expect(modelDisplay('claude-haiku-4-5')).toBe('Haiku 4.5')
  })

  it("'claude-fable-5' → 'Fable 5'", () => {
    expect(modelDisplay('claude-fable-5')).toBe('Fable 5')
  })

  it('빈 문자열 → 다른 모델', () => {
    expect(modelDisplay('')).toBe('다른 모델')
  })

  it('알 수 없는 id → 원본 문자열 반환', () => {
    expect(modelDisplay('gpt-4o')).toBe('gpt-4o')
  })

  it('undefined → 다른 모델', () => {
    expect(modelDisplay(undefined)).toBe('다른 모델')
  })
})

describe('REFUSAL_CATEGORY_LABEL', () => {
  it("'cyber' → '사이버 보안'", () => {
    expect(REFUSAL_CATEGORY_LABEL['cyber']).toBe('사이버 보안')
  })

  it("'bio' → '생물학'", () => {
    expect(REFUSAL_CATEGORY_LABEL['bio']).toBe('생물학')
  })
})

describe('fallbackNotice()', () => {
  it('from/to/category 모두 제공 시 한국어 배너 생성', () => {
    const text = fallbackNotice('claude-opus-4-8', 'claude-sonnet-4-6', 'cyber')
    expect(text).toContain('Opus 4.8')
    expect(text).toContain('Sonnet 4.6')
    expect(text).toContain('사이버 보안')
  })

  it('category 없으면 분류 언급 생략', () => {
    const text = fallbackNotice('claude-opus-4-8', 'claude-sonnet-4-6', null)
    expect(text).not.toContain('감지 분류')
    expect(text).toContain('Opus 4.8')
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
  return {
    type: 'tool_result',
    tool_use_id: id,
    content,
    ...(isError ? { is_error: true } : {}),
  }
}

function streamTextDelta(text: string) {
  return {
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } }
  }
}

function streamContentBlockStart() {
  return {
    type: 'stream_event',
    event: { type: 'content_block_start', content_block: { type: 'text', text: '' } }
  }
}

function resultMsg(isError = false) {
  return {
    type: 'result',
    subtype: isError ? 'error_during_execution' : 'success',
    is_error: isError,
    usage: { input_tokens: 10, output_tokens: 5 },
  }
}

describe('RunEventNormalizer', () => {
  let norm: RunEventNormalizer
  const TAG = 'r-test'

  beforeEach(() => {
    norm = new RunEventNormalizer(TAG)
  })

  describe('model_refusal_fallback 시스템 메시지', () => {
    it('직접 경로: model-fallback 이벤트를 emit하고 done=null 반환', () => {
      const msg = {
        type: 'system',
        subtype: 'model_refusal_fallback',
        original_model: 'claude-opus-4-8',
        fallback_model: 'claude-sonnet-4-6',
        api_refusal_category: 'cyber',
      }
      const result = norm.process(msg)
      expect(result.done).toBeNull()
      expect(result.events).toHaveLength(1)
      expect(result.events[0].type).toBe('model-fallback')
      const ev = result.events[0] as Extract<AgentEvent, { type: 'model-fallback' }>
      expect(ev.fromModel).toBe('claude-opus-4-8')
      expect(ev.toModel).toBe('claude-sonnet-4-6')
      expect(ev.retractMessageId).toBeNull()
    })

    it('dedup 경로: incrementPendingFallback 후 같은 메시지 → 이벤트 없음, 카운터 감소', () => {
      norm.incrementPendingFallback()
      const msg = {
        type: 'system',
        subtype: 'model_refusal_fallback',
        original_model: 'claude-opus-4-8',
        fallback_model: 'claude-sonnet-4-6',
      }
      const result = norm.process(msg)
      expect(result.events).toHaveLength(0)
      const result2 = norm.process(msg)
      expect(result2.events).toHaveLength(1)
    })
  })

  describe('content_block_start stream_event', () => {
    it('curTextId 리셋: content_block_start 처리 후 다음 text 이벤트는 새 id를 받는다', () => {
      const delta1 = streamTextDelta('Hello')
      const r1 = norm.process(delta1)
      const firstId = (r1.events[0] as Extract<AgentEvent, { type: 'text' }>).messageId
      expect(firstId).toBeTruthy()

      norm.process(streamContentBlockStart())

      const delta2 = streamTextDelta('World')
      const r2 = norm.process(delta2)
      const secondId = (r2.events[0] as Extract<AgentEvent, { type: 'text' }>).messageId
      expect(secondId).toBeTruthy()
      expect(secondId).not.toBe(firstId)
    })
  })

  describe('done 이벤트 보류', () => {
    it('result success → events에 done 없고 NormResult.done으로 반환', () => {
      const result = norm.process(resultMsg(false))
      expect(result.events.every(e => e.type !== 'done')).toBe(true)
      expect(result.done).not.toBeNull()
      expect(result.done!.type).toBe('done')
    })

    it('result error → error 이벤트는 events에 포함, done은 NormResult.done으로 반환', () => {
      const result = norm.process(resultMsg(true))
      expect(result.events.some(e => e.type === 'error')).toBe(true)
      expect(result.done).not.toBeNull()
      expect(result.done!.type).toBe('done')
      expect(result.events.some(e => e.type === 'done')).toBe(false)
    })
  })

  describe('session 이벤트', () => {
    it('system init → session 이벤트 즉시 추가', () => {
      const msg = {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-abc',
        tools: [],
      }
      const result = norm.process(msg)
      const sessionEvt = result.events.find(e => e.type === 'session')
      expect(sessionEvt).toBeDefined()
    })
  })

  describe('Task* 처리', () => {
    it('TaskCreate → tool_call suppress, todos emit', () => {
      const msg = assistantMsg([toolUse('tc1', 'TaskCreate', { subject: '작업 A' })])
      const result = norm.process(msg)
      expect(result.events.some(e => e.type === 'tool_call')).toBe(false)
      const todos = result.events.find(e => e.type === 'todos') as Extract<AgentEvent, { type: 'todos' }> | undefined
      expect(todos).toBeDefined()
      expect(todos!.todos).toHaveLength(1)
      expect(todos!.todos[0].label).toBe('작업 A')
      expect(todos!.todos[0].status).toBe('planned')
    })

    it('TaskCreate 후 TaskUpdate → todos 상태 갱신', () => {
      const id1 = norm.process(assistantMsg([toolUse('tc1', 'TaskCreate', { subject: '작업 A' })]))
      const firstTaskId = (id1.events.find(e => e.type === 'todos') as Extract<AgentEvent, { type: 'todos' }>).todos[0].id
      const r2 = norm.process(assistantMsg([toolUse('tc2', 'TaskUpdate', { taskId: firstTaskId, status: 'in_progress' })]))
      const todos = r2.events.find(e => e.type === 'todos') as Extract<AgentEvent, { type: 'todos' }>
      expect(todos.todos[0].status).toBe('running')
    })

    it('Task* tool_result → suppress (events에 tool_result 없음)', () => {
      norm.process(assistantMsg([toolUse('tc1', 'TaskCreate', { subject: '작업 A' })]))
      const result = norm.process(userMsg([toolResult('tc1', [{ type: 'text', text: 'ok' }])]))
      expect(result.events.some(e => e.type === 'tool_result')).toBe(false)
    })
  })

  describe('orchestration 처리', () => {
    it('orchestration 이벤트 후 해당 id의 tool_result → suppress', () => {
      const r1 = norm.process(assistantMsg([toolUse('wf1', 'Workflow', { description: 'test workflow' })]))
      expect(r1.events.some(e => e.type === 'orchestration')).toBe(true)

      const r2 = norm.process(userMsg([toolResult('wf1', [{ type: 'text', text: 'Workflow launched in background.' }])]))
      expect(r2.events.some(e => e.type === 'tool_result')).toBe(false)
    })

    it('다른 id의 tool_result → suppress 안 함', () => {
      norm.process(assistantMsg([toolUse('wf1', 'Workflow', { description: 'test' })]))

      const r = norm.process(userMsg([toolResult('other1', [{ type: 'text', text: 'result' }])]))
      expect(r.events.some(e => e.type === 'tool_result')).toBe(true)
    })
  })

  describe('text 이벤트 messageId 부여', () => {
    it('full text → messageId 발급(curTextId 추적)', () => {
      const r = norm.process(assistantMsg([{ type: 'text', text: 'Hello' }]))
      const textEvt = r.events.find(e => e.type === 'text') as Extract<AgentEvent, { type: 'text' }> | undefined
      expect(textEvt).toBeDefined()
      expect(textEvt!.messageId).toBeTruthy()
    })

    it('stream text delta → messageId 발급 + streamedThisMsg=true', () => {
      const r = norm.process(streamTextDelta('Hello'))
      const textEvt = r.events.find(e => e.type === 'text') as Extract<AgentEvent, { type: 'text' }> | undefined
      expect(textEvt).toBeDefined()
      expect(textEvt!.messageId).toBeTruthy()
    })

    it('stream delta 후 full text → full text suppress(중복 버블 방지)', () => {
      norm.process(streamTextDelta('streamed delta'))

      const r = norm.process(assistantMsg([{ type: 'text', text: 'same content' }]))
      expect(r.events.some(e => e.type === 'text')).toBe(false)
    })

    it('tool_call 후 text → 새 messageId(경계 리셋)', () => {
      const r1 = norm.process(assistantMsg([{ type: 'text', text: '첫 텍스트' }]))
      const id1 = (r1.events.find(e => e.type === 'text') as Extract<AgentEvent, { type: 'text' }>).messageId

      norm.process(assistantMsg([toolUse('t1', 'bash', { command: 'ls' })]))

      const r2 = norm.process(assistantMsg([{ type: 'text', text: '두 번째 텍스트' }]))
      const id2 = (r2.events.find(e => e.type === 'text') as Extract<AgentEvent, { type: 'text' }>).messageId
      expect(id2).not.toBe(id1)
    })
  })

  describe('thinking 이벤트 dedup', () => {
    it('스트리밍 없으면 full thinking → emit', () => {
      const msg = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: '생각중' }] } }
      const r = norm.process(msg)
      expect(r.events.some(e => e.type === 'thinking')).toBe(true)
    })

    it('stream delta 후 full thinking → suppress', () => {
      norm.process(streamTextDelta('streamed'))
      const msg = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: '생각중' }] } }
      const r = norm.process(msg)
      expect(r.events.some(e => e.type === 'thinking')).toBe(false)
    })
  })

  describe('서브에이전트 early-skip', () => {
    it('parentToolId 있는 text → 즉시 emit, 경계 상태 건드리지 않음', () => {
      norm.process(streamTextDelta('메인 스트리밍 텍스트'))
      const mainId = norm.curTextId
      expect(mainId).toBeTruthy()

      const subMsg = {
        type: 'assistant',
        parent_tool_use_id: 'parent-tool-1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: '서브에이전트 텍스트' }]
        }
      }
      norm.process(subMsg)
      expect(norm.curTextId).toBe(mainId)
    })
  })

  describe('assistant 경계 리셋', () => {
    it('일반 assistant 메시지 후 curTextId=null, resetStreaming 상태 초기화', () => {
      norm.process(streamTextDelta('hi'))
      norm.process({ type: 'assistant', message: { role: 'assistant', content: [] } })
      const r = norm.process(assistantMsg([{ type: 'text', text: '새 메시지' }]))
      expect(r.events.some(e => e.type === 'text')).toBe(true)
    })
  })

  describe('Cron 루프 추적', () => {
    it('CronCreate tool_result 성공 → loops 이벤트 emit', () => {
      norm.process(assistantMsg([toolUse('cron1', 'CronCreate', { prompt: '매분마다 실행', cron: '* * * * *' })]))

      const r = norm.process({
        type: 'user',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'cron1',
            content: 'Scheduled recurring job abc1234 (Every minute). Session-only mode.',
          }]
        }
      })
      const loopsEvt = r.events.find(e => e.type === 'loops') as Extract<AgentEvent, { type: 'loops' }> | undefined
      expect(loopsEvt).toBeDefined()
      expect(loopsEvt!.loops.length).toBeGreaterThan(0)
      expect(loopsEvt!.loops[0].summary).toContain('매분마다')
    })

    it('CronDelete tool_call → 루프 제거 + loops 이벤트 emit', () => {
      norm.process(assistantMsg([toolUse('cron1', 'CronCreate', { prompt: '테스트', cron: '* * * * *' })]))
      norm.process({
        type: 'user',
        message: {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: 'cron1',
            content: 'Scheduled recurring job abc1234 (Every minute). Session-only mode.',
          }]
        }
      })

      const r = norm.process(assistantMsg([toolUse('del1', 'CronDelete', { id: 'abc1234' })]))
      const loopsEvt = r.events.find(e => e.type === 'loops') as Extract<AgentEvent, { type: 'loops' }> | undefined
      expect(loopsEvt).toBeDefined()
      expect(loopsEvt!.loops).toHaveLength(0)
    })
  })

  describe('접근자 및 뮤테이터', () => {
    it('curTextId: stream delta 처리 후 접근 가능', () => {
      norm.process(streamTextDelta('hello'))
      expect(norm.curTextId).toBeTruthy()
    })

    it('resetCurTextId: curTextId를 null로 리셋', () => {
      norm.process(streamTextDelta('hello'))
      expect(norm.curTextId).toBeTruthy()
      norm.resetCurTextId()
      expect(norm.curTextId).toBeNull()
    })

    it('incrementPendingFallback: dedup 동작 확인', () => {
      norm.incrementPendingFallback()
      const msg = {
        type: 'system',
        subtype: 'model_refusal_fallback',
        original_model: 'claude-opus-4-8',
        fallback_model: 'claude-sonnet-4-6',
      }
      const r = norm.process(msg)
      expect(r.events).toHaveLength(0)
    })

    it('resetStreaming: 스트리밍 상태 초기화', () => {
      norm.process(streamTextDelta('hi'))
      norm.resetStreaming()
      const r = norm.process(assistantMsg([{ type: 'text', text: '새 콘텐츠' }]))
      expect(r.events.some(e => e.type === 'text')).toBe(true)
    })
  })

  describe('abortCleanup()', () => {
    it('상태 클리어 후 빈 배열(loops 없을 때)', () => {
      const evts = norm.abortCleanup()
      expect(evts).toHaveLength(0)
    })

    it('activeLoops 있으면 loops:{loops:[]} 이벤트 반환', () => {
      norm.process(assistantMsg([toolUse('c1', 'CronCreate', { prompt: 'test', cron: '* * * * *' })]))
      norm.process({
        type: 'user',
        message: { role: 'user', content: [{
          type: 'tool_result', tool_use_id: 'c1',
          content: 'Scheduled recurring job ff123456 (Every minute). Session-only mode.',
        }] }
      })

      const evts = norm.abortCleanup()
      expect(evts).toHaveLength(1)
      expect(evts[0].type).toBe('loops')
      expect((evts[0] as Extract<AgentEvent, { type: 'loops' }>).loops).toHaveLength(0)
    })
  })

  describe('singlePumpCleanup()', () => {
    it('상태 정리 후 streamedThisMsg 리셋 확인', () => {
      norm.process(streamTextDelta('hi'))
      expect(norm.curTextId).toBeTruthy()
      norm.singlePumpCleanup()
      const r = norm.process(assistantMsg([{ type: 'text', text: '새 메시지' }]))
      expect(r.events.some(e => e.type === 'text')).toBe(true)
    })
  })

  describe('persistentPumpCleanup()', () => {
    it('loops 없으면 빈 배열', () => {
      const evts = norm.persistentPumpCleanup()
      expect(evts).toHaveLength(0)
    })

    it('activeLoops 있으면 loops:{loops:[]} 이벤트 반환', () => {
      norm.process(assistantMsg([toolUse('c1', 'CronCreate', { prompt: 'test', cron: '* * * * *' })]))
      norm.process({
        type: 'user',
        message: { role: 'user', content: [{
          type: 'tool_result', tool_use_id: 'c1',
          content: 'Scheduled recurring job bb789abc (Every minute). Session-only mode.',
        }] }
      })

      const evts = norm.persistentPumpCleanup()
      expect(evts).toHaveLength(1)
      expect(evts[0].type).toBe('loops')
    })
  })
})
