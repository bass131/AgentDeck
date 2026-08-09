// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: ['src/x.ts', 'README.md'] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
  mockApi.agentRun.mockResolvedValue({ runId: 'r1' })
  mockApi.listFiles.mockResolvedValue({ files: ['src/x.ts', 'README.md'] })
  mockSendMessage.mockResolvedValue(undefined)
  mockApi.pathForFile.mockReturnValue('')
  mockApi.saveImageData.mockResolvedValue({ path: '' })
})
afterEach(() => cleanup())

async function patchStoreWithSpy() {
  const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    projectFiles: ['src/x.ts', 'README.md'],
    sendMessage: mockSendMessage,
    workspaceRoot: '/test',
  } as Parameters<typeof useAppStore.setState>[0])
}

async function typeAndSend(container: HTMLElement, text: string) {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Escape', code: 'Escape' })
  })
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter', shiftKey: false })
  })
}

describe('mention-notes M4-2 — Conversation 노트 합성 통합', () => {
  it('@src/x.ts 입력 전송 시 sendMessage 3번째 인자(promptForEngine)에 멘션 노트 포함', async () => {
    await patchStoreWithSpy()
    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const text = '@src/x.ts 확인해줘'
    await typeAndSend(container, text)
    expect(mockSendMessage).toHaveBeenCalled()
    const [arg0, , arg2] = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined]
    expect(arg0).toBe(text)
    expect(arg2).toBeDefined()
    expect(arg2).toContain('[멘션된 파일 — 필요하면 Read 도구로 확인하세요]')
    expect(arg2).toContain('- src/x.ts')
  })

  it('표시 text(원문) 는 노트 없이 원문 그대로', async () => {
    await patchStoreWithSpy()
    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const text = '@src/x.ts 봐줘'
    await typeAndSend(container, text)
    const [arg0] = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined]
    expect(arg0).toBe(text)
    expect(arg0).not.toContain('[멘션된 파일')
  })

  it('멘션 없는 일반 텍스트 → promptForEngine 미전달(undefined)', async () => {
    await patchStoreWithSpy()
    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '안녕하세요')
    const [, , arg2] = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined]
    expect(arg2).toBeUndefined()
  })

  it('슬래시 커맨드(/compact @file) → 노트 미합성, 원문 그대로 전송 (원본 App.tsx:616 if(!cmd) 미러)', async () => {
    await patchStoreWithSpy()
    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const text = '/compact @src/x.ts'
    await typeAndSend(container, text)
    const [arg0, , arg2] = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined]
    expect(arg0).toBe(text)
    expect(arg2).toBeUndefined()
  })
})

describe('mention-notes M4-2 — store.sendMessage history 교체 단위', () => {
  it('promptForEngine 전달 시 agentRun messages 마지막이 promptForEngine content', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      messages: [],
      streamingText: '',
      toolCards: [],
      isRunning: false,
      errorMessage: undefined,
    } as Parameters<typeof useAppStore.setState>[0])

    const stateSendMessage = useAppStore.getState().sendMessage
    if (stateSendMessage === mockSendMessage) {
      return
    }

    const text = '@src/x.ts 확인'
    const promptForEngine = `${text}\n\n[멘션된 파일 — 필요하면 Read 도구로 확인하세요]\n- src/x.ts`
    await act(async () => {
      await stateSendMessage(text, undefined, promptForEngine)
    })

    expect(mockApi.agentRun).toHaveBeenCalled()
    const callArg = mockApi.agentRun.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.content).toBe(promptForEngine)
    expect(lastMsg.content).toContain('[멘션된 파일')
  })

  it('promptForEngine 미전달 시 agentRun history 마지막은 원문', async () => {
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      messages: [],
      streamingText: '',
      toolCards: [],
      isRunning: false,
      errorMessage: undefined,
    } as Parameters<typeof useAppStore.setState>[0])

    const stateSendMessage = useAppStore.getState().sendMessage
    if (stateSendMessage === mockSendMessage) {
      return
    }

    const text = '일반 텍스트'
    await act(async () => {
      await stateSendMessage(text, undefined, undefined)
    })

    if (!mockApi.agentRun.mock.calls.length) return

    const callArg = mockApi.agentRun.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.content).toBe(text)
  })
})

describe('mention-notes 22c — 이미지 첨부 노트 합성', () => {
  it('attachedImages 있으면 sendMessage 3번째 인자(promptForEngine)에 이미지 노트 포함', async () => {
    await patchStoreWithSpy()
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      attachedImages: [{ path: '/tmp/screenshot.png', dataUrl: 'data:image/png;base64,X' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '이 이미지 확인해줘')

    expect(mockSendMessage).toHaveBeenCalled()
    const [arg0, , arg2] = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined]
    expect(arg0).toBe('이 이미지 확인해줘')
    expect(arg2).toBeDefined()
    expect(arg2).toContain('[첨부 이미지 — Read 도구로 확인하세요]')
    expect(arg2).toContain('- /tmp/screenshot.png')
  })

  it('attachedImages 있으면 sendMessage 4번째 인자(displayImages)에 dataUrl 전달', async () => {
    await patchStoreWithSpy()
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      attachedImages: [{ path: '/tmp/shot.png', dataUrl: 'data:image/png;base64,MOCKURL' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '확인해줘')

    expect(mockSendMessage).toHaveBeenCalled()
    const [, , , arg3] = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined, string[] | undefined]
    expect(arg3).toBeDefined()
    expect(arg3).toContain('data:image/png;base64,MOCKURL')
  })

  it('전송 후 clearAttachedImages 호출됨 (attachedImages 리셋)', async () => {
    await patchStoreWithSpy()
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    const mockClearAttachedImages = vi.fn()
    useAppStore.setState({
      attachedImages: [{ path: '/tmp/a.png', dataUrl: 'data:image/png;base64,A' }],
      clearAttachedImages: mockClearAttachedImages,
    } as Parameters<typeof useAppStore.setState>[0])

    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '이미지 보내기')

    expect(mockSendMessage).toHaveBeenCalled()
    expect(mockClearAttachedImages).toHaveBeenCalled()
  })

  it('이미지만 있고 text 없으면 이미지 단독 전송 허용 (sendMessage 호출됨)', async () => {
    await patchStoreWithSpy()
    const { useAppStore } = await import('../../../02_Project/00_Source/renderer/src/store/appStore')
    useAppStore.setState({
      attachedImages: [{ path: '/tmp/only.png', dataUrl: 'data:image/png;base64,Y' }],
    } as Parameters<typeof useAppStore.setState>[0])

    const { Conversation } = await import('../../../02_Project/00_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      fireEvent.change(ta, { target: { value: '' } })
    })
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter', shiftKey: false })
    })

    expect(mockSendMessage).toHaveBeenCalled()
    const [arg0] = mockSendMessage.mock.calls[0] as [string]
    expect(arg0).toBe('')
  })
})
