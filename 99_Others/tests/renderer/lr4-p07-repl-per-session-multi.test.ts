import { describe, it, expect } from 'vitest'
import {
  makePanelInitialState,
  snapshotForPersist,
  panelReducerFn,
} from '../../../02_Source/renderer/src/store/panelSession'
import type { PanelSessionState } from '../../../02_Source/renderer/src/store/panelSession'
import type { PanelThreadSnapshot } from '../../../02_Source/shared/ipcContract'

type AnyAction = Parameters<typeof panelReducerFn>[1]
function dispatch(state: PanelSessionState, action: unknown): PanelSessionState {
  return panelReducerFn(state, action as AnyAction)
}

describe('LR4 P07 시나리오 1(멀티): 패널별 replMode 독립 (SET_REPL_MODE 순수 테스트)', () => {
  it('slot0에 SET_REPL_MODE(false) → slot0.replMode=false, slot1은 기본값 그대로(불변)', () => {
    const slot0 = makePanelInitialState()
    const slot1 = makePanelInitialState()

    const next0 = dispatch(slot0, { type: 'SET_REPL_MODE', on: false })

    expect(next0.replMode).toBe(false)
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

describe('LR4 P07 시나리오 2(멀티): replMode 영속 라운드트립', () => {
  it('snapshotForPersist(state replMode=false) → snapshot.replMode===false', () => {
    const state: PanelSessionState = { ...makePanelInitialState(), replMode: false, thread: [], seq: 0 }
    const snapshot = snapshotForPersist(state)
    expect(snapshot.replMode).toBe(false)
  })

  it('JSON 왕복 후 makePanelInitialState(snapshot) → state.replMode===false (복원)', () => {
    const state: PanelSessionState = { ...makePanelInitialState(), replMode: false, thread: [], seq: 0 }
    const snapshot = snapshotForPersist(state)
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

describe('LR4 P07 시나리오 4(멀티): 하위호환 폴백 + APPLY_EVENT 보존', () => {
  it('makePanelInitialState() (스냅샷 없음) → replMode 기본 true (전역 마이그값 미시드 시)', () => {
    expect(makePanelInitialState().replMode).toBe(true)
  })

  it('replMode 없는 옛 snapshot 복원 → 크래시 0 + 폴백 true (마이그 전 호환)', () => {
    const legacy: PanelThreadSnapshot = {
      messages: [{ id: 'p1', role: 'user', text: '옛 메시지' }],
      seq: 1,
    }
    const restored = makePanelInitialState(legacy)
    expect(restored.thread.length).toBe(1)
    expect(restored.replMode).toBe(true)
  })

  it('SET_REPL_MODE(false) 후 APPLY_EVENT(text) 한 번 흘려도 replMode=false 유지 (이벤트마다 리셋 안 됨)', () => {
    let s: PanelSessionState = { ...makePanelInitialState(), currentRunId: 'r1' }
    s = dispatch(s, { type: 'SET_REPL_MODE', on: false })
    expect(s.replMode).toBe(false)

    const after = dispatch(s, {
      type: 'APPLY_EVENT',
      payload: { runId: 'r1', event: { type: 'text', delta: '응답' } },
    })
    expect(after.replMode).toBe(false)
  })
})
