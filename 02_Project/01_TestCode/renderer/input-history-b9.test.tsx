// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, fireEvent, cleanup, act } from '@testing-library/react'
import { Composer } from '../../../02_Project/00_Source/renderer/src/features/conversation/Composer'

beforeEach(() => {
  (window as unknown as Record<string, unknown>).api = {
    listSlashCommands: vi.fn().mockResolvedValue([
      { name: 'init', description: 'CLAUDE.md 생성', scope: 'builtin' },
      { name: 'compact', description: '대화 요약', scope: 'builtin' },
    ]),
    listSkills: vi.fn().mockResolvedValue([]),
  }
})

afterEach(() => cleanup())

function mkProps(over: Partial<Parameters<typeof Composer>[0]> = {}) {
  return {
    value: '',
    onChange: vi.fn(),
    onSend: vi.fn(),
    onAbort: vi.fn(),
    isRunning: false,
    ...over,
  }
}

function renderWithHistory(
  history: string[],
  value = '',
  extra: Partial<Parameters<typeof Composer>[0]> = {}
) {
  const onChange = vi.fn()
  const onSend = vi.fn()
  const { container } = render(
    <Composer
      {...mkProps({ value, onChange, onSend, ...extra })}
      history={history}
    />
  )
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  return { container, ta, onChange, onSend }
}

describe('B9 입력 히스토리 — ArrowUp 기본 동작', () => {
  it('history 있고 첫 줄에서 ArrowUp → onChange(최신 히스토리 항목) 호출', () => {
    const history = ['첫 번째 메시지', '두 번째 메시지', '세 번째 메시지']
    const { ta, onChange } = renderWithHistory(history, '')

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    expect(onChange).toHaveBeenCalledWith('세 번째 메시지')
  })

  it('history 1개에서 ArrowUp → onChange(유일한 항목) 호출', () => {
    const { ta, onChange } = renderWithHistory(['유일한 메시지'], '')

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    expect(onChange).toHaveBeenCalledWith('유일한 메시지')
  })

  it('ArrowUp 연속 2회 → 두 번째에서는 더 오래된 항목', () => {
    const history = ['첫 번째', '두 번째', '세 번째']
    const onChange = vi.fn()
    let currentValue = ''
    const handleChange = vi.fn((v: string) => {
      currentValue = v
      onChange(v)
    })

    const { rerender, container } = render(
      <Composer {...mkProps({ value: currentValue, onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('세 번째')

    rerender(
      <Composer {...mkProps({ value: '세 번째', onChange: handleChange })} history={history} />
    )
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta2, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('두 번째')
  })

  it('ArrowUp 히스토리 처음(인덱스 0)에서 계속 ↑ → 0에서 멈춤(첫 번째 메시지 유지)', () => {
    const history = ['첫 번째', '두 번째']
    const onChange = vi.fn()
    let currentValue = ''
    const handleChange = vi.fn((v: string) => {
      currentValue = v
      onChange(v)
    })

    const { rerender, container } = render(
      <Composer {...mkProps({ value: currentValue, onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '두 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta2, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '첫 번째', onChange: handleChange })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement

    onChange.mockClear()
    fireEvent.keyDown(ta3, { key: 'ArrowUp', code: 'ArrowUp' })
    if (onChange.mock.calls.length > 0) {
      expect(onChange.mock.calls[0][0]).toBe('첫 번째')
    }
  })
})

describe('B9 입력 히스토리 — ArrowDown 동작', () => {
  it('ArrowDown + histIdx===null(초기) → onChange 미호출(무동작)', () => {
    const { ta, onChange } = renderWithHistory(['msg1', 'msg2'], '')

    fireEvent.keyDown(ta, { key: 'ArrowDown', code: 'ArrowDown' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('histIdx가 마지막이 아닐 때 ArrowDown → 더 최신 항목', () => {
    const history = ['첫 번째', '두 번째', '세 번째']
    const onChange = vi.fn()
    const handleChange = vi.fn((v: string) => onChange(v))

    const { rerender, container } = render(
      <Composer {...mkProps({ value: '', onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '세 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta2, { key: 'ArrowUp', code: 'ArrowUp' })

    rerender(<Composer {...mkProps({ value: '두 번째', onChange: handleChange })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement

    onChange.mockClear()
    fireEvent.keyDown(ta3, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith('세 번째')
  })

  it('histIdx가 마지막일 때 ArrowDown → draft 복원 + histIdx=null', () => {
    const history = ['첫 번째', '두 번째']
    const onChange = vi.fn()
    const handleChange = vi.fn((v: string) => onChange(v))

    const { rerender, container } = render(
      <Composer {...mkProps({ value: '초안 텍스트', onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '두 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    onChange.mockClear()
    fireEvent.keyDown(ta2, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith('초안 텍스트')
  })
})

describe('B9 입력 히스토리 — 팔레트 우선순위', () => {
  it('슬래시 팔레트 열림(value="/") → ArrowUp은 팔레트 네비(onChange 미호출)', () => {
    const history = ['이전 메시지']
    const { ta, onChange } = renderWithHistory(history, '/')

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('슬래시 팔레트 열림(value="/") → ArrowDown은 팔레트 네비(onChange 미호출)', () => {
    const history = ['이전 메시지']
    const { ta, onChange } = renderWithHistory(history, '/')

    fireEvent.keyDown(ta, { key: 'ArrowDown', code: 'ArrowDown' })

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('B9 입력 히스토리 — 멀티라인 안전', () => {
  it('멀티라인 value의 중간 줄(커서가 첫 줄도 마지막 줄도 아님) → ArrowUp 히스토리 미발동', () => {
    const history = ['이전 메시지']
    const { ta, onChange } = renderWithHistory(history, '첫 줄\n중간 줄\n마지막 줄')

    Object.defineProperty(ta, 'selectionStart', { value: 7, writable: true })

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    expect(onChange).not.toHaveBeenCalledWith('이전 메시지')
  })

  it('멀티라인 value의 중간 줄에서 ArrowDown → 히스토리 미발동', () => {
    const history = ['이전 메시지']
    const onChange = vi.fn()
    const handleChange = vi.fn((v: string) => onChange(v))
    const { rerender, container } = render(
      <Composer {...mkProps({ value: '', onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '이전 메시지', onChange: handleChange })} history={history} />)
    rerender(<Composer {...mkProps({ value: '첫 줄\n두 번째 줄', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    Object.defineProperty(ta2, 'selectionStart', { value: 3, writable: true })

    onChange.mockClear()
    fireEvent.keyDown(ta2, { key: 'ArrowDown', code: 'ArrowDown' })

    expect(onChange).not.toHaveBeenCalledWith('')
  })
})

describe('B9 입력 히스토리 — 직접 타이핑 시 histIdx 초기화', () => {
  it('히스토리 탐색 중 직접 타이핑 → histIdx 초기화(이후 ↑은 항상 최신부터)', () => {
    const history = ['첫 번째', '두 번째', '세 번째']
    const onChange = vi.fn()
    const handleChange = vi.fn((v: string) => onChange(v))

    const { rerender, container } = render(
      <Composer {...mkProps({ value: '', onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '세 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta2, { key: 'ArrowUp', code: 'ArrowUp' })

    fireEvent.change(ta2, { target: { value: '새로 타이핑' } })

    rerender(<Composer {...mkProps({ value: '새로 타이핑', onChange: handleChange })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement

    onChange.mockClear()
    fireEvent.keyDown(ta3, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('세 번째')
  })
})

describe('B9 입력 히스토리 — Enter 전송 후 histIdx 초기화', () => {
  it('히스토리 탐색 중 Enter 전송 → onSend 호출 + histIdx 초기화', () => {
    const history = ['이전 메시지']
    const onChange = vi.fn()
    const onSend = vi.fn()
    const handleChange = vi.fn((v: string) => onChange(v))

    const { rerender, container } = render(
      <Composer {...mkProps({ value: '', onChange: handleChange, onSend })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '이전 메시지', onChange: handleChange, onSend })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta2, { key: 'Enter', code: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalled()

    rerender(<Composer {...mkProps({ value: '', onChange: handleChange, onSend })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement
    onChange.mockClear()
    fireEvent.keyDown(ta3, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('이전 메시지')
  })
})

describe('B9 입력 히스토리 — 빈 히스토리', () => {
  it('history=[] 이면 ArrowUp 무동작(onChange 미호출)', () => {
    const { ta, onChange } = renderWithHistory([], '')

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('history prop 없이 렌더 → ArrowUp 무동작(하위호환)', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '', onChange })} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('B9 입력 히스토리 — 기존 동작 회귀', () => {
  it('history 있어도 슬래시 팔레트 Enter 선택은 정상 동작', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '/', onChange })} history={['이전']} />
    )
    await act(async () => { await Promise.resolve() })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter' })
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as string
    expect(call).toMatch(/^\/\w/)
  })

  it('history 있어도 Enter(빈 팔레트 없음) → onSend 호출', () => {
    const onSend = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '안녕하세요', onSend })} history={['이전']} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalled()
  })

  it('Shift+Enter → 줄바꿈(onSend 미호출)', () => {
    const onSend = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '텍스트', onSend })} history={['이전']} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('history 있어도 sched 큐 표시 정상(queued prop 유지)', () => {
    const queued = [{ id: 'q1', text: '예약 메시지', images: [] }]
    const { container } = render(
      <Composer {...mkProps({ queued })} history={['이전']} />
    )
    expect(container.querySelector('.sched')).toBeTruthy()
  })
})
