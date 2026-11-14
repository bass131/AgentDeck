// @vitest-environment jsdom
// M05 G9b — 스레드 렌더 하나(ThreadView). 단일 Conversation과 멀티 PanelView가 같은 렌더를 쓴다.
// 이 파일은 공용 렌더 자체를 고정한다. 패널 쪽 정렬(R1~R7)은 g9b-panel-thread.test.tsx가 맡는다.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'

afterEach(() => cleanup())

async function baseState() {
  const { makeInitialState } = await import('@renderer/05_Conversation/state/reducer')
  return makeInitialState()
}

async function renderThread(thread: ThreadItem[], extra: Record<string, unknown> = {}) {
  const { ThreadView } = await import('@renderer/05_Conversation/ThreadView')
  const state = { ...(await baseState()), thread, ...extra }
  return render(
    <ThreadView state={state} onOpenSubagent={() => {}} className="thread" />,
  )
}

describe('ThreadView — 공용 스레드 렌더', () => {
  it('className으로 감싸고, 사용자 메시지·assistant 턴 블록을 그린다', async () => {
    const { container } = await renderThread([
      { kind: 'msg', id: 'u1', role: 'user', text: '질문', time: '오후 3:00' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '답변', time: '오후 3:01' },
    ])
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toBe('thread')
    expect(root.querySelector('.msg.user .content')?.textContent).toBe('질문')
    const ai = root.querySelector('.turn-block .turn-body .msg.ai-msg') as HTMLElement
    expect(ai.querySelector('.meta .name')?.textContent).toBe('Claude')
    expect(ai.querySelector('.meta .time')?.textContent).toBe('오후 3:01')
    expect(ai.querySelector('.ava')).toBeNull()
  })

  it('before 장식(복원 배지 등)은 블록보다 앞에 놓인다', async () => {
    const { ThreadView } = await import('@renderer/05_Conversation/ThreadView')
    const state = { ...(await baseState()), thread: [{ kind: 'msg', id: 'u1', role: 'user', text: '질문' }] as ThreadItem[] }
    const { container } = render(
      <ThreadView state={state} onOpenSubagent={() => {}} className="thread" before={<i className="deco" />} />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.firstElementChild?.className).toBe('deco')
  })

  it('중단된 assistant 메시지는 meta에 「중단됨」을 단다(시각 뒤, 훅 배지 앞)', async () => {
    const { container } = await renderThread([
      { kind: 'msg', id: 'u1', role: 'user', text: '질문' },
      {
        kind: 'permission-denied',
        id: 'pd1',
        toolName: 'Bash',
        decisionReasonType: 'hook',
        decisionReason: '차단',
      },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '부분 답', time: '오후 3:01', interrupted: true },
    ])
    const meta = container.querySelector('.msg.ai-msg .meta') as HTMLElement
    const classes = Array.from(meta.children).map((c) => c.className)
    expect(classes).toEqual(['name', 'time', 'msg-interrupted', 'hook-badge'])
  })

  it('notice·compact-boundary는 notice 행으로 그린다', async () => {
    const { container } = await renderThread([
      { kind: 'notice', id: 'n1', text: '알림 문구' },
      { kind: 'compact-boundary', id: 'cb1', preTokens: 1000, postTokens: 200 },
    ])
    const rows = container.querySelectorAll('.notice-row')
    expect(rows.length).toBe(2)
    expect(rows[0].textContent).toContain('알림 문구')
    expect(rows[1].textContent).toContain('컨텍스트를 압축했어요')
  })

  it('toolgroup은 ToolGroup(.toollog)으로 그린다', async () => {
    const { container } = await renderThread([
      { kind: 'msg', id: 'u1', role: 'user', text: '읽어줘' },
      {
        kind: 'toolgroup',
        id: 'tg1',
        tools: [{ id: 't1', name: 'Read', input: { file_path: 'a.ts' }, status: 'done' }],
      },
    ])
    expect(container.querySelector('.turn-block .toollog')).toBeTruthy()
  })

  it('실행 중이 아니고 오류가 있으면 .conv-error 줄을 그린다', async () => {
    const { container } = await renderThread(
      [{ kind: 'msg', id: 'u1', role: 'user', text: '질문' }],
      { errorMessage: '연결 끊김', isRunning: false },
    )
    const err = container.querySelector('.conv-error[role="alert"]')
    expect(err?.textContent).toBe('오류: 연결 끊김')
  })
})

describe('항목 렌더 부품의 거처', () => {
  it('NoticeItem·ThinkingItem은 ThreadView에 있고 Conversation은 같은 것을 재수출한다', async () => {
    const tv = await import('@renderer/05_Conversation/ThreadView')
    const conv = await import('@renderer/05_Conversation/Conversation')
    expect(conv.NoticeItem).toBe(tv.NoticeItem)
    expect(conv.ThinkingItem).toBe(tv.ThinkingItem)
    expect(conv.permissionDeniedDisplayText).toBe(tv.permissionDeniedDisplayText)
  })
})

describe('MessageBubble — interrupted prop', () => {
  it('interrupted면 assistant meta에 .msg-interrupted를 단다', async () => {
    const { MessageBubble } = await import('@renderer/05_Conversation/MessageBubble')
    const { container } = render(
      <MessageBubble role="assistant" content="부분" interrupted bare />,
    )
    expect(container.querySelector('.meta .msg-interrupted[data-interrupted]')?.textContent).toBe('중단됨')
  })
})
