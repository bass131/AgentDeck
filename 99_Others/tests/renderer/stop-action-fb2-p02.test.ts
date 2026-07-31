import { describe, it, expect } from 'vitest'
import { decideStopAction } from '../../../02_Source/renderer/src/lib/stopAction'
import type { LoopInfo } from '../../../02_Source/shared/agentEvents'

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
