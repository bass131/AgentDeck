/**
 * loop-tracking.test.ts — CronCreate/CronDelete 추적 → `loops` 이벤트 emit TDD
 *
 * 목표(5c): REPL 지속세션에서 Claude 내장 `/loop`가 SDK Cron 도구를 사용해 루프를
 * 등록/해제한다. 어댑터가 그 상태를 추적해 AgentEventLoops(`loops`)로 정규화.
 *
 * ADR-003 격리 확인:
 *  - 'CronCreate'/'CronDelete'/cron 표현식은 이 테스트 mock 내부(어댑터 계약 검증)에만.
 *  - 'loops'/'LoopInfo'는 공통 타입(agent-events.ts) — 중립.
 *
 * 데이터원 (프로브 실측):
 *  - CronCreate tool_use input: { cron:"*\/1 * * * *", prompt:"<작업내용>", recurring:true }
 *  - CronCreate tool_result content(string): "Scheduled recurring job cc2476aa (Every minute). Session-only ..."
 *    → id: job id 패턴 `job ([0-9a-f]+)` → cc2476aa
 *    → interval: 첫 괄호 `\(([^)]+)\)` → "Every minute"
 *  - CronDelete tool_use: input에서 id 추출(best-effort)
 *
 * TDD 케이스:
 *  LT1: CronCreate tool_use + tool_result → loops 이벤트 1개(파싱 검증)
 *  LT2: CronCreate 2개 → loops 스냅샷 2 항목. CronDelete 1개 → loops 1 항목으로 갱신.
 *  LT3: 빈/파싱 불가 result content(ok:true) → graceful(crash 0) + 보수 폴백 활성 등록
 *       (P02 🟡-2: idle-close 도입 후 "미추가"는 세션째 루프 사망으로 증폭 → tool id 폴백)
 *  LT4: summary sanitize(개행 제거·cap). 신뢰경계 필드만.
 *  LT5: 단발 경로 회귀 0 — 일반 text→tool→done 시퀀스에서 loops 이벤트 0개.
 *
 * 신뢰경계: 실 SDK 호출 0. mock 내부에 CronCreate/CronDelete 형상.
 */

import { describe, it, expect } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent, AgentEventLoops, LoopInfo } from '../../../02.Source/shared/agent-events'

// ── mock 픽스처 헬퍼 ─────────────────────────────────────────────────────────

/** result(done) SDK 메시지 픽스처 */
function mkResult() {
  return {
    type: 'result' as const,
    subtype: 'success' as const,
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result: 'done',
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

/**
 * CronCreate tool_use SDK 메시지 픽스처.
 * ADR-003: 'CronCreate' 리터럴은 어댑터 내부(어댑터 계약 검증)에만.
 * 여기선 어댑터가 올바르게 파싱하는지 검증하기 위해 mock 내부에서만 사용.
 */
function mkCronCreateToolUse(toolUseId: string, prompt: string, cron = '*/1 * * * *') {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_cron',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'CronCreate',
          input: { cron, prompt, recurring: true }
        }
      ],
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

/**
 * CronCreate tool_result SDK 메시지 픽스처.
 * content 형식: "Scheduled recurring job <hex_id> (<interval>). Session-only ..."
 */
function mkCronCreateToolResult(toolUseId: string, cronId: string, interval: string, extraText = '') {
  const content = `Scheduled recurring job ${cronId} (${interval}). Session-only (not written to disk).${extraText}`
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: content,
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/**
 * CronDelete tool_use SDK 메시지 픽스처.
 * input에 cronId 포함(best-effort 추출 대상).
 */
function mkCronDeleteToolUse(toolUseId: string, cronId: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_cron_del',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'CronDelete',
          input: { id: cronId }
        }
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-asst-del-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** tool_result SDK 메시지 픽스처 (CronDelete 등 단순 결과) */
function mkToolResult(toolUseId: string, content: string = 'ok') {
  return {
    type: 'user' as const,
    message: {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
        }
      ]
    },
    parent_tool_use_id: null,
    uuid: `uuid-user-res-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** 일반 text assistant 메시지 픽스처 */
function mkAssistant(text: string) {
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
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: 'uuid-asst-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** 일반 도구 tool_use assistant 메시지 픽스처 */
function mkBashToolUse(toolUseId: string, command: string) {
  return {
    type: 'assistant' as const,
    message: {
      id: 'msg_bash',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [
        {
          type: 'tool_use',
          id: toolUseId,
          name: 'Bash',
          input: { command }
        }
      ],
      model: 'claude-haiku-4-5-20251001',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 }
    },
    parent_tool_use_id: null,
    uuid: `uuid-bash-${toolUseId}` as `${string}-${string}-${string}-${string}-${string}`,
    session_id: 'sess-test',
  }
}

/** events 전체 수집 헬퍼 */
async function collectEvents(backend: ClaudeCodeBackend, req: Parameters<typeof backend.start>[0]): Promise<AgentEvent[]> {
  const run = backend.start(req)
  const events: AgentEvent[] = []
  for await (const e of run.events) {
    events.push(e)
  }
  return events
}

// ── LT1: CronCreate tool_use + tool_result → loops 이벤트 1개 ─────────────────

describe('LT1 — CronCreate → loops 이벤트 1개(파싱 검증)', () => {
  it('tool_use + tool_result 시퀀스 → loops 이벤트 1개, id/summary/interval 단언', async () => {
    const CRON_PROMPT = '매 분마다 상태 보고'
    const CRON_ID = 'cc2476aa'
    const INTERVAL = 'Every minute'

    const queryFn: QueryFn = async function* (_p) {
      // 1. CronCreate tool_use
      yield mkCronCreateToolUse('tool-1', CRON_PROMPT)
      // 2. CronCreate tool_result (실제 result 형식 미러)
      yield mkCronCreateToolResult('tool-1', CRON_ID, INTERVAL)
      // 3. result(done)
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 매 분마다 상태 보고' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')

    // loops 이벤트가 1개 이상 emit되어야 함
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    // 마지막 loops 스냅샷: 루프 1개
    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toHaveLength(1)

    const loop = lastLoops.loops[0] as LoopInfo
    // id: result content의 job hex id 파싱
    expect(loop.id).toBe(CRON_ID)
    // summary: CronCreate input.prompt에서 sanitize
    expect(loop.summary).toBe(CRON_PROMPT)
    // interval: result content의 첫 괄호 내용
    expect(loop.interval).toBe(INTERVAL)
  })
})

// ── LT2: CronCreate 2개 → 2항목, CronDelete → 1항목으로 갱신 ─────────────────

describe('LT2 — CronCreate 2개 + CronDelete 1개', () => {
  it('2개 CronCreate 후 loops 2항목, CronDelete 후 loops 1항목', async () => {
    const queryFn: QueryFn = async function* (_p) {
      // 루프1 생성
      yield mkCronCreateToolUse('tool-a', '작업A 반복')
      yield mkCronCreateToolResult('tool-a', 'aabbccdd', 'Every minute')
      // 루프2 생성
      yield mkCronCreateToolUse('tool-b', '작업B 반복', '*/5 * * * *')
      yield mkCronCreateToolResult('tool-b', 'eeff0011', 'Every 5 minutes')
      // 루프1 삭제 (aabbccdd)
      yield mkCronDeleteToolUse('tool-del', 'aabbccdd')
      yield mkToolResult('tool-del', 'Deleted job aabbccdd')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')

    // loops 이벤트가 최소 3번 나와야 함(Create×2 + Delete×1)
    expect(loopsEvents.length).toBeGreaterThanOrEqual(3)

    // Create 2번 후 스냅샷(루프1+루프2 모두 있어야 함)
    // loopsEvents 중 loops.length === 2인 스냅샷이 존재해야 함
    const twoLoopsSnapshot = loopsEvents.find(e => e.loops.length === 2)
    expect(twoLoopsSnapshot).toBeDefined()

    // Delete 후 최종 스냅샷: loops 1개(eeff0011만 남아야 함)
    const lastLoops = loopsEvents[loopsEvents.length - 1]
    expect(lastLoops.loops).toHaveLength(1)
    expect(lastLoops.loops[0].id).toBe('eeff0011')
  })
})

// ── LT3: 파싱 불가 result content → graceful + 보수 폴백 (P02 🟡-2) ─────────────

describe('LT3 — 파싱 불가 result content → graceful', () => {
  it('result content에 id 파싱 불가(ok:true) → crash 없음 + 보수 폴백(tool id 활성 등록)', async () => {
    const queryFn: QueryFn = async function* (_p) {
      // CronCreate tool_use
      yield mkCronCreateToolUse('tool-bad', '작업 내용')
      // 파싱 불가 result: "Scheduled recurring job" 패턴 없음 — 단 SDK 생성 자체는 성공(ok)
      yield mkToolResult('tool-bad', '파싱 불가 응답 — no job id here')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    let events: AgentEvent[] = []
    try {
      events = await collectEvents(backend, {
        messages: [{ role: 'user', content: '/loop 테스트' }]
      })
    } catch {
      threw = true
    }

    // crash 없어야 함
    expect(threw).toBe(false)

    // 보수 폴백(P02 🟡-2): ok인데 형식만 못 읽은 크론은 실재하므로 tool id로 활성 등록 —
    // hasActivity 유지(idle-close의 루프 사망 차단) + 배너 표시
    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)
    const last = loopsEvents[loopsEvents.length - 1]
    expect(last.loops.length).toBe(1)
    expect(last.loops[0].id).toBe('tool-bad')
    expect(last.loops[0].summary).toBe('작업 내용')
  })

  it('빈 result content → crash 없음', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-empty', '작업')
      yield mkToolResult('tool-empty', '')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    try {
      await collectEvents(backend, {
        messages: [{ role: 'user', content: '/loop 테스트' }]
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })

  it('result content가 배열 형식 → crash 없음', async () => {
    // SDK tool_result content가 string이 아니라 배열로 오는 엣지케이스
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-arr', '작업')
      // content를 배열로 override
      yield {
        type: 'user' as const,
        message: {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-arr',
              content: [{ type: 'text', text: 'some text' }],
            }
          ]
        },
        parent_tool_use_id: null,
        uuid: 'uuid-user-arr-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
        session_id: 'sess-test',
      }
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    let threw = false
    try {
      await collectEvents(backend, {
        messages: [{ role: 'user', content: '/loop 테스트' }]
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})

// ── LT4: summary sanitize (개행 제거·cap·신뢰경계) ──────────────────────────────

describe('LT4 — summary sanitize', () => {
  it('prompt에 개행 포함 → loops summary는 개행 제거된 1줄', async () => {
    const promptWithNewlines = '첫 번째 줄\n두 번째 줄\r세 번째 줄'
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-nl', promptWithNewlines)
      yield mkCronCreateToolResult('tool-nl', 'deadbeef', 'Every minute')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    if (lastLoops.loops.length > 0) {
      const summary = lastLoops.loops[0].summary
      // 개행 문자가 없어야 함
      expect(summary).not.toMatch(/[\n\r]/)
    }
  })

  it('200자 초과 prompt → summary는 200자 이하로 cap', async () => {
    const longPrompt = 'A'.repeat(300)  // 300자
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-cap', longPrompt)
      yield mkCronCreateToolResult('tool-cap', 'cafebabe', 'Every minute')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    if (lastLoops.loops.length > 0) {
      const summary = lastLoops.loops[0].summary
      // 200자 이하
      expect(summary.length).toBeLessThanOrEqual(200)
    }
  })

  it('loops 이벤트에 cron 표현식/raw payload 필드 없음(신뢰경계)', async () => {
    // loops 이벤트에 엔진 고유 필드(cron, recurring 등)가 누출되지 않아야 함
    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-trust', '신뢰경계 테스트', '*/30 * * * *')
      yield mkCronCreateToolResult('tool-trust', '12345678', 'Every 30 minutes')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '/loop 시작' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBeGreaterThanOrEqual(1)

    const lastLoops = loopsEvents[loopsEvents.length - 1]
    if (lastLoops.loops.length > 0) {
      const loop = lastLoops.loops[0] as unknown as Record<string, unknown>
      // LoopInfo 허용 필드: id, summary, interval
      // 엔진 고유 필드(cron, recurring, prompt_raw 등) 없어야 함
      expect(loop['cron']).toBeUndefined()
      expect(loop['recurring']).toBeUndefined()
      expect(loop['raw']).toBeUndefined()
      // 허용 필드는 존재해야 함
      expect(loop['id']).toBeDefined()
      expect(loop['summary']).toBeDefined()
    }
  })
})

// ── LT5: 단발 경로 회귀 0 — 일반 시퀀스에서 loops 이벤트 없음 ──────────────────

describe('LT5 — 단발 경로 회귀 0', () => {
  it('text→Bash→tool_result→done 시퀀스에서 loops 이벤트 0개', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkAssistant('안녕하세요')
      yield mkBashToolUse('bash-1', 'echo hello')
      yield mkToolResult('bash-1', 'hello')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '안녕' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    // 일반 도구에서 loops 이벤트가 생성되면 안 됨
    expect(loopsEvents.length).toBe(0)
  })

  it('text→done 단순 시퀀스에서 loops 이벤트 0개', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkAssistant('단순 응답입니다')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '안녕' }]
    })

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    expect(loopsEvents.length).toBe(0)
  })

  it('done 이벤트와 text 이벤트는 여전히 정상 emit됨(기존 이벤트 회귀 0)', async () => {
    const queryFn: QueryFn = async function* (_p) {
      yield mkAssistant('응답 텍스트')
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const events = await collectEvents(backend, {
      messages: [{ role: 'user', content: '테스트' }]
    })

    expect(events.some(e => e.type === 'text')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })
})

// ── LT6: abort 시 _activeLoops clear + 빈 loops push ─────────────────────────

describe('LT6 — abort 시 loops clear', () => {
  it('CronCreate 후 abort → 등록 loops 이벤트 실수집 + post-abort loops:[] 정리 이벤트 실단언', async () => {
    // 드레인 주의(BF3-P01): run.events는 단일 상태형 async generator(claudeAgentRun.ts
    // _createEventStream) — for-await를 `break`로 빠져나가면 JS가 iterator.return()을
    // 호출해 스트림이 영구히 닫힌다. abort()가 큐에 push한 post-abort 정리 이벤트
    // (abortCleanup의 loops:[])는 아직 next()로 당겨지지 않았으면 그대로 유실된다.
    // → break 없이 단일 for-await로 자연 종료(큐 drain + close)까지 소비한다
    //   (agent-runs.ts:194 "break 금지: 스트림 자연종료까지 소비"와 동일 패턴).
    let resolveHold!: () => void
    const holdPromise = new Promise<void>((r) => { resolveHold = r })

    const queryFn: QueryFn = async function* (_p) {
      yield mkCronCreateToolUse('tool-ab', '어보트 루프')
      yield mkCronCreateToolResult('tool-ab', 'ab1234cd', 'Every minute')
      // hold: abort 전까지 대기
      await holdPromise
      yield mkResult()
    }

    const backend = new ClaudeCodeBackend(queryFn)
    const run = backend.start({
      messages: [{ role: 'user', content: '/loop 어보트 테스트' }]
    })

    const events: AgentEvent[] = []
    let threw = false
    let abortedOnce = false

    try {
      for await (const e of run.events) {
        events.push(e)
        // loops 이벤트가 오면(루프 등록 완료) abort — break 없이 같은 루프에서 계속
        // 당겨서 abort()가 push한 post-abort 정리 이벤트까지 실수집한다.
        if (!abortedOnce && e.type === 'loops' && (e as AgentEventLoops).loops.length > 0) {
          abortedOnce = true
          run.abort()
          resolveHold()
        }
      }
    } catch {
      threw = true
    }

    // 안전망: 위 분기가 못 탔을 경우(가드) hold를 마저 풀어 좀비 대기 방지(멱등 resolve).
    resolveHold()

    expect(threw).toBe(false)
    // 실제로 등록 이벤트를 만나 abort 분기에 도달했음을 보장(가드 자체의 무단언화 방지).
    expect(abortedOnce).toBe(true)

    const loopsEvents = events.filter((e): e is AgentEventLoops => e.type === 'loops')
    // 최소 1건 실수집: 등록(loops.length>0) 스냅샷이 실제로 있어야 한다.
    const registeredIdx = loopsEvents.findIndex((e) => e.loops.length > 0)
    expect(registeredIdx).toBeGreaterThanOrEqual(0)
    expect(loopsEvents[registeredIdx].loops[0].id).toBe('ab1234cd')

    // post-abort 정리 실단언(BF2-mini 근본수리 반영): abortCleanup()이 push한
    // {type:'loops', loops:[]}가 등록 스냅샷 *이후* 실제로 도착해야 한다.
    const clearedAfterRegistration = loopsEvents
      .slice(registeredIdx + 1)
      .some((e) => e.loops.length === 0)
    expect(clearedAfterRegistration).toBe(true)

    // abort 후 멱등
    expect(() => run.abort()).not.toThrow()
  })
})
