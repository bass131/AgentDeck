import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Phase 01 smoke: 테스트 하네스(Vitest)가 동작하는지 확인.
// 실제 도메인 테스트는 Phase 02+ 에서 TDD로 추가된다.
describe('smoke', () => {
  it('Vitest가 동작한다', () => {
    expect(1 + 1).toBe(2)
  })

  it('프로젝트 메타가 존재한다', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('agentdeck')
  })
})
