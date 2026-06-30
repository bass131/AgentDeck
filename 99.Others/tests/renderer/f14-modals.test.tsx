// @vitest-environment jsdom
/**
 * f14-modals.test.tsx — F14-01 PermissionModal + QuestionModal 단위 테스트.
 * TDD: 실패→구현 순서.
 * 새 IPC 0. window.api 신규 호출 없음.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// ── PermissionModal ──────────────────────────────────────────────────────────

describe('PermissionModal — open=true', () => {
  it('perm-head, q-opts(3개) 렌더', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const { container } = render(
      <PermissionModal
        open={true}
        toolName="Bash"
        summary="rm -rf /tmp/test"
        onRespond={vi.fn()}
      />
    )
    expect(container.querySelector('.perm-head')).toBeTruthy()
    expect(container.querySelectorAll('.q-opt').length).toBe(3)
  })

  it('toolName + summary 렌더', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    render(
      <PermissionModal
        open={true}
        toolName="Bash"
        summary="rm -rf /tmp/test"
        onRespond={vi.fn()}
      />
    )
    expect(screen.getByText('Bash')).toBeTruthy()
    expect(screen.getByText('rm -rf /tmp/test')).toBeTruthy()
  })

  it('숫자키 1 → onRespond("allow") 호출', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const onRespond = vi.fn()
    render(
      <PermissionModal open={true} toolName="T" summary="S" onRespond={onRespond} />
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(onRespond).toHaveBeenCalledWith('allow')
  })

  it('숫자키 2 → onRespond("allow_always") 호출', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const onRespond = vi.fn()
    render(
      <PermissionModal open={true} toolName="T" summary="S" onRespond={onRespond} />
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: '2' })
    })
    expect(onRespond).toHaveBeenCalledWith('allow_always')
  })

  it('숫자키 3 → onRespond("deny") 호출', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const onRespond = vi.fn()
    render(
      <PermissionModal open={true} toolName="T" summary="S" onRespond={onRespond} />
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: '3' })
    })
    expect(onRespond).toHaveBeenCalledWith('deny')
  })

  it('Esc 키 → onRespond("deny") 호출(거부)', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const onRespond = vi.fn()
    render(
      <PermissionModal open={true} toolName="T" summary="S" onRespond={onRespond} />
    )
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(onRespond).toHaveBeenCalledWith('deny')
  })

  it('q-opt 클릭 → onRespond 호출', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const onRespond = vi.fn()
    const { container } = render(
      <PermissionModal open={true} toolName="T" summary="S" onRespond={onRespond} />
    )
    const opts = container.querySelectorAll('.q-opt')
    fireEvent.click(opts[0])
    expect(onRespond).toHaveBeenCalledWith('allow')
  })

  it('q-num 배경이 인라인 style로 설정됨(q-num 예외 허용)', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const { container } = render(
      <PermissionModal open={true} toolName="T" summary="S" onRespond={vi.fn()} />
    )
    const numEl = container.querySelector('.q-num') as HTMLElement
    expect(numEl.style.background).toBeTruthy()
  })

  it('perm-foot "숫자 키로 선택 · Esc 거부" 렌더', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    render(<PermissionModal open={true} toolName="T" summary="S" onRespond={vi.fn()} />)
    expect(screen.getByText('숫자 키로 선택 · Esc 거부')).toBeTruthy()
  })
})

describe('PermissionModal — open=false', () => {
  it('open=false → null 렌더(q-overlay 없음)', async () => {
    const { PermissionModal } = await import('../../../02.Source/renderer/src/components/06_prompt/PermissionModal')
    const { container } = render(
      <PermissionModal open={false} toolName="T" summary="S" onRespond={vi.fn()} />
    )
    expect(container.querySelector('.q-overlay')).toBeFalsy()
  })
})

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
