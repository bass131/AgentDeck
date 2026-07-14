/**
 * gap1-p09-bg-tail-wiring.test.ts — 백그라운드 output 경로 추출 → 라이브 tail 시작 배선 회귀 핀
 * (GAP1 P09 reviewer 🟡1 조치 — RED 선행이 아니라 구현 완료 지점의 GREEN 회귀 핀)
 *
 * 봉인 대상(구멍의 형상): 라이브 tail 시작의 유일한 조기 경로는 claudeAgentRun.ts의
 * `_maybeStartBgTail` — 백그라운드 Bash tool_result의 content 문자열에서 안내 문구
 * "Output is being written to: <경로>.output"(probe④ 실측, SDK 사람용 문구)을 best-effort
 * 정규식 추출해 `startBgTaskTail`을 배선한다. 기존 스위트는 decoy(무합성) *대조군*만
 * 갖고 있었다 — SDK 문구 변경/정규식 훼손으로 tail 전체가 조용히 죽어도(추출 실패는
 * graceful degrade라 예외도 없다) 스위트가 GREEN인 회귀 구멍. 이 파일은 그 반대 방향
 * ("추출이 실제로 tail을 시작시킨다")을 펌프 레벨에서 기계 증거로 고정한다:
 *   probe④ 18행 실물 형상(경로만 임시 실파일로 재작성) 주입 → 실파일 append →
 *   `bg_task { kind:'output', taskId, outputChunk }` 조각이 펌프 이벤트 스트림에 흐름.
 *
 * 커버 지점(둘 다 — call site가 2곳이라 한쪽만 핀하면 다른 쪽 배선 삭제를 놓친다):
 *   - 단발 펌프(_runPump ~:1099)          — 테스트 ①.
 *   - 지속 펌프(_runPersistentPump ~:1375) — 테스트 ② (REPL 기본 활성이라 실제 정산 경로).
 *   - 대조군 ③: 안내 문구 없는 동형 메시지(추출 실패) → kind:'output' 무방출 +
 *     생명주기(started/notification)·tool_result·done은 정상(graceful degrade 핀).
 *
 * 신규 파일 선택 근거(기존 3파일 describe 추가 대비 trade-off):
 *   - gap1-p09-bg-task.golden.test.ts — 무상태 mapClaudeStreamLine 동기 재생 하네스(펌프·
 *     비동기·임시파일 없음). 여기에 펌프+실 IO를 섞으면 골든의 "고정 샘플 순수 대조" 성격이 흐려진다.
 *   - gap1-p09-idle-close-bgtask.test.ts — 파일 전역 vi.useFakeTimers. tail 폴러는 실제
 *     fs IO promise 정착이 필요해 fake clock과 양립 불가(gap1-p09-bg-task-tail.test.ts
 *     결정론 노트와 동일 근거) — 같은 파일에 real/fake 타이머 혼재는 flaky 온상.
 *   - gap1-p09-bg-task-tail.test.ts — bgTaskTail *모듈 격리* 테스트(펌프 무관). 이 핀의
 *     요지는 "펌프 배선"이라 격리 테스트에 얹으면 대상이 어긋난다.
 *   → 펌프 + 실파일 + 실타이머 조합은 어느 기존 하네스와도 충돌 → 신규 파일.
 *
 * 결정론 노트(gap1-p09-bg-task-tail.test.ts 관례 승계): 펌프 경유 tail은 intervalMs 주입이
 * 불가능(기본 750ms 고정)하므로 fake timers 대신 until(관측 조건 대기)로 방출 내용만 단정
 * — 시간값 단정 0. 대조군 ③의 "무방출" 단정만 시간 유계(기본 주기 상수 × 2 대기 후 0건
 * 확인): 잘못 시작된 tail이 있었다면 첫 폴링(기본 주기 1×)이 그 안에 반드시 발화한다
 * (이벤트 루프 타이머 순서 보장 — 750ms 타이머는 1500ms 대기보다 먼저 fire).
 *
 * 신뢰경계: 실 SDK/네트워크 0 — mock queryFn + 로컬 임시 파일만. afterEach에서 임시 dir 제거.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { DEFAULT_TAIL_INTERVAL_MS } from '../../../02.Source/main/01_agents/bgTaskTail'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

// ── probe④ 실측 고정값 (gap1-p09-bg-task.golden.test.ts와 동일 상수) ─────────────

const TOOL_USE_ID = 'toolu_01T5qbRPpVRhXhNidJFukFYj'
const TASK_ID = 'b7hqf83vz'
const DESCRIPTION = 'Background loop printing tick counter with 1-second delays'
const SESSION_ID = 'sess-p09-wiring'

// ── 픽스처 (lr4-p03/gap1-p09-idle-close 관례 미러 + probe④ 실물 형상 재작성) ──────

function mkInit() {
  return {
    type: 'system' as const,
    subtype: 'init' as const,
    session_id: SESSION_ID,
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

function mkResult(turnLabel = 'turn1') {
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
    session_id: SESSION_ID,
  }
}

/** probe④ 17행 형상 — run_in_background Bash의 task_started(레지스트리 등록 선행 조건). */
function mkTaskStarted() {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: TASK_ID,
    tool_use_id: TOOL_USE_ID,
    description: DESCRIPTION,
    task_type: 'local_bash',
    session_id: SESSION_ID,
  }
}

/** probe④ 28행 형상 — 태스크 종료 통지(레지스트리 제거 + tail 정지 트리거). */
function mkTaskNotification(outputFile: string) {
  return {
    type: 'system',
    subtype: 'task_notification',
    task_id: TASK_ID,
    tool_use_id: TOOL_USE_ID,
    status: 'stopped',
    output_file: outputFile,
    summary: DESCRIPTION,
    session_id: SESSION_ID,
  }
}

/**
 * probe④ 18행 실물 형상 재작성 — user tool_result + top-level tool_use_result.
 * backgroundTaskId(구조 payload 정본) + content 안내 문구(경로만 임시 실파일로 치환).
 *
 * withHint=false 대조군: 구조 payload는 동일하되 content에 "Output is being written
 * to:" 안내 문구(그리고 `.output` 경로 자체)가 없다 → 추출 실패 → graceful degrade.
 */
function mkBgToolResult(outputFile: string, withHint: boolean) {
  const content = withHint
    ? `Command running in background with ID: ${TASK_ID}. Output is being written to: ${outputFile}. You will be notified when it completes. To check interim output, use Read on that file path.`
    : `Command running in background with ID: ${TASK_ID}. You will be notified when it completes. To check interim output, use the TaskOutput tool.`
  return {
    type: 'user',
    parent_tool_use_id: null,
    session_id: SESSION_ID,
    message: {
      role: 'user',
      content: [{ tool_use_id: TOOL_USE_ID, type: 'tool_result', content, is_error: false }],
    },
    tool_use_result: {
      stdout: '',
      stderr: '',
      interrupted: false,
      isImage: false,
      noOutputExpected: false,
      backgroundTaskId: TASK_ID,
    },
  }
}

// ── 단일 게이트 barrier (gap1-p09-idle-close Checkpoint 축소판 — lost-wakeup 방지) ──

class Gate {
  private arrived = false
  private released = false
  private arrivedResolver: (() => void) | null = null
  private releaseResolver: (() => void) | null = null

  /** 제너레이터: 도달을 알리고 release()까지 park(이미 release됐으면 즉시 통과). */
  async reach(): Promise<void> {
    this.arrived = true
    this.arrivedResolver?.()
    if (this.released) return
    await new Promise<void>((resolve) => {
      this.releaseResolver = resolve
    })
  }

  /** 테스트: 도달 대기(이미 도달했으면 즉시). */
  async waitArrived(): Promise<void> {
    if (this.arrived) return
    await new Promise<void>((resolve) => {
      this.arrivedResolver = resolve
    })
  }

  release(): void {
    this.released = true
    this.releaseResolver?.()
  }
}

// ── 시나리오 드라이버 ────────────────────────────────────────────────────────────

/**
 * init → task_started → (probe④ 18행 재작성) tool_result → [park] → notification →
 * result 순서의 mock 스트림. park 구간에서 테스트가 실파일 append + 관측을 수행한다.
 *
 * 관측 순서 결정성(gap1-p09-idle-close 관례): 제너레이터는 펌프가 next()를 당길 때만
 * 재개되므로, gate 도달 시점에는 펌프가 직전 tool_result 메시지 처리(= `_maybeStartBgTail`
 * 호출)를 이미 마친 상태다 — "append가 tail 시작보다 먼저 폴링되는" 경합이 구조적으로 없다.
 */
function makeWiringQueryFn(gate: Gate, outputFile: string, withHint: boolean, persistent: boolean): QueryFn {
  return (p) =>
    (async function* () {
      let inputIter: AsyncIterator<unknown> | null = null
      if (persistent) {
        // ADR-024 held-open: 지속세션 prompt는 AsyncIterable — 첫 입력 pull 후 진행.
        const prompt = p.prompt as unknown as AsyncIterable<unknown>
        inputIter = prompt[Symbol.asyncIterator]()
        const first = await inputIter.next()
        if (first.done) return
      }
      yield mkInit()
      yield mkTaskStarted()
      yield mkBgToolResult(outputFile, withHint) // ← 여기서 tail 시작 배선이 발화해야 한다
      await gate.reach() // 테스트 본문이 append + 관측 후 release
      yield mkTaskNotification(outputFile)
      yield mkResult('turn1')
      // 지속세션 held-open — done 관측 후 테스트 측 abort()가 입력 스트림을 닫을 때까지.
      if (inputIter) await inputIter.next()
    })()
}

/**
 * 펌프 구동 + park 구간 콜백 실행 + 전체 이벤트 수집.
 * 지속세션은 done 관측 즉시 abort — 실 3000ms idle-close grace 만료를 기다리지 않는다
 * (real timers 하네스에서 테스트 시간·결정성 보호. grace 거동 자체는 idle-close 파일 몫).
 * duringPark가 단정 실패로 throw해도 finally가 release+드레인해 run 누수 0.
 */
async function runWiringScenario(opts: {
  persistent: boolean
  withHint: boolean
  outputFile: string
  duringPark: (events: AgentEvent[]) => Promise<void>
}): Promise<AgentEvent[]> {
  const gate = new Gate()
  const events: AgentEvent[] = []
  const backend = new ClaudeCodeBackend(
    makeWiringQueryFn(gate, opts.outputFile, opts.withHint, opts.persistent)
  )
  const run = backend.start({
    messages: [{ role: 'user', content: 'dev 서버를 백그라운드로 돌려줘' }],
    ...(opts.persistent ? { persistent: true } : {}),
  })
  const consume = (async () => {
    for await (const e of run.events) {
      events.push(e)
      if (opts.persistent && e.type === 'done') run.abort()
    }
  })()
  try {
    await gate.waitArrived()
    await opts.duringPark(events)
  } finally {
    gate.release()
    await consume // 스트림 자연종료까지 소진(좀비 0)
  }
  return events
}

// ── 관측 헬퍼 ────────────────────────────────────────────────────────────────────

type BgTaskEv = Extract<AgentEvent, { type: 'bg_task' }>

function bgOutputs(events: AgentEvent[]): BgTaskEv[] {
  return events.filter((e): e is BgTaskEv => e.type === 'bg_task' && e.kind === 'output')
}

function joinedOutput(events: AgentEvent[]): string {
  return bgOutputs(events)
    .map((e) => e.outputChunk ?? '')
    .join('')
}

function bgKinds(events: AgentEvent[]): string[] {
  return events.filter((e): e is BgTaskEv => e.type === 'bg_task').map((e) => e.kind)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 조건 충족까지 대기(폴링 10ms) — 시간값이 아닌 관측 조건만 단정(tail 파일 관례). */
async function until(cond: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) return false
    await sleep(10)
  }
  return true
}

// ── 테스트 하네스(임시 dir) ──────────────────────────────────────────────────────

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'agentdeck-p09-wiring-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p09 회귀 핀 — content 경로 추출 → 라이브 tail 시작 배선(GREEN)', () => {
  it(
    '① 단발 펌프: probe④ 형상 주입 후 실파일 append → bg_task kind=output 조각이 스트림에 흐른다',
    async () => {
      const file = path.join(dir, `${TASK_ID}.output`)
      writeFileSync(file, '')

      const events = await runWiringScenario({
        persistent: false,
        withHint: true,
        outputFile: file,
        duringPark: async (evs) => {
          appendFileSync(file, 'tick-live-1\n')
          // 핵심 핀: 추출→startBgTaskTail 배선이 살아있다는 기계 증거 —
          // 정규식/안내 문구가 훼손되면 tail이 시작되지 않아 여기서 FAIL한다.
          expect(await until(() => joinedOutput(evs) === 'tick-live-1\n')).toBe(true)
        },
      })

      // 조각 봉투: 모든 output 조각은 구조 payload의 taskId로 귀속된다.
      const outs = bgOutputs(events)
      expect(outs.length).toBeGreaterThanOrEqual(1)
      for (const o of outs) expect(o.taskId).toBe(TASK_ID)
      // 생명주기 공존 — tail 배선이 기존 started/notification 흐름을 깨지 않는다.
      expect(bgKinds(events)).toContain('started')
      expect(bgKinds(events)).toContain('notification')
      expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
      expect(events.some((e) => e.type === 'error')).toBe(false)
    },
    15_000
  )

  it(
    '② 지속 펌프(REPL 기본 경로): 동일 형상 — persistent call site 배선도 tail을 시작시킨다',
    async () => {
      const file = path.join(dir, `${TASK_ID}.output`)
      writeFileSync(file, '')

      const events = await runWiringScenario({
        persistent: true,
        withHint: true,
        outputFile: file,
        duringPark: async (evs) => {
          appendFileSync(file, 'tick-live-repl\n')
          expect(await until(() => joinedOutput(evs) === 'tick-live-repl\n')).toBe(true)
        },
      })

      const outs = bgOutputs(events)
      expect(outs.length).toBeGreaterThanOrEqual(1)
      for (const o of outs) expect(o.taskId).toBe(TASK_ID)
      expect(bgKinds(events)).toContain('started')
      expect(bgKinds(events)).toContain('notification')
      expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
      expect(events.some((e) => e.type === 'error')).toBe(false)
    },
    15_000
  )

  it(
    '③ 대조군(graceful degrade 핀): 안내 문구 없는 동형 메시지 → 추출 실패 → output 무방출 + 생명주기 정상',
    async () => {
      const file = path.join(dir, `${TASK_ID}.output`)
      writeFileSync(file, '')

      const events = await runWiringScenario({
        persistent: false,
        withHint: false,
        outputFile: file,
        duringPark: async (evs) => {
          appendFileSync(file, 'tick-ctrl-1\n')
          // 잘못 시작된 tail이 있다면 기본 주기(1×)의 첫 폴링이 이 대기(2×) 안에 발화한다.
          await sleep(DEFAULT_TAIL_INTERVAL_MS * 2)
          expect(bgOutputs(evs)).toHaveLength(0)
        },
      })

      // 스트림 전체에서도 output 조각 0 — degrade는 조용하다(예외·에러 이벤트도 없다).
      expect(bgOutputs(events)).toHaveLength(0)
      // 생명주기 이벤트는 정상 — tail 실패가 started/notification 흐름을 막지 않는다.
      expect(bgKinds(events)).toEqual(['started', 'notification'])
      expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(1)
      expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
      expect(events.some((e) => e.type === 'error')).toBe(false)
    },
    15_000
  )
})
