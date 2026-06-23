// @vitest-environment jsdom
/**
 * slash-intercept.test.tsx — 22a 슬래시 인터셉트 단위 테스트 (TDD-first).
 *
 * 검증 범위:
 *   - /compact (in-list) → sendMessage 호출, 인터셉트 없음
 *   - /clear → clearConversation 호출, sendMessage 미호출, input 초기화
 *   - /ask → onSlashAsk 호출, sendMessage 미호출, input 초기화
 *   - /ask <args> (인자 포함) → 마찬가지로 인터셉트
 *   - 일반 텍스트 → sendMessage 호출 (회귀)
 *   - /review (non-intercepted slash) → sendMessage 호출 (회귀)
 *
 * 단언 범위: 전송 경로만. SDK 도구 실행 성공 / 권한모드 상호작용은 ⑦ 라이브.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

// ── window.api mock ──────────────────────────────────────────────────────────
const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const mockClearConversation = vi.fn()
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

// ── store 패치 헬퍼 ───────────────────────────────────────────────────────────
async function patchStore() {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  // sendMessage, clearConversation을 mock으로 교체
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    sendMessage: mockSendMessage,
    clearConversation: mockClearConversation,
  } as Parameters<typeof useAppStore.setState>[0])
  return useAppStore
}

// ── 입력 전송 헬퍼 ────────────────────────────────────────────────────────────
/**
 * 텍스트를 textarea에 입력하고 Enter로 전송한다.
 *
 * slash 명령어(예: `/clear`)는 Composer의 팔레트(parseSlashQuery)가 공백 없는
 * 슬래시 문자열에서 열린다. 팔레트가 열려 있으면 Enter가 팔레트 선택에 쓰이므로
 * handleSend까지 도달하지 않는다. 따라서:
 *   - 공백 없는 슬래시 문자열: 먼저 Escape로 팔레트를 닫은 뒤 Enter 전송.
 *     (사용자가 "/clear" 입력 → Esc → Enter 흐름과 동일)
 *   - 공백 포함 or 일반 텍스트: 팔레트 미열림 → Enter 즉시 전송.
 */
async function typeAndSend(container: HTMLElement, text: string) {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  // 슬래시로 시작하고 공백 없으면 팔레트가 열림 — Escape로 닫기
  if (text.startsWith('/') && !/\s/.test(text)) {
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Escape', code: 'Escape' })
    })
  }
  // Enter 키 (Composer의 onSend 트리거)
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter', shiftKey: false })
  })
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('slash-intercept 22a — /compact (in-list) → sendMessage 호출', () => {
  it('/compact 입력 후 Enter → sendMessage(\'/compact\') 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/compact')
    // M4-2: sendMessage(text, pickerValues, promptForEngine?) — 3번째 인자 추가됨
    expect(mockSendMessage).toHaveBeenCalled()
    expect(mockSendMessage.mock.calls[0][0]).toBe('/compact')
    expect(mockClearConversation).not.toHaveBeenCalled()
  })
})

describe('slash-intercept 22a — /clear → clearConversation, sendMessage 미호출', () => {
  it('/clear → clearConversation 호출 + sendMessage 미호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/clear')
    expect(mockClearConversation).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/clear (trailing space) → clearConversation 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/clear ')
    expect(mockClearConversation).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/clear → input이 비워짐', async () => {
    await patchStore()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/clear')
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('')
  })
})

describe('slash-intercept 22a — /ask → onSlashAsk 호출, sendMessage 미호출', () => {
  it('/ask → onSlashAsk 호출 + sendMessage 미호출', async () => {
    await patchStore()
    const onSlashAsk = vi.fn()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation onSlashAsk={onSlashAsk} />))
    await typeAndSend(container, '/ask')
    expect(onSlashAsk).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/ask <args> → onSlashAsk 호출 + sendMessage 미호출', async () => {
    await patchStore()
    const onSlashAsk = vi.fn()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation onSlashAsk={onSlashAsk} />))
    await typeAndSend(container, '/ask 무엇이든')
    expect(onSlashAsk).toHaveBeenCalledTimes(1)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('/ask → input이 비워짐', async () => {
    await patchStore()
    const onSlashAsk = vi.fn()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation onSlashAsk={onSlashAsk} />))
    await typeAndSend(container, '/ask')
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('')
  })

  it('/ask + onSlashAsk 미제공 → sendMessage 미호출 (폴백: 기존 동작 — no-op)', async () => {
    // onSlashAsk prop 없을 때도 엔진으로 /ask를 보내면 안 됨(원본 동작 미러)
    await patchStore()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/ask')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

describe('slash-intercept 22a — 회귀: 일반/비인터셉트 슬래시', () => {
  it('일반 텍스트 → sendMessage 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '안녕하세요')
    // M4-2: sendMessage(text, pickerValues, promptForEngine?) — 3번째 인자 추가됨
    expect(mockSendMessage).toHaveBeenCalled()
    expect(mockSendMessage.mock.calls[0][0]).toBe('안녕하세요')
    expect(mockClearConversation).not.toHaveBeenCalled()
  })

  it('/review (비인터셉트 슬래시) → sendMessage 호출', async () => {
    await patchStore()
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '/review')
    // M4-2: sendMessage(text, pickerValues, promptForEngine?) — 3번째 인자 추가됨
    expect(mockSendMessage).toHaveBeenCalled()
    expect(mockSendMessage.mock.calls[0][0]).toBe('/review')
    expect(mockClearConversation).not.toHaveBeenCalled()
  })
})
