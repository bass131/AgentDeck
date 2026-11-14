// @vitest-environment jsdom
// M05 G9b — 선택기 하나(P1·P2). 단일 입력창 바(ComposerBar)와 멀티 패널이 같은 PickerGroup을 쓴다.
// P1: 널 가드는 멀티 쪽(옵션에 현재 값이 없어도 깨지지 않는다), P2: 문구는 단일 쪽(aria 「모드 선택」).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

function groupProps(over: Record<string, unknown> = {}) {
  return {
    model: 'claude-opus-4-7',
    setModel: vi.fn(),
    effort: 'high',
    setEffort: vi.fn(),
    mode: 'auto',
    setMode: vi.fn(),
    orchestration: false,
    setOrchestration: vi.fn(),
    replMode: false,
    setReplMode: vi.fn(),
    replLit: false,
    ...over,
  }
}

describe('Picker — P1 널 가드(멀티 쪽)', () => {
  it('옵션이 비어도 렌더가 깨지지 않고 값 칸은 빈 문자열이다', async () => {
    const { Picker } = await import('@renderer/05_Conversation/ComposerPicker')
    const { container } = render(
      <Picker ariaLabel="빈 선택" caption="빈" options={[]} value="none" onChange={() => {}} />,
    )
    expect(container.querySelector('.pick-val')?.textContent).toBe('')
  })
})

describe('PickerGroup — 선택기 묶음 하나', () => {
  it('모델·Effort·모드 선택기와 구분선 셋, UltraCode·REPL 토글을 단일 순서로 그린다', async () => {
    const { PickerGroup } = await import('@renderer/05_Conversation/PickerGroup')
    const { container } = render(<div className="host"><PickerGroup {...groupProps()} /></div>)
    const host = container.querySelector('.host') as HTMLElement
    const seq = Array.from(host.children).map((c) =>
      c.classList.contains('pick-div')
        ? 'div'
        : (c.querySelector('.pick-btn') ?? c).getAttribute('aria-label'),
    )
    expect(seq).toEqual([
      '모델 선택',
      'div',
      'Effort 선택',
      'div',
      '모드 선택',
      'div',
      'UltraCode 모드 토글',
      'REPL 지속세션 모드 토글',
    ])
  })

  it('P2: 모드 선택기 aria는 단일 문구 「모드 선택」이고 「실행 모드 선택」은 없다', async () => {
    const { PickerGroup } = await import('@renderer/05_Conversation/PickerGroup')
    const { container } = render(<PickerGroup {...groupProps()} />)
    expect(container.querySelector('[aria-label="모드 선택"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="실행 모드 선택"]')).toBeNull()
  })

  it('UltraCode 토글은 현재 값의 반대로 setOrchestration을 부른다', async () => {
    const { PickerGroup } = await import('@renderer/05_Conversation/PickerGroup')
    const props = groupProps({ orchestration: true })
    const { container } = render(<PickerGroup {...props} />)
    fireEvent.click(container.querySelector('[aria-label="UltraCode 모드 토글"]') as HTMLElement)
    expect(props.setOrchestration).toHaveBeenCalledWith(false)
  })

  it('단일 ComposerBar는 첨부 버튼 뒤에 같은 PickerGroup 묶음을 두고 전송 버튼으로 끝난다', async () => {
    const { ComposerBar } = await import('@renderer/05_Conversation/ComposerBar')
    const { container } = render(
      <ComposerBar
        {...groupProps()}
        disabled={false}
        isRunning={false}
        value="안녕"
        attachedImages={[]}
        doSend={() => {}}
        onAbort={() => {}}
        onAttachButton={() => {}}
      />,
    )
    const bar = container.querySelector('.composer-bar') as HTMLElement
    const kids = Array.from(bar.children)
    expect(kids[0].getAttribute('aria-label')).toBe('이미지 첨부')
    expect(bar.querySelectorAll('.pick-div').length).toBe(3)
    expect(kids[kids.length - 1].getAttribute('aria-label')).toBe('전송')
  })

  it('UltraCode 토글 title은 단일 문구다', async () => {
    const { PickerGroup } = await import('@renderer/05_Conversation/PickerGroup')
    const { container } = render(<PickerGroup {...groupProps({ orchestration: true })} />)
    expect(container.querySelector('[aria-label="UltraCode 모드 토글"]')?.getAttribute('title')).toBe(
      '복잡·병렬 작업을 여러 에이전트로 — 실행마다 승인',
    )
  })
})
