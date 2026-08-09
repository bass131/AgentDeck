// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

class MockFileReader {
  result: string | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null

  readAsDataURL(_file: Blob): void {
    Promise.resolve().then(() => {
      this.result = 'data:image/png;base64,PANELMOCK'
      this.onload?.()
    })
  }
}
// @ts-expect-error: jsdom FileReader 교체
global.FileReader = MockFileReader

const mockAgentRun = vi.fn().mockResolvedValue({ runId: 'panel-run-1' })
const mockPathForFile = vi.fn().mockReturnValue('/tmp/panel-image.png')
const mockSaveImageData = vi.fn().mockResolvedValue({ path: '/tmp/panel-image.png' })

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
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  multiSessionLoad: vi.fn().mockResolvedValue({ state: null }),
  pickFolder: vi.fn().mockResolvedValue({ path: null }),
  agentRun: mockAgentRun,
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  pathForFile: mockPathForFile,
  saveImageData: mockSaveImageData,
}

Object.defineProperty(window, 'api', {
  value: mockApi,
  writable: true,
  configurable: true,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function makeImageFile(name = 'test.png', type = 'image/png'): File {
  return {
    name,
    type,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
  } as unknown as File
}

describe('패널 이미지 첨부 — (1) 파일 input → 썸네일 표시', () => {
  it('이미지 파일을 input에 주입하면 .img-thumb 썸네일이 표시된다', async () => {
    vi.resetModules()
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)

    const fileInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()

    const file = makeImageFile()
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      })
      fireEvent.change(fileInput)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const thumbs = container.querySelectorAll('.img-thumb')
    expect(thumbs.length).toBeGreaterThan(0)
  })
})

describe('패널 이미지 첨부 — (2) 썸네일 제거', () => {
  it('× 버튼 클릭 시 썸네일이 제거된다', async () => {
    vi.resetModules()
    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)

    const fileInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement

    const file = makeImageFile()
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      })
      fireEvent.change(fileInput)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const removeBtn = container.querySelector('.img-thumb-x') as HTMLButtonElement
    expect(removeBtn).toBeTruthy()

    await act(async () => {
      fireEvent.click(removeBtn)
    })

    const thumbsAfter = container.querySelectorAll('.img-thumb')
    expect(thumbsAfter.length).toBe(0)
  })
})

describe('패널 이미지 첨부 — (3) 전송 후 버블 이미지 표시', () => {
  it('이미지+텍스트 전송 후 .msg-images가 버블에 렌더된다', async () => {
    vi.resetModules()
    mockPathForFile.mockReturnValue('/tmp/panel-image.png')

    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/tmp/workspace' } as Parameters<typeof useAppStore.setState>[0])

    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)

    const fileInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement

    const file = makeImageFile()
    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      })
      fireEvent.change(fileInput)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const textarea = container.querySelector('.ma-composer-ta') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '이미지 테스트' } })
    })

    const sendBtn = container.querySelector('.ma-send:not([disabled])') as HTMLButtonElement
    expect(sendBtn, '전송 버튼이 활성화돼야 함').toBeTruthy()
    await act(async () => {
      fireEvent.click(sendBtn)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const msgImages = container.querySelector('.msg-images')
    expect(msgImages).toBeTruthy()
  })
})

describe('패널 이미지 첨부 — (4) agentRun 마지막 content에 이미지 경로 포함', () => {
  it('전송 시 agentRun 마지막 user 메시지 content에 buildEnginePrompt 결과(이미지 경로 포함)가 들어간다', async () => {
    vi.resetModules()
    mockPathForFile.mockReturnValue('/tmp/panel-img-engine.png')

    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/tmp/workspace' } as Parameters<typeof useAppStore.setState>[0])

    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)

    const fileInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    const file = makeImageFile('panel-img-engine.png', 'image/png')

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      })
      fireEvent.change(fileInput)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const textarea = container.querySelector('.ma-composer-ta') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '엔진 경로 테스트' } })
    })

    const sendBtn = container.querySelector('.ma-send:not([disabled])') as HTMLButtonElement
    expect(sendBtn, '전송 버튼이 활성화돼야 함').toBeTruthy()
    await act(async () => {
      fireEvent.click(sendBtn)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockAgentRun).toHaveBeenCalled()

    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toContain('/tmp/panel-img-engine.png')
    expect(lastMsg.content).toContain('[첨부 이미지')
  })
})

describe('패널 이미지 첨부 — (5) 이미지 단독 전송 (텍스트 없음)', () => {
  it('텍스트 없이 이미지만 첨부된 경우에도 전송 가능하다', async () => {
    vi.resetModules()
    mockPathForFile.mockReturnValue('/tmp/only-image.png')

    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({ workspaceRoot: '/tmp/workspace' } as Parameters<typeof useAppStore.setState>[0])

    const { MultiWorkspace } = await import('../../../02_Source/renderer/src/features/shell/MultiWorkspace')
    const { container } = render(<MultiWorkspace />)

    const fileInput = container.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    const file = makeImageFile('only-image.png', 'image/png')

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
        configurable: true,
      })
      fireEvent.change(fileInput)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const sendBtn = container.querySelector('.ma-send:not([disabled])') as HTMLButtonElement
    expect(sendBtn, '이미지 있으면 전송 버튼 활성화').toBeTruthy()

    await act(async () => {
      fireEvent.click(sendBtn)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockAgentRun).toHaveBeenCalled()
  })
})
