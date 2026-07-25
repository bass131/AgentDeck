// @vitest-environment jsdom
/**
 * gap1-p05-hook-cockpit-render.test.tsx — GAP1 P05 훅 콕핏 렌더 DOM 단정 (TDD RED)
 *
 * 목표: 훅 콕핏의 두 표면을 DOM으로 못박는다. 구현은 후속 renderer Worker 몫.
 *   1. HookTimeline 패널(소음 억제 UI, Phase 05 (d)) — 접힘 기본 + 토글 펼침 + 요약/상세.
 *      컴포넌트: 02.Source/renderer/src/components/07_notice/HookTimeline.tsx (현재 미존재).
 *   2. informational · permission_denied 대화 인라인 표시 — 스레드 seed → 텍스트 렌더 단정.
 *      (BL1 P03 선례처럼 Conversation을 seed된 store로 렌더 — 인라인 표시가 실제로 붙는 자리).
 *
 * 현재(RED) 이유:
 *   - HookTimeline.tsx가 아직 없다 → import가 런타임에 실패(reject) → HookTimeline 단정 전부 RED.
 *     (import specifier를 런타임 문자열로 둬 typecheck는 건드리지 않고 런타임 RED만 유발한다 —
 *      파일 생성 후에는 동일 코드가 resolve되어 GREEN 목표로 전환된다.)
 *   - Conversation의 thread 렌더 switch에 informational/permission-denied kind 분기가 없다 →
 *     unknown kind는 `return null`(Conversation.tsx:798)로 떨어져 텍스트가 렌더되지 않는다 → RED.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
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

// HookTimeline 경로 — 런타임 dynamic import 문자열(typecheck 비대상). 파일 생성 후 resolve.
const HOOK_TIMELINE_PATH = '../../../02.Source/renderer/src/components/07_notice/HookTimeline'

/** 훅 타임라인 샘플 엔트리(reducer 계약 HookRun과 동형). */
const sampleRuns = [
  { hookId: 'h1', hookName: 'PreToolUse:Bash', hookEvent: 'PreToolUse', status: 'success', exitCode: 0 },
  { hookId: 'h2', hookName: 'Stop', hookEvent: 'Stop', status: 'running' },
]

async function importHookTimeline(): Promise<{ HookTimeline: unknown }> {
  // RED: HookTimeline.tsx 미존재 → 이 import가 reject → 호출 테스트 실패.
  return (await import(/* @vite-ignore */ HOOK_TIMELINE_PATH)) as { HookTimeline: unknown }
}

// ── 1. HookTimeline — 접힘 기본 + 토글 펼침 (소음 억제 UI) ─────────────────────────

describe('gap1-p05 HookTimeline — 소음 억제(접힘 기본·토글 펼침)', () => {
  it('(i) 컨테이너 data-testid="hook-timeline" 렌더 · (iii) 요약 data-testid="hook-timeline-summary" 항상 표시', async () => {
    const { HookTimeline } = (await importHookTimeline()) as { HookTimeline: React.ComponentType<{ hookRuns: unknown[] }> }
    const { container } = await act(async () => render(<HookTimeline hookRuns={sampleRuns} />))
    expect(container.querySelector('[data-testid="hook-timeline"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="hook-timeline-summary"]')).toBeTruthy()
  })

  it('(ii) 접힘 기본 — 상세 data-testid="hook-timeline-detail"이 초기 렌더에 없음', async () => {
    const { HookTimeline } = (await importHookTimeline()) as { HookTimeline: React.ComponentType<{ hookRuns: unknown[] }> }
    const { container } = await act(async () => render(<HookTimeline hookRuns={sampleRuns} />))
    // 접힘 기본: pin-injector 매 입력 발화 소음을 막기 위해 상세는 펼침 전엔 렌더하지 않는다.
    expect(container.querySelector('[data-testid="hook-timeline-detail"]')).toBeNull()
  })

  it('(iv)(v) toggle 클릭 → 상세 표시 + hookRuns 항목(PreToolUse:Bash)이 상세에 렌더', async () => {
    const { HookTimeline } = (await importHookTimeline()) as { HookTimeline: React.ComponentType<{ hookRuns: unknown[] }> }
    const { container } = await act(async () => render(<HookTimeline hookRuns={sampleRuns} />))
    const toggle = container.querySelector('[data-testid="hook-timeline-toggle"]') as HTMLElement
    expect(toggle).toBeTruthy()
    await act(async () => { fireEvent.click(toggle) })
    const detail = container.querySelector('[data-testid="hook-timeline-detail"]')
    expect(detail).toBeTruthy()
    expect(detail?.textContent).toContain('PreToolUse:Bash')
  })
})

// ── 2. informational · permission_denied 대화 인라인 표시 ──────────────────────────

async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
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

describe('gap1-p05 대화 인라인 — informational · permission_denied 표시', () => {
  it('informational thread item → content 문구가 대화에 렌더된다', async () => {
    // seed된 thread item kind는 아직 ThreadItem union에 없어(RED, 후속 구현) 캐스팅으로 주입.
    await setStore({
      thread: [
        {
          kind: 'informational',
          id: 'inf1',
          content: 'UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로',
          level: 'warning',
        },
      ] as unknown as ThreadItem[],
    })
    const { container } = await renderConv()
    // RED: Conversation switch에 informational 분기 없음 → return null → 텍스트 부재.
    expect(container.textContent).toContain('UserPromptSubmit 훅이 입력을 차단했습니다: 금지된 경로')
  })

  it('permission-denied thread item → toolName·decisionReason 문구가 대화에 렌더된다', async () => {
    await setStore({
      thread: [
        {
          kind: 'permission-denied',
          id: 'pd1',
          toolName: 'Bash',
          decisionReasonType: 'rule',
          decisionReason: 'deny 규칙에 의해 차단: Bash(rm:*)',
        },
      ] as unknown as ThreadItem[],
    })
    const { container } = await renderConv()
    // RED: Conversation switch에 permission-denied 분기 없음 → return null → 텍스트 부재.
    expect(container.textContent).toContain('Bash')
    expect(container.textContent).toContain('deny 규칙에 의해 차단: Bash(rm:*)')
  })
})
