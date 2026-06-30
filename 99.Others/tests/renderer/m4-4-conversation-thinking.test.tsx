// @vitest-environment jsdom
/**
 * m4-4-conversation-thinking.test.tsx — Phase 24a Conversation thinking 인디케이터 테스트.
 *
 * Phase A-2 이행: messages/streamingText → thread 단언으로 교체.
 *
 * 검증 대상:
 *   - thinkingText 있고 isRunning=true → WorkingIndicator(.thinking) 렌더 + thinkingText 표시
 *   - thinkingText null이어도 isRunning=true → WorkingIndicator(.thinking) 렌더(WORKING_PHRASES)
 *   - isRunning=false이면 → .thinking 미표시(완료 후 숨김)
 *   - 마지막 thread 항목이 live assistant msg이면 → .thinking 미렌더(스트림 시작 시 사라짐)
 *
 * P14a 변경: thinkingText null + isRunning=true → WorkingIndicator 표시(원본 동작).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

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
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    // Phase A-2: thread 기반
    thread: [] as ThreadItem[],
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    thinkingText: null,
    todos: [],
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function renderConv() {
  const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
  return act(async () => render(<Conversation />))
}

describe('Phase 24a — Conversation: thinking 인디케이터', () => {
  it('thinkingText 있고 isRunning=true → .thinking 렌더', async () => {
    // Phase A-2: thread에 user msg 세팅
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: '안녕' }]
    await setStore({ thinkingText: '코드를 분석하는 중…', isRunning: true, thread })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeTruthy()
  })

  it('thinkingText null이어도 isRunning=true → WorkingIndicator(.thinking) 렌더(WORKING_PHRASES, P14a)', async () => {
    // P14a: thinkingText=null이면 WorkingIndicator가 WORKING_PHRASES 중 하나 표시.
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: '안녕' }]
    await setStore({ thinkingText: null, isRunning: true, thread })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeTruthy()
  })

  it('isRunning=false → .thinking 미렌더(완료 후 숨김)', async () => {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: '안녕' }]
    await setStore({ thinkingText: '아직 thinking 텍스트 남아있음', isRunning: false, thread })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeFalsy()
  })

  it('마지막 thread가 live assistant msg이면 → .thinking 미렌더 (Phase A-2 이행)', async () => {
    // Phase A-2: streamingText → thread 마지막 assistant msg로 판단
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'm1', role: 'user', text: '안녕' },
      // 마지막이 assistant msg + isRunning=true → WorkingIndicator 숨김
      { kind: 'msg', id: 'm2', role: 'assistant', text: '텍스트 스트리밍 시작' },
    ]
    await setStore({
      thinkingText: null,
      isRunning: true,
      thread,
    })
    const { container } = await renderConv()
    expect(container.querySelector('.thinking')).toBeFalsy()
  })

  it('thread 없고 isRunning=true이면 welcome 비표시, WorkingIndicator 렌더', async () => {
    // isEmpty = thread.length===0 && !isRunning
    // isRunning=true → isEmpty=false → thread 렌더(thinking 인디케이터 표시 가능 영역)
    await setStore({ thinkingText: '생각 중…', isRunning: true, thread: [] })
    const { container } = await renderConv()
    // isEmpty=false → welcome 비표시
    expect(container.querySelector('.welcome')).toBeFalsy()
    // thread에 thinking 인디케이터 렌더됨
    expect(container.querySelector('.thinking')).toBeTruthy()
  })
})
