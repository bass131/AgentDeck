// @vitest-environment jsdom
/**
 * gap1-p15-r1-s3-interrupted-marker.test.tsx — GAP1 P15 라운드1 시드 S3 RED.
 *
 * 결함(라운드 0 시드): 인터럽트/abort로 스트리밍이 잘렸을 때 "중단됨" 표시는
 * cmdresult 카드(closeAbortedCommandCard — reducer/helpers.ts:57)에만 있고, 잘린
 * **assistant 텍스트 메시지**에는 아무 마커가 없다 — 대화 기록만 보면 문장이 뚝 끊긴
 * 미완성 답변인지, 원래 그렇게 끝난 답변인지 구분 불가(dogfood 관찰).
 *
 * 기대 스펙(coordinator 확정, interface-of-record — 봉합은 renderer Worker):
 *   [store 레벨] 인터럽트/abort 시점에 스트리밍 중이던 assistant msg(= state.openMsgId가
 *   가리키는 ThreadItem)에 `interrupted: true`(additive 필드, threadTypes.ts 'msg' variant)를
 *   남긴다. 경로 2곳:
 *     - abortRun 로컬 정리(runtime.ts:359 set — closeAbortedCommandCard와 같은 마디).
 *     - interruptRun accepted:true(runtime.ts:436 — 세션 유지 경로. main이 이후 error를
 *       suppress하고 done만 보내므로(BF1 P03) renderer가 요청 시점에 직접 마킹해야 한다).
 *     openMsgId가 null이면(스트리밍 텍스트 없음 — 도구 실행 중 등) 마킹 없음(no-op).
 *   [렌더 레벨] interrupted:true인 assistant msg는 `.msg.ai-msg` 안에 `[data-interrupted]`
 *   마커 요소(텍스트 '중단됨' 포함)를 렌더한다. 필드 없으면 마커 미렌더(기존 회귀 0).
 *
 * TDD 상태: RED 3건(store 2 + 렌더 1) + 대조군 GREEN 1건(마커 미지정 msg에 마커 없음).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { makeInitialState } from '../../../02.Source/renderer/src/store/reducer'
import type { ThreadItem } from '../../../02.Source/renderer/src/store/threadTypes'

// ── window.api mock (fb-run-failed-cleanup.test.tsx 관례 미러) ────────────────
const mockApi = {
  conversationLoad: vi.fn(async () => ({ conversations: [] })),
  conversationSave: vi.fn(async () => ({ id: 'cv-1' })),
  listConversations: vi.fn(async () => ({ conversations: [] })),
  agentRun: vi.fn(async () => ({ runId: 'r1' })),
  agentAbort: vi.fn(async () => ({ accepted: true })),
  agentInterrupt: vi.fn(async () => ({ accepted: true })),
  onAgentEvent: vi.fn(() => () => {}),
  listFiles: vi.fn(async () => ({ files: [] })),
  pathForFile: () => '',
  saveImageData: vi.fn(async () => ({ path: '' })),
  workspaceOpen: vi.fn(async () => ({ rootPath: null, tree: null })),
  referenceList: vi.fn(async () => ({ references: [] })),
  referenceTree: vi.fn(async () => ({ tree: null })),
  referenceAdd: vi.fn(async () => ({ reference: null })),
  fsRead: vi.fn(async () => ({ kind: 'not-found' })),
  permissionRespond: vi.fn(async () => ({ ok: true })),
  questionRespond: vi.fn(async () => ({ ok: true })),
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

/** 스트리밍 중(열린 버블) assistant msg가 있는 thread 픽스처. */
function streamingThread(): ThreadItem[] {
  return [
    { kind: 'msg', id: 'u1', role: 'user', text: '긴 답변 부탁' },
    { kind: 'msg', id: 'a1', role: 'assistant', text: '첫 문장까지 쓰다가 잘린' },
  ]
}

async function seedRunningStore(): Promise<void> {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  useAppStore.setState({
    ...makeInitialState(),
    thread: streamingThread(),
    openMsgId: 'a1', // 열린(스트리밍 중) assistant 버블 포인터 — 마킹 대상 판별 소스
    isRunning: true,
    currentRunId: 'r1',
    runGeneration: null,
    conversationId: null,
    activeLoops: [],
    pendingCommand: null,
    queue: [],
  } as Parameters<typeof useAppStore.setState>[0])
}

/** additive 필드 접근 헬퍼 — ThreadItem 타입에 아직 없는 interrupted를 typecheck-green으로 읽는다. */
function interruptedOf(item: ThreadItem | undefined): unknown {
  return (item as unknown as Record<string, unknown> | undefined)?.['interrupted']
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi.agentAbort.mockResolvedValue({ accepted: true })
  mockApi.agentInterrupt.mockResolvedValue({ accepted: true })
})
afterEach(() => cleanup())

describe('GAP1 P15-R1 S3 — store: 잘린 assistant msg에 interrupted 표식 (RED)', () => {
  it('abortRun 로컬 정리 → openMsgId가 가리키던 assistant msg에 interrupted:true', async () => {
    await seedRunningStore()
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    await act(async () => {
      await useAppStore.getState().abortRun()
    })
    const a1 = useAppStore.getState().thread.find((t) => t.kind === 'msg' && t.id === 'a1')
    expect(a1).toBeTruthy()
    // 현행: closeAbortedCommandCard/OrchestrationCards만 처리 — msg 마킹 없음 → RED.
    expect(interruptedOf(a1)).toBe(true)
    // 텍스트는 보존(잘린 데까지 그대로 — 마커는 additive).
    expect(a1 && a1.kind === 'msg' && a1.text).toBe('첫 문장까지 쓰다가 잘린')
  })

  it('interruptRun accepted:true → openMsgId가 가리키던 assistant msg에 interrupted:true (세션 유지 경로)', async () => {
    await seedRunningStore()
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    await act(async () => {
      await useAppStore.getState().interruptRun()
    })
    expect(mockApi.agentInterrupt).toHaveBeenCalledWith({ runId: 'r1' })
    const a1 = useAppStore.getState().thread.find((t) => t.kind === 'msg' && t.id === 'a1')
    // 현행: accepted:true면 아무것도 하지 않고 return → RED.
    expect(interruptedOf(a1)).toBe(true)
  })
})

describe('GAP1 P15-R1 S3 — 렌더: interrupted msg에 "중단됨" 마커 (RED)', () => {
  async function renderConversationWith(thread: ThreadItem[]): Promise<HTMLElement> {
    const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.setState({
      ...makeInitialState(),
      thread,
      isRunning: false,
      openMsgId: null,
    } as Parameters<typeof useAppStore.setState>[0])
    const { Conversation } = await import(
      '../../../02.Source/renderer/src/components/01_conversation/Conversation'
    )
    const { container } = await act(async () => render(<Conversation />))
    return container
  }

  it("interrupted:true assistant msg → .msg.ai-msg 안에 [data-interrupted] 마커 + '중단됨' 텍스트", async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'u1', role: 'user', text: '질문' },
      // additive 필드 — 타입 반영 전이라 캐스트로 주입(구현이 threadTypes에 필드 추가).
      { kind: 'msg', id: 'a1', role: 'assistant', text: '잘린 답변', interrupted: true } as unknown as ThreadItem,
    ]
    const container = await renderConversationWith(thread)
    const marker = container.querySelector('.msg.ai-msg [data-interrupted]')
    // 현행: 마커 렌더 자체가 없음 → RED.
    expect(marker).toBeTruthy()
    expect(marker?.textContent).toContain('중단됨')
  })

  it('대조군(GREEN 유지): interrupted 미지정 msg엔 마커 없음 — 기존 렌더 회귀 0', async () => {
    const thread: ThreadItem[] = [
      { kind: 'msg', id: 'a2', role: 'assistant', text: '정상 완료 답변' },
    ]
    const container = await renderConversationWith(thread)
    expect(container.querySelector('[data-interrupted]')).toBeNull()
    expect(container.textContent).not.toContain('중단됨')
  })
})
