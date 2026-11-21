import { describe, expect, it } from 'vitest'
import { mapClaudeStreamLine } from '@main/04_Claude/stream/claudeStream'
import { RunEventNormalizer } from '@main/04_Claude/stream/eventNormalizer'
import type { AgentEvent } from '@shared/agentEvents'

// SDK 0.3.325 실측 원시 사건(goal 4 결정 대장 [AI] 2026-11-21)
const MEASURED = {
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed', resetsAt: 1795518000, rateLimitType: 'seven_day', overageStatus: 'rejected',
    overageDisabledReason: 'org_level_disabled', isUsingOverage: false, unifiedWindows: { seven_day: { utilization: 0.41 } },
  },
  uuid: 'u1',
  session_id: 's1',
}

describe('한도 사건 옮기기', () => {
  it('실측 사건은 공개 칸만 옮긴다 — unifiedWindows의 비율은 utilization이 아니다', () => {
    expect(mapClaudeStreamLine(MEASURED)).toEqual<AgentEvent[]>([
      { type: 'rate_limit', status: 'allowed', resetsAt: 1795518000, rateLimitType: 'seven_day', isUsingOverage: false },
    ])
  })

  it('경고·초과 사용·사용률 칸을 옮기고, 모르는 status는 버린다', () => {
    const info = { status: 'allowed_warning', resetsAt: 1795250000, rateLimitType: 'five_hour', utilization: 0.92, overageInUse: true }
    expect(mapClaudeStreamLine({ type: 'rate_limit_event', rate_limit_info: info })).toEqual<AgentEvent[]>([
      { type: 'rate_limit', status: 'allowed_warning', resetsAt: 1795250000, rateLimitType: 'five_hour', utilization: 0.92, overageInUse: true },
    ])
    expect(mapClaudeStreamLine({ type: 'rate_limit_event', rate_limit_info: { status: 'weird' } })).toEqual([])
    expect(mapClaudeStreamLine({ type: 'rate_limit_event' })).toEqual([])
  })

  it('assistant 메시지의 error rate_limit은 한도 오류 사건이다', () => {
    const msg = { type: 'assistant', message: { content: [{ type: 'text', text: 'API Error: rate limit' }] }, parent_tool_use_id: null, error: 'rate_limit' }
    expect(mapClaudeStreamLine(msg)).toEqual<AgentEvent[]>([
      { type: 'text', delta: 'API Error: rate limit' },
      { type: 'rate_limit_error' },
    ])
    expect(mapClaudeStreamLine({ ...msg, error: 'overloaded' }).map((e) => e.type)).toEqual(['text'])
  })

  it('재시도 중인 api_retry의 rate_limit은 한도 오류가 아니다', () => {
    const retry = { type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 3, retry_delay_ms: 1000, error_status: 429, error: 'rate_limit' }
    expect(mapClaudeStreamLine(retry).map((e) => e.type)).toEqual(['api_retry'])
  })

  it('정규화기를 지나도 그대로 나온다', () => {
    const n = new RunEventNormalizer('t')
    expect(n.process(MEASURED).events.map((e) => e.type)).toEqual(['rate_limit'])
  })
})
