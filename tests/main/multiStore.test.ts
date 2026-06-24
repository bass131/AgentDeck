/**
 * multiStore.test.ts — multiStore round-trip + cwd 재검증 단위 테스트 (TDD 먼저)
 *
 * TDD 순서: 이 파일 먼저 작성(실패) → src/main/multiStore.ts 구현 → 통과.
 *
 * 테스트 전략:
 *   - 순수 모듈(electron import 0): filePath 주입으로 임시 파일 경로 사용.
 *   - writeMulti / readMulti round-trip: deep-equal.
 *   - 파일 없음 → null (graceful).
 *   - 손상 JSON → null (크래시 0).
 *   - version≠2 blob → null (S1 — version 고정 = 2).
 *   - cwd 재검증 (신뢰경계 CRITICAL·B2):
 *       존재하지 않는 cwd → undefined drop
 *       비-절대경로 cwd → undefined drop
 *       비-디렉토리(파일) cwd → undefined drop
 *       유효 cwd(절대+exists+isDirectory) → 보존
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readMulti, writeMulti, validatePanelCwd } from '../../src/main/multiStore'
import type { PersistedMultiState } from '../../src/shared/ipc-contract'

// ── 픽스처 ────────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<PersistedMultiState> = {}): PersistedMultiState {
  return {
    version: 2,
    activeSessionId: 'sess-001',
    sessions: [
      {
        id: 'sess-001',
        title: 'Test Session',
        count: 2,
        panels: [
          {
            title: 'Panel 1',
            cwd: undefined,
            picker: { model: 'sonnet', effort: 'high', mode: 'normal' },
            sysPrompt: 'Be helpful',
            snapshot: undefined,
          },
          {
            title: 'Panel 2',
            cwd: undefined,
            picker: { model: 'haiku', effort: 'medium', mode: 'plan' },
            sysPrompt: undefined,
            snapshot: undefined,
          },
        ],
      },
    ],
    ...overrides,
  }
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('multiStore — round-trip (writeMulti / readMulti)', () => {
  let tmpDir: string
  let tmpFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiStore-'))
    tmpFile = path.join(tmpDir, 'multi-agent.json')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writeMulti → readMulti가 동일한 상태를 반환한다 (deep-equal)', () => {
    const state = makeState()
    writeMulti(tmpFile, state)
    const loaded = readMulti(tmpFile)
    expect(loaded).toEqual(state)
  })

  it('파일이 없으면 readMulti는 null을 반환한다 (graceful)', () => {
    const result = readMulti(path.join(tmpDir, 'nonexistent.json'))
    expect(result).toBeNull()
  })

  it('손상된 JSON이면 readMulti는 null을 반환한다 (크래시 0)', () => {
    fs.writeFileSync(tmpFile, '{ BROKEN JSON {{{{')
    const result = readMulti(tmpFile)
    expect(result).toBeNull()
  })

  it('version≠2 blob은 null을 반환한다 (S1 — version 고정 = 2)', () => {
    const badVersionState = { ...makeState(), version: 1 }
    fs.writeFileSync(tmpFile, JSON.stringify(badVersionState))
    const result = readMulti(tmpFile)
    expect(result).toBeNull()
  })

  it('version=2 blob은 정상 반환된다', () => {
    const state = makeState({ version: 2 })
    writeMulti(tmpFile, state)
    const result = readMulti(tmpFile)
    expect(result).not.toBeNull()
    expect(result?.version).toBe(2)
  })

  it('writeMulti는 부분 쓰기 실패를 조용히 무시한다 (best-effort)', () => {
    // 쓰기 불가 경로에 쓰기 시도 — 크래시 없어야 함
    expect(() => writeMulti('/nonexistent-dir/should/fail.json', makeState())).not.toThrow()
  })
})

// ── cwd 재검증 테스트 (신뢰경계 CRITICAL·B2) ─────────────────────────────────

describe('validatePanelCwd — cwd 재검증 (isAbsolute + existsSync + isDirectory)', () => {
  let tmpDir: string
  let tmpFile: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-validate-'))
    tmpFile = path.join(tmpDir, 'dummy.txt')
    fs.writeFileSync(tmpFile, 'dummy')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('유효한 절대경로 디렉토리는 그대로 반환한다 (보존)', () => {
    expect(validatePanelCwd(tmpDir)).toBe(tmpDir)
  })

  it('존재하지 않는 경로는 undefined를 반환한다', () => {
    expect(validatePanelCwd(path.join(tmpDir, 'nonexistent'))).toBeUndefined()
  })

  it('비-절대경로는 undefined를 반환한다 (절대경로 필수)', () => {
    expect(validatePanelCwd('relative/path/to/dir')).toBeUndefined()
  })

  it('파일 경로(디렉토리 아님)는 undefined를 반환한다', () => {
    expect(validatePanelCwd(tmpFile)).toBeUndefined()
  })

  it('undefined 입력은 undefined를 반환한다', () => {
    expect(validatePanelCwd(undefined)).toBeUndefined()
  })

  it('null 문자열이나 빈 문자열은 undefined를 반환한다', () => {
    expect(validatePanelCwd('')).toBeUndefined()
  })
})

// ── LOAD 핸들러 시뮬레이션 — cwd 재검증 통합 ──────────────────────────────────

describe('readMulti + cwd 재검증 통합 — LOAD 핸들러 동작 시뮬레이션', () => {
  let tmpDir: string
  let tmpFile: string
  let validCwdDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-validate-'))
    tmpFile = path.join(tmpDir, 'multi-agent.json')
    validCwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'valid-cwd-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(validCwdDir, { recursive: true, force: true })
  })

  it('유효한 cwd는 복원 후 보존된다', () => {
    const state = makeState()
    // 첫 번째 패널에 유효한 cwd 주입
    state.sessions[0].panels[0].cwd = validCwdDir
    writeMulti(tmpFile, state)

    const loaded = readMulti(tmpFile)!
    // validatePanelCwd로 cwd 재검증 적용
    const validatedPanels = loaded.sessions[0].panels.map(panel => ({
      ...panel,
      cwd: validatePanelCwd(panel.cwd),
    }))
    expect(validatedPanels[0].cwd).toBe(validCwdDir)
  })

  it('존재하지 않는 cwd는 재검증 후 undefined로 drop된다 (임의 경로 무확인 통과 0)', () => {
    const state = makeState()
    // 존재하지 않는 경로 주입 (hand-edit 공격 시뮬레이션)
    state.sessions[0].panels[0].cwd = '/absolutely/nonexistent/path/12345'
    writeMulti(tmpFile, state)

    const loaded = readMulti(tmpFile)!
    const validatedPanels = loaded.sessions[0].panels.map(panel => ({
      ...panel,
      cwd: validatePanelCwd(panel.cwd),
    }))
    expect(validatedPanels[0].cwd).toBeUndefined()
  })

  it('비-절대경로 cwd는 재검증 후 undefined로 drop된다', () => {
    const state = makeState()
    state.sessions[0].panels[0].cwd = 'relative/path'
    writeMulti(tmpFile, state)

    const loaded = readMulti(tmpFile)!
    const validatedPanels = loaded.sessions[0].panels.map(panel => ({
      ...panel,
      cwd: validatePanelCwd(panel.cwd),
    }))
    expect(validatedPanels[0].cwd).toBeUndefined()
  })
})
