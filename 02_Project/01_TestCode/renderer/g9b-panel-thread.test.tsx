// @vitest-environment jsdom
// M05 G9b — 패널(PanelView)이 단일과 같은 스레드 렌더(ThreadView)를 쓴다(차이 목록 R1~R7).
// R1·R2(notice·compact-boundary), R3(toolgroup — 사용자 결정 「패널에도 보여 준다」),
// R4·R5(시각·「중단됨」·훅 배지), R7(오류 줄 .conv-error). R6 장식(빈 화면)은 패널 배치에 남는다.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import type { PanelSessionHookResult } from '@renderer/03_Agent/state/panelSession'

afterEach(() => cleanup())

const noop = (): void => {}
const noopAsync = async (): Promise<void> => {}

async function renderPanel(overrides: Partial<PanelSessionHookResult['state']>) {
  const { makePanelInitialState } = await import('@renderer/03_Agent/state/panelSession')
  const { PanelView } = await import('@renderer/05_Conversation/PanelView')
  const session = {
    state: { ...makePanelInitialState(), ...overrides },
    send: noopAsync,
    abort: noopAsync,
    interrupt: noopAsync,
    restore: noop,
    dismissLoopsStopped: noop,
    respondPermission: noopAsync,
    respondQuestion: noopAsync,
    setReplMode: noop,
    dismissGoalStale: noop,
  } as unknown as PanelSessionHookResult
  return render(
    <PanelView
      slot={0}
      panel={{ title: 'p', status: 'working', cwd: 'C:/w', ctxPct: 0 }}
      session={session}
      workspaceRoot="C:/w"
      onExpand={noop}
      onPrompt={noop}
      onPickFolder={noop}
    />,
  )
}

describe('PanelView — 단일 스레드 렌더 정렬', () => {
  it('R1·R2: notice와 compact-boundary를 notice 행으로 그린다', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '질문' },
      { kind: 'notice', id: 'n1', text: '알림 문구' },
      { kind: 'compact-boundary', id: 'cb1' },
    ]
    const { container } = await renderPanel({ thread })
    const rows = container.querySelectorAll('.ma-p-messages .notice-row')
    expect(rows.length).toBe(2)
    expect(rows[0].textContent).toContain('알림 문구')
    expect(rows[1].textContent).toContain('컨텍스트를 압축했어요')
  })

  it('R3: toolgroup을 ToolGroup으로 그린다(사용자 결정)', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '읽어줘' },
      {
        kind: 'toolgroup',
        id: 'tg1',
        tools: [{ id: 't1', name: 'Read', input: { file_path: 'a.ts' }, status: 'done' }],
      },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '읽었어요' },
    ]
    const { container } = await renderPanel({ thread })
    expect(container.querySelector('.turn-block .turn-body .toollog')).toBeTruthy()
  })

  it('R4: 메시지 시각을 meta에 그린다(사용자·assistant)', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '질문', time: '오후 3:00' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '답', time: '오후 3:01' },
    ]
    const { container } = await renderPanel({ thread })
    expect(container.querySelector('.msg.user .meta .time')?.textContent).toBe('오후 3:00')
    expect(container.querySelector('.msg.ai-msg .meta .time')?.textContent).toBe('오후 3:01')
  })

  it('R5: 중단된 응답에 「중단됨」, 훅 차단 턴에 훅 배지를 단다(단일 순서)', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '질문' },
      { kind: 'permission-denied', id: 'pd1', toolName: 'Bash', decisionReasonType: 'hook' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '부분', time: '오후 3:01', interrupted: true },
    ]
    const { container } = await renderPanel({ thread })
    const meta = container.querySelector('.msg.ai-msg .meta') as HTMLElement
    expect(Array.from(meta.children).map((c) => c.className)).toEqual([
      'name',
      'time',
      'msg-interrupted',
      'hook-badge',
    ])
  })

  it('R7: 오류 줄은 단일과 같은 .conv-error이고 .ma-p-error는 없다', async () => {
    const { container } = await renderPanel({
      thread: [{ kind: 'msg', id: 'u1', role: 'user', text: '질문' }],
      errorMessage: '연결 끊김',
      isRunning: false,
    })
    expect(container.querySelector('.ma-p-messages .conv-error[role="alert"]')?.textContent).toBe('오류: 연결 끊김')
    expect(container.querySelector('.ma-p-error')).toBeNull()
  })

  it('R6: 스레드가 비면 패널 빈 화면(장식은 배치 쪽)을 그린다', async () => {
    const { container } = await renderPanel({ thread: [] })
    expect(container.querySelector('.ma-p-empty')).toBeTruthy()
    expect(container.querySelector('.ma-p-messages')).toBeNull()
  })
})
