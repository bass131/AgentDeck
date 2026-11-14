// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, act, cleanup, fireEvent } from '@testing-library/react'
import type { JSX } from 'react'
import { useAppStore } from '@renderer/00_App/appStore'

// G9c — 차이 목록에서 범위 밖으로 둔 항목(E6·P3·B2)의 지금 동작을 고정한다. G9a·G9b·G9c 모두 「새 기능 금지」로
// 이 동작을 바꾸지 않았다(결정 대장 [AI] 성향 25·37). 바꾸려면 이 테스트를 먼저 고친다.

const mockApi = {
  windowMinimize: vi.fn().mockResolvedValue(undefined),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn().mockResolvedValue(undefined),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn().mockResolvedValue(undefined),
  windowDragStart: vi.fn().mockResolvedValue(undefined),
  windowDragEnd: vi.fn().mockResolvedValue(undefined),
  windowResizeStart: vi.fn().mockResolvedValue(undefined),
  windowResizeEnd: vi.fn().mockResolvedValue(undefined),
  onWindowState: vi.fn().mockReturnValue(() => {}),
  onAgentEvent: vi.fn(() => () => {}),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'saved' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'run-pin' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  workspaceOpen: vi.fn().mockResolvedValue({ rootPath: null, tree: null }),
  fsRead: vi.fn().mockResolvedValue({ content: '' }),
  fsListDir: vi.fn().mockResolvedValue({ entries: [] }),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
  referenceAdd: vi.fn().mockResolvedValue({ reference: null }),
  referenceList: vi.fn().mockResolvedValue({ references: [] }),
  referenceTree: vi.fn().mockResolvedValue({ tree: null }),
  git: { root: vi.fn().mockResolvedValue(null) },
  conversationRename: vi.fn().mockResolvedValue({ ok: true }),
  conversationDelete: vi.fn().mockResolvedValue({ ok: true }),
  getUiPrefs: vi.fn().mockResolvedValue({}),
  setUiPref: vi.fn().mockResolvedValue({ ok: true }),
  getAppVersion: vi.fn().mockResolvedValue(''),
  checkEngineUpdate: vi.fn().mockResolvedValue({ current: null, latest: null, updateAvailable: false }),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.agentRun.mockResolvedValue({ runId: 'run-pin' })
})

afterEach(() => cleanup())

describe('E6 현 동작 — systemPrompt는 패널만 보낸다(단일 대화에는 없음)', () => {
  it('단일 sendMessage의 agentRun 인자에는 systemPrompt가 없다', async () => {
    useAppStore.setState({ conversationId: 'e6', isRunning: false, replMode: false, workspaceRoot: '/w' })
    await useAppStore.getState().sendMessage('안녕')
    const args = mockApi.agentRun.mock.calls[0][0] as Record<string, unknown>
    expect(args.systemPrompt).toBeUndefined()
    useAppStore.setState({ conversationId: null, currentRunId: null, isRunning: false, thread: [] })
  })

  it('패널 send는 패널마다의 sysPrompt를 systemPrompt로 싣는다', async () => {
    const { usePanelSlot, __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
    __resetPanelSessionManagerForTests()
    const { result } = renderHook(() => usePanelSlot('e6', 0))
    await act(async () => { await result.current.send('hi', { sysPrompt: '패널 지시' }) })
    const args = mockApi.agentRun.mock.calls[0][0] as Record<string, unknown>
    expect(args.systemPrompt).toBe('패널 지시')
    __resetPanelSessionManagerForTests()
  })
})

describe('P3 현 동작 — 단일 effort는 입력창 지역 상태라 재마운트하면 기본값으로 돌아간다', () => {
  it('단일 Composer의 effort는 저장되지 않는다(패널 effort는 useMultiPersist가 패널별로 저장한다)', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { DEFAULT_EFFORT } = await import('@renderer/03_Agent/pickerOptions')
    const onSend = vi.fn()
    const props = { value: 'x', onChange: () => {}, onSend, onAbort: () => {}, isRunning: false }
    const first = render(<Composer {...props} />)
    const effortBtn = first.container.querySelector('[aria-label="Effort 선택"]') as HTMLElement | null
    expect(effortBtn).toBeTruthy()
    fireEvent.click(effortBtn!)
    const opts = Array.from(first.container.querySelectorAll('.pick-menu .pick-opt')) as HTMLElement[]
    const other = opts.find((o) => !o.className.includes('on') && !o.className.includes('disabled'))
    expect(other).toBeTruthy()
    fireEvent.click(other!)
    fireEvent.keyDown(first.container.querySelector('textarea') as HTMLElement, { key: 'Enter' })
    const changed = (onSend.mock.calls[0][0] as { effort: string }).effort
    expect(changed).not.toBe(DEFAULT_EFFORT)
    first.unmount()
    const second = render(<Composer {...props} />)
    fireEvent.keyDown(second.container.querySelector('textarea') as HTMLElement, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(2)
    const picker = onSend.mock.calls[1][0] as { effort: string } | undefined
    expect(picker?.effort).toBe(DEFAULT_EFFORT)
  }, 15000)
})

describe('E10 — 중단 뒤 stale 재계산은 코어 한 곳에서 한다(구조만 통합)', () => {
  it('abort는 CLEAR_LOOPS 뒤 refreshStale을, 거절된 interrupt는 정리 뒤 refreshStale을 부른다', async () => {
    const { createRunCore } = await import('@renderer/03_Agent/state/runCore')
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    const order: string[] = []
    const state = { ...makePanelInitialState(), currentRunId: 'r-e10', isRunning: true }
    const core = createRunCore({
      readState: () => state,
      dispatch: (a) => { order.push(a.type) },
      refreshStale: () => { order.push('refreshStale') },
      resolveRunTarget: () => ({}),
      onPermissionMode: () => {},
    })
    await core.abort()
    expect(order).toEqual(['CLEAR_LOOPS', 'refreshStale'])
    order.length = 0
    const api = window.api as unknown as Record<string, unknown>
    api.agentInterrupt = vi.fn().mockResolvedValue({ accepted: false })
    await core.interrupt()
    expect(order).toEqual(['CLOSE_DEAD_RUN', 'refreshStale'])
  })
})

describe('L3 — @멘션 팔레트의 마우스 선택은 단일 입력창과 패널에서 같게 경로를 넣는다(G9b 정렬 고정)', () => {
  async function typeAtAndPick(container: HTMLElement): Promise<string> {
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => { fireEvent.change(ta, { target: { value: '@', selectionStart: 1 } }) })
    const opt = Array.from(container.querySelectorAll('.slash-menu .slash-opt'))
      .find((o) => o.textContent?.includes('README.md')) as HTMLElement | undefined
    expect(opt).toBeTruthy()
    await act(async () => { fireEvent.mouseDown(opt!) })
    return ta.value
  }

  it('단일 Composer — 항목을 누르면 @경로가 들어가고 팔레트가 닫힌다', async () => {
    const { useState } = await import('react')
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    function Host(): JSX.Element {
      const [v, setV] = useState('')
      return <Composer value={v} onChange={setV} onSend={() => {}} onAbort={() => {}} isRunning={false} mentionFiles={['README.md']} />
    }
    const { container } = render(<Host />)
    expect(await typeAtAndPick(container)).toContain('@README.md')
    expect(container.querySelector('.slash-menu')).toBeNull()
  }, 15000)

  it('패널(PanelView) — 같은 입력창 본체라 같은 결과다', async () => {
    const noop = (): void => {}
    const noopAsync = async (): Promise<void> => {}
    const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
    const { PanelView } = await import('@renderer/05_Conversation/PanelView')
    const session = {
      state: makePanelInitialState(), send: noopAsync, abort: noopAsync, interrupt: noopAsync, restore: noop,
      dismissLoopsStopped: noop, respondPermission: noopAsync, respondQuestion: noopAsync, setReplMode: noop,
      dismissGoalStale: noop, clear: noop, enqueue: noop, dequeue: () => undefined, removeQueued: noop,
    }
    const { container } = render(
      <PanelView slot={0} panel={{ title: 'p', status: 'idle', cwd: 'C:/w', ctxPct: 0 }} session={session as never}
        workspaceRoot="C:/w" onExpand={noop} onPrompt={noop} onPickFolder={noop} mentionFiles={['README.md']} />
    )
    expect(await typeAtAndPick(container)).toContain('@README.md')
    expect(container.querySelector('.slash-menu')).toBeNull()
  }, 15000)
})

describe('B2 현 동작 — Esc 중단은 단일 배치에서만 한다(멀티 배치에서는 무시)', () => {
  async function renderShell(mode: 'single' | 'multi') {
    const abortRun = vi.fn(async () => {})
    const interruptRun = vi.fn(async () => {})
    useAppStore.setState({ workspaceMode: mode, isRunning: true, replMode: false, abortRun, interruptRun } as never)
    const { Shell } = await import('@renderer/12_Window/Shell')
    await act(async () => { render(<Shell />) })
    return { abortRun, interruptRun }
  }

  it('단일 배치에서 실행 중 Esc는 중단한다', async () => {
    const { abortRun } = await renderShell('single')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(abortRun).toHaveBeenCalledTimes(1)
  })

  it('멀티 배치에서는 Esc가 단일 대화도 패널도 중단하지 않는다', async () => {
    const { abortRun, interruptRun } = await renderShell('multi')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(abortRun).not.toHaveBeenCalled()
    expect(interruptRun).not.toHaveBeenCalled()
    expect(mockApi.agentAbort).not.toHaveBeenCalled()
  })
})
