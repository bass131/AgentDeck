// @vitest-environment jsdom
/**
 * queue-drain.test.tsx — Conversation 큐 드레인 통합 테스트 (TDD-first).
 *
 * 검증 범위:
 *   ① isRunning=true 상태에서 Enter → sendMessage 미호출 + queue 길이 증가 + picker 캡처
 *   ② isRunning true→false 전이 + queue>0 → dispatchSend 경유 sendMessage가
 *      첫 메시지 text + 캡처 picker로 호출
 *   ③ 중복전송 방지: 전이 1회당 1건만 드레인
 *   ④ FIFO 순서(2건 적재 → 첫 전이에 1번째, 다음 전이에 2번째)
 *
 * mention-notes.test.tsx의 store-patch + typeAndSend idiom 재사용.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'

// ── window.api mock ──────────────────────────────────────────────────────────
const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const mockUnsub = vi.fn()
const mockApi = {
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
  agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  pathForFile: vi.fn().mockReturnValue(''),
  saveImageData: vi.fn().mockResolvedValue({ path: '' }),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
  mockApi.onAgentEvent.mockReturnValue(mockUnsub)
  mockApi.agentRun.mockResolvedValue({ runId: 'r1' })
  mockApi.listFiles.mockResolvedValue({ files: [] })
  mockSendMessage.mockResolvedValue(undefined)
})
afterEach(() => cleanup())

// ── store 패치 헬퍼 ────────────────────────────────────────────────────────
async function patchStoreWithSpy(isRunning = false) {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  useAppStore.setState({
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning,
    errorMessage: undefined,
    queue: [],
    projectFiles: [],
    attachedImages: [],
    sendMessage: mockSendMessage,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ── 입력 전송 헬퍼 ────────────────────────────────────────────────────────
async function typeAndSend(container: HTMLElement, text: string) {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  // 슬래시/멘션 팔레트가 열릴 수 있으면 Escape로 닫기
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Escape', code: 'Escape' })
  })
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter', code: 'Enter', shiftKey: false })
  })
}

// ── 테스트 ①: isRunning=true → enqueue, sendMessage 미호출 ────────────────

describe('queue-drain — ① isRunning=true → 큐에 적재, sendMessage 미호출', () => {
  it('isRunning=true 상태에서 Enter → sendMessage 호출 안 됨', async () => {
    await patchStoreWithSpy(true)
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '예약 메시지')
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('isRunning=true 상태에서 Enter → queue 길이 1 증가', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '첫 예약')
    expect(useAppStore.getState().queue).toHaveLength(1)
  })

  it('isRunning=true 상태에서 Enter → text 캡처됨', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '예약 텍스트')
    expect(useAppStore.getState().queue[0]?.text).toBe('예약 텍스트')
  })

  it('isRunning=true 상태에서 전송 후 inputText 리셋(textarea 비워짐)', async () => {
    await patchStoreWithSpy(true)
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    await typeAndSend(container, '예약할 내용')
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('')
  })
})

// ── 테스트 ②: busy→idle 전이 → 큐 첫 항목 드레인 ─────────────────────────

describe('queue-drain — ② busy→idle 전이 → 큐 드레인 (dispatchSend 경유)', () => {
  it('isRunning true→false 전이 + queue>0 → sendMessage가 큐 첫 text로 호출됨', async () => {
    // 준비: 큐에 항목 있고, isRunning=false(드레인 직후 상태 시뮬레이션)
    // 방법: isRunning=true로 시작 → 큐 적재 → isRunning=false 전이로 effect 트리거
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    // 큐에 메시지 적재
    await typeAndSend(container, '드레인될 메시지')
    expect(useAppStore.getState().queue).toHaveLength(1)
    expect(mockSendMessage).not.toHaveBeenCalled()

    // isRunning true→false 전이 — effect 발화
    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    // sendMessage가 큐 첫 항목 text로 호출됨
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [arg0] = mockSendMessage.mock.calls[0] as [string, ...unknown[]]
    expect(arg0).toBe('드레인될 메시지')
  })

  it('드레인 후 큐에서 항목 제거됨', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    await typeAndSend(container, '제거될 항목')
    expect(useAppStore.getState().queue).toHaveLength(1)

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(useAppStore.getState().queue).toHaveLength(0)
  })
})

// ── 테스트 ③: 중복전송 방지 (was 가드) ──────────────────────────────────────

describe('queue-drain — ③ 중복전송 방지 (was 가드)', () => {
  it('전이 1회 당 1건만 드레인 (queue 2개 적재 → 첫 전이에 1개만 드레인)', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    await typeAndSend(container, '메시지 1')
    await typeAndSend(container, '메시지 2')
    expect(useAppStore.getState().queue).toHaveLength(2)

    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    // 첫 전이에 1건만 드레인 (중복전송 방지)
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    // 큐에 1건 남음
    expect(useAppStore.getState().queue).toHaveLength(1)
  })

  it('이미 idle인 상태에서 queue에 항목 추가해도 자동 드레인 안 됨 (was 가드)', async () => {
    // isRunning=false로 시작 (was 가드: was=false이므로 transition 없음)
    await patchStoreWithSpy(false)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    await act(async () => render(<Conversation />))

    // 직접 큐에 항목 추가 (isRunning=false 유지)
    await act(async () => {
      useAppStore.getState().enqueueMessage({ id: 'direct', text: '직접 추가', images: [] })
    })

    // sendMessage 호출 안 됨 (busy→idle 전이가 없었으므로)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })
})

// ── 테스트 ④: FIFO 순서 ──────────────────────────────────────────────────────

describe('queue-drain — ④ FIFO 순서', () => {
  it('2건 적재 → 첫 전이에 1번째, 다음 전이에 2번째 드레인', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    await typeAndSend(container, '첫 번째')
    await typeAndSend(container, '두 번째')
    expect(useAppStore.getState().queue).toHaveLength(2)

    // 첫 번째 전이
    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [first] = mockSendMessage.mock.calls[0] as [string, ...unknown[]]
    expect(first).toBe('첫 번째')

    // 두 번째 전이 시뮬레이션: busy→idle
    mockSendMessage.mockClear()
    await act(async () => {
      useAppStore.setState({ isRunning: true } as Parameters<typeof useAppStore.setState>[0])
    })
    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [second] = mockSendMessage.mock.calls[0] as [string, ...unknown[]]
    expect(second).toBe('두 번째')
    // 큐 비워짐
    expect(useAppStore.getState().queue).toHaveLength(0)
  })
})

// ── 테스트 ⑤: picker 캡처 보존 ──────────────────────────────────────────────

describe('queue-drain — ⑤ picker 캡처', () => {
  it('드레인 시 캡처된 picker가 sendMessage 2번째 인자로 전달됨', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))

    // 큐에 직접 picker 포함 항목 적재 (Composer의 picker state를 우회)
    await act(async () => {
      useAppStore.getState().enqueueMessage({
        id: 'pk-1',
        text: 'picker test',
        images: [],
        picker: { model: 'sonnet', effort: 'low', mode: 'auto' },
      })
    })

    // busy→idle 전이
    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const [, pickerArg] = mockSendMessage.mock.calls[0] as [string, { model: string; effort: string; mode: string } | undefined, ...unknown[]]
    expect(pickerArg?.model).toBe('sonnet')
    expect(pickerArg?.effort).toBe('low')
  })
})

// ── 테스트 ⑥: 이미지 단독 큐 드레인 → displayImages 4번째 인자 (22c 연동) ──────

describe('queue-drain — ⑥ 이미지 단독 큐 항목 드레인', () => {
  it('빈 텍스트+이미지 큐 항목 드레인 → sendMessage 4번째 인자(displayImages)에 dataUrl 전달', async () => {
    await patchStoreWithSpy(true)
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    await act(async () => render(<Conversation />))

    // 텍스트 없이 이미지만 있는 큐 항목 직접 적재(이미지 단독 예약 시뮬레이션)
    await act(async () => {
      useAppStore.getState().enqueueMessage({
        id: 'img-only',
        text: '',
        images: [{ path: '/tmp/shot.png', dataUrl: 'data:image/png;base64,DRAINME' }],
      })
    })

    // busy→idle 전이로 드레인
    await act(async () => {
      useAppStore.setState({ isRunning: false } as Parameters<typeof useAppStore.setState>[0])
    })

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    const call = mockSendMessage.mock.calls[0] as [string, unknown, string | undefined, string[] | undefined]
    // 3번째(promptForEngine): 이미지 노트 포함, 4번째(displayImages): dataUrl
    expect(call[2]).toContain('[첨부 이미지 — Read 도구로 확인하세요]')
    expect(call[2]).toContain('- /tmp/shot.png')
    expect(call[3]).toEqual(['data:image/png;base64,DRAINME'])
  })
})
