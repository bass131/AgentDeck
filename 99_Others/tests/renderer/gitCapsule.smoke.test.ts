// @vitest-environment node
// 캡슐 경계 스모크 테스트 — git 기능 캡슐(02_Source/renderer/src/features/git)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
import { describe, it, expect } from 'vitest'
import { GitModal } from '../../../02_Source/renderer/src/features/git'

describe('git 캡슐 — 공개 표면 스모크', () => {
  it('GitModal이 캡슐 경로에서 export된다', () => {
    expect(typeof GitModal).toBe('function')
  })
})
