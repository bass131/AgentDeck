import { describe, it, expect } from 'vitest'
import { resolveReplLit } from '../../../02_Project/00_Source/renderer/src/lib/replIndicator'

describe('resolveReplLit — REPL 상태 표시등 점등 판정(영호 조정: ON=상시 점등)', () => {
  it('replMode OFF → 소등(false), 활동 신호가 없어도(애초 인자 자체가 없음) 항상 false', () => {
    expect(resolveReplLit(false)).toBe(false)
  })

  it('replMode ON → 점등(true), 활동(isRunning/hasActiveLoop) 무관 — 인자 자체를 받지 않는다', () => {
    expect(resolveReplLit(true)).toBe(true)
  })
})
