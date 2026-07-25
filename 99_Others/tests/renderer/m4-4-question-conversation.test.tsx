// @vitest-environment jsdom
/**
 * m4-4-question-conversation.test.tsx — Phase 24d Conversation + QuestionModal 연결 테스트 (TDD 선행).
 *
 * 검증 대상:
 *   - pendingQuestion 있을 때 QuestionModal open(.q-overlay 렌더)
 *   - pendingQuestion null → QuestionModal 미렌더
 *   - onAnswer(answers) → respondQuestion(answers) 호출
 *   - onDismiss → respondQuestion(null) 호출
 *
 * 회귀:
 *   - pendingPermission(PermissionCard — BF3 P06/ADR-030, 구 PermissionModal) 공존
 *   - thinking 인디케이터 기존 동작 유지
 *   - todos/subagents 공존
 *
 * 24c permission 테스트 패턴 그대로 미러.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import type { AgentQuestion } from '../../../02.Source/shared/agent-events'

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

const mockUnsub = vi.fn()
const mockQuestionRespond = vi.fn().mockResolvedValue({ ok: true })
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  permissionRespond: vi.fn().mockResolvedValue({ ok: true }),
  questionRespond: mockQuestionRespond,
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
  mockApi.listFiles.mockResolvedValue({ files: [] })
  mockApi.questionRespond.mockResolvedValue({ ok: true })
  mockApi.permissionRespond.mockResolvedValue({ ok: true })
})
afterEach(() => cleanup())

async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    thinkingText: null,
    todos: [],
    subagents: [],
    pendingPermission: null,
    pendingQuestion: null,
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function renderConv() {
  const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
  return act(async () => render(<Conversation />))
}

describe('Phase 24d — Conversation: QuestionModal 배선', () => {

  it('pendingQuestion 있을 때 .q-overlay(QuestionModal) 렌더', async () => {
    await setStore({
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.q-overlay')).toBeTruthy()
  })

  it('pendingQuestion null → .q-overlay 미렌더(QuestionModal 닫힘)', async () => {
    await setStore({
      pendingQuestion: null,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    // PermissionModal도 null이어야 .q-overlay 없음
    expect(container.querySelector('.q-overlay')).toBeFalsy()
  })

  it('QuestionModal 렌더 시 question 텍스트 표시', async () => {
    await setStore({
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.q-overlay')?.textContent).toContain('어떤 파일을 수정할까요?')
  })

  it('onAnswer(answers) → respondQuestion(answers) 호출', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const respondQuestion = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
      respondQuestion,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConv()
    // QuestionModal 옵션 버튼(q-opt) 첫 번째 클릭 → 단일선택 자동진행 → onAnswer 호출
    const opts = container.querySelectorAll('.q-opt')
    expect(opts.length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(opts[0]) // 'src/main.ts' 선택 → 단일선택 → onAnswer
    })
    expect(respondQuestion).toHaveBeenCalledWith([['src/main.ts']])
  })

  it('onDismiss(X 버튼) → respondQuestion(null) 호출', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    const respondQuestion = vi.fn().mockResolvedValue(undefined)
    useAppStore.setState({
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
      respondQuestion,
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { container } = await renderConv()
    // QuestionModal X 버튼(.qm-close) → onDismiss
    const closeBtn = container.querySelector('.qm-close')
    expect(closeBtn).toBeTruthy()
    await act(async () => {
      fireEvent.click(closeBtn!)
    })
    expect(respondQuestion).toHaveBeenCalledWith(null)
  })

  // ── 회귀: 기존 기능 미영향 ──────────────────────────────────────────────────

  it('[회귀/ADR-030] pendingQuestion과 pendingPermission 동시 → QuestionModal(.q-overlay)과 PermissionCard(.perm-card) 둘 다 렌더', async () => {
    // BF3 Phase 06(ADR-030): PermissionModal(.q-overlay 풀오버레이)이 PermissionCard(인라인
    // .perm-card)로 전환되면서 .q-overlay는 이제 QuestionModal 전용이 됐다 — 정확히 1개.
    await setStore({
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
      pendingPermission: {
        runId: 'run-p-1',
        requestId: 'req-p-1',
        toolName: 'Bash',
        summary: '실행',
      },
      messages: [{ id: 'm1', role: 'user', content: '테스트' }],
    })
    const { container } = await renderConv()
    expect(container.querySelectorAll('.q-overlay').length).toBe(1)
    expect(container.querySelector('.perm-card')).toBeTruthy()
  })

  it('[회귀] thinkingText 있고 isRunning=true → .thinking 렌더(기존 동작 유지)', async () => {
    await setStore({
      thinkingText: '코드 분석 중…',
      isRunning: true,
      pendingQuestion: null,
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeTruthy()
  })

  it('[회귀] pendingQuestion과 thinkingText 동시 → thinking 억제, .q-overlay만 렌더(원본 정합)', async () => {
    // 원본 App.tsx L820-821:
    //   showWorking = (thinkingText != null || !streamingAnswer) && !pendingQuestion && !pendingCommand
    // pendingQuestion이 있으면 WorkingIndicator가 억제된다 — 질문 카드 자체가 "작업 중"을
    // 이미 전달하므로 중복 인디케이터를 숨기는 것이 원본 UX 의도.
    // AgentDeck Conversation.tsx L659:
    //   isRunning && !pendingPermission && !pendingQuestion && (...)
    // 동일하게 !pendingQuestion 게이트 적용 → 원본 동작과 정합.
    await setStore({
      thinkingText: '생각 중…',
      isRunning: true,
      pendingQuestion: {
        runId: 'run-q-1',
        requestId: 'req-q-1',
        questions: SAMPLE_QUESTIONS,
      },
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
    })
    const { container } = await renderConv()
    // 질문 모달 떠있을 때 WorkingIndicator(.thinking)는 억제됨 (원본 정합)
    expect(container.querySelector('.thinking')).toBeFalsy()
    // 질문 모달(.q-overlay)은 정상 렌더
    expect(container.querySelector('.q-overlay')).toBeTruthy()
  })

  it('[회귀] pendingPermission null + pendingQuestion null → .q-overlay 없음', async () => {
    await setStore({
      pendingPermission: null,
      pendingQuestion: null,
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.q-overlay')).toBeFalsy()
  })
})
