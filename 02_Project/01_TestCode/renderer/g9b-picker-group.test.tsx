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

const noop = (): void => {}
const noopAsync = async (): Promise<void> => {}

async function renderPanelWithPicker(setPicker: (p: unknown) => void, mode = 'auto') {
  const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
  const { PanelView } = await import('@renderer/05_Conversation/PanelView')
  const session = {
    state: makePanelInitialState(),
    send: noopAsync,
    abort: noopAsync,
    interrupt: noopAsync,
    restore: noop,
    dismissLoopsStopped: noop,
    respondPermission: noopAsync,
    respondQuestion: noopAsync,
    setReplMode: noop,
    dismissGoalStale: noop,
    clear: noop,
    enqueue: noop,
    dequeue: () => undefined,
    removeQueued: noop,
  }
  return render(
    <PanelView
      slot={0}
      panel={{ title: 'p', status: 'working', cwd: 'C:/w', ctxPct: 0 }}
      session={session as never}
      workspaceRoot="C:/w"
      onExpand={noop}
      onPrompt={noop}
      onPickFolder={noop}
      picker={{ model: 'claude-opus-4-7', effort: 'high', mode }}
      setPicker={setPicker as never}
    />,
  )
}

describe('패널 선택기 — 공용 PickerGroup', () => {
  it('패널 풋터에 단일과 같은 선택기 묶음(구분선 셋, aria 「모드 선택」)이 있다', async () => {
    const { container } = await renderPanelWithPicker(vi.fn())
    const foot = container.querySelector('.ma-p-foot') as HTMLElement
    expect(foot.querySelector('[aria-label="모드 선택"]')).toBeTruthy()
    expect(foot.querySelectorAll('.pick-div').length).toBe(3)
  })

  it('패널 UltraCode 토글은 패널 키의 토글만 바꾼다(단일 범위 불변)', async () => {
    const { renderHook } = await import('@testing-library/react')
    const { useUltracodeToggle, SINGLE_CHAT_DEFAULT_SCOPE } = await import('@renderer/03_Agent/state/ultracodeToggle')
    const single = renderHook(() => useUltracodeToggle(SINGLE_CHAT_DEFAULT_SCOPE))
    const singleBefore = single.result.current[0]
    const { container } = await renderPanelWithPicker(vi.fn())
    const btn = container.querySelector('[aria-label="UltraCode 모드 토글"]') as HTMLElement
    const pressedBefore = btn.getAttribute('aria-pressed')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).not.toBe(pressedBefore)
    single.rerender()
    expect(single.result.current[0]).toBe(singleBefore)
  })

  it('패널 모델 선택은 setPicker로 패널 상태만 바꾼다', async () => {
    const setPicker = vi.fn()
    const { container } = await renderPanelWithPicker(setPicker)
    fireEvent.click(container.querySelector('[aria-label="모델 선택"]') as HTMLElement)
    const opts = container.querySelectorAll('.pick-menu .pick-opt')
    fireEvent.click(opts[opts.length - 1] as HTMLElement)
    expect(setPicker).toHaveBeenCalled()
    expect((setPicker.mock.calls[0][0] as { effort: string }).effort).toBe('high')
  })
})

describe('P5 — 멀티의 Shift+Tab은 입력창이 포커스된 패널의 모드만 돌린다(사용자 결정)', () => {
  it('패널 입력창에서 Shift+Tab → 그 패널의 모드가 MODES 다음 값으로 바뀐다', async () => {
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    const setPicker = vi.fn()
    const { container } = await renderPanelWithPicker(setPicker, MODES[0].id)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.keyDown(ta, { key: 'Tab', shiftKey: true })
    expect(setPicker).toHaveBeenCalledTimes(1)
    expect((setPicker.mock.calls[0][0] as { mode: string }).mode).toBe(MODES[1].id)
  })

  it('마지막 모드에서 Shift+Tab → 첫 모드로 돈다', async () => {
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    const setPicker = vi.fn()
    const { container } = await renderPanelWithPicker(setPicker, MODES[MODES.length - 1].id)
    fireEvent.keyDown(container.querySelector('textarea') as HTMLTextAreaElement, { key: 'Tab', shiftKey: true })
    expect((setPicker.mock.calls[0][0] as { mode: string }).mode).toBe(MODES[0].id)
  })

  it('패널이 처리한 Shift+Tab은 document 전역 단축키까지 올라가지 않는다(숨은 단일 선택기 불변)', async () => {
    const { useAppStore, selectPickerMode } = await import('@renderer/00_App/appStore')
    const before = selectPickerMode(useAppStore.getState())
    const docSpy = vi.fn()
    document.addEventListener('keydown', docSpy)
    try {
      const { container } = await renderPanelWithPicker(vi.fn())
      fireEvent.keyDown(container.querySelector('textarea') as HTMLTextAreaElement, { key: 'Tab', shiftKey: true })
      expect(docSpy).not.toHaveBeenCalled()
      expect(selectPickerMode(useAppStore.getState())).toBe(before)
    } finally {
      document.removeEventListener('keydown', docSpy)
    }
  })

  // G9b 검수 중요 2 — 단일 전역 처리기처럼 모달·권한 카드·질문 pill이 떠 있으면 손을 뗀다.
  it.each([
    ['권한 카드(.perm-card)', 'perm-card'],
    ['내려둔 질문 pill(.q-mini-pill)', 'q-mini-pill'],
    ['질문 창(.q-overlay)', 'q-overlay'],
  ])('%s가 떠 있으면 패널 Shift+Tab은 모드를 돌리지 않고 기본 포커스 이동에 맡긴다', async (_name, cls) => {
    const setPicker = vi.fn()
    const blocker = document.createElement('div')
    blocker.className = cls
    document.body.appendChild(blocker)
    try {
      const { container } = await renderPanelWithPicker(setPicker)
      const ta = container.querySelector('textarea') as HTMLTextAreaElement
      const notCanceled = fireEvent.keyDown(ta, { key: 'Tab', shiftKey: true })
      expect(setPicker).not.toHaveBeenCalled()
      expect(notCanceled).toBe(true)
    } finally {
      blocker.remove()
    }
  })

  it('전역 Shift+Tab 처리기는 멀티에서 없다 — 포커스된 패널 입력창이 없으면 아무것도 안 한다', async () => {
    const { globalModeSwitchFor } = await import('@renderer/12_Window/useGlobalShortcuts')
    const cycle = vi.fn()
    expect(globalModeSwitchFor('multi', cycle)).toBeUndefined()
    expect(globalModeSwitchFor('single', cycle)).toBe(cycle)
  })

  it('멀티의 전역 처리기(undefined)로는 document Shift+Tab이 단일 pickerMode를 바꾸지 않는다', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { useGlobalShortcuts, globalModeSwitchFor } = await import('@renderer/12_Window/useGlobalShortcuts')
    const { useAppStore, selectPickerMode } = await import('@renderer/00_App/appStore')
    const before = selectPickerMode(useAppStore.getState())
    const cycle = vi.fn(() => useAppStore.getState().cyclePickerMode())
    renderHook(() => useGlobalShortcuts({ onModeSwitch: globalModeSwitchFor('multi', cycle) }))
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true }))
    })
    expect(cycle).not.toHaveBeenCalled()
    expect(selectPickerMode(useAppStore.getState())).toBe(before)
  })
})

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
