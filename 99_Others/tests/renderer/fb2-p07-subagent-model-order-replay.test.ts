/**
 * fb2-p07-subagent-model-order-replay.test.ts — 라이브 실측 이벤트 순서를 리듀서에 재생.
 *
 * FB2 P07 사후진단(agent-backend): 라이브 SDK 프로브(agents/fb2-p07-subagent-live-probe.test.ts)로
 * 실측한 실제 이벤트 발생 순서는 합성 픽스처의 설계 가정과 달랐다:
 *   1. subagent 생성(Task/Agent tool_use) — status:'running', model 없음.
 *   2. tool_result(Task/Agent 최상위 id) — reducer가 subagent를 status:'done'으로 전이(F-E).
 *   3. subagent model-only update(서브에이전트 자신의 첫 assistant 메시지, parent_tool_use_id) —
 *      원래 설계는 "tool_result보다 항상 먼저 온다"고 가정하고 status:'running'(생성 시점
 *      스냅샷)을 그대로 echo했다 — 라이브에서 순서가 반대라 이미 'done'인 카드를 'running'으로
 *      되돌리는 회귀였다(eventNormalizer.ts 수정으로 해결 — tool_result 처리 시점에 스냅샷의
 *      status를 'done'으로 갱신해둔다).
 *
 * 이 테스트는 라이브 실측 순서(1)→(2)→(3)를 리듀서(applyAgentEvent)에 그대로 재생해 fix 이후
 * 최종 state가 회귀 없이 model+status 둘 다 올바른지 잠근다(렌더러 reducer 자체는 미변경 —
 * eventNormalizer가 보내는 값만 정확해지면 기존 병합 로직으로 충분함을 검증).
 */
import { describe, it, expect } from 'vitest'
import { makeInitialState, applyAgentEvent } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

describe('FB2 P07 사후진단: 라이브 실측 순서 재생 — subagent 완료 후 도착하는 model update', () => {
  it('tool_result(완료)가 model-update보다 먼저 와도 최종 state는 model+status 둘 다 정확하다', () => {
    let state = makeInitialState()
    const runId = 'r1'
    const subId = 'toolu_agent1'

    // 1) subagent 생성 (claude-stream.ts Task/Agent 최상위 tool_use 정규화 결과)
    state = applyAgentEvent(state, {
      runId,
      event: {
        type: 'subagent',
        subagent: { id: subId, name: 'general-purpose', role: 'Reply with exactly one word', status: 'running', tools: [] },
      },
    } as AgentEventPayload)

    // 2) tool_result — 라이브 실측: 서브에이전트 자신의 assistant 메시지보다 *먼저* 도착.
    state = applyAgentEvent(state, {
      runId,
      event: { type: 'tool_result', id: subId, ok: true, output: 'OK' },
    } as AgentEventPayload)

    const afterResult = state.subagents.find((sa) => sa.id === subId)
    // F-E: tool_result 매칭 직후 done + activity 세팅 확인(회귀 기준선).
    expect(afterResult?.status).toBe('done')
    expect(afterResult?.activity).toBeTruthy()

    // 3) subagent model-only update — eventNormalizer 2.5단계 산출물.
    // fix 이후: eventNormalizer가 tool_result 처리 시점에 스냅샷 status를 'done'으로
    // 갱신해두므로, 늦게 도착하는 이 update도 status:'done'을 echo한다(역행 없음).
    state = applyAgentEvent(state, {
      runId,
      event: {
        type: 'subagent',
        subagent: {
          id: subId,
          name: 'general-purpose',
          role: 'Reply with exactly one word',
          status: 'done',
          tools: [],
          model: 'claude-haiku-4-5-20251001',
        },
      },
    } as AgentEventPayload)

    const final = state.subagents.find((sa) => sa.id === subId)
    console.log('[FB2-P07-replay] 최종 subagent state:', JSON.stringify(final, null, 2))

    // model 필드 자체는 살아남는가?
    expect(final?.model).toBe('claude-haiku-4-5-20251001')

    // 회귀 방지 확인: status가 'done'으로 유지되는가(fix 전에는 'running'으로 역행했다).
    expect(final?.status).toBe('done')
  })
})
