// @vitest-environment jsdom
/**
 * loop-running-indicator.test.tsx — LoopRunningIndicator TDD (5c 표시기).
 *
 * LRI-1: activeLoops>0 → 표시기 렌더 + "loop 진행중" + summary 텍스트 포함. ===0 → 미렌더.
 * LRI-2: 아이콘 회전 클래스(spin) 존재 + reduced-motion 구조 단언.
 * LRI-3: 여러 루프 → "외 N" 표기. summary ellipsis 구조(max-width 클래스).
 * LRI-4: loop-active gloss 클래스가 activeLoops>0 일 때만 부착(단일 채팅창).
 * 회귀: activeLoops 기본 []라 기존 렌더 무영향.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import type { LoopInfo } from '../../../02.Source/shared/agent-events'

// window.api mock (Conversation 마운트용 최소 셋)
const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  agentInterrupt: vi.fn().mockResolvedValue({}),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
})
afterEach(() => cleanup())

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function makeLoop(id: string, summary: string, interval?: string): LoopInfo {
  return { id, summary, interval }
}

// ── LRI-1: 렌더/미렌더 ───────────────────────────────────────────────────────

describe('LoopRunningIndicator — LRI-1: 렌더·미렌더', () => {
  it('loops 1개 → 표시기 렌더 + "loop 진행중" 텍스트 포함', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [makeLoop('l1', '파일 정리')]
    const { container } = render(<LoopRunningIndicator loops={loops} />)
    expect(container.querySelector('.loop-running-indicator')).toBeTruthy()
    expect(container.textContent).toContain('loop 진행중')
    expect(container.textContent).toContain('파일 정리')
  })

  it('loops 빈 배열 → 미렌더(null)', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const { container } = render(<LoopRunningIndicator loops={[]} />)
    expect(container.querySelector('.loop-running-indicator')).toBeFalsy()
    expect(container.firstChild).toBeFalsy()
  })

  it('loops 1개 → summary 텍스트 표시', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [makeLoop('l1', '코드 리뷰')]
    render(<LoopRunningIndicator loops={loops} />)
    expect(screen.getByText(/코드 리뷰/)).toBeTruthy()
  })
})

// ── LRI-5: 정지 버튼 (세션 abort로 크론 종료 → 런어웨이 호출 중단) ──────────────

describe('LoopRunningIndicator — LRI-5: 정지 버튼', () => {
  it('onStop 전달 → 정지 버튼 렌더 + 클릭 시 onStop 호출', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const onStop = vi.fn()
    const { container } = render(<LoopRunningIndicator loops={[makeLoop('l1', '반복 작업')]} onStop={onStop} />)
    const stop = container.querySelector('.lri-stop') as HTMLButtonElement
    expect(stop).toBeTruthy()
    expect(stop.getAttribute('aria-label')).toBe('루프 정지')
    fireEvent.click(stop)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('onStop 미전달 → 정지 버튼 미렌더(표시 전용)', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const { container } = render(<LoopRunningIndicator loops={[makeLoop('l1', '반복 작업')]} />)
    expect(container.querySelector('.lri-stop')).toBeFalsy()
  })
})

// ── LRI-2: 아이콘 회전 + reduced-motion 구조 ──────────────────────────────────

describe('LoopRunningIndicator — LRI-2: 아이콘 회전 구조', () => {
  it('loops>0 → .lri-spin 회전 클래스 있는 아이콘 엘리먼트 존재', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [makeLoop('l1', '테스트')]
    const { container } = render(<LoopRunningIndicator loops={loops} />)
    // 회전 클래스(lri-spin)가 붙은 요소가 있어야 한다
    expect(container.querySelector('.lri-spin')).toBeTruthy()
  })

  it('아이콘 요소에 aria-hidden 속성 존재(접근성 — 장식 아이콘)', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [makeLoop('l1', '테스트')]
    const { container } = render(<LoopRunningIndicator loops={loops} />)
    const spinEl = container.querySelector('.lri-spin')
    expect(spinEl?.getAttribute('aria-hidden')).toBe('true')
  })
})

// ── LRI-3: 여러 루프 + summary ellipsis 구조 ─────────────────────────────────

describe('LoopRunningIndicator — LRI-3: 여러 루프 표기', () => {
  it('루프 2개 → "외 1" 텍스트 포함', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [makeLoop('l1', '첫 번째 작업'), makeLoop('l2', '두 번째 작업')]
    const { container } = render(<LoopRunningIndicator loops={loops} />)
    expect(container.textContent).toContain('외 1')
  })

  it('루프 3개 → "외 2" 텍스트 포함', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [
      makeLoop('l1', '작업 A'),
      makeLoop('l2', '작업 B'),
      makeLoop('l3', '작업 C'),
    ]
    const { container } = render(<LoopRunningIndicator loops={loops} />)
    expect(container.textContent).toContain('외 2')
  })

  it('summary 텍스트가 .lri-summary 클래스 요소 안에 있음(ellipsis 구조)', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [makeLoop('l1', '긴 작업 설명 텍스트')]
    const { container } = render(<LoopRunningIndicator loops={loops} />)
    expect(container.querySelector('.lri-summary')).toBeTruthy()
  })

  it('루프 1개 → "외" 텍스트 없음', async () => {
    const { LoopRunningIndicator } = await import('../../../02.Source/renderer/src/components/07_notice/LoopRunningIndicator')
    const loops = [makeLoop('l1', '단일 작업')]
    const { container } = render(<LoopRunningIndicator loops={loops} />)
    expect(container.textContent).not.toContain('외')
  })
})

// ── LRI-4: loop-active gloss 클래스 부착 (단일 채팅창) ──────────────────────

describe('LoopRunningIndicator — LRI-4: loop-active gloss 클래스 (Conversation)', () => {
  it('activeLoops>0 → .conversation에 loop-active 클래스 부착', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      thread: [],
      messages: [],
      isRunning: false,
      errorMessage: undefined,
      openGroupId: null,
      openMsgId: null,
      seq: 0,
      activeLoops: [makeLoop('l1', '테스트 작업')],
    } as Parameters<typeof useAppStore.setState>[0])

    const { default: Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.conversation.loop-active')).toBeTruthy()
  })

  it('activeLoops 빈 배열 → .conversation에 loop-active 클래스 없음', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      thread: [],
      messages: [],
      isRunning: false,
      errorMessage: undefined,
      openGroupId: null,
      openMsgId: null,
      seq: 0,
      activeLoops: [],
    } as Parameters<typeof useAppStore.setState>[0])

    const { default: Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.conversation.loop-active')).toBeFalsy()
  })
})

// ── 회귀: activeLoops 기본값 [] → 기존 렌더 무영향 ──────────────────────────

describe('회귀: activeLoops 기본값 []', () => {
  it('store 초기 상태(activeLoops=[]) → 표시기 미렌더, 기존 welcome 정상', async () => {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      thread: [],
      messages: [],
      isRunning: false,
      errorMessage: undefined,
      openGroupId: null,
      openMsgId: null,
      seq: 0,
      activeLoops: [],
    } as Parameters<typeof useAppStore.setState>[0])

    const { default: Conversation } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    // loop-active 클래스 없음
    expect(container.querySelector('.loop-active')).toBeFalsy()
    // 표시기 없음
    expect(container.querySelector('.loop-running-indicator')).toBeFalsy()
    // 기존 welcome은 정상 렌더
    expect(container.querySelector('.welcome')).toBeTruthy()
  })
})
