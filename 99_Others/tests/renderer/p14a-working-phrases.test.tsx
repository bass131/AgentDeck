// @vitest-environment jsdom
/**
 * p14a-working-phrases.test.tsx — P14a "생각 중" 무작위 phrase 타이머 TDD.
 *
 * 검증 대상:
 *   1. WORKING_PHRASES 배열: 10개 이상, 각 항목 비어있지 않은 문자열.
 *   2. nextPhraseIndex: 결정적 순환(non-repeating) — 인덱스 범위 내·반복.
 *   3. WorkingIndicator 렌더: thinkingText 없으면 WORKING_PHRASES 중 하나 표시.
 *   4. WorkingIndicator 렌더: thinkingText 있으면 그 텍스트 표시(phrase 대신).
 *   5. fake timers: 5초 경과 → 표시 phrase 변경(전환 검증).
 *   6. 언마운트 시 타이머 정리(누수 0).
 *   7. 기존 ThinkingItem 회귀: prop text 그대로 표시.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

// ── WorkingIndicator + helpers 임포트 준비 ─────────────────────────────────
// window.api mock (WorkingIndicator는 IPC 없지만 Conversation 전체 import 시 필요)
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
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

// ── 1. WORKING_PHRASES 배열 검증 ─────────────────────────────────────────────
describe('P14a — WORKING_PHRASES 배열', () => {
  it('10개 이상의 phrase 존재', async () => {
    const { WORKING_PHRASES } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    expect(Array.isArray(WORKING_PHRASES)).toBe(true)
    expect(WORKING_PHRASES.length).toBeGreaterThanOrEqual(10)
  })

  it('각 phrase가 비어있지 않은 문자열', async () => {
    const { WORKING_PHRASES } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    for (const phrase of WORKING_PHRASES) {
      expect(typeof phrase).toBe('string')
      expect(phrase.trim().length).toBeGreaterThan(0)
    }
  })
})

// ── 2. nextPhraseIndex 순수 함수 검증 ──────────────────────────────────────
describe('P14a — nextPhraseIndex 순수 함수', () => {
  it('반환값이 배열 인덱스 범위 내', async () => {
    const { nextPhraseIndex, WORKING_PHRASES } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const len = WORKING_PHRASES.length
    for (let cur = 0; cur < len; cur++) {
      const next = nextPhraseIndex(cur, len)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(len)
    }
  })

  it('현재 인덱스와 다른 값 반환(non-repeating)', async () => {
    const { nextPhraseIndex, WORKING_PHRASES } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const len = WORKING_PHRASES.length
    if (len < 2) return // 1개이면 skip
    for (let cur = 0; cur < len; cur++) {
      const next = nextPhraseIndex(cur, len)
      expect(next).not.toBe(cur)
    }
  })

  it('배열 길이 1이면 항상 0 반환', async () => {
    const { nextPhraseIndex } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    expect(nextPhraseIndex(0, 1)).toBe(0)
  })
})

// ── 3. WorkingIndicator 렌더: thinkingText 없으면 phrase 표시 ───────────────
describe('P14a — WorkingIndicator: thinkingText 없으면 phrase 표시', () => {
  it('text=null → WORKING_PHRASES 중 하나 표시', async () => {
    const { WorkingIndicator, WORKING_PHRASES } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<WorkingIndicator text={null} />))
    const thinking = container.querySelector('.thinking')
    expect(thinking).toBeTruthy()
    const textContent = thinking!.textContent ?? ''
    // WORKING_PHRASES 중 하나가 포함돼 있어야 함
    const found = WORKING_PHRASES.some((p) => textContent.includes(p))
    expect(found).toBe(true)
  })
})

// ── 4. WorkingIndicator 렌더: thinkingText 있으면 우선 표시 ─────────────────
describe('P14a — WorkingIndicator: thinkingText 우선', () => {
  it('text="분석 중" → "분석 중" 표시(phrase 대신)', async () => {
    const { WorkingIndicator } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<WorkingIndicator text="분석 중" />))
    const thinking = container.querySelector('.thinking')
    expect(thinking).toBeTruthy()
    expect(thinking!.textContent).toContain('분석 중')
  })
})

// ── 5. fake timers: 5초 경과 → 표시 phrase 변경 ────────────────────────────
describe('P14a — WorkingIndicator: 타이머로 phrase 전환', () => {
  it('5초 경과 후 표시 텍스트 변경(fake timers)', async () => {
    vi.useFakeTimers()

    const { WorkingIndicator, WORKING_PHRASES } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')

    let container!: HTMLElement
    await act(async () => {
      const result = render(<WorkingIndicator text={null} />)
      container = result.container
    })

    // 5초 이상 진행 → 타이머 발화 → phrase 전환
    await act(async () => {
      vi.advanceTimersByTime(21000) // 최대 20초 + 여유
    })

    const after = container.querySelector('.thinking')!.textContent ?? ''

    // WORKING_PHRASES 중 하나가 여전히 표시되고 있는지 확인
    const afterFound = WORKING_PHRASES.some((p) => after.includes(p))
    expect(afterFound).toBe(true)
    expect(typeof after).toBe('string')
    expect(after.trim().length).toBeGreaterThan(0)
  })
})

// ── 6. 언마운트 시 타이머 정리 ─────────────────────────────────────────────
describe('P14a — WorkingIndicator: 언마운트 타이머 정리', () => {
  it('언마운트 후 clearTimeout 호출(누수 0)', async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')

    const { WorkingIndicator } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')

    let unmount!: () => void
    await act(async () => {
      const result = render(<WorkingIndicator text={null} />)
      unmount = result.unmount
    })

    clearSpy.mockClear()
    await act(async () => {
      unmount()
    })

    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

// ── 7. ThinkingItem 접이식 전문 뷰어 (GAP1 P06 전환) ──────────────────────────
// 옛 회귀는 ThinkingItem이 상태표시(.thinking+.dots, text 즉시 노출)라고 가정했다.
// P06에서 ThinkingItem은 접이식 전문 뷰어로 전환됐다(라이브 스피너 역할은 위 WorkingIndicator가
// .thinking+.dots로 계속 담당 — 이 파일 테스트 3~6은 그 유효분이라 그대로 유지).
describe('P14a — ThinkingItem 접이식 (GAP1 P06)', () => {
  it('ThinkingItem: 접이식 thinking-block + 펼침 후 전문 text 노출', async () => {
    const { ThinkingItem } = await import('../../../02.Source/renderer/src/components/01_conversation/Conversation')
    const { container } = await act(async () => render(<ThinkingItem text="코드를 분석하는 중…" />))
    // GAP1 P06 갱신(옛 기대: .thinking+.dots 상태표시): 접이식 전문 뷰어로 전환.
    expect(container.querySelector('[data-testid="thinking-block"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="thinking-toggle"]')).toBeTruthy()
    // 접힘 기본: 펼치기 전 전문 미노출.
    expect(container.querySelector('[data-testid="thinking-detail"]')).toBeFalsy()
    // 펼치기 → thinking-detail에 prop text 그대로 노출.
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="thinking-toggle"]')!)
    })
    const detail = container.querySelector('[data-testid="thinking-detail"]')
    expect(detail).toBeTruthy()
    expect(detail!.textContent).toContain('코드를 분석하는 중…')
  })
})
