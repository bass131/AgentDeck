/**
 * skipDirs.test.ts — SKIP_DIRS/KEEP_DOT_DIRS/MAX_FILES 단일출처 보증 (Phase 35)
 *
 * skipDirs.ts 는 listFiles.ts(멘션 워크)의 상수를 단일출처로 이전한 순수 리팩터.
 * 기능 변화 없음 — 상수 값이 원본(files.ts)과 동일함을 보증한다.
 */

import { describe, it, expect } from 'vitest'
import { SKIP_DIRS, KEEP_DOT_DIRS, MAX_FILES } from '../../src/main/02_fs/skipDirs'

describe('SKIP_DIRS (멘션 워크 전용 필터 상수)', () => {
  it('node_modules 포함', () => {
    expect(SKIP_DIRS.has('node_modules')).toBe(true)
  })

  it('.git 포함', () => {
    expect(SKIP_DIRS.has('.git')).toBe(true)
  })

  it('dist 포함', () => {
    expect(SKIP_DIRS.has('dist')).toBe(true)
  })

  it('원본(files.ts) 전체 집합 검증 — 29개 항목', () => {
    // 원본 AgentCodeGUI/src/main/files.ts SKIP_DIRS 항목 전체
    const expected = [
      'node_modules', '.git', '.hg', '.svn', 'dist', 'out', 'build', 'coverage',
      '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache', '.vite',
      '.idea', '.vs', '.gradle', 'bin', 'obj', 'target', 'vendor', '__pycache__',
      '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.expo', 'Pods', '.dart_tool'
    ]
    for (const dir of expected) {
      expect(SKIP_DIRS.has(dir), `SKIP_DIRS에 '${dir}' 없음`).toBe(true)
    }
  })
})

describe('KEEP_DOT_DIRS (멘션에 포함할 dot-디렉토리)', () => {
  it('.github 포함', () => {
    expect(KEEP_DOT_DIRS.has('.github')).toBe(true)
  })

  it('.claude 포함', () => {
    expect(KEEP_DOT_DIRS.has('.claude')).toBe(true)
  })

  it('.vscode 포함', () => {
    expect(KEEP_DOT_DIRS.has('.vscode')).toBe(true)
  })
})

describe('MAX_FILES (멘션 팔레트 파일 상한)', () => {
  it('6000 이상', () => {
    expect(MAX_FILES).toBeGreaterThanOrEqual(6000)
  })

  it('원본과 동일 — 6000', () => {
    expect(MAX_FILES).toBe(6000)
  })
})
