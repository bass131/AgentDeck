// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { PanelSessionState } from '@renderer/03_Agent/state/panelSession'
import type { ThreadItem } from '@renderer/05_Conversation/state/threadTypes'
import type { AttachedImage } from '@renderer/00_App/appStore'

const mockUnsub = vi.fn()
const mockAgentRun = vi.fn().mockResolvedValue({ runId: 'img-run-1' })
let agentEventListener: ((payload: unknown) => void) | null = null

Object.defineProperty(window, 'api', {
  value: {
    agentRun: mockAgentRun,
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    onAgentEvent: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
      agentEventListener = cb
      return mockUnsub
    }),
  },
  writable: true,
  configurable: true,
})

beforeEach(async () => {
  // 패널 매니저는 모듈 수준 상태를 갖는다 — 같은 슬롯 키의 history가 테스트 사이에 새지 않게 비운다
  const { __resetPanelSessionManagerForTests } = await import('@renderer/03_Agent/state/panelSession')
  __resetPanelSessionManagerForTests()
  vi.clearAllMocks()
  mockAgentRun.mockResolvedValue({ runId: 'img-run-1' })
})

afterEach(() => {
  cleanup()
})

function userMsgs(state: PanelSessionState) {
  return state.thread.filter(
    (item): item is Extract<ThreadItem, { kind: 'msg' }> =>
      item.kind === 'msg' && item.role === 'user'
  )
}

const testImages: AttachedImage[] = [
  { path: '/tmp/img1.png', dataUrl: 'data:image/png;base64,AA' },
  { path: '/tmp/img2.jpg', dataUrl: 'data:image/jpeg;base64,BB' },
]

describe('panelSession send with images — (1) agentRun content에 이미지 경로 포함', () => {
  it('send(text, {images}) → agentRun 마지막 메시지 content에 buildEnginePrompt(이미지 경로) 포함', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-img', 0))

    await act(async () => {
      await result.current.send('이미지 전송 테스트', { images: testImages })
    })

    expect(mockAgentRun).toHaveBeenCalledOnce()
    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content).toContain('이미지 전송 테스트')
    expect(lastMsg.content).toContain('/tmp/img1.png')
    expect(lastMsg.content).toContain('/tmp/img2.jpg')
    expect(lastMsg.content).toContain('[첨부 이미지')
  })

  it('이미지 없으면 content는 text 그대로 (buildEnginePrompt 노트 없음)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-img', 0))

    await act(async () => {
      await result.current.send('일반 텍스트 전송', { images: [] })
    })

    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.content).toBe('일반 텍스트 전송')
  })

  it('opts.images 미지정 시 content는 text 그대로', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-img', 0))

    await act(async () => {
      await result.current.send('옵션 없음')
    })

    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.content).toBe('옵션 없음')
  })
})

describe('panelSession send with images — (2) ADD_USER_MESSAGE images=dataUrls', () => {
  it('send({images}) → thread user 메시지에 images 필드(dataUrls) 설정', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-img', 0))

    await act(async () => {
      await result.current.send('이미지 포함 메시지', { images: testImages })
    })

    const uMsgs = userMsgs(result.current.state)
    expect(uMsgs).toHaveLength(1)
    expect(uMsgs[0].images).toEqual([
      'data:image/png;base64,AA',
      'data:image/jpeg;base64,BB',
    ])
  })

  it('이미지 없으면 thread user msg에 images 필드 없음 (undefined)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-img', 0))

    await act(async () => {
      await result.current.send('이미지 없음', { images: [] })
    })

    const uMsgs = userMsgs(result.current.state)
    expect(uMsgs).toHaveLength(1)
    expect(uMsgs[0].images).toBeUndefined()
  })
})

describe('panelSession send with images — (3) 슬래시 커맨드는 buildEnginePrompt 미적용', () => {
  it('/compact 커맨드 + 이미지 → content는 /compact 그대로 (노트 미합성)', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-img', 0))

    await act(async () => {
      await result.current.send('/compact', { images: testImages })
    })

    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.content).toBe('/compact')
  })
})

describe('panelSession send with images — (4) 이전 메시지 history 보존', () => {
  it('두 번째 send에서 첫 번째 메시지 history가 올바르게 포함된다', async () => {
    const { usePanelSlot } = await import('@renderer/03_Agent/state/panelSession')
    const { result } = renderHook(() => usePanelSlot('sess-img', 0))

    await act(async () => {
      await result.current.send('첫 메시지')
    })

    // M05 G9a E1: 실행 중 재전송은 무시된다(단일과 같음). 이 테스트의 관심사는 history 보존이라
    // 첫 run을 done으로 끝낸 뒤 두 번째를 보낸다.
    act(() => {
      agentEventListener?.({ runId: 'img-run-1', event: { type: 'done' } })
    })

    await act(async () => {
      await result.current.send('두 번째 이미지', { images: testImages })
    })

    expect(mockAgentRun).toHaveBeenCalledTimes(2)
    const secondCallArg = mockAgentRun.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>
    }
    const firstHistoryMsg = secondCallArg.messages[0]
    expect(firstHistoryMsg.content).toBe('첫 메시지')
    const lastMsg = secondCallArg.messages[secondCallArg.messages.length - 1]
    expect(lastMsg.content).toContain('/tmp/img1.png')
  })
})
