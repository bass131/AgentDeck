/**
 * gap1-p09-idle-close-bgtask.test.ts — 활성 백그라운드 태스크 중 idle-close 금지 (TDD RED)
 *
 * 대상(R only — 구현은 agent-backend Worker 몫): claudeAgentRun.ts 지속세션 펌프
 * (_runPersistentPump)의 idle-close 유예/커밋 판정.
 *
 * 계약(P09 Phase 정의 완료 조건 + P04 liveness 정합):
 *   (1) 활성 bg task 존재 구간(bg_task 'started' 관측 ~ 'notification' 관측 사이)에는
 *       idle-close 유예 만료가 와도 세션(입력 스트림)을 닫지 않는다 — dev 서버를
 *       백그라운드로 돌려두고 지켜보는 세션이 "무활동"으로 오판돼 접히면 안 된다.
 *   (2) bg task 종료(task_notification) 후에는 정상 idle-close 경로가 회복돼 세션이
 *       자연 종료된다(좀비 세션 0 — 금지가 영구 고착이면 앱 종료까지 세션이 샌다).
 *   (3) 대조군: bg task가 없는 동일 흐름은 기존대로 유예 만료 시 닫힌다(LR4 P03 계약2
 *       보존 — bg 게이트가 일반 idle-close를 망가뜨리지 않는다).
 *
 * 하네스: lr4-p03-idle-grace.test.ts의 비중첩 barrier(checkpoint) + vi.useFakeTimers
 * 패턴 재사용(축소판 — 단일 checkpoint). mock 제너레이터는 clock을 만지지 않고
 * checkpoint로 park, clock 진행은 테스트 본문 한 곳에서만(중첩 advance 0 — 결정적).
 *
 * 결정성 근거(관측 순서): 제너레이터는 pump가 next()를 다시 당길 때만 재개되므로,
 * checkpoint 도달 시점에는 pump가 직전 result 메시지 처리(유예 스케줄)를 이미 마친
 * 상태다 — "advance가 유예 스케줄보다 먼저 실행되는" 경합이 구조적으로 불가능하다.
 *
 * 현재(RED) 이유: 펌프는 bg task 존재를 모른다 → turn 경계 유예가 만료되면
 * (_outstandingSendCount()===0 && !hasLoopActivity()) 무조건 idle-close 커밋 →
 * 활성 bg task 구간에서 입력 스트림이 닫힌다(계약 1·2 FAIL). 대조군(3)은 현행 GREEN.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClaudeCodeBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { QueryFn } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'

/** 어떤 합리적 grace(IDLE_CLOSE_GRACE_MS=3000)보다 큰 델타 — 정확한 grace 값에 결속 X. */
const EXPIRE_MS = 10_000

// ── 픽스처 (lr4-p03 관례 미러 + probe④ 실측 task_* 형상) ─────────────────────────

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
    session_id: 'sess-p09-idle',
  }
}

function mkInit(sessionId = 'sess-p09-idle') {
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

/** probe④ 17행 형상 — run_in_background Bash의 task_started. */
function mkTaskStarted() {
  return {
    type: 'system',
    subtype: 'task_started',
    task_id: 'b7hqf83vz',
    tool_use_id: 'toolu_p09_idle',
    description: 'Background dev server',
    task_type: 'local_bash',
    session_id: 'sess-p09-idle',
  }
}

/** probe④ 28행 형상 — 태스크 종료 통지. */
function mkTaskNotification() {
  return {
    type: 'system',
    subtype: 'task_notification',
    task_id: 'b7hqf83vz',
    tool_use_id: 'toolu_p09_idle',
    status: 'completed',
    output_file: 'C:\\tmp\\tasks\\b7hqf83vz.output',
    summary: 'Background dev server',
    session_id: 'sess-p09-idle',
  }
}

// ── 단일 checkpoint barrier (lr4 GraceProbe 축소판 — lost-wakeup 방지) ─────────────

class Checkpoint {
  private arrivedEarly = false
  private arrivedResolver: (() => void) | null = null
  private releaseResolver: (() => void) | null = null

  /** 제너레이터: 도달을 알리고 release()까지 park. */
  async reach(): Promise<void> {
    this.arrivedEarly = true
    this.arrivedResolver?.()
    await new Promise<void>((resolve) => {
      this.releaseResolver = resolve
    })
  }

  /** 테스트: 도달 대기(이미 도달했으면 즉시). */
  async waitArrived(): Promise<void> {
    if (this.arrivedEarly) return
    await new Promise<void>((resolve) => {
      this.arrivedResolver = resolve
    })
  }

  release(): void {
    this.releaseResolver?.()
  }
}

// ── 시나리오 드라이버 ────────────────────────────────────────────────────────────

interface IdleObservation {
  /** 유예 만료 델타(EXPIRE_MS) 경과 시점의 입력 스트림 폐쇄 여부 — bg task 활성 구간 관측점. */
  closedAtExpiry: boolean | null
  /** (bg 시나리오) notification 이후 세션이 자연 종료됐는가(입력 done:true) — 좀비 0 관측점. */
  inputClosedFinally: boolean
  events: AgentEvent[]
}

/**
 * turn1 후 무활동 세션 흐름. withBgTask=true면 turn1 전에 task_started를,
 * 유예 만료 관측 후에 task_notification을 방출한다.
 */
async function runIdleScenario(withBgTask: boolean): Promise<IdleObservation> {
  const cp = new Checkpoint()
  const obs: IdleObservation = { closedAtExpiry: null, inputClosedFinally: false, events: [] }

  const queryFn: QueryFn = (p) =>
    (async function* () {
      const prompt = p.prompt as unknown as AsyncIterable<unknown>
      const inputIter = prompt[Symbol.asyncIterator]()
      const first = await inputIter.next()
      if (first.done) return
      yield mkInit()
      if (withBgTask) yield mkTaskStarted()
      yield mkResult('turn1')

      // 입력 pull을 await하지 않고 캡처 — done이면 세션이 닫힌 것.
      let closed = false
      const pull = inputIter.next()
      void pull.then((r) => {
        if (r.done) closed = true
      })
      await cp.reach() // 테스트 본문이 EXPIRE_MS 진행 후 release
      obs.closedAtExpiry = closed

      if (closed) return // 세션이 이미 닫힘(현행 거동 또는 무-bg 대조군)

      if (withBgTask) yield mkTaskNotification() // bg task 종료 → idle-close 회복돼야 함
      const second = await pull
      obs.inputClosedFinally = second.done === true
    })()

  const backend = new ClaudeCodeBackend(queryFn)
  const run = backend.start({
    messages: [{ role: 'user', content: 'dev 서버를 백그라운드로 돌려줘' }],
    persistent: true,
  })

  const consume = (async () => {
    for await (const e of run.events) obs.events.push(e)
  })()

  await cp.waitArrived()
  // 유예 만료를 훨씬 넘는 델타 — bg 게이트가 없으면 여기서 idle-close가 커밋된다.
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await Promise.resolve() // pull.then microtask 정착
  cp.release()
  // notification 처리 + (재무장된) 잔여 유예 만료 — 좀비 0 확인용 여유 진행.
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await vi.advanceTimersByTimeAsync(EXPIRE_MS)
  await consume
  return obs
}

// ── 가짜 타이머 (lr4 관례 — afterEach 복원으로 누출 방지) ─────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

// ═══════════════════════════════════════════════════════════════════════════════

describe('gap1-p09 — 활성 bg task 존재 시 idle-close 금지 (RED)', () => {
  it('bg task 활성 구간(started~notification)에는 유예 만료가 와도 입력 스트림이 닫히지 않는다', async () => {
    const obs = await runIdleScenario(true)
    // RED: 현행 펌프는 bg task를 몰라 유예 만료에 무조건 커밋 → closedAtExpiry=true.
    expect(obs.closedAtExpiry).toBe(false)
    expect(obs.events.some((e) => e.type === 'error')).toBe(false)
  })

  it('bg task 종료(notification) 후에는 idle-close가 회복돼 세션이 자연 종료된다(좀비 0)', async () => {
    const obs = await runIdleScenario(true)
    // RED: 현행 흐름은 bg 구간에서 이미 자멸(위 계약 위반)해 notification 이후 경로에
    // 도달하지 못한다(inputClosedFinally=false). 구현 후에는 금지가 영구 고착되지 않고
    // notification 관측 이후 유예 만료로 입력이 닫혀야 한다.
    expect(obs.inputClosedFinally).toBe(true)
  })

  it('대조군(GREEN 핀): bg task가 없으면 기존대로 유예 만료에 세션이 닫힌다(LR4 P03 계약2 보존)', async () => {
    const obs = await runIdleScenario(false)
    expect(obs.closedAtExpiry).toBe(true)
    // 닫힌 뒤 done은 turn1 하나(user origin) — 기존 idle-close 거동 불변.
    expect(obs.events.filter((e) => e.type === 'done')).toHaveLength(1)
  })
})
