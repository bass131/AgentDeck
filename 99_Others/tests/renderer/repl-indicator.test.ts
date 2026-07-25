/**
 * repl-indicator.test.ts — LR3-06 REPL 상태 표시등 판정(resolveReplLit) 계약.
 *
 * 배경(영호 조정 2026-07-03, 06-loop-gui-polish.md 육안 게이트): 애초 판정은 "세션이 지금
 * 실제로 살아있는지"(isRunning || hasActiveLoop)를 대리해 활동 중에만 점등했다. 영호 육안
 * 검토에서 의미를 조정 — REPL 버튼은 "기능이 켜져 있음"을 보여주는 **상시 표시등**이어야
 * 한다("ON을 통해 기능이 활성화 되어 있으면 계속 점등"). 즉 activity 신호는 더 이상 관여하지
 * 않고, 점등 = replMode 토글 그 자체.
 */
import { describe, it, expect } from 'vitest'
import { resolveReplLit } from '../../../02.Source/renderer/src/lib/replIndicator'

describe('resolveReplLit — REPL 상태 표시등 점등 판정(영호 조정: ON=상시 점등)', () => {
  it('replMode OFF → 소등(false), 활동 신호가 없어도(애초 인자 자체가 없음) 항상 false', () => {
    expect(resolveReplLit(false)).toBe(false)
  })

  it('replMode ON → 점등(true), 활동(isRunning/hasActiveLoop) 무관 — 인자 자체를 받지 않는다', () => {
    expect(resolveReplLit(true)).toBe(true)
  })
})
