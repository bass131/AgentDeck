// 작업 ID: g9b · 옛 이름 g9b-composer-view.test.tsx
// @vitest-environment jsdom
// M05 G9b — 입력창 하나. 이름 Composer는 단일 store 어댑터로 남고, 순수 본체는 ComposerView다.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

afterEach(() => cleanup())

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    writable: true,
    value: adaptFlatApi({
      listSlashCommands: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
    }),
  })
})

function viewProps(over: Record<string, unknown> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAbort: vi.fn(),
    isRunning: false,
    model: 'claude-opus-4-7',
    setModel: vi.fn(),
    effort: 'high',
    setEffort: vi.fn(),
    mode: 'plan',
    setMode: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: false,
    setReplMode: vi.fn(),
    replLit: false,
    ...over,
  }
}

describe('ComposerView — store 없는 입력창 본체', () => {
  it('선택기 값은 store가 아니라 props에서 읽는다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ pickerMode: 'auto' })
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const { container } = render(<ComposerView {...viewProps({ mode: 'plan' })} />)
    const modeBtn = container.querySelector('[aria-label="모드 선택"]') as HTMLElement
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    expect(modeBtn.querySelector('.pick-val')?.textContent).toBe(MODES.find((m) => m.id === 'plan')!.label)
  })

  it('전송은 props의 선택기 값을 onSend로 넘긴다', async () => {
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const props = viewProps({ value: '안녕', mode: 'plan', orchestration: true })
    const { getByLabelText } = render(<ComposerView {...props} />)
    fireEvent.click(getByLabelText('전송'))
    expect(props.onSend).toHaveBeenCalledWith({ model: 'claude-opus-4-7', effort: 'high', mode: 'plan', orchestration: true })
  })

  it('onCycleMode가 있으면 Shift+Tab을 입력창이 처리하고, 없으면(단일) 전역 단축키에 맡긴다', async () => {
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const onCycleMode = vi.fn()
    const docSpy = vi.fn()
    document.addEventListener('keydown', docSpy)
    try {
      const a = render(<ComposerView {...viewProps({ onCycleMode })} />)
      fireEvent.keyDown(a.container.querySelector('textarea') as HTMLTextAreaElement, { key: 'Tab', shiftKey: true })
      expect(onCycleMode).toHaveBeenCalledTimes(1)
      expect(docSpy).not.toHaveBeenCalled()
      cleanup()
      const b = render(<ComposerView {...viewProps()} />)
      fireEvent.keyDown(b.container.querySelector('textarea') as HTMLTextAreaElement, { key: 'Tab', shiftKey: true })
      expect(docSpy).toHaveBeenCalledTimes(1)
    } finally {
      document.removeEventListener('keydown', docSpy)
    }
  })

  it('자동 높이(C5)는 밀도마다 줄 높이로 3줄 상한을 잰다 — compact 20px(60), 기본 22px(66)', async () => {
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', { configurable: true, get: () => 200 })
    try {
      const a = render(<ComposerView {...viewProps({ density: 'compact', value: '긴\n글\n여러\n줄\n입력' })} />)
      expect((a.container.querySelector('textarea') as HTMLTextAreaElement).style.height).toBe('60px')
      cleanup()
      const b = render(<ComposerView {...viewProps({ value: '긴\n글\n여러\n줄\n입력' })} />)
      expect((b.container.querySelector('textarea') as HTMLTextAreaElement).style.height).toBe('66px')
    } finally {
      delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight
      if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc)
    }
  })

  it('Composer(단일 어댑터)는 같은 본체를 그린다 — .composer-wrap 하나, aria 「메시지 입력」 textarea 하나', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />,
    )
    expect(container.querySelectorAll('.composer-wrap').length).toBe(1)
    expect(container.querySelectorAll('textarea[aria-label="메시지 입력"]').length).toBe(1)
  })
})

describe('Composer — 자동 압축 상태 (M11 G2, M06 Backlog 27)', () => {
  // 실행이 첫 턴 뒤 알린 SDK 값이 store에 있다(reducer의 compact settings)
  it('store의 autoCompact를 사용량 띠에 넘긴다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ autoCompact: { enabled: true, thresholdTokens: 967_000 } } as never)
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />,
    )
    expect(container.querySelector('[data-auto-compact]')?.textContent).toBe('자동 압축 967K')
    useAppStore.setState({ autoCompact: null } as never)
  })

  it('본체는 props의 autoCompact만 그린다(store를 읽지 않는다)', async () => {
    const { ComposerView } = await import('@renderer/05_Conversation/ComposerView')
    const { container } = render(<ComposerView {...viewProps({ autoCompact: { enabled: false } })} />)
    expect(container.querySelector('[data-auto-compact]')?.textContent).toBe('자동 압축 꺼짐')
  })
})

describe('Composer — 단일 store 어댑터', () => {
  it('store pickerMode를 본체 모드 선택기에 넘긴다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    useAppStore.setState({ pickerMode: 'acceptEdits' })
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />,
    )
    const val = container.querySelector('[aria-label="모드 선택"] .pick-val')?.textContent
    expect(val).toBe(MODES.find((m) => m.id === 'acceptEdits')!.label)
  })
})

// G9b 독립 검수 차단 1 — 질문 창은 창 전역 keydown으로 답을 받는다.
// M11 G6 — 패널 입력창·질문 창 사례는 그리는 곳이 없던 PanelView와 함께 지웠다(M10 Backlog 3). 질문 창 자체의 동작만 남긴다.
describe('질문 창 — 출처 표시와 반복 입력', () => {
  const Q = (question: string) => [
    {
      header: '범위',
      question,
      options: [
        { label: 'a.ts', description: '첫째' },
        { label: 'b.ts', description: '둘째' },
      ],
      multiSelect: false,
    },
  ]

  it('단일 질문 창은 출처 표시가 없다(source 미지정 → .qm-source 없음, 동작 그대로)', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const onAnswer = vi.fn()
    render(<QuestionModal open questions={Q('단일 질문')} onAnswer={onAnswer} onDismiss={vi.fn()} />)
    expect(document.querySelector('.q-overlay .qm-source')).toBeNull()
    await act(async () => {
      fireEvent.keyDown(window, { key: '2' })
    })
    expect(onAnswer).toHaveBeenCalledWith([['b.ts']])
  })

  // 재검수 경미 3 — 답하자마자 다음 패널 창이 같은 자리에 뜨므로, 길게 누른 키의 반복 입력은 답으로 받지 않는다.
  it('숫자·Enter 답 키는 반복 입력(e.repeat)이면 무시하고, 새로 누른 키만 답한다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    const onAnswer = vi.fn()
    render(<QuestionModal open questions={Q('반복 질문')} onAnswer={onAnswer} onDismiss={vi.fn()} />)
    await act(async () => {
      fireEvent.keyDown(window, { key: '1', repeat: true })
    })
    expect(onAnswer).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(window, { key: '1' })
    })
    expect(onAnswer).toHaveBeenCalledWith([['a.ts']])
    cleanup()

    const multiQ = [{ ...Q('여러 개 질문')[0], multiSelect: true }]
    const onAnswer2 = vi.fn()
    render(<QuestionModal open questions={multiQ} onAnswer={onAnswer2} onDismiss={vi.fn()} />)
    await act(async () => {
      fireEvent.keyDown(window, { key: '2' })
    })
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter', repeat: true })
    })
    expect(onAnswer2).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(onAnswer2).toHaveBeenCalledWith([['b.ts']])
  })

  it('출처를 넘기면 머리와 내려둔 pill 모두에 어느 패널의 질문인지 보인다', async () => {
    const { QuestionModal } = await import('@renderer/03_Agent/prompt')
    render(<QuestionModal open questions={Q('패널 질문')} onAnswer={vi.fn()} onDismiss={vi.fn()} source="패널 2 · 리팩터" />)
    expect(document.querySelector('.q-overlay .qm-source')?.textContent).toBe('패널 2 · 리팩터')
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(document.querySelector('.q-overlay')).toBeNull()
    expect(document.querySelector('.q-mini-pill .mini-sub')?.textContent).toBe('패널 2 · 리팩터 · 펼쳐서 답하기')
  })
})

describe('CSS — 밀도 규칙과 죽은 패널 규칙', () => {
  async function css(rel: string): Promise<string> {
    const fs = await import('fs')
    const path = await import('path')
    return fs.readFileSync(path.resolve(__dirname, '../../../00_Source/renderer/src', rel), 'utf-8')
  }

  it('Composer.css에 밀도 compact 규칙이 있고, 모든 선택자가 클래스 둘 이상(특이도 0,2,0 이상)이다', async () => {
    const text = (await css('05_Conversation/Composer.css')).replace(/\/\*[\s\S]*?\*\//g, '')
    const blocks = [...text.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((m) => m[1].includes('composer--compact'))
    expect(blocks.length).toBeGreaterThan(0)
    for (const [, sel, body] of blocks) {
      for (const one of sel.split(',')) {
        const classes = (one.match(/\.[a-zA-Z_-][\w-]*/g) ?? []).length
        expect(classes, one.trim()).toBeGreaterThanOrEqual(2)
      }
      expect(body.includes('max-height'), sel.trim()).toBe(false)
    }
  })

  it('panelCard.css에 통합으로 죽은 패널 입력창·선택기 규칙이 없다', async () => {
    const text = await css('03_Agent/panelCard.css')
    for (const dead of ['.ma-p-pickers', '.ma-p-composer', '.ma-composer-ta', '.ma-attach', '.ma-send']) {
      expect(text.includes(dead), dead).toBe(false)
    }
    expect(text).toMatch(/\.ma-p-foot\s*\{/)
  })
})

describe('엔진 프롬프트 계산 하나(Backlog 47 일부)', () => {
  it('단일 Conversation은 엔진 프롬프트를 G9a 코어 enginePromptFor로 계산한다(입력창 사본 없음)', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../00_Source/renderer/src/05_Conversation/Conversation.tsx'),
      'utf-8',
    )
    expect(src).toMatch(/enginePromptFor\(/)
    expect(src).not.toMatch(/buildEnginePrompt\(/)
    expect(src).not.toMatch(/extractMentions\(/)
  })
})
