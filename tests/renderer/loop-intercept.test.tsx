// @vitest-environment jsdom
/**
 * loop-intercept.test.tsx — 앱 레벨 /loop 인터셉트 통합 (4단계).
 *
 * 🔴#1(SDK 누수 차단)의 핵심 단언: `/loop ...`는 SDK로 보내지 않고 renderer가 직접 반복한다.
 *   - `/loop 30s do X` 전송 → agentRun엔 내부 프롬프트('do X')만, '/loop' 원문 누수 0 + activeLoop 등록.
 *   - `/loop stop` 전송 → agentRun 호출 0(평문 슬래시 SDK 누수 0) + activeLoop 해제.
 *   - 첫 틱 즉시 발사(tickCount 1).
 *
 * Phase 5a 조정: 이 테스트들은 **replMode OFF(단발 모드)** 상태에서 앱 레벨 인터셉트를 검증한다.
 * replMode ON(기본)이면 /loop는 SDK로 흘러가므로(ADR-024), setStore에 replMode:false 명시.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import type { ThreadItem } from '../../src/renderer/src/store/threadTypes'

const agentRun = vi.fn().mockResolvedValue({ runId: 'r1' })
const baseApi: Record<string, unknown> = {
  agentRun,
  agentAbort: vi.fn().mockResolvedValue({ accepted: true }),
  onAgentEvent: vi.fn().mockReturnValue(() => {}),
  conversationLoad: vi.fn().mockResolvedValue({ conversations: [] }),
  conversationSave: vi.fn().mockResolvedValue({ id: 'c1' }),
  listFiles: vi.fn().mockResolvedValue({ files: [] }),
  getUsage: vi.fn().mockResolvedValue({ fiveHour: null, weekly: null }),
  pathForFile: vi.fn(() => ''),
}
// 미지정 IPC는 graceful 빈 resolve (mount 부수효과 안전)
const apiProxy = new Proxy(baseApi, {
  get(t, p: string) {
    return p in t ? t[p] : vi.fn().mockResolvedValue({})
  },
})
// window 교체 금지(jsdom document 연결 보존) — api 프로퍼티만 주입
;(window as unknown as Record<string, unknown>).api = apiProxy

async function setStore(patch: Record<string, unknown>) {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  useAppStore.setState({
    thread: [] as ThreadItem[],
    messages: [],
    streamingText: '',
    toolCards: [],
    isRunning: false,
    errorMessage: undefined,
    openGroupId: null,
    openMsgId: null,
    seq: 0,
    activeLoop: null,
    queue: [],
    workspaceRoot: '/proj',
    ...patch,
  } as Parameters<typeof useAppStore.setState>[0])
}

async function getStore() {
  const { useAppStore } = await import('../../src/renderer/src/store/appStore')
  return useAppStore
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

async function renderConv() {
  // Phase 5a 조정: 앱 레벨 /loop 인터셉트는 replMode OFF(단발 모드)에서만 동작.
  // replMode ON(기본)이면 /loop가 SDK로 흘러감(ADR-024) — 인터셉트 테스트는 OFF 명시.
  await setStore({ replMode: false })
  const { Conversation } = await import('../../src/renderer/src/components/01_conversation/Conversation')
  const r = await act(async () => render(<Conversation />))
  return r
}

async function typeAndEnter(container: HTMLElement, text: string) {
  const ta = container.querySelector('textarea') as HTMLTextAreaElement
  await act(async () => {
    fireEvent.change(ta, { target: { value: text } })
  })
  await act(async () => {
    fireEvent.keyDown(ta, { key: 'Enter' })
  })
}

describe('Conversation — /loop 인터셉트 (🔴#1 SDK 누수 차단)', () => {
  it('/loop 30s do X → SDK엔 내부 프롬프트(do X)만, /loop 원문 누수 0', async () => {
    const { container } = await renderConv()
    await typeAndEnter(container, '/loop 30s do X')

    expect(agentRun).toHaveBeenCalledTimes(1)
    const arg = agentRun.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> }
    const last = arg.messages[arg.messages.length - 1]
    expect(last.content).toBe('do X')
    // '/loop' 원문이 SDK 메시지 어디에도 새지 않음
    expect(JSON.stringify(arg.messages)).not.toContain('/loop')
  })

  it('/loop 30s do X → activeLoop 등록(prompt/interval) + 첫 틱 카운트 1', async () => {
    const { container } = await renderConv()
    await typeAndEnter(container, '/loop 30s do X')

    const store = await getStore()
    const loop = store.getState().activeLoop
    expect(loop?.prompt).toBe('do X')
    expect(loop?.intervalMs).toBe(30_000)
    expect(loop?.status).toBe('running')
    expect(loop?.tickCount).toBe(1) // 즉시 첫 틱 발사
  })

  it('/loop stop → SDK 호출 0(평문 누수 0) + activeLoop 해제', async () => {
    const store = await getStore()
    const { container } = await renderConv()
    // 루프 활성 상태에서 정지 명령
    act(() => store.getState().startLoop({ prompt: 'x', intervalMs: 5_000 }))
    await typeAndEnter(container, '/loop stop')

    expect(agentRun).not.toHaveBeenCalled()
    expect(store.getState().activeLoop).toBeNull()
  })

  it('인디케이터 렌더 — 활성 루프 시 .loop-indicator 표시', async () => {
    const store = await getStore()
    const { container } = await renderConv()
    await act(async () => {
      store.getState().startLoop({ prompt: '반복작업', intervalMs: 60_000 })
    })
    // 리렌더 후 인디케이터 노출
    expect(container.querySelector('.loop-indicator')).toBeTruthy()
  })
})
