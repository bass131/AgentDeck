// @vitest-environment jsdom
/**
 * shell-chrome.test.tsx — F1-b Phase 03 셸 크롬(TitleBar·ResizeHandles).
 *
 * 윈도우 조작은 preload window.api 경유만(renderer untrusted). 버튼/핸들
 * mousedown이 올바른 helper를 호출하는지 검증.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { useAppStore } from '../../src/renderer/src/store/appStore'

const mockUnsub = vi.fn()
const mockApi = {
  windowMinimize: vi.fn().mockResolvedValue(undefined),
  windowMaximizeToggle: vi.fn().mockResolvedValue({ maximized: true }),
  windowClose: vi.fn().mockResolvedValue(undefined),
  windowIsMaximized: vi.fn().mockResolvedValue({ maximized: false }),
  windowGetBounds: vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1200, height: 800 }),
  windowSetBounds: vi.fn().mockResolvedValue(undefined),
  windowDragStart: vi.fn().mockResolvedValue(undefined),
  windowDragEnd: vi.fn().mockResolvedValue(undefined),
  windowResizeStart: vi.fn().mockResolvedValue(undefined),
  windowResizeEnd: vi.fn().mockResolvedValue(undefined),
  onWindowState: vi.fn().mockReturnValue(mockUnsub),
  // M4-3 23c: Sidebar 마운트 시 listConversations() 호출 대응
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  // 브랜딩: Sidebar 마운트 시 getAppVersion() IPC 호출 대응
  getAppVersion: vi.fn().mockResolvedValue('0.1.0'),
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.windowMaximizeToggle.mockResolvedValue({ maximized: true })
  mockApi.windowIsMaximized.mockResolvedValue({ maximized: false })
  mockApi.onWindowState.mockReturnValue(mockUnsub)
})
afterEach(() => {
  cleanup()
  // F13: store 격리 — workspaceMode 전역 상태를 케이스간 동기 리셋
  useAppStore.setState({ workspaceMode: 'single' })
})

describe('TitleBar — 윈도우 컨트롤', () => {
  it('워크스페이스명을 표시하고 컨트롤 3버튼을 렌더한다', async () => {
    const { TitleBar } = await import('../../src/renderer/src/components/TitleBar')
    await act(async () => {
      render(<TitleBar title="MyWorkspace" maximized={false} />)
    })
    expect(screen.getByText('MyWorkspace')).toBeTruthy()
    expect(screen.getByLabelText('최소화')).toBeTruthy()
    expect(screen.getByLabelText('최대화')).toBeTruthy()
    expect(screen.getByLabelText('닫기')).toBeTruthy()
  })

  it('최소화 버튼이 windowMinimize를 호출한다', async () => {
    const { TitleBar } = await import('../../src/renderer/src/components/TitleBar')
    await act(async () => {
      render(<TitleBar title="W" maximized={false} />)
    })
    fireEvent.click(screen.getByLabelText('최소화'))
    expect(mockApi.windowMinimize).toHaveBeenCalledOnce()
  })

  it('최대화 버튼이 windowMaximizeToggle을 호출한다', async () => {
    const { TitleBar } = await import('../../src/renderer/src/components/TitleBar')
    await act(async () => {
      render(<TitleBar title="W" maximized={false} />)
    })
    fireEvent.click(screen.getByLabelText('최대화'))
    expect(mockApi.windowMaximizeToggle).toHaveBeenCalledOnce()
  })

  it('닫기 버튼이 windowClose를 호출한다', async () => {
    const { TitleBar } = await import('../../src/renderer/src/components/TitleBar')
    await act(async () => {
      render(<TitleBar title="W" maximized={false} />)
    })
    fireEvent.click(screen.getByLabelText('닫기'))
    expect(mockApi.windowClose).toHaveBeenCalledOnce()
  })

  it('maximized=true면 복원 레이블을 보인다', async () => {
    const { TitleBar } = await import('../../src/renderer/src/components/TitleBar')
    await act(async () => {
      render(<TitleBar title="W" maximized={true} />)
    })
    expect(screen.getByLabelText('이전 크기로')).toBeTruthy()
  })

  it('타이틀바 영역 더블클릭이 최대화를 토글한다', async () => {
    const { TitleBar } = await import('../../src/renderer/src/components/TitleBar')
    await act(async () => {
      render(<TitleBar title="W" maximized={false} />)
    })
    fireEvent.doubleClick(screen.getByRole('banner'))
    expect(mockApi.windowMaximizeToggle).toHaveBeenCalledOnce()
  })
})

describe('ResizeHandles — 수동 리사이즈 트리거', () => {
  it('8개 엣지/모서리 핸들을 렌더한다', async () => {
    const { ResizeHandles } = await import('../../src/renderer/src/components/ResizeHandles')
    const { container } = render(<ResizeHandles />)
    expect(container.querySelectorAll('.rz')).toHaveLength(8)
  })

  it('엣지 mousedown이 해당 방향으로 windowResizeStart를 호출한다', async () => {
    const { ResizeHandles } = await import('../../src/renderer/src/components/ResizeHandles')
    const { container } = render(<ResizeHandles />)
    fireEvent.mouseDown(container.querySelector('.rz-e')!, { button: 0 })
    expect(mockApi.windowResizeStart).toHaveBeenCalledWith('e')
    fireEvent.mouseDown(container.querySelector('.rz-se')!, { button: 0 })
    expect(mockApi.windowResizeStart).toHaveBeenCalledWith('se')
  })
})

describe('Sidebar — F8 세션 목록 + 모드 토글', () => {
  // M4-3 23c: Sidebar가 실 store conversations를 사용하므로
  // 세션 행 기대 케이스는 store에 4개 이상의 conversations를 주입해야 한다.
  beforeEach(() => {
    useAppStore.setState({
      conversations: [
        { id: 's1', title: '세션1', messages: [], backendId: 'claude-code' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 's2', title: '세션2', messages: [], backendId: 'claude-code' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 's3', title: '세션3', messages: [], backendId: 'claude-code' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
        { id: 's4', title: '세션4', messages: [], backendId: 'claude-code' as const, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
      ],
      listConversations: async () => {},
      selectConversation: async () => {},
      renameConversation: async () => {},
      deleteConversation: async () => {},
      newConversation: () => {},
    } as Parameters<typeof useAppStore.setState>[0])
  })

  it('브랜딩 mark + 이름 + 모드 토글 + 새대화(활성) + 검색 + 세션 행 + sb-foot을 렌더한다', async () => {
    const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
    const { container } = render(<Sidebar onCollapse={() => {}} onOpenSettings={() => {}} />)
    // 브랜딩 mark + 이름(.sb-name이 "AgentDeck"으로 시작)
    expect(container.querySelector('.sb-mark')).toBeTruthy()
    const sbName = container.querySelector('.sb-name')
    expect(sbName?.textContent).toMatch(/^AgentDeck/)
    // 모드 토글 (tablist)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.length).toBe(2)
    // 새 대화 — F8에서 활성(disabled 아님)
    const newChat = screen.getByLabelText('새 대화')
    expect((newChat as HTMLButtonElement).disabled).toBe(false)
    // 검색 + 세션 행 존재 + sb-foot 설정 트리거
    expect(screen.getByLabelText('대화 검색')).toBeTruthy()
    expect(container.querySelectorAll('.sb-item').length).toBeGreaterThanOrEqual(4)
    expect(container.querySelector('.sb-foot')).toBeTruthy()
  })

  it('sb-foot 클릭 시 onOpenSettings를 호출한다', async () => {
    const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
    const onOpenSettings = vi.fn()
    render(<Sidebar onCollapse={() => {}} onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByLabelText('설정 열기'))
    expect(onOpenSettings).toHaveBeenCalledOnce()
  })

  it('접기 버튼이 onCollapse를 호출한다', async () => {
    const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
    const onCollapse = vi.fn()
    render(<Sidebar onCollapse={onCollapse} onOpenSettings={() => {}} />)
    fireEvent.click(screen.getByLabelText('사이드바 접기'))
    expect(onCollapse).toHaveBeenCalledOnce()
  })
})
