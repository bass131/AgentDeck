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
})
