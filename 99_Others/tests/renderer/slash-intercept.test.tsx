// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const mockClearConversation = vi.fn()
const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listSlashCommands: vi.fn().mockResolvedValue([]),
  listSkills: vi.fn().mockResolvedValue([]),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
})
afterEach(() => cleanup())

async function patchStore() {
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    sendMessage: mockSendMessage,
    clearConversation: mockClearConversation,
    workspaceRoot: '/test',
  } as Parameters<typeof useAppStore.setState>[0])
  return useAppStore
}

async function typeAndSend(container: HTMLElement, text: string) {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  if (text.startsWith('/') && !/\s/.test(text)) {
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Escape', code: 'Escape' })
    })
  }
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter', shiftKey: false })
  })
}

describe('slash-intercept 22a — /compact (in-list) → sendMessage 호출', () => {
  it('/compact 입력 후 Enter → sendMessage(\'/compact\') 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/compact')
    expect(mockSendMessage).toHaveBeenCalled()
    expect(mockSendMessage.mock.calls[0][0]).toBe('/compact')
    expect(mockClearConversation).not.toHaveBeenCalled()
  })
})

describe('slash-intercept 22a — /clear → clearConversation, sendMessage 미호출', () => {
  it('/clear → clearConversation 호출 + sendMessage 미호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/clear')
    expect(mockClearConversation).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/clear (trailing space) → clearConversation 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/clear ')
    expect(mockClearConversation).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/clear → input이 비워짐', async () => {
    await patchStore()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/clear')
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('')
  })
})

describe('slash-intercept 22a — /ask → onSlashAsk 호출, sendMessage 미호출', () => {
  it('/ask → onSlashAsk 호출 + sendMessage 미호출', async () => {
    await patchStore()
    const onSlashAsk = vi.fn()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation onSlashAsk={onSlashAsk} />))
    await typeAndSend(container, '/ask')
    expect(onSlashAsk).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/ask <args> → onSlashAsk 호출 + sendMessage 미호출', async () => {
    await patchStore()
    const onSlashAsk = vi.fn()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation onSlashAsk={onSlashAsk} />))
    await typeAndSend(container, '/ask 무엇이든')
    expect(onSlashAsk).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/ask → input이 비워짐', async () => {
    await patchStore()
    const onSlashAsk = vi.fn()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation onSlashAsk={onSlashAsk} />))
    await typeAndSend(container, '/ask')
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('')
  })

  it('/ask + onSlashAsk 미제공 → sendMessage 미호출 (폴백: 기존 동작 — no-op)', async () => {
    await patchStore()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/ask')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe('slash-intercept 22a — 회귀: 일반/비인터셉트 슬래시', () => {
  it('일반 텍스트 → sendMessage 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '안녕하세요')
    expect(mockSendMessage).toHaveBeenCalled()
    expect(mockSendMessage.mock.calls[0][0]).toBe('안녕하세요')
    expect(mockClearConversation).not.toHaveBeenCalled()
  })

  it('/review (비인터셉트 슬래시) → sendMessage 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../../02_Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/review')
    expect(mockSendMessage).toHaveBeenCalled()
    expect(mockSendMessage.mock.calls[0][0]).toBe('/review')
    expect(mockClearConversation).not.toHaveBeenCalled()
  })
})
