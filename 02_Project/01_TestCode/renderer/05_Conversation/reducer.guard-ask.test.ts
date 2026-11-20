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

  it('escalated 표지는 사유가 없어도 pendingPermission까지 간다 (fail-closed 카드)', () => {
    const s1 = applyAgentEvent(makeInitialState(), {
      runId: 'run-g3',
      event: {
        type: 'permission_request',
        requestId: 'perm-3',
        toolName: 'Bash',
        summary: '명령 실행: gh release --help',
        escalated: true,
      },
    })
    expect(s1.pendingPermission?.escalated).toBe(true)
    expect(s1.pendingPermission?.askReason).toBeUndefined()
  })

  it('askReason 없는 permission_request → pendingPermission.askReason 부재', () => {
    const s1 = applyAgentEvent(makeInitialState(), {
      runId: 'run-g3',
      event: { type: 'permission_request', requestId: 'perm-2', toolName: 'Bash', summary: '명령 실행: ls' },
    })
    expect(s1.pendingPermission).not.toBeNull()
    expect(s1.pendingPermission?.askReason).toBeUndefined()
    expect(s1.pendingPermission?.escalated).toBeUndefined()
  })
})

// M11 G2 — M06 Backlog 12. 먼저 온 요청을 보이고 뒤 요청은 줄을 선다.
describe('reducer — 권한 요청 줄', () => {
  const req = (requestId: string) => ({
    runId: 'run-q',
    event: { type: 'permission_request' as const, requestId, toolName: 'Bash', summary: `명령 실행: ${requestId}` },
  })

  it('두 번째 요청은 첫 번째를 덮지 않고 줄을 서며, 지우면 다음이 올라온다', async () => {
    const { runReducer } = await import('@renderer/03_Agent/state/runReducer')
    const s2 = applyAgentEvent(applyAgentEvent(makeInitialState(), req('p1')), req('p2'))
    expect(s2.pendingPermission?.requestId).toBe('p1')
    expect(s2.pendingPermission?.behind?.map((p) => p.requestId)).toEqual(['p2'])
    const s3 = runReducer({ ...s2, replMode: false, queue: [] }, { type: 'CLEAR_PENDING_PERMISSION' })
    expect(s3.pendingPermission?.requestId).toBe('p2')
    expect(s3.pendingPermission?.behind ?? []).toEqual([])
    expect(runReducer(s3, { type: 'CLEAR_PENDING_PERMISSION' }).pendingPermission).toBeNull()
  })

  it('같은 요청 id가 다시 오면 줄을 늘리지 않는다', () => {
    const s = applyAgentEvent(applyAgentEvent(makeInitialState(), req('p1')), req('p1'))
    expect(s.pendingPermission?.requestId).toBe('p1')
    expect(s.pendingPermission?.behind ?? []).toEqual([])
    const s2 = applyAgentEvent(applyAgentEvent(s, req('p2')), req('p2'))
    expect(s2.pendingPermission?.behind?.map((p) => p.requestId)).toEqual(['p2'])
  })

  it('run이 끝나면 줄까지 함께 비운다', () => {
    const s = applyAgentEvent(applyAgentEvent(makeInitialState(), req('p1')), req('p2'))
    const done = applyAgentEvent(s, { runId: 'run-q', event: { type: 'done' } })
    expect(done.pendingPermission).toBeNull()
  })
})
