// M06 G3 — 가드 질문 카드의 사유(askReason)가 reducer를 지나 pendingPermission까지 간다.
import { describe, it, expect } from 'vitest'
import { applyAgentEvent, makeInitialState } from '@renderer/05_Conversation/state/reducer'

const GUARD_REASON =
  '비가역 작업 — master가 보이는 git push (master 진입 시도). 승인하면 실행되고, 거부하면 실행되지 않습니다.'

describe('reducer — permission_request askReason 전달', () => {
  it('askReason 있는 permission_request → pendingPermission.askReason === event.askReason', () => {
    const s1 = applyAgentEvent(makeInitialState(), {
      runId: 'run-g3',
      event: {
        type: 'permission_request',
        requestId: 'perm-1',
        toolName: 'Bash',
        summary: '명령 실행: git push origin HEAD:master',
        askReason: GUARD_REASON,
      },
    })
    expect(s1.pendingPermission?.askReason).toBe(GUARD_REASON)
    expect(s1.pendingPermission?.summary).toBe('명령 실행: git push origin HEAD:master')
  })

  it('askReason 없는 permission_request → pendingPermission.askReason 부재', () => {
    const s1 = applyAgentEvent(makeInitialState(), {
      runId: 'run-g3',
      event: { type: 'permission_request', requestId: 'perm-2', toolName: 'Bash', summary: '명령 실행: ls' },
    })
    expect(s1.pendingPermission).not.toBeNull()
    expect(s1.pendingPermission?.askReason).toBeUndefined()
  })
})
