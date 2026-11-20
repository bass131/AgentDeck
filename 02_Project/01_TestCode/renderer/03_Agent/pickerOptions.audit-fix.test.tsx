// 작업 ID: phase18 · 옛 이름 phase18-audit-fix.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { adaptFlatApi } from '../00_Helpers/windowApiMock'

afterEach(() => cleanup())

// M10 G1 — 멀티 화면을 지웠다. 패널 카드(PanelView)는 남겼으므로 패널 쪽 사례는 패널 하네스로 그린다.
beforeAll(async () => {
  await import('@renderer/00_App/appStore')
  await import('../00_Helpers/panelHarness')
})

async function renderPanelCards(): Promise<HTMLElement> {
  const { useAppStore } = await import('@renderer/00_App/appStore')
  useAppStore.setState({ workspaceMode: 'single' })
  const { PanelHarness } = await import('../00_Helpers/panelHarness')
  return render(<PanelHarness />).container
}

const mockApi = {
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
}
Object.defineProperty(window, 'api', { value: adaptFlatApi(mockApi), writable: true, configurable: true })

describe('pickerOptions — 공유 옵션 모듈 (N1~N5)', () => {
  it('모듈이 존재하고 modelOptionsFor/EFFORTS/MODES를 export한다', async () => {
    const mod = await import('@renderer/03_Agent/pickerOptions')
    expect(mod.modelOptionsFor).toBeTypeOf('function')
    expect(mod.EFFORTS).toBeDefined()
    expect(mod.MODES).toBeDefined()
  })

  // M06 G4: 모델 옵션은 손 표가 아니라 목록(최소 목록 또는 SDK 목록)에서 그린다.
  it('최소 목록 옵션은 정식 ID(짧은 별칭 아님)다', async () => {
    const { modelOptionsFor } = await import('@renderer/03_Agent/pickerOptions')
    const { FALLBACK_MODELS } = await import('@shared/03_Agent/models/knownModels')
    const ids = modelOptionsFor(FALLBACK_MODELS).map((m) => m.id)
    for (const id of ids) expect(id).toMatch(/^claude-[a-z]+-\d+(?:-\d+)?$/)
    expect(ids).toHaveLength(4)
  })

  it('라벨은 목록의 displayName이고 패밀리별 색이 유지된다', async () => {
    const { modelOptionsFor } = await import('@renderer/03_Agent/pickerOptions')
    const { FALLBACK_MODELS } = await import('@shared/03_Agent/models/knownModels')
    const colors: Record<string, RegExp> = { Opus: /violet/, Fable: /gold/, Sonnet: /blue/, Haiku: /teal/ }
    for (const row of modelOptionsFor(FALLBACK_MODELS)) {
      const family = row.label.split(' ')[0]
      expect(row.label, row.id).toMatch(/^[A-Z][a-z]+ \d+(?:\.\d+)?$/)
      expect(row.color, row.id).toMatch(colors[family])
    }
  })

  it('EFFORTS는 최대(max)/매우 높음(xhigh)/높음(high)/보통(medium)/낮음(low) 5개 — 「최소」는 뺐다(M06 G4)', async () => {
    const { EFFORTS } = await import('@renderer/03_Agent/pickerOptions')
    const ids = EFFORTS.map((e) => e.id)
    expect(ids).toEqual(['max', 'xhigh', 'high', 'medium', 'low'])
    expect(ids as string[]).not.toContain('minimal')
  })

  it('멀티 패널 기본값도 같은 기본 모델이고, 옛 손 표 재수출(MODEL_OPTIONS)이 없다 (M06 G4)', async () => {
    const mod = await import('@renderer/03_Agent/multiAgentDefaults')
    const { DEFAULT_MODEL_ID } = await import('@shared/03_Agent/models/knownModels')
    expect(mod.DEFAULT_PICKER.model).toBe(DEFAULT_MODEL_ID)
    expect('MODEL_OPTIONS' in mod).toBe(false)
  })

  it('멀티 모드 잔여물(COLS·COUNT_OPTIONS·SAMPLE_*·선택지 재수출)이 없고, 패널 보기가 쓰는 것만 남는다 (M10 G4)', async () => {
    const mod = await import('@renderer/03_Agent/multiAgentDefaults')
    for (const gone of ['COLS', 'COUNT_OPTIONS', 'SAMPLE_PANELS', 'SAMPLE_BATCH_TO', 'EFFORT_OPTIONS', 'MODE_OPTIONS']) {
      expect(gone in mod, gone).toBe(false)
    }
    expect(Object.keys(mod).sort()).toEqual(['DEFAULT_PICKER', 'STATUS_META'])
  })

  it('EFFORTS max.label="최대", xhigh.label="매우 높음" (N3 수정)', async () => {
    const { EFFORTS } = await import('@renderer/03_Agent/pickerOptions')
    const max = EFFORTS.find((e) => e.id === 'max')!
    const xhigh = EFFORTS.find((e) => e.id === 'xhigh')!
    expect(max.label).toBe('최대')
    expect(xhigh.label).toBe('매우 높음')
  })

  it('MODES는 5개(normal/plan/acceptEdits/auto/bypass)', async () => {
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    const ids = MODES.map((m) => m.id)
    expect(ids).toContain('normal')
    expect(ids).toContain('plan')
    expect(ids).toContain('acceptEdits')
    expect(ids).toContain('auto')
    expect(ids).toContain('bypass')
    expect(MODES.length).toBe(5)
  })

  it('MODES bypass: label="Bypass", warn=true, color=red 계열', async () => {
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    const bypass = MODES.find((m) => m.id === 'bypass')!
    expect(bypass.label).toBe('Bypass')
    expect(bypass.warn).toBe(true)
    expect(bypass.color).toMatch(/red/)
  })

  it('MODES normal: icon=shield 계열 존재', async () => {
    const { MODES } = await import('@renderer/03_Agent/pickerOptions')
    const normal = MODES.find((m) => m.id === 'normal')!
    expect(normal.icon).toBeTruthy()
  })

  it('DEFAULT_MODEL/DEFAULT_EFFORT/DEFAULT_MODE 상수 export', async () => {
    const mod = await import('@renderer/03_Agent/pickerOptions')
    expect(mod.DEFAULT_MODEL).toBe('claude-opus-5-5')
    expect(mod.DEFAULT_EFFORT).toBe('max')
    // G9c: 단일·멀티 이름을 대화·패널 이름으로 바꿨고 값(P4)은 그대로다.
    expect(mod.DEFAULT_MODE_CONVERSATION).toBe('auto')
    expect(mod.DEFAULT_MODE_PANEL).toBe('bypass')
  })
})

describe('패널 카드 — RunPickers caption "Effort" (N2)', () => {
  it('RunPickers에 "Effort" 텍스트(.pick-lbl)가 있다', async () => {
    const container = await renderPanelCards()
    const lbls = Array.from(container.querySelectorAll('.pick-lbl')).map((el) => el.textContent)
    expect(lbls).toContain('Effort')
  })

  it('"노력" 텍스트는 없다 (이전 caption 제거됨)', async () => {
    const container = await renderPanelCards()
    const lbls = Array.from(container.querySelectorAll('.pick-lbl')).map((el) => el.textContent)
    expect(lbls).not.toContain('노력')
  })
})

describe('Composer — 피커 옵션 pickerOptions import (N3, N4)', () => {
  it('Composer에서 최소 목록 네 모델 옵션이 렌더된다(SDK 목록이 오기 전)', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const modelBtn = Array.from(container.querySelectorAll('.pick-btn')).find(
      (b) => b.querySelector('.pick-lbl')?.textContent === '모델'
    ) as HTMLButtonElement | null
    expect(modelBtn).toBeTruthy()
    act(() => { modelBtn!.click() })
    const menuItems = Array.from(container.querySelectorAll('.po-main')).map((el) => el.textContent)
    expect(menuItems).toContain('Fable 5.2')
    expect(menuItems).toContain('Opus 5.5')
    expect(menuItems).toContain('Sonnet 5.5')
    expect(menuItems).toContain('Haiku 5.5')
  })

  it('Composer에서 매우 높음(xhigh) effort 옵션이 존재한다', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
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

  it('Composer 기본 model=Opus 5.5 → pick-val에 "Opus 5.5" 표시', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const vals = Array.from(container.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('Opus 5.5')
  })

  it('Composer 기본 effort=max → pick-val에 "최대" 표시', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const vals = Array.from(container.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('최대')
  })

  it('Composer 기본 mode=auto → pick-val에 "자동" 표시', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
    const { container } = render(
      <Composer value="" onChange={vi.fn()} onSend={vi.fn()} onAbort={vi.fn()} isRunning={false} />
    )
    const vals = Array.from(container.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('자동')
  })
})

describe('Composer — 모드 Bypass warn 렌더 (N5)', () => {
  it('Composer 모드 드롭다운에 Bypass 옵션이 있다', async () => {
    const { Composer } = await import('@renderer/05_Conversation/Composer')
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
    const { Composer } = await import('@renderer/05_Conversation/Composer')
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

describe('패널 카드 — 컨텍스트 1M 표시 (N6)', () => {
  it('ma-ctx-detail에 "1M 토큰" 텍스트가 있다', async () => {
    const container = await renderPanelCards()
    const details = Array.from(container.querySelectorAll('.ma-ctx-detail')).map((el) => el.textContent)
    expect(details.some((d) => d?.includes('1M'))).toBe(true)
  })

  it('"200,000 토큰" 텍스트가 없다 (이전 값 제거됨)', async () => {
    const container = await renderPanelCards()
    const details = Array.from(container.querySelectorAll('.ma-ctx-detail')).map((el) => el.textContent)
    expect(details.some((d) => d?.includes('200,000'))).toBe(false)
  })
})

describe('패널 카드 — 기본 picker 값 (N6)', () => {
  it('패널 기본 model → "Opus 5.5" 표시', async () => {
    const container = await renderPanelCards()
    const panel = container.querySelector('.ma-panel') as HTMLElement
    const vals = Array.from(panel.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('Opus 5.5')
  })

  it('패널 기본 effort → "최대" 표시', async () => {
    const container = await renderPanelCards()
    const panel = container.querySelector('.ma-panel') as HTMLElement
    const vals = Array.from(panel.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('최대')
  })

  it('패널 기본 mode=bypass → "Bypass" 표시', async () => {
    const container = await renderPanelCards()
    const panel = container.querySelector('.ma-panel') as HTMLElement
    const vals = Array.from(panel.querySelectorAll('.pick-val')).map((el) => el.textContent)
    expect(vals).toContain('Bypass')
  })
})

describe('Conversation — 인사말 닉네임 (N1)', () => {
  async function setStore(patch: Record<string, unknown>) {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({
      messages: [], streamingText: '', toolCards: [], isRunning: false, errorMessage: undefined,
      ...patch,
    } as Parameters<typeof useAppStore.setState>[0])
  }

  it('빈 채팅 welcome에 "님?" 포함된 인사말 — profile.nickname 있을 때', async () => {
    await setStore({ profile: { nickname: '개발자', color: '#6366f1' } })
    const { Conversation } = await import('@renderer/05_Conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const title = container.querySelector('.wc-title')
    expect(title?.textContent).toMatch(/님\?/)
  })

  it('wc-title이 store profile.nickname("개발자")을 포함한다', async () => {
    await setStore({ profile: { nickname: '개발자', color: '#6366f1' } })
    const { Conversation } = await import('@renderer/05_Conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const title = container.querySelector('.wc-title')
    expect(title?.textContent).toContain('개발자')
  })

  it('wc-title 텍스트가 "무엇을 도와드릴까요" 포함', async () => {
    await setStore({})
    const { Conversation } = await import('@renderer/05_Conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const title = container.querySelector('.wc-title')
    expect(title?.textContent).toContain('무엇을 도와드릴까요')
  })
})

describe('AgentPanel — todos scroll 클래스 (N7)', () => {
  it('Todos 컴포넌트 .todos div에 "scroll" 클래스가 있다', async () => {
    const { useAppStore } = await import('@renderer/00_App/appStore')
    useAppStore.setState({ isRunning: false, changedFiles: new Set(), toolCards: [], errorMessage: undefined } as Parameters<typeof useAppStore.setState>[0])
    const { AgentPanel } = await import('@renderer/03_Agent/AgentPanel')
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
    const icons = await import('@renderer/02_Common/icons')
    expect(icons.IconClipList).toBeDefined()
  })

  it('IconCheckCirc가 export된다', async () => {
    const icons = await import('@renderer/02_Common/icons')
    expect(icons.IconCheckCirc).toBeDefined()
  })

  it('IconAlert가 이미 존재한다 (회귀)', async () => {
    const icons = await import('@renderer/02_Common/icons')
    expect(icons.IconAlert).toBeDefined()
  })

  it('IconBolt가 이미 존재한다 (회귀)', async () => {
    const icons = await import('@renderer/02_Common/icons')
    expect(icons.IconBolt).toBeDefined()
  })

  it('IconShieldChk가 이미 존재한다 (회귀)', async () => {
    const icons = await import('@renderer/02_Common/icons')
    expect(icons.IconShieldChk).toBeDefined()
  })
})

describe('multiAgentSampleData — DEFAULT_PICKER', () => {
  it('DEFAULT_PICKER가 pickerOptions 기본값에서 파생된다', async () => {
    const { DEFAULT_PICKER } = await import('@renderer/03_Agent/multiAgentDefaults')
    const { DEFAULT_MODEL, DEFAULT_EFFORT, DEFAULT_MODE_PANEL } = await import(
      '@renderer/03_Agent/pickerOptions'
    )
    expect(DEFAULT_PICKER.model).toBe(DEFAULT_MODEL)
    expect(DEFAULT_PICKER.effort).toBe(DEFAULT_EFFORT)
    expect(DEFAULT_PICKER.mode).toBe(DEFAULT_MODE_PANEL)
    expect(DEFAULT_PICKER.mode).toBe('bypass')
  })
})
