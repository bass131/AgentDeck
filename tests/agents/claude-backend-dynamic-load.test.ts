/**
 * claude-backend-dynamic-load.test.ts
 * ADR-018: ClaudeCodeBackend 동적 로드 통합 TDD
 *
 * 검증 항목:
 *   A. getDefaultQueryFn() — 활성 설치 버전 우선 → 번들 폴백
 *      A1. loadActiveQuery mock이 query 반환 → 그 query 사용
 *      A2. loadActiveQuery mock이 null 반환 → 번들 SDK import 사용
 *      A3. engine-versions 로드 자체 throw → 번들 폴백(throw 전파 금지)
 *   B. version() — 활성 버전 우선 → _resolvePackageVersion → SDK_VERSION
 *      B1. getVersionState mock active='0.4.0' → '0.4.0' 반환
 *      B2. getVersionState mock active=null → _resolvePackageVersion 값 반환
 *      B3. getVersionState throw → graceful 폴백(_resolvePackageVersion or SDK_VERSION)
 *   C. 회귀 0 — queryFn 직접 주입 시 engine-versions 경로 무관
 *      C1. queryFn 주입 → getDefaultQueryFn 미호출, events 정상 스트림
 *
 * 구현 노트:
 *   vi.doMock + vi.resetModules + dynamic re-import 방식으로 각 it마다 모듈을 재초기화.
 *   이 방식은 `getDefaultQueryFn()` 내부의 동적 `import('../engine-versions')`를
 *   intercept하는 데 확실하게 작동한다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QueryFn } from '../../src/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../src/shared/agent-events'

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

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

/** 모든 events를 배열로 수집 */
async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const ev of iterable) events.push(ev)
  return events
}

// 각 test 전에 모듈 캐시를 초기화해 mock이 충돌하지 않도록 함
beforeEach(() => {
  vi.resetModules()
})

// ── A. getDefaultQueryFn() 동적 로드 우선순위 ────────────────────────────────

describe('A. getDefaultQueryFn() — 활성 설치 버전 우선 → 번들 폴백', () => {

  it('A1. loadActiveQuery가 query를 반환하면 그 query를 사용한다', async () => {
    // engine-versions mock: loadActiveQuery → 커스텀 activeQuery 반환
    const activeQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('from-active-version')
      yield mkResultSuccess()
    }

    vi.doMock('../../src/main/engine-versions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(activeQuery),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '1.0.0',
        active: '1.2.0',
        installed: ['1.2.0'],
      }),
    }))

    // 모듈 재로드: mock 등록 이후에 import해야 mock이 적용됨
    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')

    // queryFn 미주입 → _queryFn = null → getDefaultQueryFn() 경로
    const backend = new ClaudeCodeBackend()
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

    const events = await collectEvents(run.events)

    // active query가 사용됐음을 확인
    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    expect((textEvents[0] as { type: 'text'; delta: string }).delta).toBe('from-active-version')
  })

  it('A2. loadActiveQuery가 null을 반환하면 번들 SDK import를 사용한다', async () => {
    // engine-versions mock: loadActiveQuery → null
    vi.doMock('../../src/main/engine-versions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '1.0.0',
        active: null,
        installed: [],
      }),
    }))

    // 번들 SDK mock: query를 커스텀 함수로 교체
    const bundleQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('from-bundle')
      yield mkResultSuccess()
    }
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: bundleQuery,
    }))

    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend()
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

    const events = await collectEvents(run.events)

    // 번들 query가 사용됐음을 확인
    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    expect((textEvents[0] as { type: 'text'; delta: string }).delta).toBe('from-bundle')
  })

  it('A3. engine-versions 로드 throw → 번들 폴백, throw 전파 금지', async () => {
    // engine-versions mock: loadActiveQuery가 throw
    vi.doMock('../../src/main/engine-versions', () => ({
      loadActiveQuery: vi.fn().mockRejectedValue(new Error('engine-versions 로드 실패')),
      getVersionState: vi.fn().mockImplementation(() => {
        throw new Error('engine-versions 로드 실패')
      }),
    }))

    // 번들 SDK mock
    const bundleQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('from-bundle-fallback')
      yield mkResultSuccess()
    }
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: bundleQuery,
    }))

    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend()

    let threwUnexpected = false
    let events: AgentEvent[] = []
    try {
      const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })
      events = await collectEvents(run.events)
    } catch {
      threwUnexpected = true
    }

    // getDefaultQueryFn 내부의 try/catch가 throw를 흡수해야 함
    expect(threwUnexpected).toBe(false)
    // done은 반드시 있어야 함 (번들 폴백이든 error+done이든)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })
})

// ── B. version() — 활성 버전 우선 ────────────────────────────────────────────

describe('B. version() — getVersionState active 우선 → _resolvePackageVersion → SDK_VERSION', () => {

  it('B1. getVersionState().active = "0.4.0" → version() = "0.4.0"', async () => {
    vi.doMock('../../src/main/engine-versions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '0.3.0',
        active: '0.4.0',
        installed: ['0.4.0'],
      }),
    }))

    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')
    // resolvePackageVersion은 번들 버전을 반환(active가 우선이므로 무시되어야 함)
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      resolvePackageVersion: () => '0.3.0',
    })

    const ver = await backend.version()
    // active='0.4.0'이 우선
    expect(ver).toBe('0.4.0')
  })

  it('B2. getVersionState().active = null → _resolvePackageVersion 값 반환', async () => {
    vi.doMock('../../src/main/engine-versions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: '0.3.0',
        active: null,
        installed: [],
      }),
    }))

    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend(undefined, undefined, undefined, {
      resolvePackageVersion: () => '0.3.100',
    })

    const ver = await backend.version()
    // active=null → _resolvePackageVersion 경로
    expect(ver).toBe('0.3.100')
  })

  it('B3. getVersionState() throw → graceful 폴백(_resolvePackageVersion 또는 SDK_VERSION)', async () => {
    vi.doMock('../../src/main/engine-versions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockImplementation(() => {
        throw new Error('electron 미초기화 (테스트용)')
      }),
    }))

    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')
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

    // getVersionState throw가 전파되면 안 됨
    expect(threwUnexpected).toBe(false)
    // 폴백 경로(_resolvePackageVersion)로 버전이 반환됨
    expect(ver).toBe('0.3.50')
  })
})

// ── C. 회귀 0 — queryFn 직접 주입 시 기존 동작 보존 ──────────────────────────

describe('C. 회귀 0 — queryFn 직접 주입 시 engine-versions 경로 무관', () => {

  it('C1. queryFn 주입 → getDefaultQueryFn 미호출, events 정상 스트림 (기존 동작 보존)', async () => {
    // engine-versions를 mock하지 않음 → 실 모듈 동작
    const injectedQuery = makeMockQueryFn([
      mkTextAssistant('injected'),
      mkResultSuccess(),
    ])

    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend(injectedQuery)
    const run = backend.start({ messages: [{ role: 'user', content: 'test' }] })

    const events = await collectEvents(run.events)

    // 주입된 queryFn이 그대로 사용됨
    const textEvents = events.filter(e => e.type === 'text')
    expect(textEvents.length).toBeGreaterThan(0)
    expect((textEvents[0] as { type: 'text'; delta: string }).delta).toBe('injected')
    expect(events.some(e => e.type === 'done')).toBe(true)
    expect(events.filter(e => e.type === 'error')).toHaveLength(0)
  })

  it('C2. active=null 상태(loadActiveQuery=null) → 번들 폴백, done 정상 (회귀 없음)', async () => {
    vi.doMock('../../src/main/engine-versions', () => ({
      loadActiveQuery: vi.fn().mockResolvedValue(null),
      getVersionState: vi.fn().mockReturnValue({
        package: '@anthropic-ai/claude-agent-sdk',
        bundled: null,
        active: null,
        installed: [],
      }),
    }))

    // 번들 SDK mock
    const bundleQuery: QueryFn = async function* (_params) {
      yield mkTextAssistant('hello-bundle')
      yield mkResultSuccess()
    }
    vi.doMock('@anthropic-ai/claude-agent-sdk', () => ({
      query: bundleQuery,
    }))

    const { ClaudeCodeBackend } = await import('../../src/main/01_agents/ClaudeCodeBackend')
    const backend = new ClaudeCodeBackend() // queryFn 미주입
    const run = backend.start({ messages: [{ role: 'user', content: 'hello' }] })

    const events = await collectEvents(run.events)

    // 번들 query가 사용됨 → text + done, error 없음
    expect(events.some(e => e.type === 'text')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
    expect(events.filter(e => e.type === 'error')).toHaveLength(0)
  })
})
