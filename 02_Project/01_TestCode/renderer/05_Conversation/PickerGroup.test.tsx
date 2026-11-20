// 작업 ID: g9b · 옛 이름 g9b-picker-group.test.tsx
// @vitest-environment jsdom
// M05 G9b — 선택기 하나(P1·P2). 단일 입력창 바(ComposerBar)가 PickerGroup을 쓴다.
// P1: 옵션에 현재 값이 없어도 깨지지 않는다, P2: 문구는 aria 「모드 선택」.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

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

// M11 G6 — 패널 선택기·패널 Shift+Tab 사례는 그리는 곳이 없던 PanelView와 함께 지웠다(M10 Backlog 3).
describe('P5 — 전역 Shift+Tab은 채팅의 단일 선택기만 돌린다', () => {
  // M10 G1 — 멀티 모드를 지웠다. 작업 모드에도 화면에 단일 선택기가 없으니 전역 처리기가 없다.
  it('전역 Shift+Tab 처리기는 작업 모드에서 없다 — 채팅에서만 단일 선택기를 돌린다', async () => {
    const { globalModeSwitchFor } = await import('@renderer/12_Window/useGlobalShortcuts')
    const cycle = vi.fn()
    expect(globalModeSwitchFor('work', cycle)).toBeUndefined()
    expect(globalModeSwitchFor('single', cycle)).toBe(cycle)
  })

  // G9b 검수 경미 — Shell이 전역 Shift+Tab 대상을 globalModeSwitchFor로 고르는지 실제 Shell로 고정한다.
  it('Shell: 채팅에서 document Shift+Tab은 단일 모드를 돌리고, 작업 모드에서는 돌리지 않는다(globalModeSwitchFor 배선)', async () => {
    const { act } = await import('@testing-library/react')
    const api: Record<string, unknown> = {
      conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
      conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
      agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
      agentAbort: vi.fn().mockResolvedValue({ ok: true }),
      onAgentEvent: vi.fn().mockReturnValue(() => {}),
      windowMinimize: vi.fn(),
      windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
      windowClose: vi.fn(),
      windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
      windowDragStart: vi.fn(),
      windowDragEnd: vi.fn(),
      windowResizeStart: vi.fn(),
      windowResizeEnd: vi.fn(),
      onWindowState: vi.fn().mockReturnValue(() => {}),
      fsRead: vi.fn().mockResolvedValue({ content: '' }),
      openFolder: vi.fn().mockResolvedValue({ canceled: true }),
      openReferenceFolder: vi.fn().mockResolvedValue({ canceled: true }),
      onFolderSelected: vi.fn().mockReturnValue(() => {}),
      listDir: vi.fn().mockResolvedValue({ entries: [] }),
      gitStatus: vi.fn().mockResolvedValue({ branch: 'main', staged: [], unstaged: [], untracked: [] }),
      gitLog: vi.fn().mockResolvedValue({ commits: [] }),
      gitDiff: vi.fn().mockResolvedValue({ diff: '' }),
      onGitChange: vi.fn().mockReturnValue(() => {}),
      getUiPrefs: vi.fn().mockResolvedValue({ 'whatsnew.seenVersion': '1.0.0' }),
      setUiPref: vi.fn().mockResolvedValue({ ok: true }),
      getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
      checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
      onLoopState: vi.fn().mockReturnValue(() => {}),
      getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
      listSlashCommands: vi.fn().mockResolvedValue([]),
      listSkills: vi.fn().mockResolvedValue([]),
    }
    Object.defineProperty(window, 'api', { value: adaptFlatApi(api), writable: true, configurable: true })
    const { loadPrefs } = await import('@renderer/11_Settings/prefs')
    await loadPrefs()
    const { useAppStore, selectPickerMode } = await import('@renderer/00_App/appStore')
    const { Shell } = await import('@renderer/12_Window/Shell')
    const shiftTab = async (): Promise<void> => {
      await act(async () => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true }))
      })
    }
    try {
      useAppStore.setState({ workspaceMode: 'single', workspaceRoot: null })
      await act(async () => { render(<Shell />) })
      const singleBefore = selectPickerMode(useAppStore.getState())
      await shiftTab()
      const singleAfter = selectPickerMode(useAppStore.getState())
      expect(singleAfter).not.toBe(singleBefore)

      await act(async () => { useAppStore.setState({ workspaceMode: 'work' }) })
      expect(document.querySelector('.work-center')).toBeTruthy()
      await shiftTab()
      expect(selectPickerMode(useAppStore.getState())).toBe(singleAfter)
    } finally {
      useAppStore.setState({ workspaceMode: 'single' })
    }
  })

  it('작업 모드의 전역 처리기(undefined)로는 document Shift+Tab이 단일 pickerMode를 바꾸지 않는다', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { useGlobalShortcuts, globalModeSwitchFor } = await import('@renderer/12_Window/useGlobalShortcuts')
    const { useAppStore, selectPickerMode } = await import('@renderer/00_App/appStore')
    const before = selectPickerMode(useAppStore.getState())
    const cycle = vi.fn(() => useAppStore.getState().cyclePickerMode())
    renderHook(() => useGlobalShortcuts({ onModeSwitch: globalModeSwitchFor('work', cycle) }))
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
