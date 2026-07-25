/**
 * m4-4-permission-store.test.ts — Phase 24c store/reducer 단위 테스트 (TDD 선행).
 *
 * 검증 대상 (실패→구현 순서):
 *   - makeInitialState → pendingPermission: null
 *   - permission_request 이벤트(+runId envelope) → pendingPermission 세팅
 *   - done 이벤트 → pendingPermission null
 *   - error 이벤트 → pendingPermission null
 *   - respondPermission('allow') → permissionRespond invoke 인자 정확 + pending null
 *   - respondPermission('allow_always') → 동일
 *   - respondPermission('deny') → 동일
 *   - pendingPermission null 상태에서 respondPermission → no-op (window.api 미호출)
 *   - selectPendingPermission 셀렉터
 *   - 순수함수 검증 (freeze)
 *
 * Node 환경(window.api 불필요) — 순수 리듀서 테스트 + store 셀렉터 테스트.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

const runId = 'run-24c'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

// ── 리듀서 단위 테스트 ─────────────────────────────────────────────────────────

describe('Phase 24c — store reducer: pendingPermission', () => {

  it('makeInitialState: pendingPermission=null', () => {
    const s = makeInitialState()
    expect(s.pendingPermission).toBeNull()
  })

  it('permission_request 이벤트 → pendingPermission 세팅(runId 포함)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'run-perm-1',
      event: {
        type: 'permission_request',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: 'rm -rf node_modules 실행',
      },
    })
    expect(s1.pendingPermission).not.toBeNull()
    expect(s1.pendingPermission?.runId).toBe('run-perm-1')
    expect(s1.pendingPermission?.requestId).toBe('req-1')
    expect(s1.pendingPermission?.toolName).toBe('Bash')
    expect(s1.pendingPermission?.summary).toBe('rm -rf node_modules 실행')
  })

  it('permission_request 이벤트: runId는 payload envelope에서 캡처', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'envelope-run-id',
      event: {
        type: 'permission_request',
        requestId: 'req-2',
        toolName: 'Write',
        summary: '파일 쓰기',
      },
    })
    // pendingPermission.runId는 event 페이로드가 아닌 envelope의 runId
    expect(s1.pendingPermission?.runId).toBe('envelope-run-id')
  })

  it('done 이벤트 → pendingPermission null(run 완료 시 정리)', () => {
    const s0 = {
      ...makeInitialState(),
      pendingPermission: {
        runId: 'run-perm-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
    }
    const s1 = applyAgentEvent(s0, payload({ type: 'done' }))
    expect(s1.pendingPermission).toBeNull()
  })

  it('error 이벤트 → pendingPermission null(오류 시 정리)', () => {
    const s0 = {
      ...makeInitialState(),
      pendingPermission: {
        runId: 'run-perm-1',
        requestId: 'req-1',
        toolName: 'Bash',
        summary: '실행',
      },
    }
    const s1 = applyAgentEvent(s0, payload({ type: 'error', message: '오류' }))
    expect(s1.pendingPermission).toBeNull()
  })

  it('permission_request 연속 수신 → 마지막 요청으로 덮어씀', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'run-1',
      event: { type: 'permission_request', requestId: 'req-1', toolName: 'Bash', summary: '첫 번째' },
    })
    const s2 = applyAgentEvent(s1, {
      runId: 'run-1',
      event: { type: 'permission_request', requestId: 'req-2', toolName: 'Write', summary: '두 번째' },
    })
    expect(s2.pendingPermission?.requestId).toBe('req-2')
    expect(s2.pendingPermission?.toolName).toBe('Write')
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (freeze — permission_request)', () => {
    const s0 = Object.freeze(makeInitialState())
    const s1 = applyAgentEvent(s0 as ReturnType<typeof makeInitialState>, {
      runId: 'run-x',
      event: { type: 'permission_request', requestId: 'r1', toolName: 'Bash', summary: 'test' },
    })
    expect(s1).not.toBe(s0)
    expect(s0.pendingPermission).toBeNull()
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (freeze — done으로 pending null)', () => {
    const base = {
      ...makeInitialState(),
      pendingPermission: { runId: 'r', requestId: 'rq', toolName: 'T', summary: 's' },
    }
    const frozen = Object.freeze(base)
    const s1 = applyAgentEvent(frozen as ReturnType<typeof makeInitialState>, payload({ type: 'done' }))
    expect(s1.pendingPermission).toBeNull()
    // 원본 frozen은 변경 없음
    expect(frozen.pendingPermission).not.toBeNull()
  })
})

// ── store 액션 + 셀렉터 테스트 ─────────────────────────────────────────────────

describe('Phase 24c — appStore: respondPermission 액션 + selectPendingPermission 셀렉터', () => {
  let mockPermissionRespond: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockPermissionRespond = vi.fn().mockResolvedValue({ ok: true })
    // window.api mock — permissionRespond만 필요
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          permissionRespond: mockPermissionRespond,
          conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
          conversationSave: vi.fn().mockResolvedValue({ id: 'cv' }),
          agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
          agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
          onAgentEvent: vi.fn().mockReturnValue(() => {}),
          listFiles: vi.fn().mockResolvedValue({ files: [] }),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  it('selectPendingPermission: 초기값 null', async () => {
    const { useAppStore, selectPendingPermission } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ pendingPermission: null } as Parameters<typeof useAppStore.setState>[0])
    const result = selectPendingPermission(useAppStore.getState())
    expect(result).toBeNull()
  })

  it('selectPendingPermission: pendingPermission 있을 때 값 반환', async () => {
    const { useAppStore, selectPendingPermission } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'r1', requestId: 'rq1', toolName: 'Bash', summary: '명령 실행' }
    useAppStore.setState({ pendingPermission: pending } as Parameters<typeof useAppStore.setState>[0])
    const result = selectPendingPermission(useAppStore.getState())
    expect(result).toEqual(pending)
  })

  it('respondPermission("allow") → permissionRespond IPC 호출 인자 정확', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-001', requestId: 'req-abc', toolName: 'Bash', summary: 'ls -la' }
    useAppStore.setState({ pendingPermission: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondPermission('allow')

    expect(mockPermissionRespond).toHaveBeenCalledTimes(1)
    expect(mockPermissionRespond).toHaveBeenCalledWith({
      runId: 'run-001',
      requestId: 'req-abc',
      behavior: 'allow',
    })
  })

  it('respondPermission("allow_always") → behavior="allow_always" 인자', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-002', requestId: 'req-xyz', toolName: 'Write', summary: '파일 생성' }
    useAppStore.setState({ pendingPermission: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondPermission('allow_always')

    expect(mockPermissionRespond).toHaveBeenCalledWith({
      runId: 'run-002',
      requestId: 'req-xyz',
      behavior: 'allow_always',
    })
  })

  it('respondPermission("deny") → behavior="deny" 인자', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-003', requestId: 'req-deny', toolName: 'Bash', summary: 'rm 파일' }
    useAppStore.setState({ pendingPermission: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondPermission('deny')

    expect(mockPermissionRespond).toHaveBeenCalledWith({
      runId: 'run-003',
      requestId: 'req-deny',
      behavior: 'deny',
    })
  })

  it('respondPermission 후 pendingPermission=null(모달 닫힘)', async () => {
    const { useAppStore, selectPendingPermission } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-004', requestId: 'req-4', toolName: 'Bash', summary: '실행' }
    useAppStore.setState({ pendingPermission: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondPermission('allow')

    expect(selectPendingPermission(useAppStore.getState())).toBeNull()
  })

  it('respondPermission IPC 실패해도 pendingPermission=null(방어적 모달 닫힘)', async () => {
    mockPermissionRespond.mockRejectedValue(new Error('IPC 오류'))
    const { useAppStore, selectPendingPermission } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-005', requestId: 'req-5', toolName: 'Bash', summary: '실행' }
    useAppStore.setState({ pendingPermission: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondPermission('deny')

    // IPC 실패해도 모달은 닫혀야 함 (방어 정책)
    expect(selectPendingPermission(useAppStore.getState())).toBeNull()
  })

  it('pendingPermission=null 상태에서 respondPermission → window.api 미호출(no-op)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ pendingPermission: null } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondPermission('allow')

    expect(mockPermissionRespond).not.toHaveBeenCalled()
  })

  it('subscribeAgentEvents: permission_request 수신 시 pendingPermission에 runId 포함 세팅', async () => {
    const { useAppStore, selectPendingPermission } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      pendingPermission: null,
      // P3a: subscription 가드가 payload.runId === currentRunId일 때만 반영 — 활성 run을 미리 세팅.
      currentRunId: 'run-live-1',
    } as Parameters<typeof useAppStore.setState>[0])

    // onAgentEvent 콜백 캡처
    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    mockPermissionRespond.mockResolvedValue({ ok: true })
    ;(window.api.onAgentEvent as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (payload: AgentEventPayload) => void) => {
        capturedCallback = cb
        return () => {}
      }
    )

    // subscribeAgentEvents 호출
    const unsub = useAppStore.getState().subscribeAgentEvents()

    // permission_request 이벤트 시뮬레이션
    capturedCallback!({
      runId: 'run-live-1',
      event: {
        type: 'permission_request',
        requestId: 'req-live-1',
        toolName: 'Bash',
        summary: '커맨드 실행',
      },
    })

    const pending = selectPendingPermission(useAppStore.getState())
    expect(pending).not.toBeNull()
    expect(pending?.runId).toBe('run-live-1')
    expect(pending?.requestId).toBe('req-live-1')
    expect(pending?.toolName).toBe('Bash')

    unsub()
  })

  it('subscribeAgentEvents: done 이벤트 후 pendingPermission null', async () => {
    const { useAppStore, selectPendingPermission } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      pendingPermission: { runId: 'r', requestId: 'rq', toolName: 'T', summary: 's' },
      // P3a: done 이벤트(runId 'r')가 활성 run으로 인식되도록 currentRunId를 맞춘다.
      currentRunId: 'r',
    } as Parameters<typeof useAppStore.setState>[0])

    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api.onAgentEvent as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (payload: AgentEventPayload) => void) => {
        capturedCallback = cb
        return () => {}
      }
    )

    const unsub = useAppStore.getState().subscribeAgentEvents()
    capturedCallback!({ runId: 'r', event: { type: 'done' } })

    expect(selectPendingPermission(useAppStore.getState())).toBeNull()
    unsub()
  })
})
