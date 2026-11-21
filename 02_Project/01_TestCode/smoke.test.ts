import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('smoke', () => {
  it('Vitest가 동작한다', () => {
    expect(1 + 1).toBe(2)
  })

  it('프로젝트 메타가 존재한다', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))
    expect(pkg.name).toBe('agentdeck')
  })

  // 이 기계의 콜드 import가 기본 5초를 넘어 설정 기본값을 30초로 둔다.
  it('테스트 기본 타임아웃이 30초다', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf-8')
    expect(cfg).toMatch(/^\s*testTimeout:\s*30000,/m)
  })

  // beforeAll의 콜드 import가 기본 10초 훅 타임아웃을 넘어 훅 기본값도 30초로 둔다.
  it('훅 기본 타임아웃도 30초다', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vitest.config.ts'), 'utf-8')
    expect(cfg).toMatch(/^\s*hookTimeout:\s*30000,/m)
  })
})
