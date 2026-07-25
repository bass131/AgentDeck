/**
 * sdk-version-read.test.ts — SDK package.json 실 읽기 회귀 가드.
 *
 * 배경(라이브 검증으로 발견한 실 버그):
 *   `@anthropic-ai/claude-agent-sdk`의 package.json `exports`에 './package.json'
 *   서브패스가 없어, `require('@anthropic-ai/claude-agent-sdk/package.json')`은
 *   `ERR_PACKAGE_PATH_NOT_EXPORTED`로 **항상 throw**한다. 그 결과 버전 읽기가
 *   언제나 fallback 상수로만 동작 → 하드코딩 제거 목적이 무력화되고, SDK 버전업 시
 *   drift가 발생한다.
 *
 *   기존 단위 테스트는 resolvePackageVersion/getVersion을 **주입 mock**해서 실 default
 *   경로를 타지 않았기 때문에 이 버그를 놓쳤다. 이 파일은 **주입 없이 실 default 리더**를
 *   직접 호출해 회귀를 가드한다.
 *
 * 가드 핵심: 리더는 폴백 없이 **성공 시 실 버전 문자열 / 실패 시 null**을 반환해야 한다.
 *   exports 버그가 재발하면 null이 되어 이 테스트가 빨강이 된다(폴백과 무관하게 판별).
 */
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readInstalledSdkVersion as readFromBackend } from '../../../02.Source/main/01_agents/ClaudeCodeBackend'
import { readInstalledSdkVersion as readFromEngineState } from '../../../02.Source/main/engine-state'

/** 테스트가 직접 fs로 읽은 실제 설치 버전(exports 제약 무관 — 직접 파일 경로). */
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
    // 버그(require 서브패스 throw) 재발 시 null → 빨강
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
