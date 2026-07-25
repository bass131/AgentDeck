/**
 * stop-action-fb2-p02.test.ts — 정지 버튼 판정 헬퍼 단위 테스트 (FB2 Phase 02).
 *
 * 배경(01.Phases/FB2-ui-feedback2/02-interrupt-fix.md, P01 진단 위임 반영판):
 * `interrupt()`는 "현재 턴"만 중단하고, goal/loop의 self-re-arm(세션 스코프 자기지속)은
 * 세션을 끝내는 `abort()`만이 해제한다(fb2-p01-interrupt-scope-selfrearm.test.ts 증거).
 * 기존 정지 버튼(Conversation.tsx/PanelView.tsx handleAbort)은 replMode만 보고
 * interrupt vs abort를 골라 goal/loop 활성 중에는 "정지"가 세션까지 안 닿았다.
 *
 * decideStopAction — goal/loop 활성 시 항상 abort, 아니면 기존 replMode 분기 유지.
 * CRITICAL: 순수 함수 단위 테스트 — window.api/DOM 불필요.
 */
import { describe, it, expect } from 'vitest'
import { decideStopAction } from '../../../02.Source/renderer/src/lib/stopAction'
import type { LoopInfo } from '../../../02.Source/shared/agent-events'

function mkLoop(id = 'wakeup'): LoopInfo {
  return { id, summary: '주기 작업' }
}

describe('decideStopAction — FB2 P02: goal/loop 활성이면 항상 abort', () => {
  it('activeLoops 비어있지 않으면(SDK 크론 활성) replMode 무관 abort', () => {
    expect(decideStopAction(true, [mkLoop()], null)).toBe('abort')
    expect(decideStopAction(false, [mkLoop()], null)).toBe('abort')
  })

  it("pendingCommand.name === 'goal'이면 replMode 무관 abort", () => {
    expect(decideStopAction(true, [], { name: 'goal' })).toBe('abort')
    expect(decideStopAction(false, [], { name: 'goal' })).toBe('abort')
  })

  it("pendingCommand.name이 'goal'이 아니면 goal 분기 미적용(다른 슬래시 카드는 활성 취급 X)", () => {
    expect(decideStopAction(true, [], { name: 'compact' })).toBe('interrupt')
    expect(decideStopAction(false, [], { name: 'compact' })).toBe('abort')
  })

  it('activeLoops 비고 goal도 아니면(일반 스트리밍 턴) replMode ON → interrupt', () => {
    expect(decideStopAction(true, [], null)).toBe('interrupt')
    expect(decideStopAction(true, [], undefined)).toBe('interrupt')
  })

  it('activeLoops 비고 goal도 아니면 replMode OFF → abort (BF1 계약 불변)', () => {
    expect(decideStopAction(false, [], null)).toBe('abort')
    expect(decideStopAction(false, [], undefined)).toBe('abort')
  })
})
