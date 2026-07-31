// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

afterEach(() => cleanup())

beforeAll(async () => {
  await import('../../../02_Source/renderer/src/store/appStore')
  await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
})

const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  windowMinimize: vi.fn(),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: false }),
  windowClose: vi.fn(),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn(),
  windowDragStart: vi.fn(),
  windowDragEnd: vi.fn(),
  windowResizeStart: vi.fn(),
  windowResizeEnd: vi.fn(),
  onWindowState: vi.fn().mockReturnValue(() => {}),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

describe('pickerOptions — 공유 옵션 모듈 (N1~N5)', () => {
  it('모듈이 존재하고 MODELS/EFFORTS/MODES를 export한다', async () => {
    const mod = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    expect(mod.MODELS).toBeDefined()
    expect(mod.EFFORTS).toBeDefined()
    expect(mod.MODES).toBeDefined()
  })

  it('MODELS가 full ID 어휘를 담는다 (짧은 별칭 아님)', async () => {
    const { MODELS } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    const ids = MODELS.map((m) => m.id)
    expect(ids).toContain('claude-opus-5')
    expect(ids).toContain('claude-fable-5')
    expect(ids).toContain('claude-sonnet-5')
    expect(ids).toContain('claude-haiku-4-5')
  })

  it('라벨은 패밀리명 + 버전이고 패밀리별 색이 유지된다', async () => {
    const { MODELS } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    const expected: Record<string, { label: string; color: RegExp }> = {
      'claude-opus-5': { label: 'Opus 5', color: /violet/ },
      'claude-fable-5': { label: 'Fable 5', color: /gold/ },
      'claude-sonnet-5': { label: 'Sonnet 5', color: /blue/ },
      'claude-haiku-4-5': { label: 'Haiku 4.5', color: /teal/ }
    }
    for (const [id, want] of Object.entries(expected)) {
      const row = MODELS.find((m) => m.id === id)
      expect(row, id).toBeDefined()
      expect(row!.label, id).toBe(want.label)
      expect(row!.color, id).toMatch(want.color)
    }
  })

  it('EFFORTS는 최대(max)/매우 높음(xhigh)/높음(high)/보통(medium)/낮음(low)/최소(minimal) 6개', async () => {
    const { EFFORTS } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    const ids = EFFORTS.map((e) => e.id)
    expect(ids).toContain('max')
    expect(ids).toContain('xhigh')
    expect(ids).toContain('high')
    expect(ids).toContain('medium')
    expect(ids).toContain('low')
    expect(ids).toContain('minimal')
    expect(EFFORTS.length).toBe(6)
  })

  it('EFFORTS max.label="최대", xhigh.label="매우 높음" (N3 수정)', async () => {
    const { EFFORTS } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    const max = EFFORTS.find((e) => e.id === 'max')!
    const xhigh = EFFORTS.find((e) => e.id === 'xhigh')!
    expect(max.label).toBe('최대')
    expect(xhigh.label).toBe('매우 높음')
  })

  it('MODES는 5개(normal/plan/acceptEdits/auto/bypass)', async () => {
    const { MODES } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    const ids = MODES.map((m) => m.id)
    expect(ids).toContain('normal')
    expect(ids).toContain('plan')
    expect(ids).toContain('acceptEdits')
    expect(ids).toContain('auto')
    expect(ids).toContain('bypass')
    expect(MODES.length).toBe(5)
  })

  it('MODES bypass: label="Bypass", warn=true, color=red 계열', async () => {
    const { MODES } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    const bypass = MODES.find((m) => m.id === 'bypass')!
    expect(bypass.label).toBe('Bypass')
    expect(bypass.warn).toBe(true)
    expect(bypass.color).toMatch(/red/)
  })

  it('MODES normal: icon=shield 계열 존재', async () => {
    const { MODES } = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    const normal = MODES.find((m) => m.id === 'normal')!
    expect(normal.icon).toBeTruthy()
  })

  it('DEFAULT_MODEL/DEFAULT_EFFORT/DEFAULT_MODE 상수 export', async () => {
    const mod = await import('../../../02_Source/renderer/src/lib/pickerOptions')
    expect(mod.DEFAULT_MODEL).toBe('claude-opus-5')
    expect(mod.DEFAULT_EFFORT).toBe('max')
    expect(mod.DEFAULT_MODE_SINGLE).toBe('auto')
    expect(mod.DEFAULT_MODE_MULTI).toBe('bypass')
  })
})

describe('MultiWorkspace — RunPickers caption "Effort" (N2)', () => {
  async function renderMulti() {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceMode: 'single' })
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    return container
  }

  it('RunPickers에 "Effort" 텍스트(.pick-lbl)가 있다', async () => {
    const container = await renderMulti()
    const lbls = Array.from(container.querySelectorAll('.pick-lbl')).map((el) => el.textContent)
    expect(lbls).toContain('Effort')
  })

  it('"노력" 텍스트는 없다 (이전 caption 제거됨)', async () => {
    const container = await renderMulti()
    const lbls = Array.from(container.querySelectorAll('.pick-lbl')).map((el) => el.textContent)
    expect(lbls).not.toContain('노력')
  })
})

describe('Composer — 피커 옵션 pickerOptions import (N3, N4)', () => {
  it('Composer에서 Fable 5 모델 옵션이 렌더된다', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/components/01_conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const modelBtn = Array.from(container.querySelectorAll('.pick-btn')).find(
      (b) => b.querySelector('.pick-lbl')?.textContent === '모델'
    ) as HTMLButtonElement | null
    expect(modelBtn).toBeTruthy()
    act(() => { modelBtn!.click() })
    const menuItems = Array.from(container.querySelectorAll('.po-main')).map((el) => el.textContent)
    expect(menuItems).toContain('Fable 5')
    expect(menuItems).toContain('Opus 5')
    expect(menuItems).toContain('Sonnet 5')
    expect(menuItems).toContain('Haiku 4.5')
  })

  it('Composer에서 매우 높음(xhigh) effort 옵션이 존재한다', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/components/01_conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const effortBtn = Array.from(container.querySelectorAll('.pick-btn')).find(
      (b) => b.querySelector('.pick-lbl')?.textContent === 'Effort'
    ) as HTMLButtonElement | null
    expect(effortBtn).toBeTruthy()
    act(() => { effortBtn!.click() })
    const menuItems = Array.from(container.querySelectorAll('.po-main')).map((el) => el.textContent)
    expect(menuItems).toContain('매우 높음')
    expect(menuItems).toContain('최대')
  })

  it('Composer 기본 model=Opus 5 → pick-val에 "Opus 5" 표시', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/components/01_conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const vals = Array.from(container.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('Opus 5')
  })

  it('Composer 기본 effort=max → pick-val에 "최대" 표시', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/components/01_conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const vals = Array.from(container.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('최대')
  })

  it('Composer 기본 mode=auto → pick-val에 "자동" 표시', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/components/01_conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const vals = Array.from(container.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('자동')
  })
})

describe('Composer — 모드 Bypass warn 렌더 (N5)', () => {
  it('Composer 모드 드롭다운에 Bypass 옵션이 있다', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/components/01_conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const modeBtn = Array.from(container.querySelectorAll('.pick-btn')).find(
      (b) => b.querySelector('.pick-lbl')?.textContent === '모드'
    ) as HTMLButtonElement | null
    expect(modeBtn).toBeTruthy()
    act(() => { modeBtn!.click() })
    const menuItems = Array.from(container.querySelectorAll('.po-main')).map((el) => el.textContent)
    expect(menuItems).toContain('Bypass')
  })

  it('Composer 모드 드롭다운 Bypass 항목에 .warn 클래스가 있다', async () => {
    const { Composer } = await import('../../../02_Source/renderer/src/components/01_conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const modeBtn = Array.from(container.querySelectorAll('.pick-btn')).find(
      (b) => b.querySelector('.pick-lbl')?.textContent === '모드'
    ) as HTMLButtonElement | null
    act(() => { modeBtn!.click() })
    const bypassOpt = Array.from(container.querySelectorAll('.pick-opt')).find(
      (el) => el.querySelector('.po-main')?.textContent === 'Bypass'
    )
    expect(bypassOpt?.classList.contains('warn')).toBe(true)
  })
})

describe('MultiWorkspace — 컨텍스트 1M 표시 (N6)', () => {
  it('ma-ctx-detail에 "1M 토큰" 텍스트가 있다', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceMode: 'single' })
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    const details = Array.from(container.querySelectorAll('.ma-ctx-detail')).map((el) => el.textContent)
    expect(details.some((d) => d?.includes('1M'))).toBe(true)
  })

  it('"200,000 토큰" 텍스트가 없다 (이전 값 제거됨)', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceMode: 'single' })
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    const details = Array.from(container.querySelectorAll('.ma-ctx-detail')).map((el) => el.textContent)
    expect(details.some((d) => d?.includes('200,000'))).toBe(false)
  })
})

describe('MultiWorkspace — 기본 picker 값 (N6)', () => {
  it('멀티 패널 기본 model → "Opus 5" 표시', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceMode: 'single' })
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const vals = Array.from(panel.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('Opus 5')
  })

  it('멀티 패널 기본 effort → "최대" 표시', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceMode: 'single' })
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const vals = Array.from(panel.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('최대')
  })

  it('멀티 패널 기본 mode=bypass → "Bypass" 표시', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceMode: 'single' })
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/components/00_shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const vals = Array.from(panel.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('Bypass')
  })
})

describe('Conversation — 인사말 닉네임 (N1)', () => {
  async function setStore(patch: Record<string, unknown>) {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({
      messages: [], streamingText: '', toolCards: [], isRunning: false, errorMessage: undefined,
      ...patch,
    } as Parameters<typeof useAppStore.setState>[0])
  }

  it('빈 채팅 welcome에 "님?" 포함된 인사말 — profile.nickname 있을 때', async () => {
    await setStore({ profile: { nickname: '개발자', color: '#6366f1' } })
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const title = container.querySelector('.wc-title')
    expect(title?.textContent).toMatch(/님\?/)
  })

  it('wc-title이 store profile.nickname("개발자")을 포함한다', async () => {
    await setStore({ profile: { nickname: '개발자', color: '#6366f1' } })
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const title = container.querySelector('.wc-title')
    expect(title?.textContent).toContain('개발자')
  })

  it('wc-title 텍스트가 "무엇을 도와드릴까요" 포함', async () => {
    await setStore({})
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const title = container.querySelector('.wc-title')
    expect(title?.textContent).toContain('무엇을 도와드릴까요')
  })
})

describe('AgentPanel — todos scroll 클래스 (N7)', () => {
  it('Todos 컴포넌트 .todos div에 "scroll" 클래스가 있다', async () => {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ isRunning: false, changedFiles: new Set(), toolCards: [], errorMessage: undefined } as Parameters<typeof useAppStore.setState>[0])
    const { AgentPanel } = await import('../../../02_Source/renderer/src/components/05_agent/AgentPanel')
    const todos = [
      { id: 't1', label: '작업 1', status: 'done' as const },
      { id: 't2', label: '작업 2', status: 'running' as const },
    ]
    const { container } = await act(async () => render(<AgentPanel todos={todos} />))
    const todosEl = container.querySelector('.todos')
    expect(todosEl).toBeTruthy()
    expect(todosEl?.classList.contains('scroll')).toBe(true)
  })
})

describe('icons.tsx — IconClipList / IconCheckCirc export (N7)', () => {
  it('IconClipList가 export된다', async () => {
    const icons = await import('../../../02_Source/renderer/src/components/common/icons')
    expect(icons.IconClipList).toBeDefined()
  })

  it('IconCheckCirc가 export된다', async () => {
    const icons = await import('../../../02_Source/renderer/src/components/common/icons')
    expect(icons.IconCheckCirc).toBeDefined()
  })

  it('IconAlert가 이미 존재한다 (회귀)', async () => {
    const icons = await import('../../../02_Source/renderer/src/components/common/icons')
    expect(icons.IconAlert).toBeDefined()
  })

  it('IconBolt가 이미 존재한다 (회귀)', async () => {
    const icons = await import('../../../02_Source/renderer/src/components/common/icons')
    expect(icons.IconBolt).toBeDefined()
  })

  it('IconShieldChk가 이미 존재한다 (회귀)', async () => {
    const icons = await import('../../../02_Source/renderer/src/components/common/icons')
    expect(icons.IconShieldChk).toBeDefined()
  })
})

describe('multiAgentSampleData — DEFAULT_PICKER', () => {
  it('DEFAULT_PICKER가 pickerOptions 기본값에서 파생된다', async () => {
    const { DEFAULT_PICKER } = await import('../../../02_Source/renderer/src/lib/multiAgentSampleData')
    const { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_MODE_MULTI } = await import(
      '../../../02_Source/renderer/src/lib/pickerOptions'
    )
    expect(DEFAULT_PICKER.model).toBe(DEFAULT_MODEL)
    expect(DEFAULT_PICKER.effort).toBe(DEFAULT_EFFORT)
    expect(DEFAULT_PICKER.mode).toBe(DEFAULT_MODE_MULTI)
    expect(DEFAULT_PICKER.mode).toBe('bypass')
  })
})
