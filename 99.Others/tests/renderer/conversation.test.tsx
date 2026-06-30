// @vitest-environment jsdom
/**
 * conversation.test.tsx — F3-01 대화 개편 DOM 단언.
 * 빈채팅(welcome+추천칩 2×2) + user/assistant 버블(아바타·Markdown). 스트리밍 보존.
 *
 * Phase A-2 이행: messages → thread 단언으로 교체.
 * thread=[{kind:'msg',role:'user',text:'안녕'}] 기반으로 세팅.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

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

// Phase A-2: thread 기반 store 세팅 헬퍼
async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    // 기본값: 빈 상태
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
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.welcome')).toBeTruthy()
    expect(container.querySelectorAll('.wc-card').length).toBe(4)
  })

  it('추천 칩 클릭 → 입력창(textarea)에 채움', async () => {
    await setStore({})
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    const card = container.querySelector('.wc-card') as HTMLButtonElement
    await act(async () => { fireEvent.click(card) })
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value.length).toBeGreaterThan(0)
  })
})

describe('Conversation — 메시지 버블 (F3-01)', () => {
  it('user 메시지: .msg.user + 아바타', async () => {
    // Phase A-2: thread에 user msg 세팅
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: '안녕' }]
    await setStore({ thread, messages: [{ id: 'm1', role: 'user', content: '안녕' }] })
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.msg.user')).toBeTruthy()
    expect(container.querySelector('.msg.user .ava')).toBeTruthy()
    expect(screen.getByText('안녕')).toBeTruthy()
  })

  it('assistant 메시지: .msg.ai-msg + Markdown 본문(.markdown-view)', async () => {
    // Phase A-2: thread에 assistant msg 세팅 (isRunning=false → MarkdownView 사용)
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm2', role: 'assistant', text: '**굵게**' }]
    await setStore({ thread, messages: [{ id: 'm2', role: 'assistant', content: '**굵게**' }], isRunning: false })
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.msg.ai-msg')).toBeTruthy()
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('빈 상태가 아니면 welcome 미표시', async () => {
    // Phase A-2: thread에 user msg 세팅
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'm1', role: 'user', text: 'hi' }]
    await setStore({ thread, messages: [{ id: 'm1', role: 'user', content: 'hi' }] })
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.welcome')).toBeFalsy()
  })
})

// ── Phase A-2 신규: thread 인터리브 렌더 AC ────────────────────────────────────

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
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    const threadEl = container.querySelector('.thread')
    expect(threadEl).toBeTruthy()
    const children = Array.from(threadEl!.children)
    // 순서: user msg, toollog, assistant msg (WorkingIndicator 없음 — isRunning=false)
    const kinds = children.map(el => {
      if (el.classList.contains('msg') && el.classList.contains('user')) return 'user'
      if (el.classList.contains('toollog')) return 'toolgroup'
      if (el.classList.contains('msg') && el.classList.contains('ai-msg')) return 'assistant'
      return 'other'
    })
    // user → toolgroup → assistant 순서
    expect(kinds.indexOf('user')).toBeLessThan(kinds.indexOf('toolgroup'))
    expect(kinds.indexOf('toolgroup')).toBeLessThan(kinds.indexOf('assistant'))
  })

  it('toolgroup이 이전 AI 블록 없을 때 lead 아바타(.lead-ava) 표시', async () => {
    // toolgroup 직전이 user msg (AI 블록 아님) → lead=true → lead-ava 표시
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
      { kind: 'toolgroup', id: 'tg1', tools: [
        { id: 'tc1', name: 'bash', input: {}, status: 'done' }
      ]},
    ]
    await setStore({ thread, isRunning: false })
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.lead-ava')).toBeTruthy()
  })

  it('toolgroup 직전이 assistant msg이면 lead 아바타 미표시', async () => {
    // toolgroup 직전이 assistant msg (AI 블록) → lead=false → lead-ava 없음
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'a0', role: 'assistant', text: '이전 응답' },
      { kind: 'toolgroup', id: 'tg1', tools: [
        { id: 'tc1', name: 'bash', input: {}, status: 'done' }
      ]},
    ]
    await setStore({ thread, isRunning: false })
    const { Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.lead-ava')).toBeFalsy()
  })
})
