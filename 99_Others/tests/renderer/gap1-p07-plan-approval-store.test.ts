import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '../../../02_Source/renderer/src/store/reducer'

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
    expect(s1.pendingPermission?.planReview).toEqual(planReview)
    expect(s1.pendingPermission?.planReview?.plan).toBe(PLAN_MD)
  })

  it('planReview 없는 permission_request → pendingPermission.planReview 미부여(회귀 0)', () => {
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
    expect(s1.pendingPermission?.toolName).toBe('Bash')
    expect(s1.pendingPermission?.summary).toBe('명령 실행: ls')
  })
})
