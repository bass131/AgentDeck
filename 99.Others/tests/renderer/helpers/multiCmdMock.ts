/**
 * multiCmdMock.ts — renderer 유닛테스트 공용: multi.cmd* IPC를 "main 원자 병합"으로 시뮬레이션.
 *
 * 배경(ADR-031/RMW1-P04): renderer가 이관된 명령 IPC(multiCmdUpsert/Create/Delete/Rename/Select)를
 * 호출하면, main은 각 명령마다 `readMulti → 병합함수(main/multiStore.ts) → writeMulti`를 **await
 * 없는 동기 블록**(run-to-completion)으로 실행한다(02.Source/main/00_ipc/handlers/multi.ts
 * runMultiCmd). 이 헬퍼는 그 핸들러의 의미론을 fs 없이 in-memory "디스크"로 재현하되,
 * **main/multiStore.ts의 실제 순수 병합 함수**(upsertSession/createSession/deleteSession/
 * renameSession/selectSession)를 그대로 import해서 재사용한다 — mock이 병합 규칙(예: 미지 id
 * no-op, upsert의 title 보존, delete의 활성 재계산)을 스스로 다시 구현하면 실제 main 구현과
 * 의미론이 갈라질(drift) 위험이 있는데, 실제 함수를 재사용하면 그 위험이 원천 차단된다.
 *
 * getDisk/setDisk를 주입받는 이유: 각 테스트 파일이 이미 소유한 in-memory "디스크" 변수
 * (보통 `_disk`, multiSessionLoad가 읽고 통짜 SAVE(P05 제거)가 쓰던 단일 진실원)를 그대로
 * 재사용해 LOAD(읽기)와 CMD(명령)가 항상 같은 상태를 공유하게 하기 위해서다 — 두 개의
 * 분리된 "디스크"를 두면 "명령으로 쓴 걸 LOAD가 못 본다" 같은 새로운 불일치가 생긴다.
 *
 * 결정론(레이스 재현용): 기본 구현은 `Promise.resolve().then(...)` — 매 호출이 즉시(1
 * microtask) 처리되는 "main이 바쁘지 않은" 상황을 모델링한다. "main이 아직 이 명령을
 * 처리하지 않음"(레이스 인터리브)을 재현하려면 `run`(저수준 실행기)과 {@link makeCmdGate}를
 * 조합해 `mockImplementationOnce`로 개별 호출을 게이트로 붙잡는다 — 이때도 게이트가 열리는
 * "그 시점"의 getDisk()를 기준으로 병합하므로, main의 매번 fresh read 의미론과 동형이다.
 */
import { vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  upsertSession,
  createSession,
  deleteSession,
  renameSession,
  selectSession,
} from '../../../../02.Source/main/multiStore'
import type { MergeResult } from '../../../../02.Source/main/multiStore'
import type {
  PersistedMultiState,
  PersistedMultiSession,
  MultiCmdResponse,
} from '../../../../02.Source/shared/ipc-contract'

/** readMulti가 null(파일 없음/손상)일 때 병합의 출발점 — main handlers/multi.ts emptyMultiState 동형. */
function emptyMultiState(): PersistedMultiState {
  return { version: 2, activeSessionId: '', sessions: [] }
}

/** main handlers/multi.ts makeFreshSession 동형 — 새 세션 메타(title=''·count=2·panels=[]). */
export function makeFreshSession(): PersistedMultiSession {
  return { id: randomUUID(), title: '', count: 2, panels: [] }
}

/**
 * multi.cmd* 5종의 vi.fn() 묶음을 만든다.
 *
 * @param getDisk 테스트 파일이 소유한 in-memory 디스크 변수의 getter(예: `() => _disk`)
 * @param setDisk 그 변수의 setter(예: `(s) => { _disk = s }`) — 병합 성공(ok:true) 시에만 호출된다
 */
export function makeMultiCmdMocks(
  getDisk: () => PersistedMultiState | null,
  setDisk: (state: PersistedMultiState) => void
) {
  /**
   * 저수준 실행기 — "그 시점의" getDisk()를 기준으로 병합함수를 실행하고, 성공 시에만
   * setDisk로 반영한다(main runMultiCmd와 동형: 읽기~쓰기 사이 다른 명령이 끼어들 수 없는
   * run-to-completion 블록). P01 레이스 재현처럼 커스텀 mockImplementationOnce를 짤 때 재사용.
   */
  function run(mergeFn: (current: PersistedMultiState) => MergeResult): MultiCmdResponse {
    const current = getDisk() ?? emptyMultiState()
    const result = mergeFn(current)
    if (result.ok) setDisk(result.state)
    return result
  }

  return {
    multiCmdUpsert: vi.fn(
      (session: Omit<PersistedMultiSession, 'title'>): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => upsertSession(current, session)))
    ),
    multiCmdCreate: vi.fn(
      (): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => createSession(current, makeFreshSession())))
    ),
    multiCmdDelete: vi.fn(
      (id: string): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => deleteSession(current, id, makeFreshSession)))
    ),
    multiCmdRename: vi.fn(
      (id: string, title: string): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => renameSession(current, id, title)))
    ),
    multiCmdSelect: vi.fn(
      (id: string): Promise<MultiCmdResponse> =>
        Promise.resolve().then(() => run((current) => selectSession(current, id)))
    ),
    run,
  }
}

/** makeMultiCmdMocks 반환 타입 — window.api mock 조립 시 구조분해 대상. */
export type MultiCmdMocks = ReturnType<typeof makeMultiCmdMocks>

/**
 * "main이 이 명령을 아직 처리하지 않음"을 재현하는 게이트.
 *
 * open() 호출 전까지 promise가 pending — deferred 인터리브 재현(RMW1-P01 레이스 3계열)에서
 * `mockImplementationOnce((arg) => gate.promise.then(() => run(...)))` 형태로 조합한다.
 * 예전(P01 원본)의 "미리 캡처한 stale 스냅샷을 resolve 값으로 흘려보내는" 패턴과 달리, 이
 * 게이트는 값을 나르지 않는다 — open() 시점에 `run`이 getDisk()를 fresh하게 다시 읽으므로
 * (스냅샷 캡처가 아예 불필요) main의 실제 동기 원자 블록 의미론과 정확히 대응한다.
 */
export function makeCmdGate(): { promise: Promise<void>; open: () => void } {
  let openFn!: () => void
  const promise = new Promise<void>((resolve) => {
    openFn = resolve
  })
  return { promise, open: openFn }
}
