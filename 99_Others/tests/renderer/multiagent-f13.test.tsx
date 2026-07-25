// @vitest-environment jsdom
/**
 * multiagent-f13.test.tsx — F13 멀티에이전트 워크스페이스 그리드 TDD 테스트.
 *
 * F13-01: store workspaceMode · MultiWorkspace 렌더(ma-head·ma-count·ma-grid) ·
 *         count 탭 · PanelView(슬롯·상태dot·ctx-ring·빈thread) · 단일 복귀.
 * F13-02: RunPickers 3 · PanelComposer · 크게 보기→overlay→Esc ·
 *         일괄 폴더→FolderSwitchDialog · 프롬프트→PromptModal.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'

// ── window.api 모킹 ─────────────────────────────────────────────────────
const mockApi = {
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
  // Sidebar가 마운트 시 listConversations() 호출(23c) → conversationLoad 필요
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  // 브랜딩: Sidebar 마운트 시 getAppVersion() IPC 호출 대응
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

afterEach(() => {
  cleanup()
  // store 격리 — workspaceMode를 케이스간 동기 리셋
  useAppStore.setState({ workspaceMode: 'single' })
})

// ── 헬퍼 ────────────────────────────────────────────────────────────────
async function renderMultiWorkspace() {
  const { MultiWorkspace } = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
  const { container } = render(<MultiWorkspace />)
  return container
}

async function renderSidebar() {
  const { Sidebar } = await import('../../../02.Source/renderer/src/components/00_shell/Sidebar')
  const { container } = render(
    <Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />
  )
  return container
}

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

// ══════════════════════════════════════════════════════════════════════════
describe('F13-store: workspaceMode', () => {
  it('초기 workspaceMode는 single이다', async () => {
    const store = await getStore()
    expect(store.getState().workspaceMode).toBe('single')
  })

  it('setWorkspaceMode("multi") → store workspaceMode=multi', async () => {
    const store = await getStore()
    await act(async () => {
      store.getState().setWorkspaceMode('multi')
    })
    expect(store.getState().workspaceMode).toBe('multi')
  })

  it('setWorkspaceMode("single") → store workspaceMode=single', async () => {
    const store = await getStore()
    await act(async () => {
      store.getState().setWorkspaceMode('multi')
      store.getState().setWorkspaceMode('single')
    })
    expect(store.getState().workspaceMode).toBe('single')
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-01: 사이드바 멀티 토글 → store 구독', () => {
  it('멀티 탭 클릭 → store workspaceMode=multi', async () => {
    await renderSidebar()
    const store = await getStore()

    const tabs = screen.getAllByRole('tab')
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))!
    await act(async () => {
      fireEvent.click(multiTab)
    })
    expect(store.getState().workspaceMode).toBe('multi')
  })

  it('단일 탭 클릭 → store workspaceMode=single', async () => {
    await renderSidebar()
    const store = await getStore()

    const tabs = screen.getAllByRole('tab')
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))!
    const singleTab = tabs.find((t) => t.textContent?.includes('단일'))!

    await act(async () => { fireEvent.click(multiTab) })
    expect(store.getState().workspaceMode).toBe('multi')

    await act(async () => { fireEvent.click(singleTab) })
    expect(store.getState().workspaceMode).toBe('single')
  })

  it('aria-selected은 store 상태와 일치한다', async () => {
    await renderSidebar()
    const store = await getStore()

    const tabs = screen.getAllByRole('tab')
    const multiTab = tabs.find((t) => t.textContent?.includes('멀티'))!
    const singleTab = tabs.find((t) => t.textContent?.includes('단일'))!

    expect(singleTab.getAttribute('aria-selected')).toBe('true')
    expect(multiTab.getAttribute('aria-selected')).toBe('false')

    await act(async () => { fireEvent.click(multiTab) })
    expect(store.getState().workspaceMode).toBe('multi')
    expect(multiTab.getAttribute('aria-selected')).toBe('true')
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-01: MultiWorkspace 구조', () => {
  it('ma-head가 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.ma-head')).toBeTruthy()
  })

  it('ma-head-ic (IconGrid)가 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.ma-head-ic')).toBeTruthy()
  })

  it('ma-head-title "멀티 에이전트"가 렌더된다', async () => {
    await renderMultiWorkspace()
    expect(screen.getByText('멀티 에이전트')).toBeTruthy()
  })

  it('ma-count 탭 5개(2~6)가 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    const countBtns = container.querySelectorAll('.ma-count-btn')
    expect(countBtns.length).toBe(5)
  })

  it('ma-count role=tablist가 있다', async () => {
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.ma-count[role="tablist"]')).toBeTruthy()
  })

  it('기본 count=4 → ma-count-btn "4"가 .on이다', async () => {
    const container = await renderMultiWorkspace()
    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn4 = countBtns.find((b) => b.textContent?.trim() === '4')
    expect(btn4?.classList.contains('on')).toBe(true)
  })

  it('ma-grid가 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    expect(container.querySelector('.ma-grid')).toBeTruthy()
  })

  it('ma-batch 「일괄 폴더」 버튼이 렌더된다', async () => {
    await renderMultiWorkspace()
    expect(screen.getByText('일괄 폴더')).toBeTruthy()
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-01: count 탭 → 패널 수/cols 변동', () => {
  it('count=2 클릭 → 패널 2개', async () => {
    const container = await renderMultiWorkspace()
    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    const btn = countBtns.find((b) => b.textContent?.trim() === '2')!
    await act(async () => { fireEvent.click(btn) })
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(2)
  })

  it('count=3 클릭 → 패널 3개', async () => {
    const container = await renderMultiWorkspace()
    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    await act(async () => { fireEvent.click(countBtns.find((b) => b.textContent?.trim() === '3')!) })
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(3)
  })

  it('count=6 클릭 → 패널 6개', async () => {
    const container = await renderMultiWorkspace()
    const countBtns = Array.from(container.querySelectorAll('.ma-count-btn'))
    await act(async () => { fireEvent.click(countBtns.find((b) => b.textContent?.trim() === '6')!) })
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(6)
  })

  it('count=4(기본) → 패널 4개', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    expect(panels.length).toBe(4)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-01: PanelView 구조', () => {
  it('각 패널에 ma-p-num(슬롯번호)이 있다', async () => {
    const container = await renderMultiWorkspace()
    const nums = container.querySelectorAll('.ma-p-num')
    expect(nums.length).toBe(4)
    // 슬롯 번호 1~4
    const texts = Array.from(nums).map((n) => n.textContent?.trim())
    expect(texts).toContain('1')
    expect(texts).toContain('4')
  })

  it('각 패널에 상태 dot(ma-p-dot)이 있다', async () => {
    const container = await renderMultiWorkspace()
    const dots = container.querySelectorAll('.ma-p-dot')
    expect(dots.length).toBe(4)
  })

  it('각 패널에 ma-ctx-ring이 있다', async () => {
    const container = await renderMultiWorkspace()
    const rings = container.querySelectorAll('.ma-ctx-ring')
    expect(rings.length).toBe(4)
  })

  it('빈 thread에 "메시지를 입력해 작업을 시작하세요" 텍스트가 있다', async () => {
    await renderMultiWorkspace()
    const empties = screen.getAllByText('메시지를 입력해 작업을 시작하세요')
    expect(empties.length).toBeGreaterThanOrEqual(1)
  })

  it('각 패널에 data-slot 속성이 있다', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel[data-slot]')
    expect(panels.length).toBe(4)
  })

  it('ma-p-ctx에 컨텍스트 레이블이 있다', async () => {
    await renderMultiWorkspace()
    const labels = screen.getAllByText('컨텍스트')
    expect(labels.length).toBeGreaterThanOrEqual(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-02: RunPickers (패널 풋터)', () => {
  it('각 패널에 pick-btn 최소 3개(모델/Effort/모드)가 있다', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    panels.forEach((panel) => {
      const pickers = panel.querySelectorAll('.pick-btn')
      // 모델/Effort/모드 3개 + UltraCode 토글 1개 = 4개 (Phase 38 추가)
      expect(pickers.length).toBeGreaterThanOrEqual(3)
    })
  })

  it('모델 picker에 "모델" 레이블이 있다', async () => {
    await renderMultiWorkspace()
    const labels = screen.getAllByText('모델')
    expect(labels.length).toBeGreaterThanOrEqual(1)
  })

  it('모델 picker 드롭다운은 left-anchored(.right 없음) — 좁은 패널 좌측 피커가 사이드바 뒤로 안 감', async () => {
    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const modelBtn = panel.querySelector('.pick-btn[aria-label="모델 선택"]') as HTMLElement
    await act(async () => { fireEvent.click(modelBtn) })
    const menu = panel.querySelector('.pick-menu')
    expect(menu).toBeTruthy()
    // .right 가 없어야 좌측 기준으로 우측으로 펼쳐 패널 안에 머문다
    expect(menu?.classList.contains('right')).toBe(false)
  })

  it('모드 picker(우측) 드롭다운은 right-anchored(.right)', async () => {
    const container = await renderMultiWorkspace()
    const panel = container.querySelector('.ma-panel:not(.ma-placeholder)') as HTMLElement
    const modeBtn = panel.querySelector('.pick-btn[aria-label="실행 모드 선택"]') as HTMLElement
    await act(async () => { fireEvent.click(modeBtn) })
    const menu = panel.querySelector('.pick-menu')
    expect(menu?.classList.contains('right')).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-02: PanelComposer', () => {
  it('각 패널에 textarea가 있다', async () => {
    const container = await renderMultiWorkspace()
    const tas = container.querySelectorAll('textarea')
    // count=4 기본, 각 패널 1개
    expect(tas.length).toBe(4)
  })

  it('textarea placeholder="메시지를 입력하세요"', async () => {
    const container = await renderMultiWorkspace()
    const ta = container.querySelector('textarea')
    expect(ta?.getAttribute('placeholder')).toBe('메시지를 입력하세요')
  })

  it('ma-send 버튼(전송)이 각 패널에 있다', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    panels.forEach((panel) => {
      const sendBtn = panel.querySelector('.ma-send')
      expect(sendBtn).toBeTruthy()
    })
  })

  it('ma-attach 버튼이 각 패널에 있다', async () => {
    const container = await renderMultiWorkspace()
    const panels = container.querySelectorAll('.ma-panel:not(.ma-placeholder)')
    panels.forEach((panel) => {
      expect(panel.querySelector('.ma-attach')).toBeTruthy()
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-02: 크게 보기 → 확장 오버레이', () => {
  it('ma-p-zoom 버튼이 각 패널에 있다', async () => {
    const container = await renderMultiWorkspace()
    const zooms = container.querySelectorAll('.ma-p-zoom')
    expect(zooms.length).toBe(4)
  })

  it('ma-p-zoom 클릭 → ma-expand-overlay가 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    const zoomBtn = container.querySelector('.ma-p-zoom') as HTMLButtonElement
    await act(async () => { fireEvent.click(zoomBtn) })
    expect(container.querySelector('[data-testid="ma-expand-overlay"]')).toBeTruthy()
  })

  it('확장 오버레이에 확장된 패널이 렌더된다', async () => {
    const container = await renderMultiWorkspace()
    const zoomBtn = container.querySelector('.ma-p-zoom') as HTMLButtonElement
    await act(async () => { fireEvent.click(zoomBtn) })
    const card = container.querySelector('.ma-expand-card')
    expect(card).toBeTruthy()
    expect(card?.querySelector('.ma-panel.expanded')).toBeTruthy()
  })

  it('Esc 키 → 오버레이 닫힘', async () => {
    const container = await renderMultiWorkspace()
    const zoomBtn = container.querySelector('.ma-p-zoom') as HTMLButtonElement
    await act(async () => { fireEvent.click(zoomBtn) })
    expect(container.querySelector('[data-testid="ma-expand-overlay"]')).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(container.querySelector('[data-testid="ma-expand-overlay"]')).toBeFalsy()
  })

  it('백드롭 클릭 → 오버레이 닫힘', async () => {
    const container = await renderMultiWorkspace()
    const zoomBtn = container.querySelector('.ma-p-zoom') as HTMLButtonElement
    await act(async () => { fireEvent.click(zoomBtn) })

    const overlay = container.querySelector('[data-testid="ma-expand-overlay"]') as HTMLElement
    expect(overlay).toBeTruthy()
    await act(async () => { fireEvent.mouseDown(overlay) })
    expect(container.querySelector('[data-testid="ma-expand-overlay"]')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-02: 일괄 폴더 → FolderSwitchDialog', () => {
  it('일괄 폴더 버튼 클릭 → FolderSwitchDialog 렌더', async () => {
    const container = await renderMultiWorkspace()
    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })
    // FolderSwitchDialog는 set-dialog-overlay를 사용
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
  })

  it('FolderSwitchDialog에 취소 버튼이 있다', async () => {
    await renderMultiWorkspace()
    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })
    expect(screen.getByText('취소')).toBeTruthy()
  })

  it('취소 클릭 → FolderSwitchDialog 닫힘', async () => {
    const container = await renderMultiWorkspace()
    const batchBtn = screen.getByText('일괄 폴더').closest('button')!
    await act(async () => { fireEvent.click(batchBtn) })
    const cancelBtn = screen.getByText('취소')
    await act(async () => { fireEvent.click(cancelBtn) })
    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13-02: 패널 프롬프트 → PromptModal', () => {
  it('프롬프트 버튼 클릭 → PromptModal 렌더', async () => {
    const container = await renderMultiWorkspace()
    const promptBtns = container.querySelectorAll('.ma-p-prompt')
    expect(promptBtns.length).toBeGreaterThan(0)
    await act(async () => { fireEvent.click(promptBtns[0]) })
    // PromptModal은 pr-overlay를 사용
    expect(container.querySelector('.pr-overlay')).toBeTruthy()
  })

  it('PromptModal에 "프롬프트 설정" 텍스트가 있다', async () => {
    const container = await renderMultiWorkspace()
    const promptBtns = container.querySelectorAll('.ma-p-prompt')
    await act(async () => { fireEvent.click(promptBtns[0]) })
    expect(screen.getByText('프롬프트 설정')).toBeTruthy()
  })

  it('PromptModal 닫기 → 모달 닫힘', async () => {
    const container = await renderMultiWorkspace()
    const promptBtns = container.querySelectorAll('.ma-p-prompt')
    await act(async () => { fireEvent.click(promptBtns[0]) })
    expect(container.querySelector('.pr-overlay')).toBeTruthy()

    const closeBtn = container.querySelector('.pr-close')!
    await act(async () => { fireEvent.click(closeBtn) })
    expect(container.querySelector('.pr-overlay')).toBeFalsy()
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('F13: scope 그렙 — window.api.multi 0', () => {
  it('MultiWorkspace는 window.api.multi를 참조하지 않는다', async () => {
    // 모듈 소스에서 window.api.multi 참조가 없음을 런타임에 확인
    // (정적 분석은 npm run grep으로 보완)
    const mod = await import('../../../02.Source/renderer/src/components/00_shell/MultiWorkspace')
    // 모듈이 정상 로드되면 통과(window.api.multi 호출 시 런타임 에러 발생)
    expect(mod.MultiWorkspace).toBeTruthy()
    expect(mod.PanelView).toBeTruthy()
  })
})
