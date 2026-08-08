// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'

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
  cleanup()
})

describe('P14a — WORKING_PHRASES 배열', () => {
  it('10개 이상의 phrase 존재', async () => {
    const { WORKING_PHRASES } = await import('../../../02_Source/renderer/src/lib/workingPhrases')
    expect(Array.isArray(WORKING_PHRASES)).toBe(true)
    expect(WORKING_PHRASES.length).toBeGreaterThanOrEqual(10)
  })

  it('각 phrase가 비어있지 않은 문자열', async () => {
    const { WORKING_PHRASES } = await import('../../../02_Source/renderer/src/lib/workingPhrases')
    for (const phrase of WORKING_PHRASES) {
      expect(typeof phrase).toBe('string')
      expect(phrase.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('P14a — nextPhraseIndex 순수 함수', () => {
  it('반환값이 배열 인덱스 범위 내', async () => {
    const { nextPhraseIndex, WORKING_PHRASES } = await import('../../../02_Source/renderer/src/lib/workingPhrases')
    const len = WORKING_PHRASES.length
    for (let cur = 0; cur < len; cur++) {
      const next = nextPhraseIndex(cur, len)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(len)
    }
  })

  it('현재 인덱스와 다른 값 반환(non-repeating)', async () => {
    const { nextPhraseIndex, WORKING_PHRASES } = await import('../../../02_Source/renderer/src/lib/workingPhrases')
    const len = WORKING_PHRASES.length
    if (len < 2) return
    for (let cur = 0; cur < len; cur++) {
      const next = nextPhraseIndex(cur, len)
      expect(next).not.toBe(cur)
    }
  })

  it('배열 길이 1이면 항상 0 반환', async () => {
    const { nextPhraseIndex } = await import('../../../02_Source/renderer/src/lib/workingPhrases')
    expect(nextPhraseIndex(0, 1)).toBe(0)
  })
})

describe('P14a — ThinkingItem 접이식 (GAP1 P06)', () => {
  it('ThinkingItem: 접이식 thinking-block + 펼침 후 전문 text 노출', async () => {
    const { ThinkingItem } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<ThinkingItem text="코드를 분석하는 중…" />))
    expect(container.querySelector('[data-testid="thinking-block"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="thinking-toggle"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="thinking-detail"]')).toBeFalsy()
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="thinking-toggle"]')!)
    })
    const detail = container.querySelector('[data-testid="thinking-detail"]')
    expect(detail).toBeTruthy()
    expect(detail!.textContent).toContain('코드를 분석하는 중…')
  })
})
