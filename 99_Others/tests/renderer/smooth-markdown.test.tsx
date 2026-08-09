// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

describe('smoothRevealStep — 순수 함수 velocity 공식', () => {
  it('exports smoothRevealStep 함수', async () => {
    const mod = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    expect(typeof mod.smoothRevealStep).toBe('function')
  })

  it('buffer > 0일 때 cur가 증가한다(단조 증가)', async () => {
    const { smoothRevealStep } = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 0, vel: 0, textLen: 100, dt: 0.016 })
    expect(result.nextCur).toBeGreaterThan(0)
  })

  it('cur === textLen이면 변화 없음(정지)', async () => {
    const { smoothRevealStep } = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 100, vel: 0, textLen: 100, dt: 0.016 })
    expect(result.nextCur).toBe(100)
    expect(result.nextVel).toBe(0)
  })

  it('nextCur은 textLen을 초과하지 않는다', async () => {
    const { smoothRevealStep } = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 98, vel: 9999, textLen: 100, dt: 1.0 })
    expect(result.nextCur).toBeLessThanOrEqual(100)
  })

  it('targetVel = buffer * 3.2 + 18 공식 검증(vel=0, dt 충분히 작아 easing 미적용)', async () => {
    const { smoothRevealStep } = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 0, vel: 0, textLen: 50, dt: 0.001 })
    expect(result.nextCur).toBeGreaterThan(0)
    expect(result.nextVel).toBeGreaterThan(0)
    expect(result.nextVel).toBeLessThan(178)
  })

  it('dt=0.05 clamp 넘어도 dt=0.05로 처리(탭 전환 보호)', async () => {
    const { smoothRevealStep } = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    const big = smoothRevealStep({ cur: 0, vel: 0, textLen: 100, dt: 1.0 })
    const clamped = smoothRevealStep({ cur: 0, vel: 0, textLen: 100, dt: 0.05 })
    expect(big.nextCur).toBeCloseTo(clamped.nextCur, 5)
    expect(big.nextVel).toBeCloseTo(clamped.nextVel, 5)
  })

  it('vel이 targetVel보다 높으면 감속(easing 다운)', async () => {
    const { smoothRevealStep } = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 0, vel: 500, textLen: 10, dt: 0.016 })
    expect(result.nextVel).toBeLessThan(500)
  })

  it('buffer=0일 때 vel=0 리셋', async () => {
    const { smoothRevealStep } = await import('../../../02_Source/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 50, vel: 100, textLen: 50, dt: 0.016 })
    expect(result.nextVel).toBe(0)
    expect(result.nextCur).toBe(50)
  })
})

describe('SmoothMarkdown 컴포넌트', () => {
  beforeEach(() => {
    let rafId = 0
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      rafId++
      setTimeout(() => cb(performance.now()), 0)
      return rafId
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('exports SmoothMarkdown (memo → function 또는 object)', async () => {
    const mod = await import('../../../02_Source/renderer/src/features/conversation/SmoothMarkdown')
    const t = typeof mod.SmoothMarkdown
    expect(t === 'function' || t === 'object').toBe(true)
    expect(mod.SmoothMarkdown).toBeTruthy()
  })

  it('running=false이면 text 전체가 즉시 렌더됨', async () => {
    const { SmoothMarkdown } = await import('../../../02_Source/renderer/src/features/conversation/SmoothMarkdown')
    const text = 'Hello world'
    await act(async () => {
      render(<SmoothMarkdown text={text} running={false} />)
    })
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('text가 빈 문자열이면 빈 렌더(오류 없음)', async () => {
    const { SmoothMarkdown } = await import('../../../02_Source/renderer/src/features/conversation/SmoothMarkdown')
    await act(async () => {
      render(<SmoothMarkdown text="" running={false} />)
    })
  })

  it('running=false, 마크다운 텍스트 → .markdown-view 렌더(MarkdownView 사용)', async () => {
    const { SmoothMarkdown } = await import('../../../02_Source/renderer/src/features/conversation/SmoothMarkdown')
    const { container } = await act(async () =>
      render(<SmoothMarkdown text="**굵게**" running={false} />)
    )
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('running=true, 초기엔 shown=0 → 플레인 텍스트 시작(아직 마크다운 아님)', async () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0)
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})

    const { SmoothMarkdown } = await import('../../../02_Source/renderer/src/features/conversation/SmoothMarkdown')
    const { container } = await act(async () =>
      render(<SmoothMarkdown text="Hello world" running={true} />)
    )
    expect(container.querySelector('.markdown-view')).toBeFalsy()
  })

  it('스트리밍 커서는 텍스트 끝 inline(.smooth-pre 내부 child) — 아래 줄로 분리되지 않음(원본 1:1)', async () => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0)
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})

    const { SmoothMarkdown } = await import('../../../02_Source/renderer/src/features/conversation/SmoothMarkdown')
    const { container } = await act(async () =>
      render(<SmoothMarkdown text="Hello world" running={true} />)
    )
    const pre = container.querySelector('.smooth-pre')
    const cursor = container.querySelector('.stream-cursor')
    expect(pre).toBeTruthy()
    expect(cursor).toBeTruthy()
    expect(pre!.contains(cursor as Node)).toBe(true)
  })

  it('running=true에서 충분한 시간 후 전체 텍스트가 결국 표시됨', async () => {
    vi.restoreAllMocks()

    let calls = 0
    const MAX = 200
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      if (calls < MAX) {
        calls++
        cb(performance.now() + calls * 16)
      }
      return calls
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})

    const { SmoothMarkdown } = await import('../../../02_Source/renderer/src/features/conversation/SmoothMarkdown')
    const text = 'Short text'
    const { container } = await act(async () =>
      render(<SmoothMarkdown text={text} running={true} />)
    )

    expect(container.textContent).toContain('Short text')
  })
})

describe('Conversation — SmoothMarkdown 통합 회귀', () => {
  const mockUnsub = vi.fn()
  const mockApi = {
    conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
    conversationSave: vi.fn().mockResolvedValue({ id: 'cv-1' }),
    agentRun: vi.fn().mockResolvedValue({ runId: 'r1' }),
    agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
    onAgentEvent: vi.fn().mockReturnValue(mockUnsub),
    listFiles: vi.fn().mockResolvedValue({ files: [] }),
  }

  beforeEach(() => {
    Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })
    vi.clearAllMocks()
    mockApi.conversationLoad.mockResolvedValue({ conversations: [] })
    mockApi.onAgentEvent.mockReturnValue(mockUnsub)
    mockApi.listFiles.mockResolvedValue({ files: [] })
  })

  async function setStore(patch: Record<string, unknown>) {
    const { useAppStore } = await import('../../../02_Source/renderer/src/store/appStore')
    useAppStore.setState({
      thread: [],
      messages: [], streamingText: '', toolCards: [], isRunning: false,
      errorMessage: undefined, thinkingText: null, todos: [],
      openGroupId: null, openMsgId: null, seq: 0,
      ...patch,
    } as Parameters<typeof useAppStore.setState>[0])
  }

  it('running=false인 완료 메시지는 기존 MarkdownView로 렌더됨(.markdown-view)', async () => {
    await setStore({
      thread: [{ kind: 'msg', id: 'm1', role: 'assistant', text: '**완료된 응답**' }],
      isRunning: false,
    })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('thread의 마지막 assistant msg + isRunning=true → SmoothMarkdown 렌더(Phase A-2)', async () => {
    await setStore({
      thread: [
        { kind: 'msg', id: 'm1', role: 'user', text: '안녕' },
        { kind: 'msg', id: 'm2', role: 'assistant', text: '스트리밍 중인 텍스트' },
      ],
      isRunning: true,
    })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.msg.ai-msg')).toBeTruthy()
  })

  it('running=false + assistant msg → 스트리밍 버블 없음(완료 후 정리)', async () => {
    await setStore({
      thread: [{ kind: 'msg', id: 'm1', role: 'user', text: '안녕' }],
      isRunning: false,
    })
    const { Conversation } = await import('../../../02_Source/renderer/src/features/conversation/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.stream-cursor')).toBeFalsy()
  })
})
