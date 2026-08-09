import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../../02_Project/00_Source/main/01_agents/claudeStream'
import { RunEventNormalizer } from '../../../02_Project/00_Source/main/01_agents/eventNormalizer'
import type { AgentEvent } from '../../../02_Project/00_Source/shared/agentEvents'

type ThinkingEvent = Extract<AgentEvent, { type: 'thinking' }>
type ThinkingDeltaEvent = Extract<AgentEvent, { type: 'thinking_delta' }>

const FULL_THINKING =
  '사용자 요청을 먼저 분해했다.  핵심은 두 가지다.\n' +
  '첫째, 입력 전문을 절단 없이 보존해야 한다(90자 oneLine 요약은 손실이 크다).\n' +
  '둘째, thinking_delta 증분을 라이브로 이어붙여 진행이 멈춘 듯 보이지 않게 한다.\n' +
  '이 두 요구를 종합하면 접이식 전문 블록과 증분 스트리밍이 답이다.'

describe('gap1-p06 A1 사고 전문 보존 (90자 oneLine 절단 아님)', () => {
  it('assistant thinking 블록(>90자·개행 포함) → AgentEventThinking.text 전문 동일', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: FULL_THINKING }],
      },
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'thinking', text: FULL_THINKING },
    ])
  })

  it('전문 보존 명세: text 길이 > 90 · 마지막 문장까지 보존(절단 흔적 없음)', () => {
    const obj = {
      type: 'assistant',
      message: { role: 'assistant', content: [{ type: 'thinking', thinking: FULL_THINKING }] },
    }
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(1)
    const ev = events[0] as ThinkingEvent
    expect(ev.text.length).toBeGreaterThan(90)
    expect(ev.text).toContain('접이식 전문 블록과 증분 스트리밍이 답이다')
    expect(ev.text).not.toContain('…')
  })
})

describe('gap1-p06 A2 thinking_delta 정규화 (stream_event content_block_delta)', () => {
  it('content_block_delta.thinking_delta → [{thinking_delta, text}]', () => {
    const obj = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: '증분텍스트' },
      },
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'thinking_delta', text: '증분텍스트' },
    ])
  })

  it('빈 thinking 증분("")은 skip → [] (text_delta 빈 문자열 skip과 동일 관례)', () => {
    const obj = {
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: '' },
      },
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([])
  })
})

describe('gap1-p06 A3 thinking_tokens 정규화 (system, 러닝토탈 estimated_tokens)', () => {
  it('system thinking_tokens → [{thinking_delta, estimatedTokens: 러닝토탈}]', () => {
    const obj = {
      type: 'system',
      subtype: 'thinking_tokens',
      estimated_tokens: 1234,
      estimated_tokens_delta: 56,
      uuid: 'u',
      session_id: 's',
    }
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'thinking_delta', estimatedTokens: 1234 },
    ])
  })

  it('러닝토탈(estimated_tokens) 사용 — 증분(estimated_tokens_delta)이 아님을 고정', () => {
    const obj = {
      type: 'system',
      subtype: 'thinking_tokens',
      estimated_tokens: 1234,
      estimated_tokens_delta: 56,
      uuid: 'u',
      session_id: 's',
    }
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(1)
    const ev = events[0] as ThinkingDeltaEvent
    expect(ev.estimatedTokens).toBe(1234)
    expect(ev.estimatedTokens).not.toBe(56)
  })
})

describe('gap1-p06 B thinking_delta eventNormalizer 통과 (parentToolId 없음)', () => {
  it('stream_event thinking_delta → process().events에 그대로 흘러나옴', () => {
    const norm = new RunEventNormalizer('r-p06-a')
    const { events } = norm.process({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: '증분텍스트' },
      },
    })
    const deltas = events.filter((e) => e.type === 'thinking_delta') as ThinkingDeltaEvent[]
    expect(deltas).toEqual<ThinkingDeltaEvent[]>([{ type: 'thinking_delta', text: '증분텍스트' }])
    expect((deltas[0] as { parentToolId?: string }).parentToolId).toBeUndefined()
  })

  it('system thinking_tokens → process().events에 estimatedTokens delta로 흘러나옴', () => {
    const norm = new RunEventNormalizer('r-p06-b')
    const { events } = norm.process({
      type: 'system',
      subtype: 'thinking_tokens',
      estimated_tokens: 1234,
      estimated_tokens_delta: 56,
      uuid: 'u',
      session_id: 's',
    })
    const deltas = events.filter((e) => e.type === 'thinking_delta') as ThinkingDeltaEvent[]
    expect(deltas).toEqual<ThinkingDeltaEvent[]>([{ type: 'thinking_delta', estimatedTokens: 1234 }])
  })
})
