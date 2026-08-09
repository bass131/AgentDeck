import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readInstalledSdkVersion as readFromBackend } from '../../../02_Project/00_Source/main/01_agents/ClaudeCodeBackend'
import { readInstalledSdkVersion as readFromEngineState } from '../../../02_Project/00_Source/main/07_engine/engineState'

function realInstalledVersion(): string {
  const p = join(
    process.cwd(),
    'node_modules',
    '@anthropic-ai',
    'claude-agent-sdk',
    'package.json'
  )
  const pkg = JSON.parse(readFileSync(p, 'utf8'))
  return pkg.version
}

describe('SDK package.json 실 읽기 (exports 제약 우회) — 회귀 가드', () => {
  const real = realInstalledVersion()

  test('실제 설치 버전이 유효한 semver 문자열이다(테스트 전제)', () => {
    expect(real).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('ClaudeCodeBackend.readInstalledSdkVersion()이 실 버전을 읽는다(폴백 아님)', () => {
    const v = readFromBackend()
    expect(v).not.toBeNull()
    expect(v).toBe(real)
  })

  test('engine-state.readInstalledSdkVersion()이 실 버전을 읽는다(폴백 아님)', () => {
    const v = readFromEngineState()
    expect(v).not.toBeNull()
    expect(v).toBe(real)
  })

  test('두 리더가 동일 버전을 보고한다(드리프트 0)', () => {
    expect(readFromBackend()).toBe(readFromEngineState())
  })
})
