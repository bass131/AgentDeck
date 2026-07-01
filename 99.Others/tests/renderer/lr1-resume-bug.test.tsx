// @vitest-environment jsdom
/**
 * lr1-resume-bug.test.tsx — LR1: 멀티패널 resume 체인 특성화(회귀 방어).
 *
 * ⚠️ 이력(중요): 이 파일은 원래 Phase 01의 "flush 내구성 갭" 가설(_resume-bug-diagnosis.md §3)을
 *   RED로 캡처했으나, **그 가설은 §6/§7에서 반증**됐다. 진짜 원인은 flush가 아니라 단일채팅
 *   `CONVERSATION_SAVE` 핸들러의 sessionId drop이었고 `fa9df22`로 수정됐다. flush 하드닝
 *   (beforeunload)은 건강한 멀티패널 경로를 반증된 가설로 손대는 것이라 되돌렸고, 그 짝인
 *   RED 그룹도 함께 제거했다. 남긴 것은 아래 **멀티패널 resume 체인 특성화**뿐이다.
 *
 * 남은 목적: 멀티패널(usePanelSession + useMultiPersist)의 resume 체인
 *   (turn → sessionId 세팅 → 디바운스 저장 → 재시작 복원 → 다음 send가 resumeSessionId 주입)이
 *   정상 작동함을 고정한다. **Phase 02(transcript 폴백)가 claudeAgentRun 공용 헬퍼를 건드리므로,
 *   멀티패널 경로가 깨지지 않았는지 지키는 회귀 방어**로도 유효하다.
 *
 * CRITICAL: window.api 화이트리스트 호출만 mock. fs/Node 직접 0. 앱 소스(02.Source) 무변경 — R only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'
import { usePanelSession } from '../../../02.Source/renderer/src/store/panelSession'
import { useMultiPersist } from '../../../02.Source/renderer/src/hooks/useMultiPersist'
import type { AgentEventPayload, PersistedMultiState } from '../../../02.Source/shared/ipc-contract'

// ── 인메모리 "디스크" ─────────────────────────────────────────────────────────
// multi-session-persist-2.test.tsx와 동일 패턴 — save가 쓰고 load가 읽는 단일 진실원.

let _disk: PersistedMultiState | null = null

const mockMultiSessionSave = vi.fn(async (state: PersistedMultiState) => {
  _disk = state
  return { ok: true }
})
const mockMultiSessionLoad = vi.fn(async () => ({ state: _disk }))

// ── onAgentEvent 핸들러 캡처 ───────────────────────────────────────────────────
// usePanelSession() 6개가 마운트 시 각자 1회 구독 → 호출 순서 = s0..s5.

let capturedHandlers: Array<(payload: AgentEventPayload) => void> = []
const mockOnAgentEvent = vi.fn((cb: (payload: AgentEventPayload) => void) => {
  capturedHandlers.push(cb)
  return () => {}
})

let runIdSeq = 0
const mockAgentRun = vi.fn(async (_req: { resumeSessionId?: string }) => ({ runId: `run-${runIdSeq++}` }))
const mockAgentAbort = vi.fn(async () => ({ accepted: true }))

const mockApi = {
  onAgentEvent: mockOnAgentEvent,
  agentRun: mockAgentRun,
  agentAbort: mockAgentAbort,
  multiSessionSave: mockMultiSessionSave,
  multiSessionLoad: mockMultiSessionLoad,
}
Object.defineProperty(window, 'api', { value: mockApi, writable: true, configurable: true })

// ── 테스트 하네스: 6패널 usePanelSession + useMultiPersist ────────────────────
// 실 MultiWorkspace 컴포넌트를 마운트하지 않고 훅 레벨에서 직접 배선을 재현한다.

function useHarness(activeMultiSessionId: string) {
  const s0 = usePanelSession()
  const s1 = usePanelSession()
  const s2 = usePanelSession()
  const s3 = usePanelSession()
  const s4 = usePanelSession()
  const s5 = usePanelSession()
  const sessions = [s0, s1, s2, s3, s4, s5]
  useMultiPersist(sessions, activeMultiSessionId)
  return { sessions }
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 마운트 복원 effect(multiSessionLoad) 완료까지 실시간 대기 (restoredRef=true 허가). */
async function waitForRestore(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

beforeEach(() => {
  _disk = null
  runIdSeq = 0
  capturedHandlers = []
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ═══════════════════════════════════════════════════════════════════════════════
// 멀티패널 resume 체인 특성화: turn → 디바운스 완료 → 저장 → reload → 복원 → resume 주입
// ═══════════════════════════════════════════════════════════════════════════════

describe('멀티패널 resume 체인 — 정상성 (회귀 방어)', () => {
  it('디바운스 완료 후 저장 → 재마운트(재시작 시뮬) 복원 → 다음 send가 resumeSessionId로 주입', async () => {
    const ACTIVE_ID = 'sess-lr1-green'
    const SESSION_ID = 'sess-runtime-green-002'

    // ── 1단계: 최초 세션 — turn → sessionId 세팅 → 디바운스 "완료"까지 대기 ──
    const first = renderHook(() => useHarness(ACTIVE_ID))
    await waitForRestore()

    await act(async () => {
      await first.result.current.sessions[0].send('hello')
    })
    const runId = first.result.current.sessions[0].state.currentRunId as string

    act(() => {
      capturedHandlers[0]({ runId, event: { type: 'session', sessionId: SESSION_ID } })
    })
    expect(first.result.current.sessions[0].state.sessionId).toBe(SESSION_ID)

    // 디바운스 완료까지 실시간 대기(≥500ms) — 정상 운영 중 저장되는 경우를 재현
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700))
    })

    // 디스크에 sessionId가 durable하게 남았어야 한다
    expect(mockMultiSessionSave).toHaveBeenCalled()
    const savedSession = _disk?.sessions.find((s) => s.id === ACTIVE_ID)
    expect(savedSession?.panels[0]?.snapshot?.sessionId).toBe(SESSION_ID)

    // ── 2단계: "재시작" 시뮬 — 언마운트 후 완전히 새 하네스 인스턴스를 같은 activeId로 마운트 ──
    first.unmount()
    cleanup()
    capturedHandlers = []

    const second = renderHook(() => useHarness(ACTIVE_ID))
    await waitForRestore()
    // 마운트 복원 effect 내부 sessions[i].restore(panel.snapshot) dispatch 반영 대기
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })

    // makePanelInitialState(snapshot) 경유 복원 — state.sessionId가 디스크 값으로 되살아나야 함
    expect(second.result.current.sessions[0].state.sessionId).toBe(SESSION_ID)

    // ── 3단계: 복원 후 다음 send()가 resumeSessionId로 주입하는지(panelSession.ts:510) ──
    mockAgentRun.mockClear()
    await act(async () => {
      await second.result.current.sessions[0].send('안녕, 계속할게')
    })
    expect(mockAgentRun).toHaveBeenCalledTimes(1)
    const sentReq = mockAgentRun.mock.calls[0][0]
    expect(sentReq.resumeSessionId).toBe(SESSION_ID)

    second.unmount()
  })
})
