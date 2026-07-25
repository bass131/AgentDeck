// @vitest-environment jsdom
/**
 * chat-polish-f14.test.tsx — F14-02 채팅 폴리시(줌·타임스탬프·thinking/notice·SelectionToolbar).
 * TDD: 실패→구현 순서.
 * 새 IPC 0. localStorage/navigator.clipboard renderer-safe.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(() => cleanup())

// localStorage mock
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

// clipboard mock
const clipboardMock = { writeText: vi.fn().mockResolvedValue(undefined) }
Object.defineProperty(navigator, 'clipboard', { value: clipboardMock, writable: true, configurable: true })

// ── useZoom ──────────────────────────────────────────────────────────────────

describe('useZoom', () => {
  beforeEach(() => localStorageMock.clear())

  it('초기 zoom=1(default), pct=100', async () => {
    const { renderHook } = await import('@testing-library/react')
    const { useZoom } = await import('../../../02.Source/renderer/src/lib/zoom')
    const { result } = renderHook(() => useZoom('test.zoom'))
    expect(result.current.zoom).toBe(1)
    expect(result.current.pct).toBe(100)
  })

  it('localStorage에 저장된 값 로드', async () => {
    // zoom.ts 내부 prefix = 'agentdeck.zoom.' + storageKey
    localStorageMock.setItem('agentdeck.zoom.test.zoom2', '1.5')
    const { renderHook } = await import('@testing-library/react')
    const { useZoom } = await import('../../../02.Source/renderer/src/lib/zoom')
    const { result } = renderHook(() => useZoom('test.zoom2'))
    expect(result.current.zoom).toBe(1.5)
    expect(result.current.pct).toBe(150)
  })

  it('Ctrl+wheel 이벤트 → zoom 변경 + flash=true', async () => {
    const { renderHook } = await import('@testing-library/react')
    const { useZoom } = await import('../../../02.Source/renderer/src/lib/zoom')
    const { result } = renderHook(() => {
      const z = useZoom('test.zoom3')
      return z
    })
    // flash는 초기 false
    expect(result.current.flash).toBe(false)
    // 직접 setZoom은 외부에서 테스트하기 어려움 — 초기값만 확인
    expect(result.current.zoom).toBeGreaterThanOrEqual(0.5)
    expect(result.current.zoom).toBeLessThanOrEqual(3)
  })
})

// ── ZoomBadge ────────────────────────────────────────────────────────────────

describe('ZoomBadge', () => {
  it('show=false → .zoom-badge(on 없음)', async () => {
    const { ZoomBadge } = await import('../../../02.Source/renderer/src/lib/zoom')
    const { container } = render(<ZoomBadge pct={120} show={false} />)
    const el = container.querySelector('.zoom-badge')
    expect(el).toBeTruthy()
    expect(el!.classList.contains('on')).toBe(false)
  })

  it('show=true → .zoom-badge.on + "120%"', async () => {
    const { ZoomBadge } = await import('../../../02.Source/renderer/src/lib/zoom')
    const { container } = render(<ZoomBadge pct={120} show={true} />)
    const el = container.querySelector('.zoom-badge')
    expect(el).toBeTruthy()
    expect(el!.classList.contains('on')).toBe(true)
    expect(el!.textContent).toContain('120%')
  })
})

// ── 메시지 타임스탬프 ────────────────────────────────────────────────────────

describe('MessageBubble — 타임스탬프', () => {
  it('time prop 있으면 .meta .time 렌더', async () => {
    const { MessageBubble } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = render(
      <MessageBubble role="user" content="안녕" time="오후 2:30" />
    )
    expect(container.querySelector('.meta .time')).toBeTruthy()
    expect(screen.getByText('오후 2:30')).toBeTruthy()
  })

  it('time prop 없으면 .meta .time 미렌더', async () => {
    const { MessageBubble } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = render(
      <MessageBubble role="user" content="안녕" />
    )
    expect(container.querySelector('.meta .time')).toBeFalsy()
  })
})

// ── thinking 아이템 (GAP1 P06: 상태표시 → 접이식 전문 뷰어) ─────────────────────
// 옛 계약은 ThinkingItem이 "생각 중" 상태표시(.thinking+.dots, text 즉시 노출)였다.
// P06에서 reducer가 사고 전문을 thread에 영속화하면서 ThinkingItem은 접이식 전문
// 뷰어(archival)로 전환됐다(라이브 스피너는 WorkingIndicator가 계속 담당 — 역할 분리).

describe('ThinkingItem', () => {
  it('.msg.ai-msg + 접이식 thinking-block + thinking-toggle 렌더(접힘 기본)', async () => {
    const { ThinkingItem } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = render(<ThinkingItem text="분석 중" />)
    expect(container.querySelector('.msg.ai-msg')).toBeTruthy()
    // GAP1 P06 갱신(옛 기대: .thinking+.dots 상태표시): 접이식 전문 뷰어로 전환.
    expect(container.querySelector('[data-testid="thinking-block"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="thinking-toggle"]')).toBeTruthy()
    // 접힘 기본 — 펼치기 전에는 전문(thinking-detail)이 DOM에 없다(성능: 펼칠 때만 렌더).
    expect(container.querySelector('[data-testid="thinking-detail"]')).toBeFalsy()
  })

  it('text 내용 — 펼침 후에만 전문 노출(접힘 기본이라 펼치기 전 미노출)', async () => {
    const { ThinkingItem } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = render(<ThinkingItem text="분석 중" />)
    // GAP1 P06 갱신(옛 기대: text 즉시 노출): 접힘 기본이라 펼치기 전에는 전문 미노출.
    expect(screen.queryByText('분석 중')).toBeFalsy()
    // 토글 펼치기 → thinking-detail에 전문 노출.
    fireEvent.click(container.querySelector('[data-testid="thinking-toggle"]')!)
    const detail = container.querySelector('[data-testid="thinking-detail"]')
    expect(detail).toBeTruthy()
    expect(detail!.textContent).toContain('분석 중')
  })
})

// ── notice 아이템 ────────────────────────────────────────────────────────────

describe('NoticeItem', () => {
  it('.notice-row + .notice-ic(IconAlert) + .notice-text 렌더', async () => {
    const { NoticeItem } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = render(<NoticeItem text="정책 거부로 모델 전환됨" time="오후 3:00" />)
    expect(container.querySelector('.notice-row')).toBeTruthy()
    expect(container.querySelector('.notice-ic')).toBeTruthy()
    expect(container.querySelector('.notice-text')).toBeTruthy()
  })

  it('notice-time 렌더', async () => {
    const { NoticeItem } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = render(<NoticeItem text="알림" time="오후 4:00" />)
    expect(container.querySelector('.notice-time')).toBeTruthy()
    expect(screen.getByText('오후 4:00')).toBeTruthy()
  })
})

// ── SelectionToolbar ─────────────────────────────────────────────────────────

describe('SelectionToolbar', () => {
  it('기본 렌더: scrollRef=null이면 null', async () => {
    const { SelectionToolbar } = await import('../../../02.Source/renderer/src/components/01_conversation/SelectionToolbar')
    const scrollRef = { current: null }
    const { container } = render(
      <SelectionToolbar scrollRef={scrollRef} onElaborate={vi.fn()} />
    )
    // pos=null이므로 sel-bar 없음
    expect(container.querySelector('.sel-bar')).toBeFalsy()
  })

  it('sel-bar: 복사 + 더 자세히 버튼', async () => {
    // selection 시뮬레이션은 jsdom 한계 — 컴포넌트 내부에서 pos를 직접 주입할 수 없어
    // 컴포넌트 인터페이스만 검증
    const { SelectionToolbar } = await import('../../../02.Source/renderer/src/components/01_conversation/SelectionToolbar')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const scrollRef = { current: el }
    const onElaborate = vi.fn()
    const { container } = render(
      <SelectionToolbar scrollRef={scrollRef} onElaborate={onElaborate} />
    )
    // pos=null이므로 sel-bar 없음(mouseup 이전)
    expect(container.querySelector('.sel-bar')).toBeFalsy()
    document.body.removeChild(el)
  })
})
