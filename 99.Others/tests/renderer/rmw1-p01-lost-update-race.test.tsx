// @vitest-environment jsdom
/**
 * rmw1-p01-lost-update-race.test.tsx — RMW1 Phase 01: multi-agent.json 분산 RMW
 * lost-update 결정론적 재현 (TDD RED).
 *
 * 배경(00.Documents/ADR.md ADR-031): `useMultiPersist.performRmwSave` / `slices/multiSession.ts`의
 * 5개 CRUD 액션은 전부 "디스크 read → 메모리에서 수정 → 디스크 write" 2단 RMW(Read-Modify-Write)
 * 패턴이다. 이 read와 write 사이에 *다른* RMW 주체(자동저장 훅 인스턴스, 또는 다른 CRUD 액션)가
 * 끼어들어 자신의 write를 먼저 완전히 landing시키면, 나중에 이어지는 write는 그 끼어든 변경을
 * 전혀 모르는 stale(오래된) 스냅샷을 기반으로 디스크 전체를 덮어쓴다 — 그 사이에 landing된 변경은
 * 통째로 사라진다("lost update"). 이 파일은 그 lost update를 3계열로, 타이밍 운(`setTimeout` 경합)이
 * 아니라 deferred promise로 read↔write의 인터리브 순서를 결정론적으로 고정해 재현한다
 * (재현 기법 선례: bf3-p05-multipersist-restore-race.test.tsx).
 *
 * `test.fails` / `it.fails`(Vitest): "이 테스트는 실패해야 정상"을 선언하는 기능. 현재 구조(단일
 * writer 직렬화 없음)에서는 아래 3계열이 전부 실패한다 — 그 실패 자체를 CI green으로 박제해
 * 버그의 존재를 증명한다. RMW1-P03~P04에서 main 프로세스 단일 writer 큐로 직렬화하면 유실이
 * 사라지고, 그 시점에 `.fails`를 제거하는 것이 GREEN 전환의 증거가 된다(P04 완료 조건).
 *
 * mock "디스크"는 실제 `writeMulti`처럼 **무조건 덮어쓰기**(merge 아님) — 그래야 유실이 관측된다.
 * 모든 시나리오는 공개 행동(훅 public API·store 액션)만 경유한다 — `performRmwSave` 등 내부 함수는
 * 직접 import하지 않는다(P04 리팩토링 후에도 이 테스트가 살아남게).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiPersist } from '../../../02.Source/renderer/src/hooks/useMultiPersist'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import { makePanelInitialState } from '../../../02.Source/renderer/src/store/panelSession'
import type { PanelSessionHookResult } from '../../../02.Source/renderer/src/store/panelSession'
import type { PersistedMultiState, PersistedMultiSession } from '../../../02.Source/shared/ipc-contract'

// ── window.api mock — "디스크"를 시뮬레이션하는 in-memory blob ──────────────────────
//
// CRITICAL(선례 bf3-p05 준수): SAVE는 현 실제 구현(main-process writeMulti)처럼
// *무조건 덮어쓰기*다 — merge로 구현하면 lost-update가 관측되지 않는다.

let _disk: PersistedMultiState | null = null

const mockMultiSessionLoad = vi.fn(async (): Promise<{ state: PersistedMultiState | null }> => ({ state: _disk }))
const mockMultiSessionSave = vi.fn(async (state: PersistedMultiState): Promise<{ ok: boolean }> => {
  _disk = state // 무조건 덮어쓰기(merge 아님) — 유실 관측의 전제조건
  return { ok: true }
})

Object.defineProperty(window, 'api', {
  value: { multiSessionLoad: mockMultiSessionLoad, multiSessionSave: mockMultiSessionSave },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  _disk = null
  // 기본: 호출 시점의 _disk를 즉시 반환(대부분의 read는 여기 걸린다 — 딱 1회만
  // 인터리브를 고정할 때 mockReturnValueOnce로 deferred promise를 끼워넣는다).
  mockMultiSessionLoad.mockImplementation(async () => ({ state: _disk }))
  // 각 테스트가 store의 multiSession 슬라이스를 깨끗한 상태에서 시작하도록 리셋
  // (단일챗 슬라이스는 이 파일의 시나리오와 무관 — 손대지 않는다).
  useAppStore.setState({
    activeMultiSessionId: '',
    multiSessions: [],
  } as Parameters<typeof useAppStore.setState>[0])
})

// ── 공용 헬퍼 ───────────────────────────────────────────────────────────────────

/** 6개 mock PanelSessionHookResult — restore는 spy, state는 초기값(개별 슬롯 오버라이드용). */
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

/** 마이크로태스크 큐를 N tick 비운다 — 실시간 대기 없이 pending promise 체인을 흘려보낸다. */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

/** deferred promise — read/write 인터리브 순서를 테스트가 직접 쥐고 흔들기 위한 핸들. */
function makeDeferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

// ── 유실 관측 헬퍼(디스크 mock 공용화, 3계열 중복 방지) ──────────────────────────────

/** 디스크(mock)에서 세션 id로 레코드 조회 — 없으면 undefined. */
function diskSession(id: string): PersistedMultiSession | undefined {
  return _disk?.sessions.find((s) => s.id === id)
}

/** 세션 slot0의 첫 메시지 텍스트(유실 관측용) — 세션/패널/스냅샷/메시지 중 하나라도 없으면 undefined. */
function diskFirstMsgText(id: string): string | undefined {
  return diskSession(id)?.panels[0]?.snapshot?.messages[0]?.text
}

/** 세션 title(유실 관측용) — 없으면 undefined. */
function diskTitle(id: string): string | undefined {
  return diskSession(id)?.title
}

// ═══════════════════════════════════════════════════════════════════════════════
// (a) autosave × 언마운트 flush — 두 멀티세션(A·B) 각자의 훅 인스턴스가 같은 디스크
//     blob에 경합 write. A의 autosave read가 pending인 동안 B의 flush write가 랜딩.
// ═══════════════════════════════════════════════════════════════════════════════
describe('RMW1-P01 (a) — autosave × 언마운트 flush: A·B 두 멀티세션 훅의 저장 경합', () => {
  it.fails(
    'A의 autosave(디바운스) read가 pending인 동안 B의 언마운트 flush write가 먼저 랜딩해도, 최종 디스크에 A·B 변경이 모두 생존한다',
    async () => {
      const SID_A = 'sess-rmw-a'
      const SID_B = 'sess-rmw-b'

      // 초기 디스크: A·B 둘 다 기존 저장 이력 있음(직전에 이미 한 번 flush된 상태).
      _disk = {
        version: 2,
        activeSessionId: SID_A,
        sessions: [
          { id: SID_A, title: 'A', count: 4, panels: [] },
          { id: SID_B, title: 'B', count: 4, panels: [] },
        ],
      }

      // A: 라이브 진행에 새 메시지가 이미 있는 상태로 마운트(이후 autosave 대상이 됨).
      const aSessions = makeMockSessions()
      aSessions[0] = {
        ...aSessions[0],
        state: { ...aSessions[0].state, thread: [{ kind: 'msg', id: 'a-1', role: 'user', text: 'A 신규 메시지' }] },
      }
      renderHook(() => useMultiPersist(aSessions, SID_A))

      // A의 마운트 복원 완료 대기 → restoredRef=true + 상태변경(setPanelMetas 등, re-render)
      // → 저장(디바운스) effect가 pending 타이머(500ms)를 건다.
      await act(async () => {
        await flushMicrotasks()
      })

      // A의 다음 LOAD 호출(=디바운스 콜백이 발화시킬 performRmwSave의 RMW read)을
      // deferred로 붙잡는다 — 이 시점부터 인터리브 순서는 테스트가 쥐고 흔든다.
      const aLoadDeferred = makeDeferred<{ state: PersistedMultiState | null }>()
      mockMultiSessionLoad.mockReturnValueOnce(aLoadDeferred.promise)

      // 디바운스(500ms) 발화 대기. 실시간 대기이지만 "누가 먼저 끝나는지"는 타이밍 운이
      // 아니라 아래 deferred promise 해소 순서로 고정된다 — 이 대기는 콜백을 발화시키는
      // 기계적 필요일 뿐, 레이스의 승패를 결정하지 않는다.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600))
      })

      // A의 read가 호출됐다(=deferred 소비, pending) — 아직 아무 write도 랜딩 전.
      expect(mockMultiSessionSave).not.toHaveBeenCalled()

      // 이 시점 디스크 스냅샷을 보존 — A의 read가 나중에 resolve될 "stale" 값이 된다.
      const staleSnapshotForA: PersistedMultiState = JSON.parse(JSON.stringify(_disk))

      // B: 자신의 새 메시지와 함께 마운트 → 복원 완료 후 즉시 언마운트(세션 전환 시뮬 → flush).
      const bSessions = makeMockSessions()
      bSessions[0] = {
        ...bSessions[0],
        state: { ...bSessions[0].state, thread: [{ kind: 'msg', id: 'b-1', role: 'user', text: 'B 신규 메시지' }] },
      }
      const bHook = renderHook(() => useMultiPersist(bSessions, SID_B))
      await act(async () => {
        await flushMicrotasks()
      })

      // B 언마운트 → cleanup에서 pending 타이머를 즉시 flush(RMW read→write, 자기 완결).
      act(() => {
        bHook.unmount()
      })
      await act(async () => {
        await flushMicrotasks()
      })

      // 레이스의 전제조건: B의 flush write가 A보다 먼저 완전히 디스크에 랜딩했다.
      expect(mockMultiSessionSave).toHaveBeenCalled()
      expect(diskFirstMsgText(SID_B)).toBe('B 신규 메시지')

      // 이제 A의 read를 resolve — "main이 A의 read를 B의 write 완료 후에야 처리"를
      // stale 스냅샷으로 모델링한다.
      await act(async () => {
        aLoadDeferred.resolve({ state: staleSnapshotForA })
        await flushMicrotasks()
      })

      // 목표 불변조건: A·B 둘 다 최종 디스크에 생존해야 한다.
      expect(diskFirstMsgText(SID_A)).toBe('A 신규 메시지')
      // 현 구조: A의 stale write가 sessions[] 전체를 덮어써 B의 flush 변경이 사라진다.
      expect(diskFirstMsgText(SID_B)).toBe('B 신규 메시지')
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════════════
// (b) autosave × CRUD — A의 autosave read가 pending인 동안 newMultiSession()의 write가
//     랜딩. 새 세션 존재 + A의 autosave 스냅샷 모두 생존해야 한다.
// ═══════════════════════════════════════════════════════════════════════════════
describe('RMW1-P01 (b) — autosave × CRUD(newMultiSession): 새 세션 생성과 autosave 저장 경합', () => {
  it.fails(
    'A의 autosave read가 pending인 동안 newMultiSession()의 write가 랜딩해도, 새 세션과 A의 autosave 갱신 모두 디스크에 생존한다',
    async () => {
      const SID_A = 'sess-rmw-crud-a'

      _disk = {
        version: 2,
        activeSessionId: SID_A,
        sessions: [{ id: SID_A, title: 'A', count: 4, panels: [] }],
      }

      const aSessions = makeMockSessions()
      aSessions[0] = {
        ...aSessions[0],
        state: { ...aSessions[0].state, thread: [{ kind: 'msg', id: 'a-1', role: 'user', text: 'A autosave 메시지' }] },
      }
      renderHook(() => useMultiPersist(aSessions, SID_A))
      await act(async () => {
        await flushMicrotasks()
      })

      // A의 디바운스 콜백이 발화시킬 RMW read를 deferred로 붙잡는다.
      const aLoadDeferred = makeDeferred<{ state: PersistedMultiState | null }>()
      mockMultiSessionLoad.mockReturnValueOnce(aLoadDeferred.promise)

      await act(async () => {
        await new Promise((r) => setTimeout(r, 600))
      })
      expect(mockMultiSessionSave).not.toHaveBeenCalled()

      // A의 read가 pending에 걸린 시점의 디스크 스냅샷(=A가 나중에 resolve될 stale 값).
      const staleSnapshotForA: PersistedMultiState = JSON.parse(JSON.stringify(_disk))

      // CRUD: newMultiSession — A와 무관하게 자기 완결 RMW(read 즉시 완료) → 새 세션 write 랜딩.
      await useAppStore.getState().newMultiSession()
      const newSessionId = useAppStore.getState().activeMultiSessionId
      expect(newSessionId).not.toBe(SID_A)
      // 레이스의 전제조건: newMultiSession의 write가 A보다 먼저 랜딩했다.
      expect(diskSession(newSessionId)).toBeDefined()

      // A의 read를 resolve(stale — newMultiSession의 새 세션을 못 본 시점 스냅샷).
      await act(async () => {
        aLoadDeferred.resolve({ state: staleSnapshotForA })
        await flushMicrotasks()
      })

      // 목표 불변조건: A의 autosave 갱신과 새 세션 둘 다 최종 디스크에 생존해야 한다.
      expect(diskFirstMsgText(SID_A)).toBe('A autosave 메시지')
      // 현 구조: A의 stale write가 sessions[] 전체를 덮어써 새로 생성된 세션이 통째로 사라진다.
      expect(diskSession(newSessionId)).toBeDefined()
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════════════
// (c) CRUD 연쇄 — selectMultiSession(S2) 직후 renameMultiSession(S1) 인터리브.
//     rename 결과(title)와 activeSessionId 변경 모두 생존해야 한다.
// ═══════════════════════════════════════════════════════════════════════════════
describe('RMW1-P01 (c) — CRUD 연쇄: selectMultiSession 직후 renameMultiSession 인터리브', () => {
  it.fails(
    'select의 read가 pending인 동안 rename의 write가 먼저 랜딩해도, rename 결과와 활성 세션 변경 모두 디스크에 생존한다',
    async () => {
      const S1 = 'sess-rmw-c1'
      const S2 = 'sess-rmw-c2'

      _disk = {
        version: 2,
        activeSessionId: S1,
        sessions: [
          { id: S1, title: '원래 제목', count: 2, panels: [] },
          { id: S2, title: 'S2', count: 2, panels: [] },
        ],
      }

      // select의 RMW read를 deferred로 붙잡는다.
      const selectLoadDeferred = makeDeferred<{ state: PersistedMultiState | null }>()
      mockMultiSessionLoad.mockReturnValueOnce(selectLoadDeferred.promise)

      // selectMultiSession(S2) 시작 — optimistic set은 동기 반영, RMW read는 pending.
      const selectPromise = useAppStore.getState().selectMultiSession(S2)

      expect(useAppStore.getState().activeMultiSessionId).toBe(S2)
      expect(mockMultiSessionLoad).toHaveBeenCalledTimes(1)

      // select의 read가 pending에 걸린 시점의 디스크 스냅샷(=select가 나중에 resolve될 stale 값).
      const staleSnapshotForSelect: PersistedMultiState = JSON.parse(JSON.stringify(_disk))

      // renameMultiSession(S1) — select와 무관하게 자기 완결 RMW(read 즉시 완료) → write 랜딩.
      await useAppStore.getState().renameMultiSession(S1, '새 제목')
      // 레이스의 전제조건: rename의 write가 select보다 먼저 랜딩했다.
      expect(diskTitle(S1)).toBe('새 제목')

      // select의 read를 resolve(stale — rename을 못 본 시점 스냅샷) → select의 write 진행.
      await act(async () => {
        selectLoadDeferred.resolve({ state: staleSnapshotForSelect })
        await selectPromise
      })

      // 목표 불변조건: rename 결과(title)와 activeSessionId 변경 모두 최종 디스크에 생존해야 한다.
      expect(_disk?.activeSessionId).toBe(S2)
      // 현 구조: select의 stale write가 sessions[] 전체를 덮어써 rename 결과가 사라진다.
      expect(diskTitle(S1)).toBe('새 제목')
    }
  )
})
