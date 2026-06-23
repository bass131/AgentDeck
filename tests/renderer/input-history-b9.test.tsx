// @vitest-environment jsdom
/**
 * input-history-b9.test.tsx — Phase 25 B9: 입력창 히스토리(↑↓) TDD 테스트.
 *
 * 검증 범위:
 *   - ArrowUp 첫 줄 → 최신 히스토리 로드
 *   - 연속 ↑ → 더 오래된 항목, 0에서 멈춤
 *   - ArrowDown 마지막 줄 → 더 최신, 초과 시 draft 복원
 *   - 팔레트 열림 시 ↑↓는 히스토리 미발동(팔레트 우선)
 *   - 멀티라인 중간 줄에서 ↑↓는 히스토리 미발동(줄 이동)
 *   - 직접 타이핑 후 histIdx 초기화
 *   - Enter 후 histIdx 초기화
 *   - 빈 히스토리(messages=0) → 무동작
 *   - 기존 슬래시/mention/Enter/큐 회귀
 *
 * 신뢰경계: renderer 단독, window.api 신규 호출 0.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { Composer } from '../../src/renderer/src/components/Composer'

afterEach(() => cleanup())

// ── 헬퍼: history가 있는 Composer props 생성 ──────────────────────────────────

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

/**
 * history prop이 있는 Composer 렌더.
 * Phase 25 B9: Composer는 `history` prop(string[])을 소비한다.
 * (현재 미구현 → 테스트 실패 예상)
 */
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

// ── 1. ArrowUp 첫 줄 → 최신 히스토리 로드 ──────────────────────────────────────

describe('B9 입력 히스토리 — ArrowUp 기본 동작', () => {
  it('history 있고 첫 줄에서 ArrowUp → onChange(최신 히스토리 항목) 호출', () => {
    const history = ['첫 번째 메시지', '두 번째 메시지', '세 번째 메시지']
    const { ta, onChange } = renderWithHistory(history, '')

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    // 최신 항목(마지막) = '세 번째 메시지'
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
    // 두 번째 ArrowUp을 시뮬레이션하려면 value도 변경되어야 하므로
    // 두 번 렌더링 사이클을 시뮬레이션한다
    let currentValue = ''
    const handleChange = vi.fn((v: string) => {
      currentValue = v
      onChange(v)
    })

    const { rerender, container } = render(
      <Composer {...mkProps({ value: currentValue, onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    // 첫 번째 ArrowUp: histIdx=null → histIdx=2(마지막), value='세 번째'
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('세 번째')

    // value 갱신 후 두 번째 ArrowUp: histIdx=2 → histIdx=1, value='두 번째'
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

    // 첫 ↑: histIdx=null → 1 ('두 번째')
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '두 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    // 두 번째 ↑: histIdx=1 → 0 ('첫 번째')
    fireEvent.keyDown(ta2, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '첫 번째', onChange: handleChange })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement

    // 세 번째 ↑: histIdx=0 → 0 (멈춤, '첫 번째' 다시 호출)
    onChange.mockClear()
    fireEvent.keyDown(ta3, { key: 'ArrowUp', code: 'ArrowUp' })
    // onChange는 '첫 번째'로 호출되거나, no-op이거나 — 인덱스 넘어가지 않음
    if (onChange.mock.calls.length > 0) {
      expect(onChange.mock.calls[0][0]).toBe('첫 번째')
    }
  })
})

// ── 2. ArrowDown 동작 ──────────────────────────────────────────────────────────

describe('B9 입력 히스토리 — ArrowDown 동작', () => {
  it('ArrowDown + histIdx===null(초기) → onChange 미호출(무동작)', () => {
    const { ta, onChange } = renderWithHistory(['msg1', 'msg2'], '')

    fireEvent.keyDown(ta, { key: 'ArrowDown', code: 'ArrowDown' })

    // histIdx===null이면 ArrowDown은 무동작
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

    // ↑ 두 번: histIdx=2→1 ('두 번째' 상태)
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })  // histIdx=2
    rerender(<Composer {...mkProps({ value: '세 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta2, { key: 'ArrowUp', code: 'ArrowUp' })  // histIdx=1

    rerender(<Composer {...mkProps({ value: '두 번째', onChange: handleChange })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement

    // ↓ 한 번: histIdx=1→2 ('세 번째')
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

    // ↑: histIdx=null(draft='초안 텍스트') → histIdx=1 ('두 번째')
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '두 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    // ↓: histIdx=1(마지막) → histIdx=null, draft 복원
    onChange.mockClear()
    fireEvent.keyDown(ta2, { key: 'ArrowDown', code: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith('초안 텍스트')
  })
})

// ── 3. 팔레트 열림 시 ↑↓는 히스토리 미발동 ──────────────────────────────────────

describe('B9 입력 히스토리 — 팔레트 우선순위', () => {
  it('슬래시 팔레트 열림(value="/") → ArrowUp은 팔레트 네비(onChange 미호출)', () => {
    const history = ['이전 메시지']
    const { ta, onChange } = renderWithHistory(history, '/')

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    // 팔레트 우선: onChange는 히스토리 적용용으로 호출되지 않음
    // (슬래시 팔레트가 ArrowUp을 가로채 slashIdx 변경만 함)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('슬래시 팔레트 열림(value="/") → ArrowDown은 팔레트 네비(onChange 미호출)', () => {
    const history = ['이전 메시지']
    const { ta, onChange } = renderWithHistory(history, '/')

    fireEvent.keyDown(ta, { key: 'ArrowDown', code: 'ArrowDown' })

    expect(onChange).not.toHaveBeenCalled()
  })
})

// ── 4. 멀티라인 중간 줄에서 히스토리 미발동 ──────────────────────────────────────

describe('B9 입력 히스토리 — 멀티라인 안전', () => {
  it('멀티라인 value의 중간 줄(커서가 첫 줄도 마지막 줄도 아님) → ArrowUp 히스토리 미발동', () => {
    const history = ['이전 메시지']
    const { ta, onChange } = renderWithHistory(history, '첫 줄\n중간 줄\n마지막 줄')

    // 커서를 중간 줄에 놓기 (selectionStart = '첫 줄\n중간 줄'.length 정도)
    Object.defineProperty(ta, 'selectionStart', { value: 7, writable: true })

    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })

    // 중간 줄이므로 히스토리 로드 없음(onChange 히스토리 값으로 호출 안 됨)
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
    // 먼저 ↑로 histIdx 설정
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '이전 메시지', onChange: handleChange })} history={history} />)
    // value를 멀티라인으로 변경 후 커서를 중간에
    rerender(<Composer {...mkProps({ value: '첫 줄\n두 번째 줄', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    // 커서를 첫 줄 끝에 놓기 (selectionStart < '첫 줄\n'.length → 마지막 줄이 아님)
    Object.defineProperty(ta2, 'selectionStart', { value: 3, writable: true })

    onChange.mockClear()
    fireEvent.keyDown(ta2, { key: 'ArrowDown', code: 'ArrowDown' })

    // 마지막 줄이 아니므로 histrory draft 복원 안 됨
    expect(onChange).not.toHaveBeenCalledWith('')
  })
})

// ── 5. 직접 타이핑 후 histIdx 초기화 ──────────────────────────────────────────────

describe('B9 입력 히스토리 — 직접 타이핑 시 histIdx 초기화', () => {
  it('히스토리 탐색 중 직접 타이핑 → histIdx 초기화(이후 ↑은 항상 최신부터)', () => {
    const history = ['첫 번째', '두 번째', '세 번째']
    const onChange = vi.fn()
    const handleChange = vi.fn((v: string) => onChange(v))

    const { rerender, container } = render(
      <Composer {...mkProps({ value: '', onChange: handleChange })} history={history} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement

    // ↑: histIdx=null → 2 ('세 번째')
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '세 번째', onChange: handleChange })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    // ↑: histIdx=2 → 1 ('두 번째')
    fireEvent.keyDown(ta2, { key: 'ArrowUp', code: 'ArrowUp' })

    // 직접 타이핑(fireEvent.change) → histIdx=null 초기화
    // rerender 없이 바로 change 발생 — Composer가 value prop을 아직 '세 번째'로 보지만
    // onChange 핸들러가 histIdx를 null로 리셋한다
    fireEvent.change(ta2, { target: { value: '새로 타이핑' } })

    rerender(<Composer {...mkProps({ value: '새로 타이핑', onChange: handleChange })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement

    // 다시 ↑ → histIdx=null이므로 최신부터(세 번째)
    onChange.mockClear()
    fireEvent.keyDown(ta3, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('세 번째')
  })
})

// ── 6. Enter 후 histIdx 초기화 ────────────────────────────────────────────────────

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

    // ↑ 히스토리 로드
    fireEvent.keyDown(ta, { key: 'ArrowUp', code: 'ArrowUp' })
    rerender(<Composer {...mkProps({ value: '이전 메시지', onChange: handleChange, onSend })} history={history} />)
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement

    // Enter 전송
    fireEvent.keyDown(ta2, { key: 'Enter', code: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalled()

    // 전송 후 value='', ↑ → 히스토리 최신부터(초기화 확인)
    rerender(<Composer {...mkProps({ value: '', onChange: handleChange, onSend })} history={history} />)
    const ta3 = container.querySelector('textarea') as HTMLTextAreaElement
    onChange.mockClear()
    fireEvent.keyDown(ta3, { key: 'ArrowUp', code: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith('이전 메시지')
  })
})

// ── 7. 빈 히스토리 → 무동작 ──────────────────────────────────────────────────────

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

// ── 8. 기존 키 동작 회귀 ─────────────────────────────────────────────────────────

describe('B9 입력 히스토리 — 기존 동작 회귀', () => {
  it('history 있어도 슬래시 팔레트 Enter 선택은 정상 동작', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Composer {...mkProps({ value: '/', onChange })} history={['이전']} />
    )
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter' })
    // 슬래시 팔레트가 Enter로 명령어 선택 → onChange 호출됨
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
