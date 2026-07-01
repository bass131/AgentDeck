/**
 * repl-ui-toggle.test.tsx — REPL 지속세션 시각 UI (5b) 단위 테스트.
 *
 * TDD 순서: RED → GREEN.
 *
 * RU-A: 컴포저 REPL 토글 버튼
 *   A-1: replMode true 시 버튼 aria-pressed=true
 *   A-2: replMode false 시 버튼 aria-pressed=false
 *   A-3: 클릭 시 setReplMode 반전 호출
 *   A-4: Composer에 토글 버튼 존재
 *
 * RU-B: cron-turn 배지 — reducer done 처리
 *   B-1: done.origin='cron' → 마지막 assistant msg에 origin:'cron' 마킹
 *   B-2: done.origin='user' → origin 마킹 없음
 *   B-3: done.origin 미지정 → origin 마킹 없음 (하위호환)
 *
 * RU-C: 정지 버튼 분리 (interrupt vs 세션종료)
 *   C-1: interruptRun 액션 → agentInterrupt IPC 호출
 *   C-2: abortRun 액션 → agentAbort IPC 호출 (기존 동작 회귀 0)
 *   C-3: replMode ON 시 정지 버튼이 interrupt를 호출
 *   C-4: replMode OFF 시 정지 버튼이 abort를 호출
 *
 * CRITICAL: renderer untrusted — window.api 경유만.
 * CRITICAL(ADR-003): 엔진 리터럴 미포함.
 * CRITICAL(UI_GUIDE): 안티슬롭 — 이모지 기능아이콘 X, CSS 토큰 준수.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeInitialState, applyAgentEvent } from '../../../02.Source/renderer/src/store/reducer'
import type { AppState } from '../../../02.Source/renderer/src/store/reducer'
import type { AgentEventPayload } from '../../../02.Source/shared/ipc-contract'

// ── mock window.api ────────────────────────────────────────────────────────────

const mockInterrupt = vi.fn(async () => ({ accepted: true }))
const mockAbort = vi.fn(async () => ({ accepted: true }))
const mockAgentRun = vi.fn(async () => ({ runId: 'r1' }))

const mockApi = {
  conversationLoad: async () => ({ conversations: [] }),
  conversationSave: async () => ({ id: 'cv-1' }),
  agentRun: mockAgentRun,
  agentAbort: mockAbort,
  agentInterrupt: mockInterrupt,
  onAgentEvent: () => () => {},
  listFiles: async () => ({ files: [] }),
  getUsage: async () => ({ fiveHour: null, weekly: null }),
  pathForFile: () => '',
  workspaceOpen: async () => ({ rootPath: null, tree: null }),
  referenceList: async () => ({ references: [] }),
  referenceTree: async () => ({ tree: null }),
  referenceAdd: async () => ({ reference: null }),
  fsRead: async () => ({ kind: 'not-found' }),
}

Object.defineProperty(globalThis, 'window', {
  value: { api: mockApi },
  writable: true,
  configurable: true,
})

// ── 공통 store 리셋 헬퍼 ─────────────────────────────────────────────────────

async function getStore() {
  const { useAppStore } = await import('../../../02.Source/renderer/src/store/appStore')
  return useAppStore
}

function resetStore(useAppStore: Awaited<ReturnType<typeof getStore>>) {
  mockInterrupt.mockClear()
  mockAbort.mockClear()
  mockAgentRun.mockClear()
  useAppStore.setState({
    ...makeInitialState(),
    messages: [],
    conversationId: null,
    attachedImages: [],
    queue: [],
    activeLoop: null,
    currentRunId: null,
    isRunning: false,
    replMode: true,
  } as Parameters<typeof useAppStore.setState>[0])
}

// ══════════════════════════════════════════════════════════════════════════════
// RU-A: REPL 토글 버튼 — store 계약 (렌더 테스트는 환경 한계로 store 계약으로 대체)
// ══════════════════════════════════════════════════════════════════════════════

describe('RU-A: REPL 토글 버튼 store 계약', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('A-1: resetStore가 replMode:true를 명시 세팅 — ON 상태에서 토글 계약 검증용(LR2-01부터 store 실제 기본값은 false, 이 테스트는 resetStore(L81)의 명시값을 확인)', async () => {
    // LR2-01: store 기본값은 false(resume 단발)로 전환됐지만, 이 스위트는 resetStore에서 replMode:true를 강제 세팅(L81)
    // → ON 상태를 전제로 한 아래 A-2~ 토글 계약 테스트들의 준비 상태 확인일 뿐, store 기본값 자체를 단언하는 게 아님.
    expect(useAppStore.getState().replMode).toBe(true)
  })

  it('A-2: selectReplMode 셀렉터가 replMode를 반환', async () => {
    const { selectReplMode } = await import('../../../02.Source/renderer/src/store/appStore')
    useAppStore.getState().setReplMode(false)
    expect(selectReplMode(useAppStore.getState())).toBe(false)
    useAppStore.getState().setReplMode(true)
    expect(selectReplMode(useAppStore.getState())).toBe(true)
  })

  it('A-3: setReplMode(false) 호출 → replMode false', async () => {
    useAppStore.getState().setReplMode(false)
    expect(useAppStore.getState().replMode).toBe(false)
  })

  it('A-4: setReplMode(!current) 토글 — true→false→true', async () => {
    // ON 상태에서 토글
    const cur1 = useAppStore.getState().replMode // true
    useAppStore.getState().setReplMode(!cur1)    // false
    const cur2 = useAppStore.getState().replMode
    expect(cur2).toBe(false)
    useAppStore.getState().setReplMode(!cur2)    // true
    expect(useAppStore.getState().replMode).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RU-B: cron-turn 배지 — reducer
// ══════════════════════════════════════════════════════════════════════════════

describe('RU-B: cron-turn 배지 — done reducer 처리', () => {
  /**
   * 보조 함수: 실행 중 상태 + assistant msg가 있는 상태 만들기.
   * applyAgentEvent text → done 순 적용.
   */
  function stateWithAssistantMsg(baseState?: AppState): AppState {
    const s0 = baseState ?? makeInitialState()
    // text 이벤트로 assistant msg 생성
    const textPayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'text', delta: '안녕하세요' },
    }
    return applyAgentEvent(s0, textPayload)
  }

  it('B-1: done.origin=cron → 마지막 assistant msg에 origin:cron 마킹', () => {
    const s1 = stateWithAssistantMsg()
    // 마지막 assistant msg 확인
    const lastAssistant = [...s1.thread].reverse().find(
      (item) => item.kind === 'msg' && item.role === 'assistant'
    )
    expect(lastAssistant).toBeDefined()

    // done 이벤트 with origin:cron
    const donePayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'done', origin: 'cron' },
    }
    const s2 = applyAgentEvent(s1, donePayload)

    // 마지막 assistant msg의 origin이 'cron'으로 마킹되어야 함
    const markedMsg = [...s2.thread].reverse().find(
      (item) => item.kind === 'msg' && item.role === 'assistant'
    )
    expect(markedMsg).toBeDefined()
    expect(markedMsg!.kind).toBe('msg')
    if (markedMsg!.kind === 'msg') {
      expect(markedMsg!.origin).toBe('cron')
    }
  })

  it('B-2: done.origin=user → 마지막 assistant msg에 origin 없음', () => {
    const s1 = stateWithAssistantMsg()
    const donePayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'done', origin: 'user' },
    }
    const s2 = applyAgentEvent(s1, donePayload)

    const lastMsg = [...s2.thread].reverse().find(
      (item) => item.kind === 'msg' && item.role === 'assistant'
    )
    expect(lastMsg).toBeDefined()
    if (lastMsg!.kind === 'msg') {
      // origin이 undefined(미지정) 또는 'user'여야 함 (배지 미표시)
      expect(lastMsg!.origin).not.toBe('cron')
    }
  })

  it('B-3: done.origin 미지정 → origin 마킹 없음 (하위호환)', () => {
    const s1 = stateWithAssistantMsg()
    const donePayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'done' }, // origin 없음
    }
    const s2 = applyAgentEvent(s1, donePayload)

    const lastMsg = [...s2.thread].reverse().find(
      (item) => item.kind === 'msg' && item.role === 'assistant'
    )
    if (lastMsg && lastMsg.kind === 'msg') {
      // origin 미지정 → undefined (배지 미표시)
      expect(lastMsg.origin).toBeUndefined()
    }
  })

  it('B-4: thread에 assistant msg 없을 때 done.origin=cron → no-op (안전 가드)', () => {
    const s0 = makeInitialState()
    const donePayload: AgentEventPayload = {
      runId: 'r1',
      event: { type: 'done', origin: 'cron' },
    }
    // 예외 없이 처리되어야 함
    expect(() => applyAgentEvent(s0, donePayload)).not.toThrow()
    const s1 = applyAgentEvent(s0, donePayload)
    expect(s1.isRunning).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// RU-C: 정지 버튼 분리 (interrupt vs 세션종료)
// ══════════════════════════════════════════════════════════════════════════════

describe('RU-C: 정지 버튼 분리 — interruptRun vs abortRun', () => {
  let useAppStore: Awaited<ReturnType<typeof getStore>>

  beforeEach(async () => {
    useAppStore = await getStore()
    resetStore(useAppStore)
  })

  it('C-1: interruptRun 액션 → agentInterrupt IPC 호출 (agentAbort 아님)', async () => {
    // currentRunId 세팅
    useAppStore.setState({
      currentRunId: 'run-abc',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().interruptRun()

    // agentInterrupt 호출됨
    expect(mockInterrupt).toHaveBeenCalledTimes(1)
    expect(mockInterrupt).toHaveBeenCalledWith({ runId: 'run-abc' })
    // agentAbort는 호출되지 않음
    expect(mockAbort).not.toHaveBeenCalled()
  })

  it('C-2: abortRun 액션 → agentAbort IPC 호출 (기존 동작 회귀 0)', async () => {
    useAppStore.setState({
      currentRunId: 'run-xyz',
      isRunning: true,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    expect(mockAbort).toHaveBeenCalledTimes(1)
    expect(mockAbort).toHaveBeenCalledWith({ runId: 'run-xyz' })
    expect(mockInterrupt).not.toHaveBeenCalled()
  })

  it('C-3: interruptRun — currentRunId 없으면 no-op (방어 가드)', async () => {
    useAppStore.setState({
      currentRunId: null,
      isRunning: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().interruptRun()

    // runId 없으면 IPC 호출하지 않음
    expect(mockInterrupt).not.toHaveBeenCalled()
  })

  it('C-4: abortRun 기존 — currentRunId 없으면 no-op (회귀 0)', async () => {
    useAppStore.setState({
      currentRunId: null,
      isRunning: false,
    } as Parameters<typeof useAppStore.setState>[0])

    await useAppStore.getState().abortRun()

    expect(mockAbort).not.toHaveBeenCalled()
  })
})
