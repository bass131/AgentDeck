// @vitest-environment jsdom
/**
 * shell-chrome.test.tsx — F1-b Phase 03 셸 크롬(TitleBar·ResizeHandles).
 *
 * 윈도우 조작은 preload window.api 경유만(renderer untrusted). 버튼/핸들
 * mousedown이 올바른 helper를 호출하는지 검증.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

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
}

Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.windowMaximizeToggle.mockResolvedValue({ maximized: true })
  mockApi.windowIsMaximized.mockResolvedValue({ maximized: false })
  mockApi.onWindowState.mockReturnValue(mockUnsub)
})
afterEach(() => cleanup())

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

describe('Sidebar — 채팅목록 스텁 (Phase 04)', () => {
  it('브랜딩 + "새 대화"(비활성) + 최근 채팅 placeholder를 렌더한다', async () => {
    const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
    render(<Sidebar onCollapse={() => {}} />)
    expect(screen.getByText('AgentDeck')).toBeTruthy()
    const newChat = screen.getByLabelText('새 대화 (준비 중)')
    expect((newChat as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('최근 채팅')).toBeTruthy()
  })

  it('접기 버튼이 onCollapse를 호출한다', async () => {
    const { Sidebar } = await import('../../src/renderer/src/components/Sidebar')
    const onCollapse = vi.fn()
    render(<Sidebar onCollapse={onCollapse} />)
    fireEvent.click(screen.getByLabelText('사이드바 접기'))
    expect(onCollapse).toHaveBeenCalledOnce()
  })
})
