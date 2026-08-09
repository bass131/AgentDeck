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
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
  mockApi.agentRun.mockResolvedValue({ runId: 'r1' })
  mockApi.listFiles.mockResolvedValue({ files: [] })
  mockSendMessage.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

async function patchStoreWithSpy(isRunning = false) {
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning,
    errorMessage: undefined,
    queue: [],
    projectFiles: [],
    attachedImages: [],
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

describe('queue-drain — ① isRunning=true → 큐에 적재, sendMessage 미호출', () => {
  it('isRunning=true 상태에서 Enter → sendMessage 호출 안 됨', async () => {
    await patchStoreWithSpy(true)
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '예약 메시지')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('isRunning=true 상태에서 Enter → queue 길이 1 증가', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '첫 예약')
    expect(useAppStore.getState().queue).toHaveLength(1)
  })

  it('isRunning=true 상태에서 Enter → text 캡처됨', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '예약 텍스트')
    expect(useAppStore.getState().queue[0]?.text).toBe('예약 텍스트')
  })

  it('isRunning=true 상태에서 전송 후 inputText 리셋(textarea 비워짐)', async () => {
    await patchStoreWithSpy(true)
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '예약할 내용')
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('')
  })
})

describe('queue-drain — ② busy→idle 전이 → 큐 드레인 (dispatchSend 경유)', () => {
  it('isRunning true→false 전이 + queue>0 → sendMessage가 큐 첫 text로 호출됨', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    await typeAndSend(container, '드레인될 메시지')
    expect(useAppStore.getState().queue).toHaveLength(1)
    expect(mockSendMessage).not.toHaveBeenCalled()

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [arg0] = mockSendMessage.mock.calls[0] as [string, ...unknown[]]
    expect(arg0).toBe('드레인될 메시지')
  })

  it('드레인 후 큐에서 항목 제거됨', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    await typeAndSend(container, '제거될 항목')
    expect(useAppStore.getState().queue).toHaveLength(1)

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(useAppStore.getState().queue).toHaveLength(0)
  })
})

describe('queue-drain — ③ 중복전송 방지 (was 가드)', () => {
  it('전이 1회 당 1건만 드레인 (queue 2개 적재 → 첫 전이에 1개만 드레인)', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    await typeAndSend(container, '메시지 1')
    await typeAndSend(container, '메시지 2')
    expect(useAppStore.getState().queue).toHaveLength(2)

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().queue).toHaveLength(1)
  })

  it('이미 idle인 상태에서 queue에 항목 추가해도 자동 드레인 안 됨 (was 가드)', async () => {
    await patchStoreWithSpy(false)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    await act(async () => render(<Conversation />))

    await act(async () => {
      useAppStore.getState().enqueueMessage({ id: 'direct', text: '직접 추가', images: [] })
    })

    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe('queue-drain — ④ FIFO 순서', () => {
  it('2건 적재 → 첫 전이에 1번째, 다음 전이에 2번째 드레인', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    await typeAndSend(container, '첫 번째')
    await typeAndSend(container, '두 번째')
    expect(useAppStore.getState().queue).toHaveLength(2)

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [first] = mockSendMessage.mock.calls[0] as [string, ...unknown[]]
    expect(first).toBe('첫 번째')

    mockSendMessage.mockClear()
    await act(async () => {
      useAppStore.setState({ isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    })
    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [second] = mockSendMessage.mock.calls[0] as [string, ...unknown[]]
    expect(second).toBe('두 번째')
    expect(useAppStore.getState().queue).toHaveLength(0)
  })
})

describe('queue-drain — ⑤ picker 캡처', () => {
  it('드레인 시 캡처된 picker가 sendMessage 2번째 인자로 전달됨', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    await act(async () => render(<Conversation />))

    await act(async () => {
      useAppStore.getState().enqueueMessage({
        id: 'pk-1',
        text: 'picker test',
        images: [],
        picker: { model: 'sonnet', effort: 'low', mode: 'auto' },
      })
    })

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [, pickerArg] = mockSendMessage.mock.calls[0] as [string, { model: string; effort: string; mode: string } | undefined, ...unknown[]]
    expect(pickerArg?.model).toBe('sonnet')
    expect(pickerArg?.effort).toBe('low')
  })
})

describe('queue-drain — ⑥ 이미지 단독 큐 항목 드레인', () => {
  it('빈 텍스트+이미지 큐 항목 드레인 → sendMessage 4번째 인자(displayImages)에 dataUrl 전달', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    await act(async () => render(<Conversation />))

    await act(async () => {
      useAppStore.getState().enqueueMessage({
        id: 'img-only',
        text: '',
        images: [{ path: '/tmp/shot.png', dataUrl: 'data:image/png;base64,DRAINME' }],
      })
    })

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const call = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined, string[] | undefined]
    expect(call[2]).toContain('[첨부 이미지 — Read 도구로 확인하세요]')
    expect(call[2]).toContain('- /tmp/shot.png')
    expect(call[3]).toEqual(['data:image/png;base64,DRAINME'])
  })
})
