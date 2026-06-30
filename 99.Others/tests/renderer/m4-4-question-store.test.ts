/**
 * m4-4-question-store.test.ts — Phase 24d store/reducer 단위 테스트 (TDD 선행).
 *
 * 검증 대상 (실패→구현 순서):
 *   - makeInitialState → pendingQuestion: null
 *   - question_request 이벤트(+runId envelope) → pendingQuestion 세팅
 *   - done 이벤트 → pendingQuestion null
 *   - error 이벤트 → pendingQuestion null
 *   - respondQuestion(answers) → questionRespond invoke 인자 정확 + pending null
 *   - respondQuestion(null) → answers=null invoke
 *   - pendingQuestion null 상태에서 respondQuestion → no-op (window.api 미호출)
 *   - selectPendingQuestion 셀렉터
 *   - 순수함수 검증 (freeze)
 *   - 회귀: pendingPermission 공존
 *
 * Node 환경(window.api 불필요) — 순수 리듀서 테스트 + store 셀렉터 테스트.
 * 24c permission 테스트와 동일 패턴.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  applyAgentEvent,
  makeInitialState,
} from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'
import type { AgentQuestion } from '../../../02.Source/shared/agent-events'

const runId = 'run-24d'

function payload(event: AgentEventPayload['event']): AgentEventPayload {
  return { runId, event }
}

const SAMPLE_QUESTIONS: AgentQuestion[] = [
  {
    header: '작업 범위',
    question: '어떤 파일을 수정할까요?',
    options: [
      { label: 'src/main.ts', description: '메인 프로세스' },
      { label: 'src/renderer/index.ts', description: '렌더러' },
    ],
    multiSelect: false,
  },
]

// ── 리듀서 단위 테스트 ─────────────────────────────────────────────────────────

describe('Phase 24d — store reducer: pendingQuestion', () => {

  it('makeInitialState: pendingQuestion=null', () => {
    const s = makeInitialState()
    expect(s.pendingQuestion).toBeNull()
  })

  it('question_request 이벤트 → pendingQuestion 세팅(runId 포함)', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'run-q-1',
      event: {
        type: 'question_request',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
    })
    expect(s1.pendingQuestion).not.toBeNull()
    expect(s1.pendingQuestion?.runId).toBe('run-q-1')
    expect(s1.pendingQuestion?.requestId).toBe('req-q-1')
    expect(s1.pendingQuestion?.questions).toEqual(SAMPLE_QUESTIONS)
  })

  it('question_request 이벤트: runId는 payload envelope에서 캡처', () => {
    const s0 = makeInitialState()
    const s1 = applyAgentEvent(s0, {
      runId: 'envelope-run-id',
      event: {
        type: 'question_request',
        requestId: 'req-q-2',
        questions: SAMPLE_QUESTIONS,
      },
    })
    expect(s1.pendingQuestion?.runId).toBe('envelope-run-id')
  })

  it('done 이벤트 → pendingQuestion null(run 완료 시 정리)', () => {
    const s0 = {
      ...makeInitialState(),
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
    }
    const s1 = applyAgentEvent(s0, payload({ type: 'done' }))
    expect(s1.pendingQuestion).toBeNull()
  })

  it('error 이벤트 → pendingQuestion null(오류 시 정리)', () => {
    const s0 = {
      ...makeInitialState(),
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
    }
    const s1 = applyAgentEvent(s0, payload({ type: 'error', message: '오류' }))
    expect(s1.pendingQuestion).toBeNull()
  })

  it('question_request 연속 수신 → 마지막 요청으로 덮어씀', () => {
    const s0 = makeInitialState()
    const q2: AgentQuestion[] = [
      { question: '두 번째 질문', options: [{ label: 'A' }] },
    ]
    const s1 = applyAgentEvent(s0, {
      runId: 'run-1',
      event: { type: 'question_request', requestId: 'req-1', questions: SAMPLE_QUESTIONS },
    })
    const s2 = applyAgentEvent(s1, {
      runId: 'run-1',
      event: { type: 'question_request', requestId: 'req-2', questions: q2 },
    })
    expect(s2.pendingQuestion?.requestId).toBe('req-2')
    expect(s2.pendingQuestion?.questions).toEqual(q2)
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (freeze — question_request)', () => {
    const s0 = Object.freeze(makeInitialState())
    const s1 = applyAgentEvent(s0 as ReturnType<typeof makeInitialState>, {
      runId: 'run-x',
      event: { type: 'question_request', requestId: 'r1', questions: SAMPLE_QUESTIONS },
    })
    expect(s1).not.toBe(s0)
    expect(s0.pendingQuestion).toBeNull()
  })

  it('리듀서는 원본 상태를 변경하지 않는다 (freeze — done으로 pending null)', () => {
    const base = {
      ...makeInitialState(),
      pendingQuestion: { runId: 'r', requestId: 'rq', questions: SAMPLE_QUESTIONS },
    }
    const frozen = Object.freeze(base)
    const s1 = applyAgentEvent(frozen as ReturnType<typeof makeInitialState>, payload({ type: 'done' }))
    expect(s1.pendingQuestion).toBeNull()
    expect(frozen.pendingQuestion).not.toBeNull()
  })

  it('[회귀] pendingPermission은 question_request 이벤트에 무영향', () => {
    const s0 = {
      ...makeInitialState(),
      pendingPermission: {
        runId: 'r', requestId: 'rq', toolName: 'Bash', summary: '실행',
      },
    }
    const s1 = applyAgentEvent(s0, {
      runId: 'run-x',
      event: { type: 'question_request', requestId: 'r1', questions: SAMPLE_QUESTIONS },
    })
    // question_request 수신해도 pendingPermission 미변경
    expect(s1.pendingPermission).not.toBeNull()
    expect(s1.pendingPermission?.toolName).toBe('Bash')
  })
})

// ── store 액션 + 셀렉터 테스트 ─────────────────────────────────────────────────

describe('Phase 24d — appStore: respondQuestion 액션 + selectPendingQuestion 셀렉터', () => {
  let mockQuestionRespond: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockQuestionRespond = vi.fn().mockResolvedValue({ ok: true })
    Object.defineProperty(globalThis, 'window', {
      value: {
        api: {
          questionRespond: mockQuestionRespond,
          permissionRespond: vi.fn().mockResolvedValue({ ok: true }),
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

  it('selectPendingQuestion: 초기값 null', async () => {
    const { useAppStore, selectPendingQuestion } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ pendingQuestion: null } as Parameters<typeof useAppStore.setState>[0])
    const result = selectPendingQuestion(useAppStore.getState())
    expect(result).toBeNull()
  })

  it('selectPendingQuestion: pendingQuestion 있을 때 값 반환', async () => {
    const { useAppStore, selectPendingQuestion } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'r1', requestId: 'rq1', questions: SAMPLE_QUESTIONS }
    useAppStore.setState({ pendingQuestion: pending } as Parameters<typeof useAppStore.setState>[0])
    const result = selectPendingQuestion(useAppStore.getState())
    expect(result).toEqual(pending)
  })

  it('respondQuestion(answers) → questionRespond IPC 호출 인자 정확', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-001', requestId: 'req-abc', questions: SAMPLE_QUESTIONS }
    useAppStore.setState({ pendingQuestion: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondQuestion([['src/main.ts']])

    expect(mockQuestionRespond).toHaveBeenCalledTimes(1)
    expect(mockQuestionRespond).toHaveBeenCalledWith({
      runId: 'run-001',
      requestId: 'req-abc',
      answers: [['src/main.ts']],
    })
  })

  it('respondQuestion(null) → answers=null로 invoke', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-002', requestId: 'req-xyz', questions: SAMPLE_QUESTIONS }
    useAppStore.setState({ pendingQuestion: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondQuestion(null)

    expect(mockQuestionRespond).toHaveBeenCalledWith({
      runId: 'run-002',
      requestId: 'req-xyz',
      answers: null,
    })
  })

  it('respondQuestion 후 pendingQuestion=null(모달 닫힘)', async () => {
    const { useAppStore, selectPendingQuestion } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-004', requestId: 'req-4', questions: SAMPLE_QUESTIONS }
    useAppStore.setState({ pendingQuestion: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondQuestion([['A']])

    expect(selectPendingQuestion(useAppStore.getState())).toBeNull()
  })

  it('respondQuestion IPC 실패해도 pendingQuestion=null(방어적 모달 닫힘)', async () => {
    mockQuestionRespond.mockRejectedValue(new Error('IPC 오류'))
    const { useAppStore, selectPendingQuestion } = await import('../../../02.Source/renderer/src/store/appStore')
    const pending = { runId: 'run-005', requestId: 'req-5', questions: SAMPLE_QUESTIONS }
    useAppStore.setState({ pendingQuestion: pending } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondQuestion(null)

    expect(selectPendingQuestion(useAppStore.getState())).toBeNull()
  })

  it('pendingQuestion=null 상태에서 respondQuestion → window.api 미호출(no-op)', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ pendingQuestion: null } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondQuestion([['A']])

    expect(mockQuestionRespond).not.toHaveBeenCalled()
  })

  it('subscribeAgentEvents: question_request 수신 시 pendingQuestion에 runId 포함 세팅', async () => {
    const { useAppStore, selectPendingQuestion } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({ pendingQuestion: null } as Parameters<typeof useAppStore.setState>[0])

    let capturedCallback: ((payload: AgentEventPayload) => void) | null = null
    ;(window.api.onAgentEvent as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (payload: AgentEventPayload) => void) => {
        capturedCallback = cb
        return () => {}
      }
    )

    const unsub = useAppStore.getState().subscribeAgentEvents()

    capturedCallback!({
      runId: 'run-live-q',
      event: {
        type: 'question_request',
        requestId: 'req-live-q',
        questions: SAMPLE_QUESTIONS,
      },
    })

    const pending = selectPendingQuestion(useAppStore.getState())
    expect(pending).not.toBeNull()
    expect(pending?.runId).toBe('run-live-q')
    expect(pending?.requestId).toBe('req-live-q')
    expect(pending?.questions).toEqual(SAMPLE_QUESTIONS)

    unsub()
  })

  it('subscribeAgentEvents: done 이벤트 후 pendingQuestion null', async () => {
    const { useAppStore, selectPendingQuestion } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      pendingQuestion: { runId: 'r', requestId: 'rq', questions: SAMPLE_QUESTIONS },
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

    expect(selectPendingQuestion(useAppStore.getState())).toBeNull()
    unsub()
  })

  it('[회귀] respondPermission은 respondQuestion과 독립 동작', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      pendingPermission: { runId: 'r', requestId: 'rq', toolName: 'Bash', summary: '실행' },
      pendingQuestion: null,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().respondPermission('allow')

    // respondQuestion은 호출되지 않아야 함
    expect(mockQuestionRespond).not.toHaveBeenCalled()
  })
})
