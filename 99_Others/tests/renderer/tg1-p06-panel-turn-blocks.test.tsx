// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ThreadItem } from '../../../02_Source/renderer/src/store/threadTypes'
import type { SamplePanel } from '../../../02_Source/renderer/src/lib/multiAgentSampleData'
import type { PanelSessionHookResult } from '../../../02_Source/renderer/src/store/panelSession'

afterEach(() => cleanup())

const PANEL_META: SamplePanel = {
  title: '테스트 패널',
  status: 'working',
  cwd: 'C:/Dev/AgentDeck',
  ctxPct: 10,
}

const noop = (): void => {}
const noopAsync = async (): Promise<void> => {}

async function makeSession(overrides: Partial<PanelSessionHookResult['state']>): Promise<PanelSessionHookResult> {
  const { makePanelInitialState } = await import('../../../02_Source/renderer/src/store/panelSession')
  const base = makePanelInitialState()
  return {
    state: { ...base, ...overrides },
    send: noopAsync,
    abort: noopAsync,
    restore: noop,
    dismissLoopsStopped: noop,
    respondPermission: noopAsync,
    setReplMode: noop,
    dismissGoalStale: noop,
  }
}

async function renderPanel(threadOverrides: Partial<PanelSessionHookResult['state']>) {
  const { PanelView } = await import('../../../02_Source/renderer/src/components/00_shell/panel/PanelView')
  const session = await makeSession(threadOverrides)
  return render(
    <PanelView
      slot={0}
      panel={PANEL_META}
      session={session}
      workspaceRoot="C:/Dev/AgentDeck"
      onExpand={noop}
      onPrompt={noop}
      onPickFolder={noop}
    />,
  )
}

describe('TB1 — 연속 agent-side 런 → 턴 블록 1개 + 아바타 1개', () => {
  it('[thinking, assistant] → .turn-block 1개, .turn-block-ava 1개, 개별 아바타(.msg .ava:not(.turn-block-ava)) 0개', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '질문' },
      { kind: 'thinking', id: 't1', text: '사고 전문' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '답변' },
    ]
    const { container } = await renderPanel({ thread })

    expect(container.querySelectorAll('.turn-block').length).toBe(1)
    expect(container.querySelectorAll('.turn-block-ava').length).toBe(1)
    const turnBody = container.querySelector('.turn-block .turn-body')
    expect(turnBody).toBeTruthy()
    expect(turnBody!.querySelector('.ava')).toBeNull()
    expect(turnBody!.querySelector('.msg.ai-msg .content')?.textContent).toContain('답변')
  })
})

describe('TB2 — user 메시지는 자기 블록', () => {
  it('user 메시지는 .turn-block 밖 .msg.user로 렌더', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '안녕' },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '반가워요' },
    ]
    const { container } = await renderPanel({ thread })
    const userMsg = container.querySelector('.msg.user')
    expect(userMsg).toBeTruthy()
    expect(userMsg!.textContent).toContain('안녕')
    expect(container.querySelector('.turn-block .msg.user')).toBeNull()
  })
})

describe('TB3 — 훅 배지 보존(옵트인 shot p16-hookbadge-panel 고정 셀렉터)', () => {
  it('permission-denied(hook) + 같은 턴 assistant → .msg.ai-msg .meta .hook-badge 렌더', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '위험한 명령 실행해줘' },
      {
        kind: 'permission-denied',
        id: 'pd1',
        toolName: 'Bash',
        decisionReasonType: 'hook',
        decisionReason: '위험 명령 차단',
      },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '대신 안전한 방법을 제안할게요' },
    ]
    const { container } = await renderPanel({ thread })
    const badge = container.querySelector('.msg.ai-msg .meta .hook-badge')
    expect(badge).toBeTruthy()
  })
})

describe('TB4 — toolgroup 여전히 미렌더(패널 기존 정책 유지)', () => {
  it('toolgroup 아이템이 thread에 있어도 DOM에 아무것도 그리지 않는다', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '파일 읽어줘' },
      { kind: 'toolgroup', id: 'tg1', tools: [] },
      { kind: 'msg', id: 'a1', role: 'assistant', text: '읽었어요' },
    ]
    const { container } = await renderPanel({ thread })
    expect(container.querySelector('.toollog')).toBeNull()
    expect(container.querySelector('[data-testid="tool-card"]')).toBeNull()
    expect(container.querySelectorAll('.turn-block').length).toBe(1)
  })
})

describe('TB5 — 상태 라인: 마지막 블록이 agent면 그 turn-body에 이어붙임', () => {
  it('isRunning + thread가 thinking으로 끝남 → 마지막 .turn-block 안에 상태 라인', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '질문' },
      { kind: 'thinking', id: 't1', text: '' },
    ]
    const { container } = await renderPanel({
      thread,
      isRunning: true,
      thinkingText: '분석 중',
      pendingPermission: null,
      pendingQuestion: null,
    })
    const turnBlocks = container.querySelectorAll('.turn-block')
    expect(turnBlocks.length).toBe(1)
    const statusLine = turnBlocks[turnBlocks.length - 1].querySelector('[data-testid="status-line"]')
    expect(statusLine).toBeTruthy()
    expect(statusLine!.textContent).toContain('분석 중')
  })
})

describe('TB6 — 상태 라인: 마지막 블록이 agent가 아니면 새 turn-block을 연다', () => {
  it('isRunning + thread가 user로 끝남 → 새 .turn-block(상태 라인 전용) 추가', async () => {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'u1', role: 'user', text: '질문' }]
    const { container } = await renderPanel({
      thread,
      isRunning: true,
      thinkingText: null,
      pendingPermission: null,
      pendingQuestion: null,
    })
    const turnBlocks = container.querySelectorAll('.turn-block')
    expect(turnBlocks.length).toBe(1)
    expect(turnBlocks[0].querySelector('[data-testid="status-line"]')).toBeTruthy()
  })

})

describe('TB7 — 권한/질문 대기 중엔 상태 라인 억제(기존 게이팅 유지)', () => {
  it('pendingPermission 있으면 상태 라인 미표시', async () => {
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'u1', role: 'user', text: '질문' }]
    const { container } = await renderPanel({
      thread,
      isRunning: true,
      pendingPermission: { requestId: 'r1', toolName: 'Bash', input: {} } as never,
      pendingQuestion: null,
    })
    expect(container.querySelector('[data-testid="status-line"]')).toBeNull()
  })
})

describe('TG1 P06 — window.api 미사용 회귀 가드', () => {
  it('PanelView 렌더 자체는 window.api를 호출하지 않는다(순수 표시 조합)', async () => {
    const spy = vi.fn()
    Object.defineProperty(window, 'api', { value: new Proxy({}, { get: () => spy }), writable: true, configurable: true })
    const thread: ThreadItem[] = [{ kind: 'msg', id: 'u1', role: 'user', text: '질문' }]
    await renderPanel({ thread })
    expect(spy).not.toHaveBeenCalled()
  })
})
