// 작업 ID: f14 · 옛 이름 f14-modals.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

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
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelector('.q-block')).toBeTruthy()
    expect(container.querySelector('.q-opts')).toBeTruthy()
  })

  it('q-head + q-chip + q-q 렌더', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(screen.getByText('범위')).toBeTruthy()
    expect(screen.getByText('어느 파일을 수정할까요?')).toBeTruthy()
  })

  it('옵션 수 = questions[0].options + 직접 입력', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelectorAll('.q-opt').length).toBe(3)
  })

  it('단일 선택: 옵션 클릭 → onAnswer 호출(마지막 질문)', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const onAnswer = vi.fn()
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={onAnswer} onDismiss={vi.fn()} />
    )
    const opts = container.querySelectorAll('.q-opt')
    await act(async () => { fireEvent.click(opts[0]) })
    expect(onAnswer).toHaveBeenCalled()
  })

  it('직접 입력 클릭 → q-custom input 표시', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    const opts = container.querySelectorAll('.q-opt')
    const lastOpt = opts[opts.length - 1]
    await act(async () => { fireEvent.click(lastOpt) })
    expect(container.querySelector('.q-custom')).toBeTruthy()
  })

  it('Esc → 내려두기(q-mini-* 알약 표시)', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(container.querySelector('.q-mini-pill')).toBeTruthy()
  })

  it('내려두기 후 알약 클릭 → 모달 다시 펼침', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { container } = render(
      <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    const pill = container.querySelector('.q-mini-pill') as HTMLElement
    await act(async () => { fireEvent.click(pill) })
    expect(container.querySelector('.q-overlay')).toBeTruthy()
  })

  it('q-modal-foot "숫자 키로 선택 · Esc 내려두기" 렌더', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
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
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { container } = render(
      <QuestionModal open={true} questions={MULTI_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelectorAll('.q-step').length).toBe(2)
  })
})

// G4 검수 차단 B2 — 질문 창이 둘 열려 있으면 키(숫자·Enter·Esc)는 맨 위 창 하나만 받는다. 내려두면 그 아래 창이 받는다.
describe('QuestionModal — 여러 창의 키 입력', () => {
  const A = [{ header: 'A', question: '아래 창 질문', options: [{ label: 'a1', description: '' }], multiSelect: false }]
  const B = [{ header: 'B', question: '위 창 질문', options: [{ label: 'b1', description: '' }], multiSelect: false }]

  it('숫자 키는 맨 위 창에만 간다 — Esc는 맨 위 창만 내려두고, 그 뒤 키는 아래 창이 받는다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const lower = vi.fn()
    const upper = vi.fn()
    const lowerDismiss = vi.fn()
    const upperDismiss = vi.fn()
    const { container } = render(
      <>
        <QuestionModal open={true} questions={A} onAnswer={lower} onDismiss={lowerDismiss} />
        <QuestionModal open={true} questions={B} onAnswer={upper} onDismiss={upperDismiss} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: '1' }) })
    expect(upper).toHaveBeenCalledWith([['b1']])
    expect(lower).not.toHaveBeenCalled()
    upper.mockClear()
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    // 위 창만 알약으로 내려갔다 — 아래 창은 펼친 채다
    expect(container.querySelectorAll('.q-mini-pill').length).toBe(1)
    expect(container.querySelectorAll('.q-overlay').length).toBe(1)
    expect(screen.getByText('아래 창 질문')).toBeTruthy()
    expect(upperDismiss).not.toHaveBeenCalled()
    expect(lowerDismiss).not.toHaveBeenCalled()
    await act(async () => { fireEvent.keyDown(window, { key: '1' }) })
    expect(lower).toHaveBeenCalledWith([['a1']])
    expect(upper).not.toHaveBeenCalled()
  })

  it('내려둔 창을 다시 펼치면 그 창이 맨 위가 된다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const lower = vi.fn()
    const upper = vi.fn()
    const { container } = render(
      <>
        <QuestionModal open={true} questions={A} onAnswer={lower} onDismiss={vi.fn()} />
        <QuestionModal open={true} questions={B} onAnswer={upper} onDismiss={vi.fn()} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    await act(async () => { fireEvent.click(container.querySelector('.q-mini-pill') as HTMLElement) })
    await act(async () => { fireEvent.keyDown(window, { key: '1' }) })
    expect(upper).toHaveBeenCalledWith([['b1']])
    expect(lower).not.toHaveBeenCalled()
  })

  it('맨 위 창이 닫히면 남은 창이 키를 받는다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const lower = vi.fn()
    const view = render(
      <>
        <QuestionModal open={true} questions={A} onAnswer={lower} onDismiss={vi.fn()} />
        <QuestionModal open={true} questions={B} onAnswer={vi.fn()} onDismiss={vi.fn()} />
      </>,
    )
    view.rerender(
      <>
        <QuestionModal open={true} questions={A} onAnswer={lower} onDismiss={vi.fn()} />
        <QuestionModal open={false} questions={B} onAnswer={vi.fn()} onDismiss={vi.fn()} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: '1' }) })
    expect(lower).toHaveBeenCalledWith([['a1']])
  })
})

describe('QuestionModal — open=false', () => {
  it('open=false → null 렌더', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { container } = render(
      <QuestionModal open={false} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />
    )
    expect(container.querySelector('.q-overlay')).toBeFalsy()
    expect(container.querySelector('.q-mini-pill')).toBeFalsy()
  })
})
