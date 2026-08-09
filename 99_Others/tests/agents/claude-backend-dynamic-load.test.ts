import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryFn } from '../../../02_Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02_Source/shared/agentEvents'

function mkResultSuccess() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 10,
    duration_api_ms: 8,
    num_turns: 1,
    result: 'ok',
    stop_reason: 'end_turn',
    total_cost_usd: 0,
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    modelUsage: {},
    permission_denials: [],
    errors: [],
    uuid: 'uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session',
  }
}

function mkTextAssistant(text: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_001',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text', text }],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'test-session',
  }
}

function makeMockQueryFn(messages: unknown[]): QueryFn {
  return async function* mockQuery(_params: { prompt: string; options?: unknown }) {
    for (const msg of messages) yield msg
  }
}

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const ev of iterable) events.push(ev)
  return events
}

beforeEach(() => {
  vi.resetModules()
})

describe('A. getDefaultQueryFn() — 활성 설치 버전 우선 → 번들 폴백', () => {

  it('A1. loadActiveQuery가 query를 반환하면 그 query를 사용한다', async () => {
    const activeQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('from-active-version')
      yield mkResultSuccess()
    }

    vi.doMock('../../../02_Source/main/07_engine/engineVersions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(activeQuery),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '1.0.0',
        active: '1.2.0',
        installed: ['1.2.0'],
      }),
    }))

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')

    const backend = new ClaudeCodeBackend()
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

    const events = await collectEvents(run.events)

    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    expect((textEvents[0] as { type: 'text'; delta: string }).delta).toBe('from-active-version')
  })

  it('A2. loadActiveQuery가 null을 반환하면 번들 SDK import를 사용한다', async () => {
    vi.doMock('../../../02_Source/main/07_engine/engineVersions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '1.0.0',
        active: null,
        installed: [],
      }),
    }))

    const bundleQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('from-bundle')
      yield mkResultSuccess()
    }
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: bundleQuery,
    }))

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend()
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

    const events = await collectEvents(run.events)

    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    expect((textEvents[0] as { type: 'text'; delta: string }).delta).toBe('from-bundle')
  })

  it('A3. engine-versions 로드 throw → 번들 폴백, throw 전파 금지', async () => {
    vi.doMock('../../../02_Source/main/07_engine/engineVersions', () => ({
      loadActiveQuery: vi.fn().mockRejectedValue(new Error('engine-versions 로드 실패')),
      getVersionState: vi.fn().mockImplementation(() => {
        throw new Error('engine-versions 로드 실패')
      }),
    }))

    const bundleQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('from-bundle-fallback')
      yield mkResultSuccess()
    }
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: bundleQuery,
    }))

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend()

    let threwUnexpected = false
    let events: AgentEvent[] = []
    try {
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      events = await collectEvents(run.events)
    } catch {
      threwUnexpected = true
    }

    expect(threwUnexpected).toBe(false)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })
})

describe('B. version() — getVersionState active 우선 → _resolvePackageVersion → SDK_VERSION', () => {

  it('B1. getVersionState().active = "0.4.0" → version() = "0.4.0"', async () => {
    vi.doMock('../../../02_Source/main/07_engine/engineVersions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '0.3.0',
        active: '0.4.0',
        installed: ['0.4.0'],
      }),
    }))

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      resolvePackageVersion: () => '0.3.0',
    })

    const ver = await backend.version()
    expect(ver).toBe('0.4.0')
  })

  it('B2. getVersionState().active = null → _resolvePackageVersion 값 반환', async () => {
    vi.doMock('../../../02_Source/main/07_engine/engineVersions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '0.3.0',
        active: null,
        installed: [],
      }),
    }))

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      resolvePackageVersion: () => '0.3.100',
    })

    const ver = await backend.version()
    expect(ver).toBe('0.3.100')
  })

  it('B3. getVersionState() throw → graceful 폴백(_resolvePackageVersion 또는 SDK_VERSION)', async () => {
    vi.doMock('../../../02_Source/main/07_engine/engineVersions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockImplementation(() => {
        throw new Error('electron 미초기화 (테스트용)')
      }),
    }))

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      resolvePackageVersion: () => '0.3.50',
    })

    let ver: string | null = null
    let threwUnexpected = false
    try {
      ver = await backend.version()
    } catch {
      threwUnexpected = true
    }

    expect(threwUnexpected).toBe(false)
    expect(ver).toBe('0.3.50')
  })
})

describe('C. 회귀 0 — queryFn 직접 주입 시 engine-versions 경로 무관', () => {

  it('C1. queryFn 주입 → getDefaultQueryFn 미호출, events 정상 스트림 (기존 동작 보존)', async () => {
    const injectedQuery = makeMockQueryFn([
      mkTextAssistant('injected'),
      mkResultSuccess(),
    ])

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend(injectedQuery)
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

    const events = await collectEvents(run.events)

    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    expect((textEvents[0] as { type: 'text'; delta: string }).delta).toBe('injected')
    expect(events.some(e => e.type === 'done')).toBe(true)
    expect(events.filter(e => e.type === 'error')).toHaveLength(0)
  })

  it('C2. active=null 상태(loadActiveQuery=null) → 번들 폴백, done 정상 (회귀 없음)', async () => {
    vi.doMock('../../../02_Source/main/07_engine/engineVersions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: null,
        active: null,
        installed: [],
      }),
    }))

    const bundleQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('hello-bundle')
      yield mkResultSuccess()
    }
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: bundleQuery,
    }))

    const { ClaudeCodeBackend } = await import('../../../02_Source/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend()
    const run = backend.start({ messages: [{ role: 'user', content: 'hello' }] })

    const events = await collectEvents(run.events)

    expect(events.some(e => e.type === 'text')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
    expect(events.filter(e => e.type === 'error')).toHaveLength(0)
  })
})
