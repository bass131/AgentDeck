// @vitest-environment jsdom
/**
 * bf3-p05-multipersist-restore-race.test.tsx — BF3 Phase 05: useMultiPersist 마운트 복원 레이스.
 *
 * 배경(01.Phases/LR3-loop-ux/07-multipanel-continuity-DONE.md §범위 밖 발견, :134-139):
 * 마운트 복원 effect가 자기 세션 id(activeMultiSessionId)를 디스크에서 못 찾으면
 * res.state.activeSessionId(디스크가 마지막으로 기록한 "누군가의" 활성 id)로 폴백하는데,
 * 신규(디스크에 한 번도 저장 안 된) 세션이 이 폴백 시점에 다른 세션의 언마운트-플러시
 * 저장(그 세션 자신의 id를 activeSessionId로 다시 씀)과 경합하면 잘못된 세션의 스냅샷을
 * 상속할 수 있다 — 6건 백로그 중 유일하게 사용자 데이터가 오염되는 실질 버그.
 *
 * 재현 전략(결정론적 — 실시간 대기/setTimeout 0, LR3-P07 교훈 2 준수): useMultiPersist
 * 훅을 renderHook으로 직접 구동하고 mock PanelSessionHookResult[]를 주입한다.
 * "신규 세션(New)의 마운트 복원 read"를 deferred promise로 붙잡아 pending 상태로 두고,
 * 그 사이 "기존 세션(Old)의 언마운트-플러시 저장"이 먼저 디스크에 완전히 랜딩하게 한
 * 뒤에야 New의 read를 resolve한다 — main 프로세스가 두 IPC 요청을 프로그램 순서와
 * 다르게 처리할 수 있는 실제 상황을 promise 해소 순서로 정확히 고정 재현한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiPersist } from '../../../02.Source/renderer/src/hooks/useMultiPersist'
import { makePanelInitialState } from '../../../02.Source/renderer/src/store/panelSession'
import type { PanelSessionHookResult } from '../../../02.Source/renderer/src/store/panelSession'
import type { PersistedMultiState } from '../../../02.Source/shared/ipc-contract'
import { makeMultiCmdMocks } from './helpers/multiCmdMock'

// ── window.api mock ───────────────────────────────────────────────────────────
// RMW1-P04/P05: 저장(flush)은 이제 multiCmdUpsert(명령 1발) 경유 — 통짜 SAVE(P05 제거)는
// 더 이상 존재하지 않는다. multiCmdUpsert는 main의 실제 순수 병합 함수(upsertSession)를
// 재사용하는 helpers/multiCmdMock.ts로 위임(getDisk/setDisk를 이 파일의 `_disk`에 연결).

let _disk: PersistedMultiState | null = null

const mockMultiSessionLoad = vi.fn()
const { multiCmdUpsert: mockMultiCmdUpsert } = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

Object.defineProperty(window, 'api', {
  value: { multiSessionLoad: mockMultiSessionLoad, multiCmdUpsert: mockMultiCmdUpsert },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  _disk = null
  // 기본: 호출 시점의 _disk를 즉시 반환(디바운스 저장 effect의 RMW read 등 New/Old 자신의
  // 후속 read가 여기 걸린다 — mockReturnValueOnce로 딱 1회만 예외를 준다).
  mockMultiSessionLoad.mockImplementation(async () => ({ state: _disk }))
})

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 6개 mock PanelSessionHookResult — restore는 spy(상속 여부 단언용), state는 초기값. */
function makeMockSessions(): PanelSessionHookResult[] {
  return Array.from({ length: 6 }, () => ({
    state: makePanelInitialState(),
    send: vi.fn(),
    abort: vi.fn(),
    restore: vi.fn(),
    dismissLoopsStopped: vi.fn(),
    respondPermission: vi.fn(),
  }))
}

/** 마이크로태스크 큐를 N tick 비운다 — 실시간 대기(setTimeout) 없이 pending promise 체인을 흘려보낸다. */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('BF3 Phase 05 — 신규 세션 마운트 복원이 타 세션의 언마운트-플러시 저장과 경합해도 스냅샷을 상속하지 않는다', () => {
  it('New(디스크 이력 0)의 복원 read가 pending인 동안 Old의 flush 저장이 먼저 랜딩해도, New는 Old의 스냅샷을 상속하지 않는다', async () => {
    const SID_OLD = 'sess-old-established'
    const SID_NEW = 'sess-new-never-saved'

    // 초기 디스크: Old만 존재(스냅샷 없음, 빈 패널) — New는 디스크에 전혀 없음(최초 생성 직후).
    _disk = {
      version: 2,
      activeSessionId: SID_OLD,
      sessions: [{ id: SID_OLD, title: 'Old', count: 6, panels: [] }],
    }

    // New의 마운트 복원 read를 deferred로 붙잡아 둔다 — 순서를 테스트가 쥐고 흔든다.
    let resolveNewLoad!: (v: { state: PersistedMultiState | null }) => void
    const newLoadDeferred = new Promise<{ state: PersistedMultiState | null }>((resolve) => {
      resolveNewLoad = resolve
    })
    mockMultiSessionLoad.mockReturnValueOnce(newLoadDeferred)

    const newSessions = makeMockSessions()
    const { result: newResult } = renderHook(() => useMultiPersist(newSessions, SID_NEW))

    // New의 read가 호출됐다(=call #1, deferred 소비) — 아직 resolve 안 함(pending).
    expect(mockMultiSessionLoad).toHaveBeenCalledTimes(1)

    // Old 세션의 실제 라이브 진행(메시지)을 구성 — Old 자신의 훅 인스턴스가 flush 시
    // buildActiveSession()으로 이 thread를 스냅샷화한다.
    const oldSessions = makeMockSessions()
    oldSessions[0] = {
      ...oldSessions[0],
      state: {
        ...oldSessions[0].state,
        thread: [{ kind: 'msg', id: 'old-1', role: 'user', text: 'OLD 전용 메시지' }],
      },
    }
    const oldHook = renderHook(() => useMultiPersist(oldSessions, SID_OLD))

    // Old 자신의 마운트 복원 read(call #2, 기본 구현 — 즉시 _disk 반환)가 끝나고
    // restoredRef=true + 상태 변경(setPanelMetas 등, re-render) → 저장 effect가 pending 타이머를 건다.
    await act(async () => {
      await flushMicrotasks()
    })

    // Old 언마운트(모드 전환/세션 전환 시뮬) → cleanup에서 pending 타이머 flush(즉시 RMW save).
    act(() => {
      oldHook.unmount()
    })

    // flush 저장(자기 read → write)이 완전히 랜딩할 때까지 마이크로태스크를 흘려보낸다.
    await act(async () => {
      await flushMicrotasks()
    })

    // Old의 flush write가 디스크에 랜딩했는지 사전 확인(레이스의 전제 조건).
    expect(mockMultiCmdUpsert).toHaveBeenCalled()
    expect(_disk?.activeSessionId).toBe(SID_OLD)
    expect(
      _disk?.sessions.find((s) => s.id === SID_OLD)?.panels[0]?.snapshot?.messages[0]?.text
    ).toBe('OLD 전용 메시지')

    // 이제 New의 read를 resolve — "main이 New의 read를 Old의 write 완료 후 처리"를 모델링.
    await act(async () => {
      resolveNewLoad({ state: _disk })
      await flushMicrotasks()
    })

    // 불변조건(BF3 Phase05): 엉뚱한 세션 데이터는 절대 상속 금지.
    newSessions.forEach((s) => {
      expect(s.restore).not.toHaveBeenCalled()
    })
    // 보조 신호: New의 영속 상태(count)도 Old(6)로 오염되지 않아야 한다(기본값 4 유지).
    expect(newResult.current.count).toBe(4)
  })
})
