/**
 * rmw1-p03-merge-semantics.test.ts — RMW1 Phase 03: main 병합 의미론 순수 함수 5종
 * (upsertSession / createSession / deleteSession / renameSession / selectSession) 단위 테스트.
 *
 * TDD RED: 02.Source/main/multiStore.ts에 아직 이 함수들이 없다 — import 자체가 실패해야
 * 정상이다(GREEN 전환은 다음 Worker가 함수 구현 후).
 *
 * 배경(01.Phases/RMW1-single-writer/03-main-merge-semantics.md, ADR-031):
 * renderer 분산 RMW(BF3 P05 lost-update 재발)를 main 단일 기록자로 이관한다. 명령 5종은
 * `read → merge → write`를 동기 원자 블록에서 처리하며, 이 파일은 그 중 "merge" 단계 —
 * fs를 전혀 만지지 않는 순수 함수들 — 의 의미론만 fs mock 없이 고정한다.
 *
 * 게이트 확정 의미론(코디네이터 지시 — phase 문서보다 이 파일이 최신·우선):
 *   - upsertSession: 미지 id → no-op + ok:false (phase 문서의 "없으면 추가"는 게이트에서
 *     뒤집힘 — stale upsert가 삭제된 세션을 되살리는 것을 차단, 영호 확정).
 *   - upsertSession은 title을 보존하고 activeSessionId를 절대 건드리지 않는다(소유는
 *     create/select 전용 — BF3 P05 오염 재발 방지).
 *   - deleteSession은 remaining이 비면 makeFresh() 콜백으로 새 세션을 만들어 채운다(현
 *     renderer deleteMultiSession L140-144 미러) — makeFresh는 순수 함수 외부에서 주입되는
 *     id 생성 등 비결정 요소를 캡슐화한다(그래야 이 함수 자체는 순수하게 유지된다).
 *   - 모든 함수는 입력 state를 변이하지 않는다 — deep clone 비교로 고정.
 */

import { describe, it, expect, vi } from 'vitest'
import type {
  PersistedMultiState,
  PersistedMultiSession,
  PersistedPanel,
} from '../../../02.Source/shared/ipc-contract'
// ── TDD RED: 아래 심볼들은 아직 02.Source/main/multiStore.ts에 존재하지 않는다.
// 이 import 자체가 실패해야 정상(RED). 구현 후(GREEN) 이 파일은 그대로 통과해야 한다.
import {
  upsertSession,
  createSession,
  deleteSession,
  renameSession,
  selectSession,
} from '../../../02.Source/main/multiStore'
import type { MergeResult } from '../../../02.Source/main/multiStore'

// ── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

function makePanel(overrides: Partial<PersistedPanel> = {}): PersistedPanel {
  return {
    title: 'Panel A',
    cwd: undefined,
    picker: { model: 'sonnet', effort: 'high', mode: 'normal' },
    sysPrompt: undefined,
    snapshot: undefined,
    ...overrides,
  }
}

function makeSession(overrides: Partial<PersistedMultiSession> = {}): PersistedMultiSession {
  return {
    id: 'sess-001',
    title: 'Original Title',
    count: 2,
    panels: [makePanel()],
    ...overrides,
  }
}

function makeState(overrides: Partial<PersistedMultiState> = {}): PersistedMultiState {
  return {
    version: 2,
    activeSessionId: 'sess-001',
    sessions: [makeSession()],
    ...overrides,
  }
}

const EMPTY_STATE: PersistedMultiState = { version: 2, activeSessionId: '', sessions: [] }

/** JSON 직렬화 가능한 PersistedMultiState의 deep clone (순수성 검증용 — 함수 호출 전/후 원본 비교). */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// ── 1. 빈 상태 — 각 명령의 대상 부재 → no-op + ok:false + 상태 불변 ─────────────

describe('빈 상태(sessions: [])에서 대상 부재 명령은 no-op + ok:false를 반환한다', () => {
  it('upsertSession: 빈 상태에서 upsert 대상 id가 없으면 no-op + ok:false', () => {
    const before = deepClone(EMPTY_STATE)
    const result: MergeResult = upsertSession(EMPTY_STATE, { id: 'ghost', count: 2, panels: [] })
    expect(result.ok).toBe(false)
    expect(result.state).toEqual(EMPTY_STATE)
    expect(EMPTY_STATE).toEqual(before) // 원본 불변
  })

  it('deleteSession: 빈 상태에서 삭제 대상 id가 없으면 no-op + ok:false (makeFresh 미호출)', () => {
    const before = deepClone(EMPTY_STATE)
    const makeFresh = vi.fn(() => makeSession({ id: 'should-not-be-called' }))
    const result: MergeResult = deleteSession(EMPTY_STATE, 'ghost', makeFresh)
    expect(result.ok).toBe(false)
    expect(result.state).toEqual(EMPTY_STATE)
    expect(makeFresh).not.toHaveBeenCalled()
    expect(EMPTY_STATE).toEqual(before)
  })

  it('renameSession: 빈 상태에서 rename 대상 id가 없으면 no-op + ok:false', () => {
    const before = deepClone(EMPTY_STATE)
    const result: MergeResult = renameSession(EMPTY_STATE, 'ghost', 'New Title')
    expect(result.ok).toBe(false)
    expect(result.state).toEqual(EMPTY_STATE)
    expect(EMPTY_STATE).toEqual(before)
  })

  it('selectSession: 빈 상태에서 select 대상 id가 없으면 no-op + ok:false', () => {
    const before = deepClone(EMPTY_STATE)
    const result: MergeResult = selectSession(EMPTY_STATE, 'ghost')
    expect(result.ok).toBe(false)
    expect(result.state).toEqual(EMPTY_STATE)
    expect(EMPTY_STATE).toEqual(before)
  })
})

// ── 2. 중복 id upsert — 교체 + title 보존 + activeSessionId 불변 ────────────────

describe('upsertSession — 중복 id 교체', () => {
  it('id 일치 세션은 count/panels가 교체되지만 title은 보존된다', () => {
    const original = makeState({
      activeSessionId: 'sess-001',
      sessions: [makeSession({ id: 'sess-001', title: 'Keep Me', count: 2, panels: [] })],
    })
    const incomingPanels = [makePanel({ title: 'Panel B' })]
    const result = upsertSession(original, { id: 'sess-001', count: 4, panels: incomingPanels })

    expect(result.ok).toBe(true)
    expect(result.state.sessions).toHaveLength(1)
    expect(result.state.sessions[0].title).toBe('Keep Me') // title은 upsert 인자에 없음 — 보존
    expect(result.state.sessions[0].count).toBe(4)
    expect(result.state.sessions[0].panels).toEqual(incomingPanels)
  })

  it('activeSessionId는 upsert 대상과 무관하게 절대 변경되지 않는다', () => {
    const original = makeState({
      activeSessionId: 'sess-002', // 활성은 sess-002인데 upsert는 sess-001을 교체
      sessions: [
        makeSession({ id: 'sess-001', title: 'A' }),
        makeSession({ id: 'sess-002', title: 'B' }),
      ],
    })
    const result = upsertSession(original, { id: 'sess-001', count: 3, panels: [] })
    expect(result.ok).toBe(true)
    expect(result.state.activeSessionId).toBe('sess-002') // 불변
  })
})

// ── 3. 미지 id upsert — no-op + ok:false (stale upsert 부활 차단) ───────────────

describe('upsertSession — 미지 id는 부활시키지 않는다', () => {
  it('세션이 존재하는 상태에서도 매칭 안 되는 id는 no-op + ok:false, 상태 불변', () => {
    const original = makeState() // sess-001만 존재
    const before = deepClone(original)
    const result = upsertSession(original, { id: 'ghost-id', count: 2, panels: [] })

    expect(result.ok).toBe(false)
    expect(result.state).toEqual(original)
    expect(result.state.sessions).toHaveLength(1)
    expect(result.state.sessions.some((s) => s.id === 'ghost-id')).toBe(false)
    expect(original).toEqual(before) // 원본 불변
  })
})

// ── 4/5/6. deleteSession — active 삭제/비active 삭제/마지막 세션 삭제 ──────────

describe('deleteSession — 활성 세션 삭제 시 remaining[0] 승계', () => {
  it('활성 세션을 삭제하면 남은 첫 세션이 활성화된다', () => {
    const original = makeState({
      activeSessionId: 'sess-001',
      sessions: [
        makeSession({ id: 'sess-001', title: 'First' }),
        makeSession({ id: 'sess-002', title: 'Second' }),
      ],
    })
    const makeFresh = vi.fn(() => makeSession({ id: 'should-not-be-called' }))
    const result = deleteSession(original, 'sess-001', makeFresh)

    expect(result.ok).toBe(true)
    expect(result.state.sessions.map((s) => s.id)).toEqual(['sess-002'])
    expect(result.state.activeSessionId).toBe('sess-002')
    expect(makeFresh).not.toHaveBeenCalled()
  })
})

describe('deleteSession — 비활성 세션 삭제 시 활성 유지', () => {
  it('활성이 아닌 세션을 삭제하면 activeSessionId가 그대로 유지된다', () => {
    const original = makeState({
      activeSessionId: 'sess-001',
      sessions: [
        makeSession({ id: 'sess-001', title: 'First' }),
        makeSession({ id: 'sess-002', title: 'Second' }),
      ],
    })
    const makeFresh = vi.fn(() => makeSession({ id: 'should-not-be-called' }))
    const result = deleteSession(original, 'sess-002', makeFresh)

    expect(result.ok).toBe(true)
    expect(result.state.sessions.map((s) => s.id)).toEqual(['sess-001'])
    expect(result.state.activeSessionId).toBe('sess-001')
    expect(makeFresh).not.toHaveBeenCalled()
  })
})

describe('deleteSession — 마지막 세션 삭제 시 makeFresh() 자동 생성 + 활성화', () => {
  it('remaining이 비면 makeFresh()가 정확히 1회 호출되고 그 결과가 유일한 세션이자 활성이 된다', () => {
    const original = makeState({
      activeSessionId: 'sess-001',
      sessions: [makeSession({ id: 'sess-001', title: 'Only One' })],
    })
    const freshSession = makeSession({ id: 'fresh-999', title: '', count: 2, panels: [] })
    const makeFresh = vi.fn(() => freshSession)
    const result = deleteSession(original, 'sess-001', makeFresh)

    expect(result.ok).toBe(true)
    expect(makeFresh).toHaveBeenCalledTimes(1)
    expect(result.state.sessions).toEqual([freshSession])
    expect(result.state.activeSessionId).toBe('fresh-999')
  })
})

// ── 7. renameSession — trim + 200자 cap ─────────────────────────────────────

describe('renameSession — title trim + 200자 cap', () => {
  it('앞뒤 공백은 trim된다', () => {
    const original = makeState({ sessions: [makeSession({ id: 'sess-001', title: 'Old' })] })
    const result = renameSession(original, 'sess-001', '   Hello World   ')
    expect(result.ok).toBe(true)
    expect(result.state.sessions[0].title).toBe('Hello World')
  })

  it('200자를 초과하는 title은 200자로 잘린다', () => {
    const original = makeState({ sessions: [makeSession({ id: 'sess-001', title: 'Old' })] })
    const longTitle = '  ' + 'x'.repeat(250) + '  '
    const result = renameSession(original, 'sess-001', longTitle)
    expect(result.ok).toBe(true)
    expect(result.state.sessions[0].title).toBe('x'.repeat(200))
    expect(result.state.sessions[0].title!.length).toBe(200)
  })

  it('미지 id에 대한 rename은 no-op + ok:false (비어있지 않은 상태에서도)', () => {
    const original = makeState({ sessions: [makeSession({ id: 'sess-001', title: 'Old' })] })
    const before = deepClone(original)
    const result = renameSession(original, 'ghost-id', 'New Title')
    expect(result.ok).toBe(false)
    expect(result.state).toEqual(original)
    expect(original).toEqual(before)
  })
})

// ── 8. selectSession — 정상 전환 ────────────────────────────────────────────

describe('selectSession — 정상 전환', () => {
  it('존재하는 id로 select하면 activeSessionId가 갱신된다', () => {
    const original = makeState({
      activeSessionId: 'sess-001',
      sessions: [
        makeSession({ id: 'sess-001', title: 'First' }),
        makeSession({ id: 'sess-002', title: 'Second' }),
      ],
    })
    const result = selectSession(original, 'sess-002')
    expect(result.ok).toBe(true)
    expect(result.state.activeSessionId).toBe('sess-002')
    // sessions 배열 자체는 손상되지 않는다
    expect(result.state.sessions.map((s) => s.id)).toEqual(['sess-001', 'sess-002'])
  })
})

// ── createSession — append + activeSessionId 갱신 (5종 완전성) ────────────────

describe('createSession — append + activeSessionId 갱신', () => {
  it('newSession을 그대로 추가하고 activeSessionId를 새 세션 id로 갱신한다', () => {
    const original = makeState({
      activeSessionId: 'sess-001',
      sessions: [makeSession({ id: 'sess-001', title: 'First' })],
    })
    const newSession = makeSession({ id: 'sess-new', title: '', count: 2, panels: [] })
    const result = createSession(original, newSession)

    expect(result.ok).toBe(true)
    expect(result.state.sessions.map((s) => s.id)).toEqual(['sess-001', 'sess-new'])
    expect(result.state.sessions[1]).toEqual(newSession)
    expect(result.state.activeSessionId).toBe('sess-new')
  })

  it('빈 상태에도 첫 세션으로 추가할 수 있다', () => {
    const newSession = makeSession({ id: 'sess-first', title: '', count: 2, panels: [] })
    const result = createSession(EMPTY_STATE, newSession)
    expect(result.ok).toBe(true)
    expect(result.state.sessions).toEqual([newSession])
    expect(result.state.activeSessionId).toBe('sess-first')
  })
})

// ── 9. 순수성 — 입력 state 객체가 변이되지 않는다 (원본 deep copy 비교) ──────────

describe('순수성 — 모든 병합 함수는 입력 state를 변이하지 않는다', () => {
  it('upsertSession 호출 후에도 원본 state는 deep-equal하게 보존된다', () => {
    const original = makeState({
      sessions: [makeSession({ id: 'sess-001', title: 'Keep Me' })],
    })
    const before = deepClone(original)
    upsertSession(original, { id: 'sess-001', count: 9, panels: [makePanel({ title: 'X' })] })
    expect(original).toEqual(before)
  })

  it('createSession 호출 후에도 원본 state는 deep-equal하게 보존된다', () => {
    const original = makeState()
    const before = deepClone(original)
    createSession(original, makeSession({ id: 'sess-brandnew' }))
    expect(original).toEqual(before)
  })

  it('deleteSession 호출 후에도 원본 state는 deep-equal하게 보존된다', () => {
    const original = makeState({
      sessions: [
        makeSession({ id: 'sess-001', title: 'First' }),
        makeSession({ id: 'sess-002', title: 'Second' }),
      ],
    })
    const before = deepClone(original)
    deleteSession(original, 'sess-001', () => makeSession({ id: 'fresh' }))
    expect(original).toEqual(before)
  })

  it('renameSession 호출 후에도 원본 state는 deep-equal하게 보존된다', () => {
    const original = makeState({ sessions: [makeSession({ id: 'sess-001', title: 'Old' })] })
    const before = deepClone(original)
    renameSession(original, 'sess-001', 'Changed Title')
    expect(original).toEqual(before)
  })

  it('selectSession 호출 후에도 원본 state는 deep-equal하게 보존된다', () => {
    const original = makeState({
      activeSessionId: 'sess-001',
      sessions: [
        makeSession({ id: 'sess-001', title: 'First' }),
        makeSession({ id: 'sess-002', title: 'Second' }),
      ],
    })
    const before = deepClone(original)
    selectSession(original, 'sess-002')
    expect(original).toEqual(before)
  })
})

// ── version 유지 확인 ────────────────────────────────────────────────────────

describe('모든 병합 함수는 version=2를 유지한다', () => {
  it('upsert/create/delete/rename/select 결과 state.version은 항상 2다', () => {
    const original = makeState()
    expect(upsertSession(original, { id: 'sess-001', count: 2, panels: [] }).state.version).toBe(2)
    expect(createSession(original, makeSession({ id: 'sess-x' })).state.version).toBe(2)
    expect(deleteSession(original, 'sess-001', () => makeSession({ id: 'fresh' })).state.version).toBe(2)
    expect(renameSession(original, 'sess-001', 'New').state.version).toBe(2)
    expect(selectSession(original, 'sess-001').state.version).toBe(2)
  })
})
