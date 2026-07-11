/**
 * lr4-p07-repl-per-session-multi.test.ts — LR4 P07 RED 테스트 (TDD 1단계, 멀티 패널).
 *
 * 목표: 전역 단일 replMode를 패널별(PanelThreadSnapshot.replMode + PanelSessionState.replMode)
 *   로 이관한다. shared 계약은 이미 `PanelThreadSnapshot.replMode?: boolean`(shared/ipc/multi.ts)
 *   으로 확장됨. 이 파일은 순수 함수(panelReducerFn/makePanelInitialState/snapshotForPersist/
 *   panelApply)만 다뤄 window.api 없이 결정론적으로 검증한다.
 *
 * 이 파일은 *실패하는 테스트만* 작성한다(구현 없음):
 *   - makePanelInitialState는 아직 replMode를 세팅하지 않는다(undefined).
 *   - snapshotForPersist는 replMode를 직렬화하지 않는다(undefined).
 *   - panelReducer에 SET_REPL_MODE 액션이 없다(default → no-op).
 *   → 아래 단언들은 behavioral RED(값 undefined ≠ 기대 boolean)로 실패한다.
 *
 * 시나리오 매핑(코디네이터 4종 중):
 *   1. 세션 A/B 독립 토글(멀티) — panelReducer SET_REPL_MODE 순수 테스트로 slot0=false여도 slot1 불변.
 *   2. 영속 라운드트립(멀티) — snapshotForPersist→snapshot.replMode→makePanelInitialState 복원.
 *   4. 하위호환 마이그(멀티) — replMode 없는 옛 snapshot 로드 시 폴백(기본 true) + APPLY_EVENT 후 보존.
 *
 * 패턴 재사용: m3-persist.test.ts / m3-thread-restore.test.ts(순수 panelSession 함수).
 * CRITICAL: shared reducer.ts(applyAgentEvent/makeInitialState) 무변경 — panelSession 로컬만.
 */

import { describe, it, expect } from 'vitest'
import {
  makePanelInitialState,
  snapshotForPersist,
  panelReducerFn,
} from '../../../02.Source/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../../02.Source/renderer/src/store/panelSession'
import type { PanelThreadSnapshot } from '../../../02.Source/shared/ipc-contract'

// SET_REPL_MODE·APPLY_EVENT 등 액션은 구현 후 PanelAction 유니온에 추가된다.
// RED 단계에서는 유니온에 없어 타입상 미지 액션이므로 unknown 캐스팅으로 dispatch한다
// (esbuild는 타입만 stripping — 런타임은 panelReducer default 분기로 no-op → 값이 안 바뀜 = RED).
type AnyAction = Parameters<typeof panelReducerFn>[1]
function dispatch(state: PanelSessionState, action: unknown): PanelSessionState {
  return panelReducerFn(state, action as AnyAction)
}

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 1(멀티): 두 패널 독립 — slot0 SET_REPL_MODE(false)가 slot1로 새지 않음
// ═══════════════════════════════════════════════════════════════════════════════

describe('LR4 P07 시나리오 1(멀티): 패널별 replMode 독립 (SET_REPL_MODE 순수 테스트)', () => {
  it('slot0에 SET_REPL_MODE(false) → slot0.replMode=false, slot1은 기본값 그대로(불변)', () => {
    const slot0 = makePanelInitialState()
    const slot1 = makePanelInitialState()

    const next0 = dispatch(slot0, { type: 'SET_REPL_MODE', on: false })

    // slot0만 OFF로 내려간다.
    expect(next0.replMode).toBe(false)
    // slot1은 다른 패널 — 토글이 새지 않고 기본값(true)을 유지한다(전역 공유 아님).
    expect(slot1.replMode).toBe(true)
  })

  it('SET_REPL_MODE(true) 후 다시 (false) → 마지막 값이 반영된다', () => {
    let s = makePanelInitialState()
    s = dispatch(s, { type: 'SET_REPL_MODE', on: true })
    expect(s.replMode).toBe(true)
    s = dispatch(s, { type: 'SET_REPL_MODE', on: false })
    expect(s.replMode).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 2(멀티): 영속 라운드트립 — snapshotForPersist → JSON → makePanelInitialState
// ═══════════════════════════════════════════════════════════════════════════════

describe('LR4 P07 시나리오 2(멀티): replMode 영속 라운드트립', () => {
  it('snapshotForPersist(state replMode=false) → snapshot.replMode===false', () => {
    const state: PanelSessionState = { ...makePanelInitialState(), replMode: false, thread: [], seq: 0 }
    const snapshot = snapshotForPersist(state)
    expect(snapshot.replMode).toBe(false)
  })

  it('JSON 왕복 후 makePanelInitialState(snapshot) → state.replMode===false (복원)', () => {
    const state: PanelSessionState = { ...makePanelInitialState(), replMode: false, thread: [], seq: 0 }
    const snapshot = snapshotForPersist(state)
    // multiStore writeMulti/readMulti = JSON.stringify/parse 통째 — 그 왕복을 모사.
    const round = JSON.parse(JSON.stringify(snapshot)) as PanelThreadSnapshot
    const restored = makePanelInitialState(round)
    expect(restored.replMode).toBe(false)
  })

  it('replMode=true도 왕복 보존된다 (ON 세션)', () => {
    const state: PanelSessionState = { ...makePanelInitialState(), replMode: true, thread: [], seq: 0 }
    const snapshot = snapshotForPersist(state)
    expect(snapshot.replMode).toBe(true)
    const round = JSON.parse(JSON.stringify(snapshot)) as PanelThreadSnapshot
    expect(makePanelInitialState(round).replMode).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 시나리오 4(멀티): 하위호환 마이그 + 이벤트 보존
// ═══════════════════════════════════════════════════════════════════════════════

describe('LR4 P07 시나리오 4(멀티): 하위호환 폴백 + APPLY_EVENT 보존', () => {
  it('makePanelInitialState() (스냅샷 없음) → replMode 기본 true (전역 마이그값 미시드 시)', () => {
    // 새 패널: 시드 없으면 기본 true(held-open) — getReplModeDefault() 단일 출처의 미시드 폴백.
    expect(makePanelInitialState().replMode).toBe(true)
  })

  it('replMode 없는 옛 snapshot 복원 → 크래시 0 + 폴백 true (마이그 전 호환)', () => {
    const legacy: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: '옛 메시지' }],
      seq: 1,
      // replMode 필드 없음 (마이그레이션 전 스냅샷)
    }
    const restored = makePanelInitialState(legacy)
    // 크래시 없이 복원 + 폴백값 적용.
    expect(restored.thread.length).toBe(1)
    expect(restored.replMode).toBe(true)
  })

  it('SET_REPL_MODE(false) 후 APPLY_EVENT(text) 한 번 흘려도 replMode=false 유지 (이벤트마다 리셋 안 됨)', () => {
    let s: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'r1' }
    s = dispatch(s, { type: 'SET_REPL_MODE', on: false })
    expect(s.replMode).toBe(false)

    // 자기 runId 이벤트 하나 적용 — replMode는 대화/패널 설정이라 이벤트로 리셋되면 안 된다.
    const after = dispatch(s, {
      type: 'APPLY_EVENT',
      payload: { runId: 'r1', event: { type: 'text', delta: '응답' } },
    })
    expect(after.replMode).toBe(false)
  })
})
