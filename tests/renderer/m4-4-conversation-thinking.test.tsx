// @vitest-environment jsdom
/**
 * m4-4-conversation-thinking.test.tsx — Phase 24a Conversation thinking 인디케이터 테스트.
 *
 * 검증 대상:
 *   - thinkingText 있고 isRunning=true → ThinkingItem(.thinking) 렌더
 *   - thinkingText 없으면(null) → .thinking 미표시
 *   - isRunning=false이면 → .thinking 미표시(완료 후 숨김)
 *   - streamingText 있으면 → .thinking 미표시(텍스트 스트림 시작 시 사라짐)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
  mockApi.listFiles.mockResolvedValue({ files: [] })
})
afterEach(() => cleanup())

async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    thinkingText: null,
    todos: [],
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function renderConv() {
  const { Conversation } = await import('../../src/renderer/src/components/Conversation')
  return act(async () => render(<Conversation />))
}

describe('Phase 24a — Conversation: thinking 인디케이터', () => {
  it('thinkingText 있고 isRunning=true → .thinking 렌더', async () => {
    await setStore({ thinkingText: '코드를 분석하는 중…', isRunning: true, messages: [{ id: 'm1', role: 'user', content: '안녕' }] })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeTruthy()
  })

  it('thinkingText null → .thinking 미렌더', async () => {
    await setStore({ thinkingText: null, isRunning: true, messages: [{ id: 'm1', role: 'user', content: '안녕' }] })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeFalsy()
  })

  it('isRunning=false → .thinking 미렌더(완료 후 숨김)', async () => {
    await setStore({ thinkingText: '아직 thinking 텍스트 남아있음', isRunning: false, messages: [{ id: 'm1', role: 'user', content: '안녕' }] })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeFalsy()
  })

  it('streamingText 시작되면 → .thinking 미렌더', async () => {
    await setStore({
      thinkingText: null, // text 이벤트에서 null로 정리됨
      streamingText: '텍스트 스트리밍 시작',
      isRunning: true,
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
    })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeFalsy()
  })

  it('messages 없고 isRunning=true이면 welcome 비표시, thread 표시(isEmpty=false)', async () => {
    // isEmpty = messages.length===0 && !streamingText && !isRunning
    // isRunning=true → isEmpty=false → thread 렌더(thinking 인디케이터 표시 가능 영역)
    await setStore({ thinkingText: '생각 중…', isRunning: true, messages: [] })
    const { container } = await renderConv()
    // isEmpty=false → welcome 비표시
    expect(container.querySelector('.welcome')).toBeFalsy()
    // thread에 thinking 인디케이터 렌더됨
    expect(container.querySelector('.thinking')).toBeTruthy()
  })
})
