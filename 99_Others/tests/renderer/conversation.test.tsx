// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'

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
  const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
  useAppStore.setState({
    thread: [] as ThreadItem[],
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

describe('Conversation — 빈 채팅 (F3-01)', () => {
  it('빈 상태: welcome + 추천 칩 2×2(4개)', async () => {
    await setStore({})
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.welcome')).toBeTruthy()
    expect(container.querySelectorAll('.wc-card').length).toBe(4)
  })

  it('추천 칩 클릭 → 입력창(textarea)에 채움', async () => {
    await setStore({})
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const card = container.querySelector('.wc-card') as HTMLButtonElement
    await act(async () => { fireEvent.click(card) })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value.length).toBeGreaterThan(0)
  })
})

describe('Conversation — 메시지 버블 (F3-01)', () => {
  it('user 메시지: .msg.user + 아바타', async () => {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: '안녕' }]
    await setStore({ thread, messages: [{ id: 'm1', role: 'user', content: '안녕' }] })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.msg.user')).toBeTruthy()
    expect(container.querySelector('.msg.user .ava')).toBeTruthy()
    expect(screen.getByText('안녕')).toBeTruthy()
  })

  it('assistant 메시지: .msg.ai-msg + Markdown 본문(.markdown-view)', async () => {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm2', role: 'assistant', text: '**굵게**' }]
    await setStore({ thread, messages: [{ id: 'm2', role: 'assistant', content: '**굵게**' }], isRunning: false })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.msg.ai-msg')).toBeTruthy()
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('빈 상태가 아니면 welcome 미표시', async () => {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }]
    await setStore({ thread, messages: [{ id: 'm1', role: 'user', content: 'hi' }] })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.welcome')).toBeFalsy()
  })
})

describe('Conversation — Phase A-2: thread 인터리브 렌더 (AC)', () => {
  it('thread=[user,toolgroup,assistant] → DOM 순서: .msg.user, .toollog, .msg.ai-msg', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
      { kind: 'toolgroup', id: 'tg1', tools: [
        { id: 'tc1', name: 'bash', input: { command: 'ls' }, status: 'done', result: 'ok' }
      ]},
      { kind: 'msg', id: 'a1', role: 'assistant', text: '완료했습니다' },
    ]
    await setStore({ thread, isRunning: false })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const threadEl = container.querySelector('.thread')
    expect(threadEl).toBeTruthy()
    const nodes = Array.from(threadEl!.querySelectorAll('.msg.user, .toollog, .msg.ai-msg'))
    const kinds = nodes.map(el => {
      if (el.classList.contains('msg') && el.classList.contains('user')) return 'user'
      if (el.classList.contains('toollog')) return 'toolgroup'
      if (el.classList.contains('msg') && el.classList.contains('ai-msg')) return 'assistant'
      return 'other'
    })
    expect(kinds.indexOf('user')).toBeLessThan(kinds.indexOf('toolgroup'))
    expect(kinds.indexOf('toolgroup')).toBeLessThan(kinds.indexOf('assistant'))
  })

  it('TG1 아바타 감사: toolgroup이 턴을 열어도 ToolGroup 자체의 lead 아바타(.lead-ava)는 미표시 — 턴 블록 헤더 아바타가 이미 있어 중복 노출 금지', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
      { kind: 'toolgroup', id: 'tg1', tools: [
        { id: 'tc1', name: 'bash', input: {}, status: 'done' }
      ]},
    ]
    await setStore({ thread, isRunning: false })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.lead-ava')).toBeFalsy()
    expect(container.querySelector('.lead-meta')).toBeFalsy()
    expect(container.querySelectorAll('.turn-block .ava.ai').length).toBe(1)
  })

  it('toolgroup 직전이 assistant msg여도 마찬가지로 lead 아바타 미표시(회귀 보존)', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'a0', role: 'assistant', text: '이전 응답' },
      { kind: 'toolgroup', id: 'tg1', tools: [
        { id: 'tc1', name: 'bash', input: {}, status: 'done' }
      ]},
    ]
    await setStore({ thread, isRunning: false })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.lead-ava')).toBeFalsy()
  })
})
