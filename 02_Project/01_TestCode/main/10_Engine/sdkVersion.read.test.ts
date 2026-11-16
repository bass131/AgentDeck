import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readInstalledSdkVersion, SDK_VERSION_FALLBACK } from '@main/10_Engine/sdkVersion'
import { ClaudeCodeBackend } from '@main/04_Claude/ClaudeCodeBackend'
import { getEngineState } from '@main/10_Engine/engineState'

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

  test('readInstalledSdkVersion()이 실 버전을 읽는다(폴백 아님)', () => {
    const v = readInstalledSdkVersion()
    expect(v).not.toBeNull()
    expect(v).toBe(real)
  })

  test('폴백 상수는 semver 문자열이다', () => {
    expect(SDK_VERSION_FALLBACK).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // Backlog 4: 폴백이 0.3.186에 묶여 설치본(0.3.201)보다 낡아 있었다. M06 G4에서 0.3.325로 올렸다. 의존 명세가 바뀌면 이 테스트가 폴백 갱신을 요구한다.
  test('폴백 상수 = package.json 의존 명세에서 접두 기호를 뗀 값(드리프트 고정)', () => {
    const rootPkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    const spec: unknown = rootPkg.dependencies?.['@anthropic-ai/claude-agent-sdk']
    expect(typeof spec).toBe('string')
    expect(SDK_VERSION_FALLBACK).toBe(String(spec).replace(/^[\^~]/, ''))
  })
})

// M05 G11: 두 벌이던 리더를 10_Engine/sdkVersion 하나로 모았다. 두 소비처가 같은 리더를 쓰는지 소비처 쪽에서 고정한다.
describe('두 소비처가 같은 리더를 거친다 (M05 G11)', () => {
  const real = realInstalledVersion()

  test('ClaudeCodeBackend.version() 기본 경로 — 활성 엔진이 없으면 설치본 버전', async () => {
    const v = await new ClaudeCodeBackend().version()
    expect(v).toBe(real)
  })

  test('getEngineState() 기본 getVersion — 설치본 버전', async () => {
    const state = await getEngineState({
      isAvailable: async () => true,
      readCredentials: () => null,
      env: {},
    })
    expect(state.version).toBe(real)
  })
})
