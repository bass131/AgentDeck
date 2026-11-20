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

// G4 확인 검수 — 맨 위 판정은 화면 겹침(층)을 따른다. 낮은 층(여기서는 시험용 60)의 창은 나중에 열려도 z 80 대화 질문 창 아래다.
// M10 G1부터 앱에 60 층을 쓰는 창은 없다(루프 화면이 모달이 아니다). 층 기계는 G3 세션 탭이 다시 쓸 수 있어 남긴다.
// 순서: 펼친 창이 내려둔 창보다 먼저, 그다음 층이 높은 창, 같은 층에서는 연(펼친) 순서.
describe('QuestionModal — 화면 층', () => {
  const CONV = [{ header: 'C', question: '대화 창 질문', options: [{ label: 'c1', description: '' }], multiSelect: false }]
  const LOOP = [{ header: 'L', question: '루프 창 질문', options: [{ label: 'l1', description: '' }], multiSelect: false }]

  it('대화 창이 떠 있는 상태에서 루프 창을 나중에 열어도 숫자 키는 대화 창에만 간다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const conv = vi.fn()
    const loop = vi.fn()
    const view = render(
      <>
        <QuestionModal open={true} questions={CONV} onAnswer={conv} onDismiss={vi.fn()} />
        <QuestionModal open={false} layer={60} questions={LOOP} onAnswer={loop} onDismiss={vi.fn()} />
      </>,
    )
    view.rerender(
      <>
        <QuestionModal open={true} questions={CONV} onAnswer={conv} onDismiss={vi.fn()} />
        <QuestionModal open={true} layer={60} questions={LOOP} onAnswer={loop} onDismiss={vi.fn()} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: '1' }) })
    expect(conv).toHaveBeenCalledWith([['c1']])
    expect(loop).not.toHaveBeenCalled()
  })

  it('높은 층의 창을 내려두면 낮은 층의 펼친 창이 키를 받는다 — Esc도 그 창을 내려둘 뿐 숨은 창을 건너뛰지 않는다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const conv = vi.fn()
    const convDismiss = vi.fn()
    const loop = vi.fn()
    const { container } = render(
      <>
        <QuestionModal open={true} layer={60} questions={LOOP} onAnswer={loop} onDismiss={vi.fn()} />
        <QuestionModal open={true} questions={CONV} onAnswer={conv} onDismiss={convDismiss} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(container.querySelectorAll('.q-mini-pill').length).toBe(1)
    expect(screen.getByText('루프 창 질문')).toBeTruthy()
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(convDismiss).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.q-mini-pill').length).toBe(2)
  })

  it('떠 있는 창의 층이 낮아지면 그 자리에서 맨 위 판정이 바뀐다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const conv = vi.fn()
    const loop = vi.fn()
    const view = render(
      <>
        <QuestionModal open={true} questions={CONV} onAnswer={conv} onDismiss={vi.fn()} />
        <QuestionModal open={true} questions={LOOP} onAnswer={loop} onDismiss={vi.fn()} />
      </>,
    )
    view.rerender(
      <>
        <QuestionModal open={true} questions={CONV} onAnswer={conv} onDismiss={vi.fn()} />
        <QuestionModal open={true} layer={60} questions={LOOP} onAnswer={loop} onDismiss={vi.fn()} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: '1' }) })
    expect(conv).toHaveBeenCalledWith([['c1']])
    expect(loop).not.toHaveBeenCalled()
  })

  // M10 G1 — 루프 화면이 모달에서 작업 모드 몸체로 바뀌어 z 60 루프 오버레이 층이 없어졌다. 층 값은 질문 창 CSS 하나와 대조한다.
  it('층 값은 질문 창의 CSS z-index와 같다 — 대화·루프 질문 창(.q-overlay) 320, 루프 화면에는 겹침 맥락이 없다', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { DIALOG_LAYER } = await import('@renderer/03_Agent/prompt')
    const src = path.resolve(__dirname, '../../../00_Source/renderer/src')
    const zOf = (rel: string, selector: string): number => {
      const css = fs.readFileSync(path.join(src, rel), 'utf8')
      const at = css.indexOf(`${selector} {`)
      expect(at).toBeGreaterThanOrEqual(0)
      const block = css.slice(at, css.indexOf('}', at))
      return Number(/z-index:\s*(\d+)/.exec(block)?.[1])
    }
    expect(DIALOG_LAYER).toEqual({ app: zOf('03_Agent/prompt/QuestionModal.css', '.q-overlay') })
    const loopCss = fs.readFileSync(path.join(src, '13_Loop/LoopScreen.css'), 'utf8')
    expect(loopCss).not.toMatch(/z-index|transform|filter|isolation|contain\s*:/)
  })

  // M11 G2 — M05 Backlog 49. 질문 창은 숫자 키를 가져가므로 다른 모달 겹침(.fs-overlay 제외)보다 위에 그린다.
  it('질문 창(.q-overlay)은 다른 모달 겹침보다 위다', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = path.resolve(__dirname, '../../../00_Source/renderer/src')
    const zOf = (rel: string, selector: string): number => {
      const css = fs.readFileSync(path.join(src, rel), 'utf8')
      const at = css.indexOf(`${selector} {`)
      expect(at).toBeGreaterThanOrEqual(0)
      const block = css.slice(at, css.indexOf('}', at))
      return Number(/z-index:\s*(\d+)/.exec(block)?.[1])
    }
    const question = zOf('03_Agent/prompt/QuestionModal.css', '.q-overlay')
    const others: Array<[string, string]> = [
      ['02_Common/Modal.css', '.modal-overlay'],
      ['03_Agent/prompt/AskModal.css', '.ask-overlay'],
      ['03_Agent/prompt/PromptModal.css', '.pr-overlay'],
      ['12_Window/shell.css', '.pf-overlay'],
      ['07_Workspace/ImageViewer.css', '.iv-overlay'],
      ['08_Git/GitModal.css', '.gitm-overlay'],
      ['07_Workspace/file/FileModal.css', '.fv-overlay'],
      ['12_Window/Sidebar.css', '.set-dialog-overlay'],
    ]
    for (const [rel, sel] of others) expect({ sel, z: zOf(rel, sel) < question }).toEqual({ sel, z: true })
  })

  it('[M11-G4 22] 펼친 질문 창 위에 다른 모달이 열리면 Esc는 그 모달만 닫고 질문 창은 펼친 채 남는다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const { isAnyModalOpen, isBlockingModalOpen, pushModalLayer } = await import('@renderer/02_Common/modalStack')
    render(<QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={vi.fn()} />)
    expect(isBlockingModalOpen()).toBe(true)
    const over = vi.fn()
    const close = pushModalLayer({ onEscape: over })
    try {
      await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    } finally {
      close()
    }
    expect(over).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.q-mini-pill')).toBeNull()
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(document.querySelector('.q-mini-pill')).toBeTruthy()
    expect([isAnyModalOpen(), isBlockingModalOpen()]).toEqual([true, false])
  })

  it('[M11-G4 22] 층이 다른 두 창에서도 Esc는 화면 맨 위 질문 창을 내려둔다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const CONV = [{ header: 'C', question: '대화 창 질문', options: [{ label: 'c1', description: '' }], multiSelect: false }]
    const LOOP = [{ header: 'L', question: '루프 창 질문', options: [{ label: 'l1', description: '' }], multiSelect: false }]
    const view = render(<QuestionModal open={true} questions={CONV} onAnswer={vi.fn()} onDismiss={vi.fn()} />)
    view.rerender(
      <>
        <QuestionModal open={true} questions={CONV} onAnswer={vi.fn()} onDismiss={vi.fn()} />
        <QuestionModal open={true} layer={60} questions={LOOP} onAnswer={vi.fn()} onDismiss={vi.fn()} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(document.querySelectorAll('.q-mini-pill').length).toBe(1)
    expect(screen.getByText('루프 창 질문')).toBeTruthy()
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(document.querySelectorAll('.q-mini-pill').length).toBe(2)
  })

  it('내려둔 질문은 다른 모달이 열려 있으면 Esc를 그 모달에 양보한다(건너뛰지 않는다)', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const onDismiss = vi.fn()
    render(<QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={onDismiss} />)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(document.querySelector('.q-mini-pill')).toBeTruthy()
    // M11 G4(설계 감사 22) — 다른 모달은 클래스가 아니라 모달 층으로 안다
    const { pushModalLayer } = await import('@renderer/02_Common/modalStack')
    const other = pushModalLayer()
    try {
      await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
      expect(onDismiss).not.toHaveBeenCalled()
    } finally {
      other()
    }
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('[M11-G4 22] 내려둔 질문 알약과 Ask 알약이 함께 있으면 Esc 한 번에 나중에 내려간 하나만 닫힌다(질문이 거절되지 않는다)', async () => {
    const { QuestionModal, AskModal } = await import('@renderer/03_Agent/prompt')
    const onDismiss = vi.fn()
    const onClose = vi.fn()
    const view = render(<QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={onDismiss} />)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(document.querySelector('.q-mini-pill')).toBeTruthy()
    view.rerender(
      <>
        <QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={onDismiss} />
        <AskModal minimized={true} onClose={onClose} onMinimizedChange={vi.fn()} />
      </>,
    )
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect([onClose.mock.calls.length, onDismiss.mock.calls.length]).toEqual([1, 0])
    view.rerender(<QuestionModal open={true} questions={SAMPLE_QS} onAnswer={vi.fn()} onDismiss={onDismiss} />)
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(onDismiss).toHaveBeenCalledTimes(1)
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
