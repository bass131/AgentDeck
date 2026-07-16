/**
 * gap1-p06-thinking-fulltext.test.ts — GAP1 P06 확장 사고 전문·delta 정규화 (TDD RED)
 *
 * 목표: claude-stream.ts `mapClaudeStreamLine`이
 *   (A1) 사고 전문을 90자 oneLine 요약으로 절단하지 않고 전문 보존하고,
 *   (A2) stream_event content_block_delta.thinking_delta 증분을 공통
 *        AgentEventThinkingDelta(text)로 정규화하고,
 *   (A3) system 'thinking_tokens'의 러닝토탈 estimated_tokens를 thinking_delta(estimatedTokens)로
 *        표면화하는지 못박는다. 구현은 후속 agent-backend Worker 몫 — 이 파일은 실패하는
 *        계약(RED)을 먼저 둔다.
 *
 * (B) eventNormalizer 통과: 위 thinking_delta 이벤트가 RunEventNormalizer.process()를
 *   거쳐 소비자 events로 드롭 없이 흘러나오는지(메인 스트림 = parentToolId 없음) 단정.
 *
 * 픽스처 근거(SDK 선언 실측 — 임의 발명 금지):
 *   - ThinkingDelta = { thinking: string; type: 'thinking_delta' }
 *     (@anthropic-ai/sdk messages.d.ts:1178). stream_event 봉투는 기존 text_delta 경로와 동일
 *     구조(content_block_delta.delta.type 판별).
 *   - SDKThinkingTokensMessage = { type:'system', subtype:'thinking_tokens',
 *     estimated_tokens:number, estimated_tokens_delta:number, uuid, session_id }
 *     (claude-agent-sdk sdk.d.ts:4263). estimated_tokens=러닝토탈(스피너용 근사),
 *     estimated_tokens_delta=증분 — 계약은 러닝토탈 estimated_tokens를 쓴다.
 *
 * 현재(RED) 이유:
 *   - A1: mapAssistantContent가 thinking을 oneLine(thinking, 90)으로 절단(claude-stream.ts:252).
 *   - A2: case 'stream_event'가 text_delta만 매핑하고 그 외(thinking_delta 포함)는 []
 *         (claude-stream.ts:754).
 *   - A3: case 'system'에 'thinking_tokens' subtype 분기가 없어 "그 외 system → []"
 *         (claude-stream.ts:730)로 드롭.
 */
import { describe, it, expect } from 'vitest'
import { mapClaudeStreamLine } from '../../../02.Source/main/01_agents/claude-stream'
import { RunEventNormalizer } from '../../../02.Source/main/01_agents/eventNormalizer'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

type ThinkingEvent = Extract<AgentEvent, { type: 'thinking' }>
type ThinkingDeltaEvent = Extract<AgentEvent, { type: 'thinking_delta' }>

// 전문 보존 검증용 — 90자를 크게 넘고, 개행·내부 이중공백을 포함(oneLine이 \s+ → ' '로
// 붕괴시키고 89자에서 절단하므로 verbatim 동일성이 이 두 손실을 모두 잡아낸다). 앞뒤 공백
// 없음(트림 여부와 무관하게 내부 구조 보존만 단정).
const FULL_THINKING =
  '사용자 요청을 먼저 분해했다.  핵심은 두 가지다.\n' +
  '첫째, 입력 전문을 절단 없이 보존해야 한다(90자 oneLine 요약은 손실이 크다).\n' +
  '둘째, thinking_delta 증분을 라이브로 이어붙여 진행이 멈춘 듯 보이지 않게 한다.\n' +
  '이 두 요구를 종합하면 접이식 전문 블록과 증분 스트리밍이 답이다.'

// ── A1. 사고 전문 보존 (I-01) ─────────────────────────────────────────────────────

describe('gap1-p06 A1 사고 전문 보존 (90자 oneLine 절단 아님)', () => {
  it('assistant thinking 블록(>90자·개행 포함) → AgentEventThinking.text 전문 동일', () => {
    const obj = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [{ type: 'thinking', thinking: FULL_THINKING }],
      },
    }
    // RED: 현재 oneLine(thinking, 90)이 \s+ 붕괴 + 89자 절단 → 전문과 불일치.
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
    // RED: 현재 text는 89자 + '…'로 절단돼 길이 ≤ 90, 마지막 문장 소실.
    expect(ev.text.length).toBeGreaterThan(90)
    expect(ev.text).toContain('접이식 전문 블록과 증분 스트리밍이 답이다')
    expect(ev.text).not.toContain('…')
  })
})

// ── A2. thinking_delta (stream_event) 정규화 (S-09) ────────────────────────────────

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
    // RED: 현재 case 'stream_event'는 text_delta만 매핑, thinking_delta는 [] 드롭.
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'thinking_delta', text: '증분텍스트' },
    ])
  })

  it('빈 thinking 증분("")은 skip → [] (text_delta 빈 문자열 skip과 동일 관례)', () => {
    // 대조군 성격 — 구현 시 빈 증분을 흘리지 않아야 UI에 빈 delta 소음이 없다.
    // (현재도 [] 이지만 "드롭됨"이 아니라 "빈 증분 스킵"이라는 의도된 [] 로 고정되어야 한다.)
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

// ── A3. thinking_tokens (system) 정규화 (S-09, redacted 진행률) ──────────────────────

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
    // RED: 현재 case 'system'에 thinking_tokens 분기 없음 → "그 외 system → []" 드롭.
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
    // RED: 현재 미매핑. 구현 후 러닝토탈 1234여야 하며 증분 56이면 안 된다.
    expect(ev.estimatedTokens).toBe(1234)
    expect(ev.estimatedTokens).not.toBe(56)
  })
})

// ── B. eventNormalizer 통과 (드롭 안 됨, 메인 스트림) ────────────────────────────────

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
    // RED: mapClaudeStreamLine이 아직 thinking_delta를 내지 않으므로 events에 없음(드롭).
    expect(deltas).toEqual<ThinkingDeltaEvent[]>([{ type: 'thinking_delta', text: '증분텍스트' }])
    // 메인 스트림 = parentToolId 없음(서브에이전트 라우팅 아님).
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
    // RED: mapClaudeStreamLine이 아직 thinking_tokens를 내지 않으므로 events에 없음(드롭).
    expect(deltas).toEqual<ThinkingDeltaEvent[]>([{ type: 'thinking_delta', estimatedTokens: 1234 }])
  })
})
