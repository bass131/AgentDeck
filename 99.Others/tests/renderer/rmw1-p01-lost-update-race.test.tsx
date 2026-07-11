// @vitest-environment jsdom
/**
 * rmw1-p01-lost-update-race.test.tsx — RMW1 Phase 01: multi-agent.json 분산 RMW
 * lost-update 소멸의 기계 증거(GREEN, RMW1-P04 완료).
 *
 * 배경(00.Documents/ADR.md ADR-031): 이 파일은 원래(P01, TDD RED) `useMultiPersist.
 * performRmwSave` / `slices/multiSession.ts`의 5개 CRUD 액션이 전부 "디스크 read → 메모리에서
 * 수정 → 디스크 write" 2단 RMW(Read-Modify-Write) 패턴이던 시절의 lost-update를 3계열로,
 * 타이밍 운(`setTimeout` 경합)이 아니라 deferred promise로 read↔write의 인터리브 순서를
 * 결정론적으로 고정해 재현했다(그 시절엔 3계열 전부 `it.fails`로 RED가 CI green으로 박제됐다).
 *
 * RMW1-P04(이 파일의 현재 상태): renderer 호출처가 통짜 SAVE 대신 **의도 명령**
 * (multiCmdUpsert/Create/Select 등)으로 이관됐다 — main이 `readMulti → 병합함수
 * (main/multiStore.ts) → writeMulti`를 **await 없는 동기 블록**(run-to-completion)으로
 * 실행해, 명령이 실제로 처리되는 시점의 fresh 디스크를 기준으로 **자신이 명시한 필드만**
 * 병합한다(예: upsertSession은 id 일치 세션만 교체, 다른 세션은 완전히 무손상). "read한
 * 스냅샷 전체를 나중에 통째로 덮어쓰기"라는 lost-update의 전제조건 자체가 구조적으로
 * 사라졌다 — 아래 3계열은 이제 전부 GREEN이고, 그 GREEN 자체가 소멸의 증거다.
 *
 * mock 하네스(P04에서 교체): 예전엔 mock "디스크"가 통짜 SAVE(P05 제거)처럼 **무조건
 * 덮어쓰기**였다(그래야 유실이 관측됐다). 지금은 그 대신 `helpers/multiCmdMock.ts`가 main의
 * 실제 순수 병합 함수를 그대로 재사용해 "명령 수신 → main 원자 병합"을 시뮬레이션한다 —
 * mock과 실제 main 구현의 의미론 드리프트를 원천 차단한다. 인터리브(레이스) 재현은
 * `makeCmdGate()`로 "main이 이 명령을 아직 처리하지 않음"을 모델링한다: 게이트가 열리는
 * *그 시점*의 디스크를 기준으로 병합이 실행되므로(스냅샷을 미리 캡처해 resolve로 흘려보내는
 * 방식이 아니다), main의 매번 fresh read 의미론과 정확히 대응한다.
 *
 * 모든 시나리오는 공개 행동(훅 public API·store 액션)만 경유한다 — `performUpsert` 등 내부
 * 함수는 직접 import하지 않는다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMultiPersist } from '../../../02.Source/renderer/src/hooks/useMultiPersist'
import { useAppStore } from '../../../02.Source/renderer/src/store/appStore'
import { makePanelInitialState } from '../../../02.Source/renderer/src/store/panelSession'
import type { PanelSessionHookResult } from '../../../02.Source/renderer/src/store/panelSession'
import type { PersistedMultiState, PersistedMultiSession } from '../../../02.Source/shared/ipc-contract'
import { upsertSession, selectSession } from '../../../02.Source/main/multiStore'
import { makeMultiCmdMocks, makeCmdGate } from './helpers/multiCmdMock'

// ── window.api mock — "디스크"를 시뮬레이션하는 in-memory blob ──────────────────────
//
// multiSessionLoad(읽기)는 그대로 유지 — ADR-031 이후에도 READ 전용 채널은 폐기 대상이
// 아니다. multiCmd*(명령 5종)는 main의 실제 순수 병합 함수를 재사용하는 helpers/
// multiCmdMock.ts로 위임 — getDisk/setDisk를 이 파일의 `_disk`에 연결해 LOAD와 CMD가
// 항상 같은 "디스크"를 공유하게 한다.

let _disk: PersistedMultiState | null = null

const mockMultiSessionLoad = vi.fn(async (): Promise<{ state: PersistedMultiState | null }> => ({ state: _disk }))

const {
  multiCmdUpsert: mockMultiCmdUpsert,
  multiCmdCreate: mockMultiCmdCreate,
  multiCmdDelete: mockMultiCmdDelete,
  multiCmdRename: mockMultiCmdRename,
  multiCmdSelect: mockMultiCmdSelect,
  run: runMultiCmd,
} = makeMultiCmdMocks(
  () => _disk,
  (s) => { _disk = s }
)

Object.defineProperty(window, 'api', {
  value: {
    multiSessionLoad: mockMultiSessionLoad,
    multiCmdUpsert: mockMultiCmdUpsert,
    multiCmdCreate: mockMultiCmdCreate,
    multiCmdDelete: mockMultiCmdDelete,
    multiCmdRename: mockMultiCmdRename,
    multiCmdSelect: mockMultiCmdSelect,
  },
  writable: true,
  configurable: true,
})

beforeEach(() => {
  vi.clearAllMocks()
  _disk = null
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
    // LR4 P07: PanelSessionHookResult에 setReplMode(필수) 추가 — mock 정합용.
    setReplMode: vi.fn(),
  }))
}

/** 마이크로태스크 큐를 N tick 비운다 — 실시간 대기 없이 pending promise 체인을 흘려보낸다. */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
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
//     blob에 경합 write. A의 upsert가 main에서 아직 처리되지 않은 동안 B의 flush upsert가
//     먼저 랜딩.
// ═══════════════════════════════════════════════════════════════════════════════
describe('RMW1-P01 (a) — autosave × 언마운트 flush: A·B 두 멀티세션 훅의 저장 경합', () => {
  it(
    'A의 autosave(디바운스) upsert가 main에서 아직 처리되지 않은 동안 B의 언마운트 flush upsert가 먼저 랜딩해도, 최종 디스크에 A·B 변경이 모두 생존한다',
    async () => {
      const SID_A = 'sess-rmw-a'
      const SID_B = 'sess-rmw-b'

      // 초기 디스크: A·B 둘 다 기존 저장 이력 있음(직전에 이미 한 번 저장된 상태).
      _disk = {
        version: 2,
        activeSessionId: SID_A,
        sessions: [
          { id: SID_A, title: 'A', count: 4, panels: [] },
          { id: SID_B, title: 'B', count: 4, panels: [] },
        ],
      }
      const pendingSnapshot: PersistedMultiState = JSON.parse(JSON.stringify(_disk))

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

      // A의 다음 multiCmdUpsert 호출(=디바운스 콜백이 발화시킬 명령)을 게이트로 붙잡는다 —
      // "main이 이 명령을 아직 처리하지 않음"을 재현. 게이트가 열리는 시점의 fresh 디스크를
      // 기준으로 upsertSession(main/multiStore.ts 실제 병합 함수)이 실행된다.
      const aGate = makeCmdGate()
      mockMultiCmdUpsert.mockImplementationOnce((session) =>
        aGate.promise.then(() => runMultiCmd((current) => upsertSession(current, session)))
      )

      // 디바운스(500ms) 발화 대기. 실시간 대기이지만 "누가 먼저 끝나는지"는 타이밍 운이
      // 아니라 아래 게이트 오픈 순서로 고정된다 — 이 대기는 콜백을 발화시키는 기계적
      // 필요일 뿐, 레이스의 승패를 결정하지 않는다.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 600))
      })

      // A의 upsert 호출은 발사됐다(=게이트 소비, pending) — main 처리 전이라 디스크 미반영.
      expect(mockMultiCmdUpsert).toHaveBeenCalledTimes(1)
      expect(_disk).toEqual(pendingSnapshot)

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

      // B 언마운트 → cleanup에서 pending 타이머를 즉시 flush(multiCmdUpsert 발사, 자기 완결).
      act(() => {
        bHook.unmount()
      })
      await act(async () => {
        await flushMicrotasks()
      })

      // 레이스의 전제조건: B의 flush upsert가 A보다 먼저 완전히 디스크에 랜딩했다.
      expect(diskFirstMsgText(SID_B)).toBe('B 신규 메시지')

      // 이제 A의 게이트를 연다 — "main이 A의 명령을 B의 write 완료 후에야 처리"를 재현한다.
      // upsertSession은 이 시점의 fresh 디스크(B 반영됨)를 기준으로 id=SID_A 세션만
      // 교체한다 — B의 항목은 다른 인덱스라 완전히 무손상 보존된다.
      await act(async () => {
        aGate.open()
        await flushMicrotasks()
      })

      // 목표 불변조건(달성됨): A·B 둘 다 최종 디스크에 생존한다 — 명령 기반 이관(ADR-031)이
      // "read한 스냅샷 전체를 나중에 통째로 덮어쓰기"라는 lost-update의 전제조건을
      // 구조적으로 제거했기 때문(각 명령은 자신이 명시한 필드만 병합).
      expect(diskFirstMsgText(SID_A)).toBe('A 신규 메시지')
      expect(diskFirstMsgText(SID_B)).toBe('B 신규 메시지')
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════════════
// (b) autosave × CRUD — A의 autosave upsert가 main에서 아직 처리되지 않은 동안
//     newMultiSession()의 create 명령이 먼저 랜딩. 새 세션 존재 + A의 autosave 스냅샷
//     모두 생존해야 한다.
// ═══════════════════════════════════════════════════════════════════════════════
describe('RMW1-P01 (b) — autosave × CRUD(newMultiSession): 새 세션 생성과 autosave 저장 경합', () => {
  it(
    'A의 autosave upsert가 main에서 아직 처리되지 않은 동안 newMultiSession()의 create 명령이 먼저 랜딩해도, 새 세션과 A의 autosave 갱신 모두 디스크에 생존한다',
    async () => {
      const SID_A = 'sess-rmw-crud-a'

      _disk = {
        version: 2,
        activeSessionId: SID_A,
        sessions: [{ id: SID_A, title: 'A', count: 4, panels: [] }],
      }
      const pendingSnapshot: PersistedMultiState = JSON.parse(JSON.stringify(_disk))

      const aSessions = makeMockSessions()
      aSessions[0] = {
        ...aSessions[0],
        state: { ...aSessions[0].state, thread: [{ kind: 'msg', id: 'a-1', role: 'user', text: 'A autosave 메시지' }] },
      }
      renderHook(() => useMultiPersist(aSessions, SID_A))
      await act(async () => {
        await flushMicrotasks()
      })

      // A의 디바운스 콜백이 발화시킬 multiCmdUpsert 호출을 게이트로 붙잡는다.
      const aGate = makeCmdGate()
      mockMultiCmdUpsert.mockImplementationOnce((session) =>
        aGate.promise.then(() => runMultiCmd((current) => upsertSession(current, session)))
      )

      await act(async () => {
        await new Promise((r) => setTimeout(r, 600))
      })
      expect(mockMultiCmdUpsert).toHaveBeenCalledTimes(1)
      // A의 upsert는 게이트 보류 중 — 디스크 미반영.
      expect(_disk).toEqual(pendingSnapshot)

      // CRUD: newMultiSession — A와 무관하게 즉시 완결되는 명령(multiCmdCreate, 기본
      // mock 구현 — 게이트 없음) → 새 세션 write가 먼저 랜딩.
      await useAppStore.getState().newMultiSession()
      const newSessionId = useAppStore.getState().activeMultiSessionId
      expect(newSessionId).not.toBe(SID_A)
      // 레이스의 전제조건: newMultiSession의 write가 A보다 먼저 랜딩했다.
      expect(diskSession(newSessionId)).toBeDefined()

      // A의 게이트를 연다 — 이 시점의 fresh 디스크(새 세션 포함)를 기준으로 upsertSession이
      // id=SID_A 세션만 교체한다. 새로 생성된 세션은 다른 인덱스라 무손상 보존된다.
      await act(async () => {
        aGate.open()
        await flushMicrotasks()
      })

      // 목표 불변조건(달성됨): A의 autosave 갱신과 새 세션 둘 다 최종 디스크에 생존한다.
      expect(diskFirstMsgText(SID_A)).toBe('A autosave 메시지')
      expect(diskSession(newSessionId)).toBeDefined()
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════════════
// (c) CRUD 연쇄 — selectMultiSession(S2) 직후 renameMultiSession(S1) 인터리브.
//     rename 결과(title)와 activeSessionId 변경 모두 생존해야 한다.
// ═══════════════════════════════════════════════════════════════════════════════
describe('RMW1-P01 (c) — CRUD 연쇄: selectMultiSession 직후 renameMultiSession 인터리브', () => {
  it(
    'select 명령이 main에서 아직 처리되지 않은 동안 rename 명령이 먼저 랜딩해도, rename 결과와 활성 세션 변경 모두 디스크에 생존한다',
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

      // select의 multiCmdSelect 호출을 게이트로 붙잡는다.
      const selectGate = makeCmdGate()
      mockMultiCmdSelect.mockImplementationOnce((id) =>
        selectGate.promise.then(() => runMultiCmd((current) => selectSession(current, id)))
      )

      // selectMultiSession(S2) 시작 — optimistic set은 동기 반영, 명령은 게이트 보류.
      const selectPromise = useAppStore.getState().selectMultiSession(S2)

      expect(useAppStore.getState().activeMultiSessionId).toBe(S2)
      expect(mockMultiCmdSelect).toHaveBeenCalledTimes(1)
      // select의 명령은 게이트 보류 중 — 디스크(activeSessionId)는 아직 S1 그대로.
      expect(_disk?.activeSessionId).toBe(S1)

      // renameMultiSession(S1) — select와 무관하게 즉시 완결되는 명령(multiCmdRename,
      // 기본 mock 구현 — 게이트 없음) → write가 먼저 랜딩.
      await useAppStore.getState().renameMultiSession(S1, '새 제목')
      // 레이스의 전제조건: rename의 write가 select보다 먼저 랜딩했다.
      expect(diskTitle(S1)).toBe('새 제목')

      // select의 게이트를 연다 — 이 시점의 fresh 디스크(rename 반영됨)를 기준으로
      // selectSession이 activeSessionId 필드만 바꾼다(sessions 배열은 완전히 무손상 보존).
      await act(async () => {
        selectGate.open()
        await selectPromise
      })

      // 목표 불변조건(달성됨): rename 결과(title)와 activeSessionId 변경 모두 최종
      // 디스크에 생존한다.
      expect(_disk?.activeSessionId).toBe(S2)
      expect(diskTitle(S1)).toBe('새 제목')
    }
  )
})
