/**
 * gap1-p09-bg-task.golden.test.ts — GAP1 P09 백그라운드 셸 `bg_task` 정규화 골든 (TDD RED)
 *
 * 대상 1(claude-stream.ts mapClaudeStreamLine): SDK system task_started/task_updated/
 *   task_notification → 엔진 중립 `bg_task` 이벤트(agent-events.ts AgentEventBgTask,
 *   P03 선정의 + P09 additive) 방출 + assistant tool_use의 백그라운드 플래그 →
 *   `tool_call.background: true`. 구현은 agent-backend Worker 몫 — 이 파일은 실패하는
 *   계약(RED)을 먼저 못박는다.
 * 대상 2(claudeAgentRun.ts): AgentRun optional 메서드 `stopTask?(taskId: string): void`
 *   — 캡처된 query 핸들의 stopTask(taskId)로 위임(fire-and-forget·멱등·핸들 미캡처 시
 *   no-op). EchoBackend는 미구현(no-op) 대조군.
 *
 * fixture 근거(실측 — SYNTHETIC 아님): 99.Others/tests/fixtures/gap1-p03/
 *   probe-4-bg-bash.jsonl (2026-07-13 라이브 캡처, 28행).
 *   - 15행: assistant tool_use Bash input.run_in_background=true
 *   - 17행: system task_started  { task_id, tool_use_id, description, task_type:'local_bash' }
 *   - 18행: user tool_result + top-level tool_use_result.backgroundTaskId='b7hqf83vz'
 *   - 27행: system task_updated  { task_id, patch:{ status:'killed', end_time } } — tool_use_id 없음
 *   - 28행: system task_notification { task_id, tool_use_id, status:'stopped', output_file, summary }
 *
 * 합의된 표면(interface-of-record — 구현이 여기에 맞춘다):
 *   - task_started       → bg_task { kind:'started', taskId, toolUseId, taskType, description }
 *   - task_updated       → bg_task { kind:'updated', taskId, patch:{ status, endTime(camelCase) } }
 *                          (toolUseId 없음 — SDK 선언에 부재. taskId가 상관 키)
 *   - task_notification  → bg_task { kind:'notification', taskId, toolUseId, status, outputFile, summary }
 *   - 기존 orchestration_progress 방출(task_started/task_notification)은 **변경 없이 유지**
 *     (이중 방출 — 회귀 대조군. F-C orchestration-stream.test.ts 계약 보존).
 *   - assistant tool_use의 백그라운드 플래그(엔진 고유 필드명은 어댑터 내부에만, ADR-003)
 *     → tool_call.background: true. 포그라운드 Bash는 background **미지정(undefined)**.
 *   - tool_result의 taskId 상관은 원시 top-level `tool_use_result.backgroundTaskId`
 *     구조 payload가 정본 — **content 문자열 파싱으로 taskId 추출 금지**(P03 계약 주석,
 *     agent-events.ts AgentEventBgTask.taskId). user 라인에서 bg_task를 합성 방출하지 않는다.
 *   - AgentRun.stopTask?(taskId: string): void — claudeAgentRun이 query 핸들 캡처 후
 *     q.stopTask(taskId) 위임. 핸들 미캡처/미구현(Echo)은 조용한 no-op.
 *
 * 현재(RED) 이유:
 *   - case 'system'이 task_* 를 orchestration_progress로만 매핑(bg_task 0건) → 정규화 단정 FAIL.
 *   - mapAssistantContent가 background 플래그를 읽지 않음 → background:true 단정 FAIL.
 *   - AgentRun에 stopTask 부재 → 존재/위임 단정 FAIL.
 *   대조군(이중 방출 유지·포그라운드 미지정·user 라인 무합성·Echo no-op)은 현행 그대로
 *   GREEN — 구현 후에도 불변이어야 하는 회귀 핀.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mapClaudeStreamLine } from '../../../02.Source/main/01_agents/claude-stream'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { EchoBackend } from '../../../02.Source/main/01_agents/EchoBackend'
import type { AgentRun } from '../../../02.Source/main/01_agents/AgentBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── 타입 헬퍼 ────────────────────────────────────────────────────────────────────

type BgTaskEv = Extract<AgentEvent, { type: 'bg_task' }>
type ToolCallEv = Extract<AgentEvent, { type: 'tool_call' }>
type OrchProgressEv = Extract<AgentEvent, { type: 'orchestration_progress' }>
type ToolResultEv = Extract<AgentEvent, { type: 'tool_result' }>

/**
 * AgentRun + 구현 예정 additive 메서드(stopTask) — 구현 전 타입 다리(P07/P08 선례).
 * 구현 후 AgentBackend.ts에 `stopTask?(taskId: string): void`가 생기면 이 교차 타입은
 * 동일 시그니처라 그대로 호환된다(테스트 수정 불필요).
 */
type RunWithStopTask = AgentRun & { stopTask?: (taskId: string) => void }

// ── fixture 로드 (테스트 파일 위치 기준 — cwd 비의존, gap1-p03 계약 테스트 관례) ────

const FIXTURE_PATH = fileURLToPath(
  new URL('../fixtures/gap1-p03/probe-4-bg-bash.jsonl', import.meta.url)
)

const fixtureLines: Record<string, unknown>[] = readFileSync(FIXTURE_PATH, 'utf-8')
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line) as Record<string, unknown>)

/** 픽스처 전 라인 재생 결과(순서 보존 평탄화). */
const allEvents: AgentEvent[] = fixtureLines.flatMap((line) => mapClaudeStreamLine(line))

// probe④ 실측 고정값
const TOOL_USE_ID = 'toolu_01T5qbRPpVRhXhNidJFukFYj'
const TASK_ID = 'b7hqf83vz'
const DESCRIPTION = 'Background loop printing tick counter with 1-second delays'

// ═══════════════════════════════════════════════════════════════════════════════
// 1. run_in_background 플래그 인지 — tool_call.background
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p09 어댑터 골든 — run_in_background → tool_call.background (RED)', () => {
  it('probe④ 재생: Bash tool_call 1개 + background:true + input passthrough', () => {
    const toolCalls = allEvents.filter((e): e is ToolCallEv => e.type === 'tool_call')
    expect(toolCalls).toHaveLength(1)
    const bash = toolCalls[0]
    expect(bash.id).toBe(TOOL_USE_ID)
    expect(bash.name).toBe('Bash')
    // input은 그대로 통과(기존 계약 — background는 input 파싱 결과의 *구조화 미러*).
    expect((bash.input as { run_in_background?: boolean }).run_in_background).toBe(true)
    // RED: 현행 mapAssistantContent는 background를 세팅하지 않는다(undefined).
    expect(bash.background).toBe(true)
  })

  it('대조군(GREEN 핀): 포그라운드 Bash(플래그 부재) → background 키 자체가 없다', () => {
    const obj = {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_fg_01', name: 'Bash', input: { command: 'ls', description: 'List files' } },
        ],
      },
    }
    // 미지정(undefined) 계약: 렌더러가 배지를 그리지 않는 기존 동작 회귀 0.
    expect(mapClaudeStreamLine(obj)).toEqual<AgentEvent[]>([
      { type: 'tool_call', id: 'toolu_fg_01', name: 'Bash', input: { command: 'ls', description: 'List files' } },
    ])
  })

  it('대조군(GREEN 핀): run_in_background:false → background는 true가 아니다(포그라운드 취급)', () => {
    const obj = {
      type: 'assistant',
      parent_tool_use_id: null,
      message: {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_fg_02',
            name: 'Bash',
            input: { command: 'ls', run_in_background: false },
          },
        ],
      },
    }
    const events = mapClaudeStreamLine(obj)
    expect(events).toHaveLength(1)
    const tc = events[0] as ToolCallEv
    expect(tc.type).toBe('tool_call')
    expect(tc.background).not.toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. system task_* → bg_task 생명주기 정규화
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p09 어댑터 골든 — system task_* → bg_task (RED)', () => {
  const bgTasks = allEvents.filter((e): e is BgTaskEv => e.type === 'bg_task')

  it('probe④ 재생: bg_task 정확히 3건 — started → updated → notification 순서', () => {
    // RED: 현행 어댑터는 bg_task를 한 번도 방출하지 않는다(0건).
    expect(bgTasks.map((e) => e.kind)).toEqual(['started', 'updated', 'notification'])
  })

  it("kind:'started' — taskId/toolUseId/taskType/description 매핑(probe 17행)", () => {
    const started = bgTasks.find((e) => e.kind === 'started')
    expect(started).toEqual<BgTaskEv>({
      type: 'bg_task',
      kind: 'started',
      taskId: TASK_ID,
      toolUseId: TOOL_USE_ID,
      taskType: 'local_bash',
      description: DESCRIPTION,
    })
  })

  it("kind:'updated' — patch snake→camel(end_time→endTime) + toolUseId 부재(probe 27행)", () => {
    const updated = bgTasks.find((e) => e.kind === 'updated')
    expect(updated).toBeDefined()
    expect(updated).toMatchObject({
      type: 'bg_task',
      kind: 'updated',
      taskId: TASK_ID,
      patch: { status: 'killed', endTime: 1783947441873 },
    })
    // SDK task_updated 실페이로드에 tool_use_id 없음(F-C 프로브·P03 계약 주석) — 합성 금지.
    expect(updated?.toolUseId).toBeUndefined()
  })

  it("kind:'notification' — status/outputFile/summary 매핑(probe 28행)", () => {
    const rawNotif = fixtureLines.find((l) => l['subtype'] === 'task_notification')
    expect(rawNotif).toBeDefined()
    const notif = bgTasks.find((e) => e.kind === 'notification')
    expect(notif).toEqual<BgTaskEv>({
      type: 'bg_task',
      kind: 'notification',
      taskId: TASK_ID,
      toolUseId: TOOL_USE_ID,
      status: 'stopped',
      // 원시 output_file(snake) → outputFile(camel) — 값은 픽스처 원문과 동일해야 한다.
      outputFile: rawNotif?.['output_file'] as string,
      summary: DESCRIPTION,
    })
  })

  it('대조군(GREEN 핀): 기존 orchestration_progress 이중 방출은 변경 없이 유지', () => {
    // task_started/task_notification의 기존 매핑(F-C) — bg_task 신설로 대체·삭제 금지.
    // task_updated는 tool_use_id 부재로 기존에도 orchestration_progress 미방출(T4 계약 유지).
    const progress = allEvents.filter((e): e is OrchProgressEv => e.type === 'orchestration_progress')
    expect(progress).toEqual<OrchProgressEv[]>([
      { type: 'orchestration_progress', id: TOOL_USE_ID, status: 'running' },
      { type: 'orchestration_progress', id: TOOL_USE_ID, status: 'running', summary: DESCRIPTION },
    ])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. tool_result 상관 — 구조 payload 정본(content 문자열 파싱 금지)
// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p09 어댑터 골든 — tool_result backgroundTaskId 상관(무합성 대조군)', () => {
  it('대조군(GREEN 핀): probe④ 18행(user tool_result) → tool_result 1건만, bg_task 무합성', () => {
    const rawUser = fixtureLines.find((l) => l['type'] === 'user')
    expect(rawUser).toBeDefined()
    const events = mapClaudeStreamLine(rawUser)
    // content 문자열에 taskId·output 경로가 포함돼 있지만, taskId↔toolUseId 상관은
    // task_started(17행)가 이미 운반한다 — user 라인에서 bg_task를 합성하지 않는다.
    expect(events).toHaveLength(1)
    const tr = events[0] as ToolResultEv
    expect(tr.type).toBe('tool_result')
    expect(tr.id).toBe(TOOL_USE_ID)
    expect(tr.ok).toBe(true)
    expect(String(tr.output)).toContain('Command running in background with ID')
  })

  it('대조군(GREEN 핀): content 문자열의 미끼(decoy) taskId를 grep해 bg_task를 합성하지 않는다', () => {
    // 구조 payload(tool_use_result.backgroundTaskId='real-task-99')와 content 문자열의
    // decoy-task-11이 다른 합성 케이스 — 문자열 파싱 구현이면 decoy가 새어 나온다(계약 위반).
    const obj = {
      type: 'user',
      parent_tool_use_id: null,
      tool_use_result: {
        stdout: '',
        stderr: '',
        interrupted: false,
        isImage: false,
        noOutputExpected: false,
        backgroundTaskId: 'real-task-99',
      },
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_bg_decoy',
            content:
              'Command running in background with ID: decoy-task-11. Output is being written to: C:\\tmp\\decoy-task-11.output.',
          },
        ],
      },
    }
    const events = mapClaudeStreamLine(obj)
    expect(events.filter((e) => e.type === 'bg_task')).toHaveLength(0)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('tool_result')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. AgentRun.stopTask — query 핸들 위임 (claudeAgentRun)
// ═══════════════════════════════════════════════════════════════════════════════

// lr4-p03-idle-grace.test.ts 픽스처 관례 미러 — 실 SDK 호출 0.
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
    session_id: 'sess-p09-stop',
  }
}

function mkInit(sessionId = 'sess-p09-stop') {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: sessionId,
    apiKeySource: 'none' as const,
    cwd: '/tmp',
    tools: [],
    mcp_servers: [],
    model: 'claude-haiku-4-5-20251001',
    permissionMode: 'default' as const,
    slash_commands: [],
    uuid: 'uuid-init-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
  }
}

/**
 * stopTask 스파이를 실은 held-open mock queryFn.
 * 반환 객체 = AsyncGenerator + stopTask(taskId 기록) — 어댑터가 캡처하는 query 핸들 형상.
 * turn1 이후 입력 pull을 직접 대기(추가 타이머 없음) — run.abort()가 입력을 닫으면 종료.
 */
function makeStopQueryFn(stopCalls: string[]): QueryFn {
  return (p) => {
    const gen = (async function* () {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkInit()
      yield mkResult('turn1')
      // 세션 held-open 유지 — abort가 입력 스트림을 닫을 때까지 대기.
      await inputIter.next()
    })()
    return Object.assign(gen, {
      stopTask: (taskId: string): void => {
        stopCalls.push(taskId)
      },
    })
  }
}

describe('gap1-p09 AgentRun.stopTask — query 핸들 위임 (RED)', () => {
  it('AgentRun이 stopTask 메서드를 노출한다', async () => {
    const backend = new ClaudeCodeBackend(makeStopQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: 'dev 서버 백그라운드 시작' }],
      persistent: true,
    }) as RunWithStopTask
    try {
      // RED: 현행 AgentRun 계약에 stopTask가 없다(undefined).
      expect(typeof run.stopTask).toBe('function')
    } finally {
      run.abort()
      for await (const e of run.events) void e // 좀비 0 — 스트림 자연종료까지 소진
    }
  })

  it('핸들 캡처 후 stopTask(taskId) → q.stopTask(taskId)로 위임(fire-and-forget·재호출 안전)', async () => {
    const stopCalls: string[] = []
    const backend = new ClaudeCodeBackend(makeStopQueryFn(stopCalls))
    const run = backend.start({
      messages: [{ role: 'user', content: 'dev 서버 백그라운드 시작' }],
      persistent: true,
    }) as RunWithStopTask

    for await (const e of run.events) {
      if (e.type === 'done') {
        // done 관측 시점 = queryFn 호출 완료 후(핸들 캡처 확정).
        run.stopTask?.(TASK_ID)
        run.stopTask?.(TASK_ID) // 멱등 계약: 재호출에 예외 없음
        run.abort()
      }
    }

    // RED: 현행 run.stopTask는 undefined(optional chaining no-op) → 위임 0건.
    expect(stopCalls.length).toBeGreaterThanOrEqual(1)
    expect(stopCalls.every((t) => t === TASK_ID)).toBe(true)
  })

  it('대조군(GREEN 핀): query 핸들 캡처 전 호출은 조용한 no-op(throw 금지)', async () => {
    const backend = new ClaudeCodeBackend(makeStopQueryFn([]))
    const run = backend.start({
      messages: [{ role: 'user', content: '즉시 정지 시도' }],
      persistent: true,
    }) as RunWithStopTask
    // start() 직후 = 펌프가 아직 queryFn을 호출하기 전일 수 있는 시점.
    expect(() => run.stopTask?.('task-preflight')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e
  })

  it('대조군(GREEN 핀): EchoBackend는 stopTask 미구현(no-op) — 호출해도 예외 없음', async () => {
    const run = new EchoBackend().start({
      messages: [{ role: 'user', content: 'echo' }],
    }) as RunWithStopTask
    expect(() => run.stopTask?.('task-echo')).not.toThrow()
    run.abort()
    for await (const e of run.events) void e
  })
})
