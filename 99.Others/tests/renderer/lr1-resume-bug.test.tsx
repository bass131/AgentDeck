// @vitest-environment jsdom
/**
 * lr1-resume-bug.test.tsx — LR1 Phase 01: resume 버그 RED 테스트 + 체인 GREEN 특성화.
 *
 * 배경(_resume-bug-diagnosis.md 정적 진단):
 *   - 후보②(held-open이 resumeSessionId 미사용) 반증 — 공용 buildClaudeSdkOptions 경유(별도 파일 테스트).
 *   - 유력 원인 = 후보① 정제형: "flush 내구성 갭". renderer 멀티세션 영속(sessionId 포함)은
 *     (a) 500ms 디바운스 또는 (b) React 언마운트(useMultiPersist.ts:279-292)에만 의존한다.
 *     main의 before-quit(index.ts:93)은 renderer flush를 트리거하지 않는다.
 *     → PC 종료/절전(급작 kill)·일반 앱 종료 시, 디바운스 창(500ms) 안에 있던 최신 sessionId가
 *       디스크에 미반영될 수 있다.
 *
 * 이 파일의 두 그룹:
 *   1. RED  — "종료-시 flush 부재": 세션 이벤트로 sessionId가 세팅된 직후(디바운스 완료 전,
 *      React 언마운트 없이) 'beforeunload'(앱 종료의 표준 렌더러 신호 — 원인노트 §4가
 *      Phase02 후보로 명시한 beforeunload/before-quit 중 beforeunload를 모사)를 디스크패치해도
 *      현재는 아무 것도 flush하지 않는다 → sessionId가 디스크에 안 남음 → **fail이 정상(RED)**.
 *      Phase02가 beforeunload(or 동등한 종료 신호) 리스너로 flush를 추가하면 이 테스트가 green.
 *   2. GREEN(특성화) — 동일 하네스에서 디바운스를 "완료"까지 기다리면 정상 저장되고,
 *      새 인스턴스로 재마운트(=재시작 시뮬)하면 sessionId가 복원되어 다음 send()의
 *      resumeSessionId로 주입됨을 확인한다. RED 테스트의 실패가 하네스/모킹 결함이 아니라
 *      "조기 종료" 시나리오에 국한된 진짜 갭임을 이 쌍으로 증명한다(false RED 방지).
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
// 1. RED — 종료-시 flush 부재 (flush 내구성 갭)
// ═══════════════════════════════════════════════════════════════════════════════

describe('RED — 종료-시 flush 부재 (LR1 Phase01, _resume-bug-diagnosis.md §3)', () => {
  it('디바운스(500ms) 완료 전 + 언마운트 없이 beforeunload 발생 → sessionId가 디스크에 남아야 하지만 현재는 안 남는다', async () => {
    const ACTIVE_ID = 'sess-lr1-red'
    const SESSION_ID = 'sess-runtime-red-001'

    const { result } = renderHook(() => useHarness(ACTIVE_ID))
    await waitForRestore()

    // turn 시작: panel0.send() → agentRun mock → SET_RUN_ID
    await act(async () => {
      await result.current.sessions[0].send('hello')
    })
    const runId = result.current.sessions[0].state.currentRunId
    expect(typeof runId).toBe('string')

    // ⚠️ false RED 방지 1단계: send()가 만든 "베이스라인" 디바운스 타이머를 완전히
    // 흘려보낸다(≥500ms 실시간 대기). useMultiPersist.ts의 debounce effect cleanup은
    // React 표준 동작상 "재실행 시에도" 실행되므로(언마운트 전용이 아님), 만약 이 baseline
    // 타이머가 아직 pending인 채로 다음 상태변화(session 이벤트)가 곧바로 들어오면 그 cleanup이
    // "pending 타이머 있음"으로 오인해 즉시 flush해버려 갭이 가려진다(관찰됨 — false RED 사례).
    // 여기서 완전히 정착(settle)시켜 saveTimerRef를 null로 비운 뒤, 아래에서 "직전 turn의
    // 마지막(고립된) 상태변화"만 격리해 재현한다 — 실제 버그 시나리오(유휴 후 갑작스런 종료)와 일치.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 650))
    })
    mockMultiSessionSave.mockClear() // baseline save(있었다면) 기록 제거 — 이후 assert를 격리

    // 정밀한 디바운스-미완 구간 재현: 여기서부터 fake timer로 전환.
    // (이 시점에는 pending 실타이머가 없음 — 위 650ms 정착으로 saveTimerRef=null 보장)
    vi.useFakeTimers()

    // session 이벤트 도착 → state.sessionId 세팅 (panelApply → applyAgentEvent → handleSession)
    // 이 상태변화 "하나만" 고립시켜야 진짜 갭을 잡는다 — 뒤이은 추가 상태변화 없음.
    act(() => {
      capturedHandlers[0]({ runId: runId as string, event: { type: 'session', sessionId: SESSION_ID } })
    })
    expect(result.current.sessions[0].state.sessionId).toBe(SESSION_ID)

    // 디바운스 창(500ms) 안에서 정지 — 완료 전임을 명시적으로 재확인
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(mockMultiSessionSave).not.toHaveBeenCalled() // 아직 디바운스 안 끝남 (사전조건 확인)

    // "앱 종료" 모사: beforeunload(원인노트 §4 Phase02 후보 신호) 디스패치.
    // 언마운트는 절대 발생시키지 않는다 — held-open in-memory 세션에 의존하지 않는 디스크 전용 경로 검증.
    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'))
      await Promise.resolve()
    })

    // ── 버그 캡처 지점 ──────────────────────────────────────────────────────
    // 기대(수정 후 목표): 종료 신호에 sessionId가 디스크에 durable하게 남아야 한다.
    // 현재: beforeunload 리스너가 renderer에 전혀 없음(useMultiPersist.ts 전체에 부재,
    // grep 결과 확인됨) → save가 한 번도 발화하지 않아 disk는 여전히 null.
    // 이 assert가 fail하는 것이 RED — Phase02가 flush 리스너를 추가하면 green.
    const savedSession = _disk?.sessions.find((s) => s.id === ACTIVE_ID)
    const savedSessionId = savedSession?.panels[0]?.snapshot?.sessionId
    expect(savedSessionId).toBe(SESSION_ID)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. GREEN(특성화) — 체인 정상성: turn → 디바운스 완료 → 저장 → reload → 복원 → resume 주입
// ═══════════════════════════════════════════════════════════════════════════════

describe('GREEN 특성화 — 체인 정상성 (배선은 온전, 갭은 "내구성"이지 "배선"이 아님)', () => {
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

    // 디스크에 sessionId가 durable하게 남았어야 한다 (RED 테스트의 쌍둥이 — 여기선 통과해야 함)
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
