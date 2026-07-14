/**
 * gap1-p05-hook-cockpit-reducer.test.ts — GAP1 P05 renderer store-shape 디스패치 (TDD RED)
 *
 * 목표: applyAgentEvent(store/reducer.ts)가 훅 콕핏 3 이벤트(hook_lifecycle·informational·
 *   permission_denied)를 소비해 AppState로 반영하는지 못박는다. 구현은 후속 renderer Worker
 *   몫 — 이 파일은 store-shape 계약(coordinator 고정 필드명)을 RED로 먼저 둔다.
 *   gap1-p04-reliability-signals-reducer.test.ts의 P04State 확장 캐스팅 패턴 그대로 미러.
 *
 * store-shape 계약(coordinator 고정 — renderer가 이 이름으로 구현):
 *   hookRuns: HookRun[]  — 훅 타임라인 소스. HookRun={hookId,hookName,hookEvent,
 *     status:'running'|'success'|'error'|'cancelled', exitCode?,stdout?,stderr?,output?,time?}
 *   - hook_lifecycle started → hookRuns에 {…, status:'running'} 1건 추가.
 *   - 동일 hookId response → 같은 엔트리 status/exitCode 갱신(엔트리 개수 불변 = 페어링 upsert).
 *   - informational → thread에 {kind:'informational', content, level, preventContinuation?} 1개 추가(seq++, id 접두 'inf').
 *   - permission_denied → thread에 {kind:'permission-denied', toolName, decisionReasonType?, decisionReason?} 1개 추가(seq++, id 접두 'pd').
 *
 * 현재(RED) 이유: AppState에 hookRuns 필드가 없고 applyAgentEvent 디스패처에 위 3 case가 없어
 *   default 분기(state 불변 반환)로 떨어진다 — hookRuns는 undefined, thread는 불변.
 *
 * 결정론: 순수 리듀서(fs/네트워크/타이머 0). nowMs 미전달(활동 스탬프 무영향).
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const RUN = 'run-gap1-p05'

function payload(event: AgentEvent, runId = RUN): AgentEventPayload {
  return { runId, event }
}

/** 훅 타임라인 엔트리 계약(coordinator 고정 필드명). */
type HookRun = {
  hookId: string
  hookName: string
  hookEvent: string
  status: 'running' | 'success' | 'error' | 'cancelled'
  exitCode?: number
  stdout?: string
  stderr?: string
  output?: string
  time?: string
}

/**
 * P05 store-shape 계약 필드를 얹은 확장 뷰. AppState에 아직 hookRuns가 없어(RED) 타입상
 * optional로 선언하고, 런타임에서 undefined(미구현) → 값(구현 후)으로 전이하는지 단정한다.
 */
type P05State = AppState & { hookRuns?: HookRun[] }

/** thread item을 P05 계약 shape로 읽기 위한 최소 캐스팅 뷰. */
type ThreadShape = {
  kind: string
  id: string
  content?: string
  level?: string
  preventContinuation?: boolean
  toolName?: string
  decisionReasonType?: string
  decisionReason?: string
}

// ── hookRuns 초기값 ──────────────────────────────────────────────────────────────

describe('gap1-p05 reducer — hookRuns 초기 상태', () => {
  it('makeInitialState().hookRuns === [] (미수신 기본)', () => {
    const base = makeInitialState() as P05State
    // RED: 현재 makeInitialState에 hookRuns 필드 없음 → undefined.
    expect(base.hookRuns).toEqual([])
  })
})

// ── hook_lifecycle started → hookRuns 추가 ────────────────────────────────────────

describe('gap1-p05 reducer — hook_lifecycle started/response 페어링 upsert', () => {
  it('started 수신 → hookRuns에 {status:running} 1건 추가', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-pre-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    ) as P05State
    // RED: hook_lifecycle case 없음 → default → hookRuns undefined.
    // GAP1 P16 계열③(additive): reducer.ts:234가 이제 agentPayload.runId(payload() 헬퍼가
    // 항상 RUN을 싣는다)를 handleHookLifecycle 4번째 인자로 전달 — 생성된 엔트리에 runId가
    // 실린다(HookRun.runId?:string, reducer/types.ts). 이 파일 로컬 HookRun 계약 타입에는
    // runId가 없어(P05 당시 정의) 여기 단정에서만 안전 캐스팅으로 필드를 얹는다.
    expect(next.hookRuns).toEqual<(HookRun & { runId?: string })[]>([
      { hookId: 'h-pre-1', hookName: 'PreToolUse:Bash', hookEvent: 'PreToolUse', status: 'running', runId: RUN },
    ])
  })

  it('동일 hookId response(outcome:success, exit_code:0) → 같은 엔트리 status:success·exitCode:0 갱신(개수 불변)', () => {
    const base = makeInitialState()
    const afterStarted = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-pre-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const afterResponse = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-pre-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        exitCode: 0,
        outcome: 'success',
      })
    ) as P05State
    // RED: hook_lifecycle case 없음 → hookRuns undefined → 아래 단정 실패.
    // 페어링 upsert: 새 엔트리를 만들지 않고(개수 1 유지) 기존 running 엔트리를 갱신.
    expect(afterResponse.hookRuns).toHaveLength(1)
    const entry = afterResponse.hookRuns?.[0]
    expect(entry?.status).toBe('success')
    expect(entry?.exitCode).toBe(0)
  })

  it('response outcome:error → 같은 엔트리 status:error 갱신', () => {
    const base = makeInitialState()
    const afterStarted = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-stop-1',
        hookName: 'Stop',
        hookEvent: 'Stop',
      })
    )
    const afterResponse = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-stop-1',
        hookName: 'Stop',
        hookEvent: 'Stop',
        exitCode: 2,
        outcome: 'error',
      })
    ) as P05State
    // RED: hook_lifecycle case 없음 → hookRuns undefined.
    expect(afterResponse.hookRuns).toHaveLength(1)
    expect(afterResponse.hookRuns?.[0]?.status).toBe('error')
  })
})

// ── informational → thread 인라인 item ────────────────────────────────────────────

describe('gap1-p05 reducer — informational → thread 인라인 item', () => {
  it('informational 수신 → thread에 {kind:informational, content, level} 1개 추가(seq++, id 접두 inf)', () => {
    const base = makeInitialState()
    const beforeLen = base.thread.length
    const next = applyAgentEvent(
      base,
      payload({
        type: 'informational',
        content: 'UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로',
        level: 'warning',
      })
    )
    // RED: informational case 없음 → thread 불변, seq 불변.
    expect(next.thread.length).toBe(beforeLen + 1)
    expect(next.seq).toBe(base.seq + 1)
    const item = next.thread.find((it) => (it as ThreadShape).kind === 'informational') as ThreadShape | undefined
    expect(item).toBeDefined()
    expect(item?.content).toBe('UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로')
    expect(item?.level).toBe('warning')
    expect(item?.id.startsWith('inf')).toBe(true)
  })

  it('informational preventContinuation:true → thread item에 그대로 실린다', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'informational',
        content: 'Stop 훅이 계속 진행을 거부했습니다',
        level: 'notice',
        preventContinuation: true,
      })
    )
    // RED: informational case 없음 → 매칭 item 없음.
    const item = next.thread.find((it) => (it as ThreadShape).kind === 'informational') as ThreadShape | undefined
    expect(item?.preventContinuation).toBe(true)
  })
})

// ── permission_denied → thread 인라인 item ────────────────────────────────────────

describe('gap1-p05 reducer — permission_denied → thread 인라인 item', () => {
  it('permission_denied 수신 → thread에 {kind:permission-denied, toolName, decisionReasonType, decisionReason} 1개 추가(seq++, id 접두 pd)', () => {
    const base = makeInitialState()
    const beforeLen = base.thread.length
    const next = applyAgentEvent(
      base,
      payload({
        type: 'permission_denied',
        toolName: 'Bash',
        decisionReasonType: 'rule',
        decisionReason: 'deny 규칙에 의해 차단: Bash(rm:*)',
      })
    )
    // RED: permission_denied case 없음 → thread 불변, seq 불변.
    expect(next.thread.length).toBe(beforeLen + 1)
    expect(next.seq).toBe(base.seq + 1)
    const item = next.thread.find((it) => (it as ThreadShape).kind === 'permission-denied') as ThreadShape | undefined
    expect(item).toBeDefined()
    expect(item?.toolName).toBe('Bash')
    expect(item?.decisionReasonType).toBe('rule')
    expect(item?.decisionReason).toBe('deny 규칙에 의해 차단: Bash(rm:*)')
    expect(item?.id.startsWith('pd')).toBe(true)
  })
})

// ── 회귀 안전망(reviewer 🟡①): cockpit.ts handleHookLifecycle 미커버 3경로 ─────────────
//
// GAP1 P05 후속 — 기존 스위트는 started/response 페어링·informational/permission_denied만
// 커버했다. 아래 3 describe는 handleHookLifecycle의 나머지 3경로(cap 트리밍·response 방어
// append·progress 병합)를 못박아 회귀를 잡는다. 이미 구현됨(GREEN 예상) — 실측 거동을
// cockpit.ts에서 확인 후 그 거동에 맞춰 단정한다(테스트가 구현을 못박는다).

// ── (1) cap 200 트리밍: 오래된 것부터 드롭 ─────────────────────────────────────────────

describe('gap1-p05 reducer — hook_lifecycle cap 200 트리밍(오래된 것 드롭)', () => {
  it('서로 다른 hookId started 201건 순차 apply → hookRuns.length === 200(상한 유지)', () => {
    let st: AppState = makeInitialState()
    for (let i = 1; i <= 201; i++) {
      st = applyAgentEvent(
        st,
        payload({
          type: 'hook_lifecycle',
          phase: 'started',
          hookId: `h-${i}`,
          hookName: 'PreToolUse:Bash',
          hookEvent: 'PreToolUse',
        })
      )
    }
    const runs = (st as P05State).hookRuns
    // 실측: nextRuns.length(201) > CAP(200) → slice(201-200)=slice(1) → 인덱스 0 드롭.
    expect(runs).toHaveLength(200)
  })

  it('201건째 초과 시 가장 오래된 엔트리(첫 hookId)부터 드롭 · 마지막 hookId는 잔존', () => {
    let st: AppState = makeInitialState()
    for (let i = 1; i <= 201; i++) {
      st = applyAgentEvent(
        st,
        payload({
          type: 'hook_lifecycle',
          phase: 'started',
          hookId: `h-${i}`,
          hookName: 'PreToolUse:Bash',
          hookEvent: 'PreToolUse',
        })
      )
    }
    const runs = (st as P05State).hookRuns ?? []
    // 가장 오래된 것(첫 apply한 h-1)이 밀려나야 한다.
    expect(runs.find((r) => r.hookId === 'h-1')).toBeUndefined()
    // 마지막으로 apply한 h-201은 남아야 한다.
    expect(runs.find((r) => r.hookId === 'h-201')).toBeDefined()
    // 두 번째(h-2)가 새 head가 된다(FIFO 드롭 확인).
    expect(runs[0]?.hookId).toBe('h-2')
    expect(runs[runs.length - 1]?.hookId).toBe('h-201')
  })
})

// ── (2) response 방어적 append: 매칭 started 없어도 기록 보존 ───────────────────────────

describe('gap1-p05 reducer — hook_lifecycle response 방어적 append(started 유실)', () => {
  it('매칭 started 없는 response(outcome:success, exit_code:0) → 1건 append · status:success(유실 아님)', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-orphan-ok',
        hookName: 'PostToolUse:Bash',
        hookEvent: 'PostToolUse',
        exitCode: 0,
        outcome: 'success',
      })
    ) as P05State
    // 실측: idx === -1 → 방어적 append(페어링 실패해도 기록 보존).
    expect(next.hookRuns).toHaveLength(1)
    const entry = next.hookRuns?.[0]
    expect(entry?.hookId).toBe('h-orphan-ok')
    expect(entry?.status).toBe('success')
    expect(entry?.exitCode).toBe(0)
  })

  it('매칭 started 없는 response(outcome:error) → append 엔트리 status:error로 세팅', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-orphan-err',
        hookName: 'Stop',
        hookEvent: 'Stop',
        exitCode: 2,
        outcome: 'error',
        stderr: '차단 사유',
      })
    ) as P05State
    // 실측: outcome 그대로(?? 'success' 폴백 안 탐) · stderr도 실림.
    expect(next.hookRuns).toHaveLength(1)
    const entry = next.hookRuns?.[0]
    expect(entry?.status).toBe('error')
    expect(entry?.stderr).toBe('차단 사유')
  })
})

// ── (3) progress 병합: stdout/stderr/output만 병합 · status running 유지 ─────────────────

describe('gap1-p05 reducer — hook_lifecycle progress 병합(status running 유지)', () => {
  it('started(running) 후 동일 hookId progress(stdout) → stdout 병합 · status는 running 유지', () => {
    const base = makeInitialState()
    const afterStarted = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-prog',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const afterProgress = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'progress',
        hookId: 'h-prog',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        stdout: 'chunk-1',
        output: 'partial-output',
      })
    ) as P05State
    // 실측: 개수 불변(1) · stdout/output 병합 · status는 여전히 running(response 아님).
    expect(afterProgress.hookRuns).toHaveLength(1)
    const entry = afterProgress.hookRuns?.[0]
    expect(entry?.stdout).toBe('chunk-1')
    expect(entry?.output).toBe('partial-output')
    expect(entry?.status).toBe('running')
  })

  it('매칭 started 없는 progress → no-op(새 엔트리 생성 0 · started가 진실 원천)', () => {
    const base = makeInitialState()
    const next = applyAgentEvent(
      base,
      payload({
        type: 'hook_lifecycle',
        phase: 'progress',
        hookId: 'h-no-started',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        stdout: 'orphan-chunk',
      })
    ) as P05State
    // 실측: idx === -1 → return state → hookRuns 불변(빈 배열 유지).
    expect(next.hookRuns).toEqual([])
  })
})
