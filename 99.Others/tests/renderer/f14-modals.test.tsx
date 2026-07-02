// @vitest-environment jsdom
/**
 * f14-modals.test.tsx — F14-01 QuestionModal 단위 테스트.
 * TDD: 실패→구현 순서.
 * 새 IPC 0. window.api 신규 호출 없음.
 *
 * BF3 Phase 06(ADR-030): 종전 이 파일에 있던 PermissionModal describe 블록은 제거됐다 —
 * PermissionModal(중앙 모달)이 폐기되고 PermissionCard(컴포저 위 인라인 카드)로 전환되면서
 * 그 커버리지는 `bf3-p06-permission-inline-card.test.tsx`(컴포넌트 단위)와
 * `m4-4-permission-conversation.test.tsx`(Conversation 배선)로 이관됐다.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// ── QuestionModal ────────────────────────────────────────────────────────────

const SAMPLE_QS = [
  {
    header: '범위',
    question: '어느 파일을 수정할까요?',
    options: [
      { label: 'src/main.ts', description: '메인 파일' },
      { label: 'src/renderer/index.ts', description: '렌더러 파일' },
    ],
    multiSelect: false,
  },
]

describe('QuestionModal — open=true', () => {
  it('q-block + q-opts 렌더', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelector('.q-block')).toBeTruthy()
    expect(container.querySelector('.q-opts')).toBeTruthy()
  })

  it('q-head + q-chip + q-q 렌더', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.getByText('범위')).toBeTruthy()
    expect(screen.getByText('어느 파일을 수정할까요?')).toBeTruthy()
  })

  it('옵션 수 = questions[0].options + 직접 입력', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    // 2 옵션 + 1 직접 입력 = 3
    expect(container.querySelectorAll('.q-opt').length).toBe(3)
  })

  it('단일 선택: 옵션 클릭 → onAnswer 호출(마지막 질문)', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const onAnswer = vi.fn()
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={onAnswer} onDismiss={vi.fn()} />
    )
    const opts = container.querySelectorAll('.q-opt')
    await act(async () => { fireEvent.click(opts[0]) })
    expect(onAnswer).toHaveBeenCalled()
  })

  it('직접 입력 클릭 → q-custom input 표시', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    const opts = container.querySelectorAll('.q-opt')
    const lastOpt = opts[opts.length - 1] // 직접 입력
    await act(async () => { fireEvent.click(lastOpt) })
    expect(container.querySelector('.q-custom')).toBeTruthy()
  })

  it('Esc → 내려두기(q-mini-* 알약 표시)', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    // 알약이 떠야 함 (q-mini-pill 또는 q-mini-wrap 클래스)
    expect(container.querySelector('.q-mini-pill')).toBeTruthy()
  })

  it('내려두기 후 알약 클릭 → 모달 다시 펼침', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    const pill = container.querySelector('.q-mini-pill') as HTMLElement
    await act(async () => { fireEvent.click(pill) })
    expect(container.querySelector('.q-overlay')).toBeTruthy()
  })

  it('q-modal-foot "숫자 키로 선택 · Esc 내려두기" 렌더', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.getByText(/숫자 키로 선택/)).toBeTruthy()
  })
})

describe('QuestionModal — 다중 질문', () => {
  const MULTI_QS = [
    {
      header: '1단계',
      question: '첫 번째 질문',
      options: [{ label: 'A', description: '' }, { label: 'B', description: '' }],
      multiSelect: false,
    },
    {
      header: '2단계',
      question: '두 번째 질문',
      options: [{ label: 'C', description: '' }],
      multiSelect: false,
    },
  ]

  it('q-steps 렌더(2개)', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const { container } = render(
      <QuestionModal open={true} questions={MULTI_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelectorAll('.q-step').length).toBe(2)
  })
})

describe('QuestionModal — open=false', () => {
  it('open=false → null 렌더', async () => {
    const { QuestionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/QuestionModal')
    const { container } = render(
      <QuestionModal open={false} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelector('.q-overlay')).toBeFalsy()
    expect(container.querySelector('.q-mini-pill')).toBeFalsy()
  })
})
