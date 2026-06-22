// @vitest-environment jsdom
/**
 * conversation.test.tsx — F3-01 대화 개편 DOM 단언.
 * 빈채팅(welcome+추천칩 2×2) + user/assistant 버블(아바타·Markdown). 스트리밍 보존.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'

const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
})
afterEach(() => cleanup())

async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [], streamingText: '', toolCards: [], isRunning: false, errorMessage: undefined,
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

describe('Conversation — 빈 채팅 (F3-01)', () => {
  it('빈 상태: welcome + 추천 칩 2×2(4개)', async () => {
    await setStore({})
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.welcome')).toBeTruthy()
    expect(container.querySelectorAll('.wc-card').length).toBe(4)
  })

  it('추천 칩 클릭 → 입력창(textarea)에 채움', async () => {
    await setStore({})
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const card = container.querySelector('.wc-card') as HTMLButtonElement
    await act(async () => { fireEvent.click(card) })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value.length).toBeGreaterThan(0)
  })
})

describe('Conversation — 메시지 버블 (F3-01)', () => {
  it('user 메시지: .msg.user + 아바타', async () => {
    await setStore({ messages: [{ id: 'm1', role: 'user', content: '안녕' }] })
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.msg.user')).toBeTruthy()
    expect(container.querySelector('.msg.user .ava')).toBeTruthy()
    expect(screen.getByText('안녕')).toBeTruthy()
  })

  it('assistant 메시지: .msg.ai-msg + Markdown 본문(.markdown-view)', async () => {
    await setStore({ messages: [{ id: 'm2', role: 'assistant', content: '**굵게**' }] })
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.msg.ai-msg')).toBeTruthy()
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('빈 상태가 아니면 welcome 미표시', async () => {
    await setStore({ messages: [{ id: 'm1', role: 'user', content: 'hi' }] })
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.welcome')).toBeFalsy()
  })
})
