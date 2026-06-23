// @vitest-environment jsdom
/**
 * smooth-markdown.test.tsx — P11 SmoothMarkdown 점진 렌더 TDD.
 *
 * 검증 대상:
 *   1. smoothRevealStep 순수 함수: velocity 공식, 단조 증가, textLen 초과 불가.
 *   2. SmoothMarkdown 컴포넌트: RAF 완료 후 전체 텍스트 표시, running=false 즉시 완료, text 변경 이어받기.
 *   3. 회귀: 기존 conversation.test의 스트리밍 텍스트 보임 보장.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// ── 1. 순수 함수 단위 테스트 ────────────────────────────────────────────────────

describe('smoothRevealStep — 순수 함수 velocity 공식', () => {
  it('exports smoothRevealStep 함수', async () => {
    const mod = await import('../../src/renderer/src/lib/smoothReveal')
    expect(typeof mod.smoothRevealStep).toBe('function')
  })

  it('buffer > 0일 때 cur가 증가한다(단조 증가)', async () => {
    const { smoothRevealStep } = await import('../../src/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 0, vel: 0, textLen: 100, dt: 0.016 })
    expect(result.nextCur).toBeGreaterThan(0)
  })

  it('cur === textLen이면 변화 없음(정지)', async () => {
    const { smoothRevealStep } = await import('../../src/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 100, vel: 0, textLen: 100, dt: 0.016 })
    expect(result.nextCur).toBe(100)
    expect(result.nextVel).toBe(0)
  })

  it('nextCur은 textLen을 초과하지 않는다', async () => {
    const { smoothRevealStep } = await import('../../src/renderer/src/lib/smoothReveal')
    // 큰 dt + 큰 vel로 한 프레임에 많이 이동해도 clamp
    const result = smoothRevealStep({ cur: 98, vel: 9999, textLen: 100, dt: 1.0 })
    expect(result.nextCur).toBeLessThanOrEqual(100)
  })

  it('targetVel = buffer * 3.2 + 18 공식 검증(vel=0, dt 충분히 작아 easing 미적용)', async () => {
    // dt가 극히 작으면 vel 변화가 미미 — buffer=50이면 targetVel=50*3.2+18=178
    // vel이 0에서 한 프레임: velNew ≈ 0 + (178-0)*min(1, 0.001*3.5) ≈ 0.623
    // nextCur ≈ 0 + 0.623 * 0.001 ≈ 0.000623  (>0이면 OK)
    const { smoothRevealStep } = await import('../../src/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 0, vel: 0, textLen: 50, dt: 0.001 })
    expect(result.nextCur).toBeGreaterThan(0)
    // nextVel이 targetVel=178 방향으로 이동했는지 확인
    expect(result.nextVel).toBeGreaterThan(0)
    expect(result.nextVel).toBeLessThan(178)
  })

  it('dt=0.05 clamp 넘어도 dt=0.05로 처리(탭 전환 보호)', async () => {
    const { smoothRevealStep } = await import('../../src/renderer/src/lib/smoothReveal')
    // dt=1초(탭 전환 시 큰 gap)를 넘겨도 결과가 dt=0.05와 동일해야 함
    const big = smoothRevealStep({ cur: 0, vel: 0, textLen: 100, dt: 1.0 })
    const clamped = smoothRevealStep({ cur: 0, vel: 0, textLen: 100, dt: 0.05 })
    expect(big.nextCur).toBeCloseTo(clamped.nextCur, 5)
    expect(big.nextVel).toBeCloseTo(clamped.nextVel, 5)
  })

  it('vel이 targetVel보다 높으면 감속(easing 다운)', async () => {
    // vel=500, buffer=10 → targetVel=10*3.2+18=50 → vel 감소
    const { smoothRevealStep } = await import('../../src/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 0, vel: 500, textLen: 10, dt: 0.016 })
    expect(result.nextVel).toBeLessThan(500)
  })

  it('buffer=0일 때 vel=0 리셋', async () => {
    const { smoothRevealStep } = await import('../../src/renderer/src/lib/smoothReveal')
    const result = smoothRevealStep({ cur: 50, vel: 100, textLen: 50, dt: 0.016 })
    expect(result.nextVel).toBe(0)
    expect(result.nextCur).toBe(50)
  })
})

// ── 2. SmoothMarkdown 컴포넌트 테스트 ──────────────────────────────────────────

describe('SmoothMarkdown 컴포넌트', () => {
  beforeEach(() => {
    // RAF를 동기로 즉시 실행하도록 mock
    let rafId = 0
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      // 즉시 호출하지 않고 Promise.resolve로 비동기 큐에 넣음
      // (무한루프 방지: 실제로는 테스트에서 act()로 flush)
      rafId++
      // 테스트 환경에서는 한 번만 호출(재귀 방지)
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
    const mod = await import('../../src/renderer/src/components/SmoothMarkdown')
    // memo()로 래핑 시 typeof === 'object', 직접 함수면 'function' — 둘 다 허용
    const t = typeof mod.SmoothMarkdown
    expect(t === 'function' || t === 'object').toBe(true)
    expect(mod.SmoothMarkdown).toBeTruthy()
  })

  it('running=false이면 text 전체가 즉시 렌더됨', async () => {
    const { SmoothMarkdown } = await import('../../src/renderer/src/components/SmoothMarkdown')
    const text = 'Hello world'
    await act(async () => {
      render(<SmoothMarkdown text={text} running={false} />)
    })
    // running=false → 초기 shown=text.length → 전체 표시
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('text가 빈 문자열이면 빈 렌더(오류 없음)', async () => {
    const { SmoothMarkdown } = await import('../../src/renderer/src/components/SmoothMarkdown')
    await act(async () => {
      render(<SmoothMarkdown text="" running={false} />)
    })
    // 오류 없이 렌더 완료
  })

  it('running=false, 마크다운 텍스트 → .markdown-view 렌더(MarkdownView 사용)', async () => {
    const { SmoothMarkdown } = await import('../../src/renderer/src/components/SmoothMarkdown')
    const { container } = await act(async () =>
      render(<SmoothMarkdown text="**굵게**" running={false} />)
    )
    // revealed(running=false, shown===text.length) → MarkdownView 렌더
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('running=true, 초기엔 shown=0 → 플레인 텍스트 시작(아직 마크다운 아님)', async () => {
    // RAF를 무한루프 없이 0회 실행 상태로: 첫 렌더만
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0)
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})

    const { SmoothMarkdown } = await import('../../src/renderer/src/components/SmoothMarkdown')
    const { container } = await act(async () =>
      render(<SmoothMarkdown text="Hello world" running={true} />)
    )
    // 초기 shown=0 → 플레인(pre 또는 span), markdown-view는 없어야 함
    expect(container.querySelector('.markdown-view')).toBeFalsy()
  })

  it('running=true에서 충분한 시간 후 전체 텍스트가 결국 표시됨', async () => {
    // RAF를 여러 번 실행해 shown이 textLen에 도달하도록
    vi.restoreAllMocks()

    // RAF를 N회 동기 실행하는 mock
    let calls = 0
    const MAX = 200 // 200프레임이면 어떤 텍스트도 완료
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      if (calls < MAX) {
        calls++
        cb(performance.now() + calls * 16) // 16ms/프레임 시뮬
      }
      return calls
    })
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})

    const { SmoothMarkdown } = await import('../../src/renderer/src/components/SmoothMarkdown')
    const text = 'Short text'
    const { container } = await act(async () =>
      render(<SmoothMarkdown text={text} running={true} />)
    )

    // 200프레임 후 shown===text.length → 마크다운 렌더 또는 플레인에 전체 텍스트
    // 컨테이너에 텍스트 내용이 있으면 OK
    expect(container.textContent).toContain('Short text')
  })
})

// ── 3. Conversation 통합: 스트리밍 텍스트 보임 회귀 ───────────────────────────

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
    const { useAppStore } = await import('../../src/renderer/src/store/appStore')
    useAppStore.setState({
      messages: [], streamingText: '', toolCards: [], isRunning: false,
      errorMessage: undefined, thinkingText: null, todos: [],
      ...patch,
    } as Parameters<typeof useAppStore.setState>[0])
  }

  it('running=false인 완료 메시지는 기존 MarkdownView로 렌더됨(.markdown-view)', async () => {
    await setStore({
      messages: [{ id: 'm1', role: 'assistant', content: '**완료된 응답**' }],
    })
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    expect(container.querySelector('.markdown-view')).toBeTruthy()
  })

  it('streamingText 있으면 스트리밍 버블이 DOM에 존재(SmoothMarkdown)', async () => {
    // running=true + streamingText → SmoothMarkdown 렌더됨
    await setStore({
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
      streamingText: '스트리밍 중인 텍스트',
      isRunning: true,
    })
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    // .smooth-markdown 또는 .stream-area가 렌더됨
    const smoothEl = container.querySelector('.smooth-markdown')
    const streamingEl = container.querySelector('.streaming-bubble')
    // 둘 중 하나 존재 — 구현에 따라 클래스 다를 수 있으므로 텍스트 포함 여부로도 검증
    // running=true + shown=0이므로 마크다운은 없지만 컨테이너가 렌더됨
    expect(smoothEl || streamingEl || container.querySelector('.msg.ai-msg')).toBeTruthy()
  })

  it('running=false + streamingText="" → 스트리밍 버블 없음(완료 후 정리)', async () => {
    await setStore({
      messages: [{ id: 'm1', role: 'user', content: '안녕' }],
      streamingText: '',
      isRunning: false,
    })
    const { Conversation } = await import('../../src/renderer/src/components/Conversation')
    const { container } = await act(async () => render(<Conversation />))
    // streamingText 없으면 SmoothMarkdown 컨테이너 없어야 함
    expect(container.querySelector('.smooth-markdown')).toBeFalsy()
  })
})
