/**
 * gap1-p16-s3-hookruns-runid.test.ts — GAP1 P16 계열③ hookRuns runId 배선 (TDD RED)
 *
 * 목표: hook_lifecycle 이벤트가 속한 실행(runId)을 HookRun에 저장해, 생명주기 hookRuns를
 * "어느 턴/런에서 발생한 훅인가"로 연결할 수 있게 한다(빨간 배지의 status==='error' 연결
 * 및 턴 귀속의 원천). runId는 이미 AgentEventPayload 엔벨로프(agentPayload.runId,
 * reducer.ts:214에서 다른 핸들러가 소비 중)에 존재하나, handleHookLifecycle 호출부
 * (reducer.ts:234)가 time만 넘기고 runId를 전달하지 않아 미배선 상태다.
 *
 * ── 확정 계약(renderer 내부만 — shared/preload/main 무접촉) ────────────────────────
 *   1) HookRun 타입(reducer/types.ts) 확장: `runId?: string` additive optional 필드.
 *   2) handleHookLifecycle 시그니처 확장: (state, event, time?, runId?): AppState.
 *   3) reducer.ts:234 호출부: handleHookLifecycle(state, event, time, agentPayload.runId).
 *   4) started/response(방어 append)로 새 HookRun 엔트리 생성 시 runId를 실어야 한다.
 *      (started에서 실린 runId는 response 페어링 upsert에서도 보존.)
 *
 *   실경로 검증: applyAgentEvent(AgentEventPayload) → handleHookLifecycle.
 *   테스트는 renderer 내부 타입만 소비(shared 계약 무접촉 전제).
 *
 * ── 현재 RED 이유 ─────────────────────────────────────────────────────────────────
 *   HookRun에 runId 필드가 없고 reducer.ts:234가 runId를 넘기지 않는다 → 생성된 엔트리의
 *   runId는 undefined. 아래 runId 단정이 실패(RED). 배선 후 GREEN 전이.
 *   (HookRun에 runId가 아직 없어 타입상 읽을 수 없으므로 { runId?: string } 교차 캐스팅으로
 *    읽는다 — p05 P05State 확장 캐스팅 관례 계승. typecheck-green 유지.)
 *
 * 결정론: 순수 리듀서(fs/네트워크/타이머 0). nowMs 미전달(활동 스탬프 무영향).
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEvent } from '../../../02.Source/shared/agent-events'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const RUN = 'run-gap1-p16'

function payload(event: AgentEvent, runId: string = RUN): AgentEventPayload {
  return { runId, event }
}

/** HookRun을 runId 확장 shape로 읽기 위한 최소 뷰(HookRun에 아직 runId 없음 → 캐스팅). */
type HookRunWithRun = { hookId: string; status: string; runId?: string }

describe('gap1-p16 계열③ — hook_lifecycle started runId 배선', () => {
  it('started(runId=RUN) → 생성된 HookRun에 runId===RUN 저장', () => {
    const next = applyAgentEvent(
      makeInitialState(),
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-1',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const entry = next.hookRuns?.[0] as HookRunWithRun | undefined
    // 엔트리 자체는 P05 배선으로 이미 생성됨(setup 유효) — 실패 지점은 runId 하나로 격리.
    expect(entry?.hookId).toBe('h-1')
    // RED: reducer.ts:234가 runId 미전달 → entry.runId === undefined.
    expect(entry?.runId).toBe(RUN)
  })
})

describe('gap1-p16 계열③ — started→response 페어링에서 runId 보존', () => {
  it('started(RUN) 후 동일 hookId response(RUN) → 페어링된 엔트리가 runId===RUN 유지(개수 1)', () => {
    const afterStarted = applyAgentEvent(
      makeInitialState(),
      payload({
        type: 'hook_lifecycle',
        phase: 'started',
        hookId: 'h-pair',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
      })
    )
    const afterResponse = applyAgentEvent(
      afterStarted,
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-pair',
        hookName: 'PreToolUse:Bash',
        hookEvent: 'PreToolUse',
        exitCode: 0,
        outcome: 'success',
      })
    )
    expect(afterResponse.hookRuns).toHaveLength(1)
    const entry = afterResponse.hookRuns?.[0] as HookRunWithRun | undefined
    expect(entry?.status).toBe('success')
    // RED: runId 미배선 → undefined.
    expect(entry?.runId).toBe(RUN)
  })
})

describe('gap1-p16 계열③ — response 방어적 append에도 runId 배선', () => {
  it('매칭 started 없는 response(RUN) → 방어 append 엔트리에도 runId===RUN', () => {
    const next = applyAgentEvent(
      makeInitialState(),
      payload({
        type: 'hook_lifecycle',
        phase: 'response',
        hookId: 'h-orphan',
        hookName: 'Stop',
        hookEvent: 'Stop',
        exitCode: 2,
        outcome: 'error',
      })
    )
    expect(next.hookRuns).toHaveLength(1)
    const entry = next.hookRuns?.[0] as HookRunWithRun | undefined
    expect(entry?.status).toBe('error')
    // RED: runId 미배선 → undefined.
    expect(entry?.runId).toBe(RUN)
  })
})
