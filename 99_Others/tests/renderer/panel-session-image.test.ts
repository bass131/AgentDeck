// @vitest-environment jsdom
/**
 * panel-session-image.test.ts — send({images}) 단위 테스트 (TDD-first).
 *
 * Node 환경 (window.api mock 포함).
 * 검증 범위:
 *   (1) send({images}) → history 마지막 content가 buildEnginePrompt 출력(이미지 경로 포함)
 *   (2) send({images}) → ADD_USER_MESSAGE images=dataUrls (표시용)
 *   (3) 이미지 없으면 content는 text 그대로 (buildEnginePrompt 스킵)
 *   (4) 슬래시 커맨드는 images 있어도 buildEnginePrompt 미적용
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import type { PanelSessionState } from '../../../02.Source/renderer/src/store/panelSession'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'
import type { AttachedImage } from '../../../02.Source/renderer/src/store/appStore'

// ── window.api mock ───────────────────────────────────────────────────────────
const mockUnsub = vi.fn()
const mockAgentRun = vi.fn().mockResolvedValue({ runId: 'img-run-1' })

Object.defineProperty(window, 'api', {
  value: {
    agentRun: mockAgentRun,
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    onAgentEvent: vi.fn().mockImplementation((cb: (payload: unknown) => void) => {
      void cb // 참조 유지
      return mockUnsub
    }),
  },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockAgentRun.mockResolvedValue({ runId: 'img-run-1' })
})

afterEach(() => {
  cleanup()
})

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════════

describe('panelSession send with images — (1) agentRun content에 이미지 경로 포함', () => {
  it('send(text, {images}) → agentRun 마지막 메시지 content에 buildEnginePrompt(이미지 경로) 포함', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('이미지 전송 테스트', { images: testImages })
    })

    expect(mockAgentRun).toHaveBeenCalledOnce()
    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    expect(lastMsg.role).toBe('user')
    // buildEnginePrompt: 텍스트 + 이미지 경로 노트
    expect(lastMsg.content).toContain('이미지 전송 테스트')
    expect(lastMsg.content).toContain('/tmp/img1.png')
    expect(lastMsg.content).toContain('/tmp/img2.jpg')
    expect(lastMsg.content).toContain('[첨부 이미지')
  })

  it('이미지 없으면 content는 text 그대로 (buildEnginePrompt 노트 없음)', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('일반 텍스트 전송', { images: [] })
    })

    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    // buildEnginePrompt 노트 없이 text 그대로
    expect(lastMsg.content).toBe('일반 텍스트 전송')
  })

  it('opts.images 미지정 시 content는 text 그대로', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

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
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('이미지 포함 메시지', { images: testImages })
    })

    const uMsgs = userMsgs(result.current.state)
    expect(uMsgs).toHaveLength(1)
    // 표시용 dataUrl이 images 필드에 들어가야 함
    expect(uMsgs[0].images).toEqual([
      'data:image/png;base64,AA',
      'data:image/jpeg;base64,BB',
    ])
  })

  it('이미지 없으면 thread user msg에 images 필드 없음 (undefined)', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('이미지 없음', { images: [] })
    })

    const uMsgs = userMsgs(result.current.state)
    expect(uMsgs).toHaveLength(1)
    // images 필드 없거나 undefined
    expect(uMsgs[0].images).toBeUndefined()
  })
})

describe('panelSession send with images — (3) 슬래시 커맨드는 buildEnginePrompt 미적용', () => {
  it('/compact 커맨드 + 이미지 → content는 /compact 그대로 (노트 미합성)', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    await act(async () => {
      await result.current.send('/compact', { images: testImages })
    })

    const callArg = mockAgentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const lastMsg = callArg.messages[callArg.messages.length - 1]
    // 슬래시 커맨드: 이미지 경로 노트 미합성
    expect(lastMsg.content).toBe('/compact')
  })
})

describe('panelSession send with images — (4) 이전 메시지 history 보존', () => {
  it('두 번째 send에서 첫 번째 메시지 history가 올바르게 포함된다', async () => {
    const { usePanelSession } = await import('../../../02.Source/renderer/src/store/panelSession')
    const { result } = renderHook(() => usePanelSession())

    // 첫 번째 send (이미지 없음)
    await act(async () => {
      await result.current.send('첫 메시지')
    })

    // 두 번째 send (이미지 포함)
    await act(async () => {
      await result.current.send('두 번째 이미지', { images: testImages })
    })

    // 두 번째 agentRun 호출 확인
    expect(mockAgentRun).toHaveBeenCalledTimes(2)
    const secondCallArg = mockAgentRun.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>
    }
    // history에 첫 번째 메시지가 포함됨 (이전 msg text 그대로)
    const firstHistoryMsg = secondCallArg.messages[0]
    expect(firstHistoryMsg.content).toBe('첫 메시지')
    // 마지막 메시지는 두 번째 (buildEnginePrompt 결과)
    const lastMsg = secondCallArg.messages[secondCallArg.messages.length - 1]
    expect(lastMsg.content).toContain('/tmp/img1.png')
  })
})
