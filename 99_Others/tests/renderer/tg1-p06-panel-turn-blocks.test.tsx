// @vitest-environment jsdom
/**
 * tg1-p06-panel-turn-blocks.test.tsx — TG1 P06 표면 전파: PanelView 턴 블록 + 상태 라인.
 *
 * 배경(01.Phases/18_TG1-thinking-gui/06-surface-propagation.md): 단일챗(TG1 P03/P04)에서
 * 성립한 "한 턴 = 한 블록 = 아바타 1개" + 상태 라인을 멀티패널(PanelView)에도 반영한다.
 * PanelView는 자체 렌더 루프를 갖고 있어(공유 리프 MessageBubble 자동전파와 별개) 이
 * Phase가 별도로 적용해야 하는 대상이다.
 *
 * 잠그는 계약:
 *   TB1: [thinking, assistant] 연속 agent-side 런 → .turn-block 1개 + .turn-block-ava 1개
 *        (개별 메시지 아바타 중복 없음 — MessageBubble bare + ThinkingItem bare).
 *   TB2: user 메시지는 자기 블록(.turn-block 밖, MessageBubble role=user 그대로).
 *   TB3: 훅 배지 보존 — permission-denied(hook) + 같은 턴 assistant → 배지가
 *        `.msg.ai-msg .meta .hook-badge`에 그대로 렌더(옵트인 shot p16-hookbadge-panel
 *        고정 셀렉터 — 회귀 0).
 *   TB4: toolgroup은 여전히 미렌더(패널 기존 정책 유지 — turnBlocks가 agent로 묶어도
 *        renderPanelAgentItem이 null 반환).
 *   TB5: 상태 라인 — isRunning + 마지막 블록이 agent면 그 turn-body 안에 이어붙임
 *        (.status-line-row가 마지막 .turn-block 안에 위치).
 *   TB6: 상태 라인 — 마지막 블록이 agent가 아니면(또는 thread 비어있음) 새 turn-block을
 *        열어 그 안에 상태 라인만 표시.
 *   TB7: pendingPermission/pendingQuestion 대기 중엔 상태 라인 억제(기존 FB2 ④ 게이팅 유지).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { SamplePanel } from '../../../02.Source/renderer/src/lib/multiAgentSampleData'
import type { PanelSessionHookResult } from '../../../02.Source/renderer/src/store/panelSession'

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
  const { makePanelInitialState } = await import('../../../02.Source/renderer/src/store/panelSession')
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
  const { PanelView } = await import('../../../02.Source/renderer/src/components/00_shell/panel/PanelView')
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
    // MessageBubble bare + ThinkingItem bare — turn-body 안에 개별 .ava가 없어야 한다.
    const turnBody = container.querySelector('.turn-block .turn-body')
    expect(turnBody).toBeTruthy()
    expect(turnBody!.querySelector('.ava')).toBeNull()
    // 답변 본문은 여전히 렌더된다(.msg.ai-msg .content).
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
    // user 블록은 .turn-block 자식이 아니다.
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
    // agent 런은 여전히 하나(아바타 1개) — toolgroup이 껴도 turn-block이 갈라지지 않는다.
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
    // user 블록은 .turn-block이 아니므로, 상태 라인 전용 turn-block이 정확히 1개 열려야 한다.
    expect(turnBlocks.length).toBe(1)
    expect(turnBlocks[0].querySelector('[data-testid="status-line"]')).toBeTruthy()
  })

  // 참고: thread가 완전히 빈 상태(hasContent=false)는 패널의 기존 게이팅
  // (`.ma-p-empty` vs `.ma-p-messages` 분기, PanelView.tsx `hasContent`)이 이 Phase 이전부터
  // 항상 빈 상태 플레이스홀더를 우선한다 — 실사용에서 isRunning=true인 시점엔 이미
  // ADD_USER_MESSAGE로 thread에 최소 1개 아이템이 있어 도달 불가능한 조합이라, 이 Phase가
  // hasContent 게이팅 자체를 바꾸지 않는다(범위 밖 — 무접촉).
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
