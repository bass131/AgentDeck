/**
 * gap1-p07-plan-approval-store.test.ts — GAP1 P07 store 전달 RED(TDD 선행).
 *
 * 대상(R only, qa는 앱 소스 미편집):
 *   02.Source/renderer/src/store/reducer/permission.ts (handlePermissionRequest)
 *   02.Source/renderer/src/store/reducer/types.ts (PendingPermission.planReview?)
 *
 * 계약(interface-of-record — 구현 renderer Worker가 여기 맞춘다):
 *   - permission_request 이벤트에 planReview가 있으면 handlePermissionRequest가 이를
 *     pendingPermission.planReview로 전달한다(state.pendingPermission.planReview === event.planReview).
 *   - planReview 없는 이벤트 → pendingPermission.planReview 미부여(회귀 0).
 *
 * TDD 상태: RED. 현행 handlePermissionRequest는 {runId,requestId,toolName,summary}만 세팅해
 *   planReview를 흘리지 않는다. PendingPermission 타입에 planReview? 필드가 아직 없어
 *   타입 에러(RED)가 날 수 있음 — 그것도 정상(구현이 필드 추가).
 *
 * Node 환경(순수 리듀서) — window.api 불필요.
 */
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02.Source/renderer/src/store/reducer'

const PLAN_MD =
  '# Plan: Print Hello\n\n## Context\nThe user wants to print "hello".\n\n## Implementation\n1. Output "hello"\n'

describe('GAP1 P07 — reducer: permission_request planReview 전달 (RED)', () => {
  it('planReview 있는 permission_request → pendingPermission.planReview === event.planReview', () => {
    const s0 = makeInitialState()
    const planReview = {
      plan: PLAN_MD,
      planFilePath: 'C:\\Users\\bass1\\.claude\\plans\\plan.md',
    }
    const s1 = applyAgentEvent(s0, {
      runId: 'run-p07',
      event: {
        type: 'permission_request',
        requestId: 'req-p07',
        toolName: 'ExitPlanMode',
        summary: 'ExitPlanMode 실행',
        planReview,
      },
    })

    expect(s1.pendingPermission).not.toBeNull()
    // 현행 handlePermissionRequest는 planReview를 전달하지 않음 → undefined → RED.
    expect(s1.pendingPermission?.planReview).toEqual(planReview)
    // 참조 그대로 전달(구조화 재노출 — 복제 요구 없음).
    expect(s1.pendingPermission?.planReview?.plan).toBe(PLAN_MD)
  })

  it('planReview 없는 permission_request → pendingPermission.planReview 미부여(회귀 0)', () => {
    // 회귀 가드(구현 후에도 green 유지) — plan 전달 로직이 비-plan 요청을 오염시키지 않아야 한다.
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'run-bash',
      event: {
        type: 'permission_request',
        requestId: 'req-bash',
        toolName: 'Bash',
        summary: '명령 실행: ls',
      },
    })
    expect(s1.pendingPermission?.planReview).toBeUndefined()
    // 기존 필드는 정상 세팅(회귀 0).
    expect(s1.pendingPermission?.toolName).toBe('Bash')
    expect(s1.pendingPermission?.summary).toBe('명령 실행: ls')
  })
})
