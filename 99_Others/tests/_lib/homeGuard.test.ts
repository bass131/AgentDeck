/**
 * homeGuard.test.ts — 테스트 격리 전역 게이트의 순수 함수 단위 테스트 (BZ P02 · 백로그 21①)
 *
 * 대상: `_lib/homeGuard.ts` 의 `snapshotDir`(디렉토리 상태 스냅샷) · `diffSnapshot`(대조).
 *
 * 설계 규율 (백로그 21 사고의 교훈 — engineVersions.test.ts 상단 주석 참조):
 *   - **모킹 없이 임시 디렉토리**로 테스트한다. 이 모듈의 존재 이유가 "fs 모킹이 조용히
 *     빗나가도 테스트는 green" 이라는 실패 부류를 잡는 것인데, 그 모듈 자신을 fs 모킹으로
 *     검증하면 같은 함정에 다시 들어간다. (trade-off: 실 디스크 I/O 수 ms 발생.)
 *   - 다만 **주입 가능성 자체**는 별도 케이스에서 가짜 `GuardFs` 로 확인한다 —
 *     주입구가 살아 있는지는 순수 함수 계약의 일부이기 때문.
 *   - 결정론: mtime 비교는 `sleep` 이 아니라 `fs.utimesSync` 로 시각을 **명시 지정**한다.
 *     (같은 밀리초 안에서 덮어써도 흔들리지 않는다.)
 *
 * ⚠️ 이 테스트가 쓰는 임시 디렉토리는 `os.tmpdir()` 아래다 — 감시 대상(`~/.agentdeck-dev`)과
 *    겹치지 않으므로 globalSetup 게이트 자신을 오염시키지 않는다.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  snapshotDir,
  diffSnapshot,
  formatDiff,
  nodeGuardFs,
  type GuardFs,
  type DirSnapshot,
} from './homeGuard'

// ── 임시 디렉토리 픽스처 ───────────────────────────────────────────────────────

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-homeguard-'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

/** 파일 쓰기 + mtime 고정(결정론) */
function write(rel: string, content: string, mtimeSec = 1_700_000_000): void {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  fs.utimesSync(abs, mtimeSec, mtimeSec)
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. snapshotDir — 상태 포착
// ══════════════════════════════════════════════════════════════════════════════

describe('snapshotDir()', () => {
  it('부재 디렉토리 → exists=false, entries 비어 있음', () => {
    const snap = snapshotDir(path.join(root, 'nope'), nodeGuardFs)
    expect(snap.exists).toBe(false)
    expect(snap.entries).toEqual({})
  })

  it('파일 존재 → exists=true + size·mtimeMs 기록', () => {
    write('engine-config.json', '{"activeVersion":null}')
    const snap = snapshotDir(root, nodeGuardFs)
    expect(snap.exists).toBe(true)
    const entry = snap.entries['engine-config.json']
    expect(entry).toBeDefined()
    expect(entry.kind).toBe('file')
    if (entry.kind !== 'file') throw new Error('unreachable')
    expect(entry.size).toBe(22)
    expect(entry.mtimeMs).toBe(1_700_000_000_000)
  })

  it('하위 디렉토리 재귀 + 상대경로는 POSIX 슬래시로 정규화', () => {
    write('engines/1.2.3/package.json', '{}')
    const snap = snapshotDir(root, nodeGuardFs)
    expect(Object.keys(snap.entries).sort()).toEqual([
      'engines',
      'engines/1.2.3',
      'engines/1.2.3/package.json',
    ])
    expect(snap.entries['engines'].kind).toBe('dir')
  })

  it('빈 하위 디렉토리도 항목으로 기록 (빈 폴더 생성 검출용)', () => {
    fs.mkdirSync(path.join(root, 'empty'), { recursive: true })
    const snap = snapshotDir(root, nodeGuardFs)
    expect(snap.entries['empty']).toEqual({ kind: 'dir' })
  })

  it('GuardFs 주입 가능 — 가짜 fs 로도 동작 (순수 함수 계약)', () => {
    const fake: GuardFs = {
      existsSync: (p) => p === '/virtual',
      readdirSync: (p) =>
        p === '/virtual' ? [{ name: 'a.json', isDirectory: false, isFile: true }] : [],
      statSync: () => ({ size: 7, mtimeMs: 42 }),
    }
    const snap = snapshotDir('/virtual', fake)
    expect(snap.exists).toBe(true)
    expect(snap.entries['a.json']).toEqual({ kind: 'file', size: 7, mtimeMs: 42 })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. diffSnapshot — 추가 / 수정 / 삭제 3종 + 디렉토리 부재→생성
// ══════════════════════════════════════════════════════════════════════════════

describe('diffSnapshot()', () => {
  it('변화 없음 → 빈 배열', () => {
    write('engine-config.json', '{"activeVersion":null}')
    const before = snapshotDir(root, nodeGuardFs)
    const after = snapshotDir(root, nodeGuardFs)
    expect(diffSnapshot(before, after)).toEqual([])
  })

  it('추가 검출 — 없던 파일이 생김', () => {
    const before = snapshotDir(root, nodeGuardFs)
    write('engine-config.json', '{"activeVersion":null}')
    const diff = diffSnapshot(before, snapshotDir(root, nodeGuardFs))
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('added')
    expect(diff[0].path).toBe('engine-config.json')
  })

  it('수정 검출 — size 변화 (같은 mtime 이어도 잡는다)', () => {
    write('engine-config.json', '{"activeVersion":null}')
    const before = snapshotDir(root, nodeGuardFs)
    // 내용 길이가 달라지고 mtime 은 **동일**하게 유지 → size 축만으로 검출돼야 한다
    write('engine-config.json', '{"activeVersion":"1.2.3"}')
    const diff = diffSnapshot(before, snapshotDir(root, nodeGuardFs))
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
    expect(diff[0].path).toBe('engine-config.json')
    expect(diff[0].detail).toMatch(/size/)
  })

  it('수정 검출 — mtime 변화 (size 가 같아도 잡는다)', () => {
    write('engine-config.json', '{"activeVersion":null}')
    const before = snapshotDir(root, nodeGuardFs)
    // 같은 길이로 덮어쓰고 mtime 만 다르게 → mtime 축만으로 검출돼야 한다
    write('engine-config.json', '{"activeVersion":TRUE}', 1_700_000_999)
    const diff = diffSnapshot(before, snapshotDir(root, nodeGuardFs))
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('modified')
    expect(diff[0].detail).toMatch(/mtime/)
  })

  it('삭제 검출 — 있던 파일이 사라짐', () => {
    write('engine-config.json', '{}')
    const before = snapshotDir(root, nodeGuardFs)
    fs.rmSync(path.join(root, 'engine-config.json'))
    const diff = diffSnapshot(before, snapshotDir(root, nodeGuardFs))
    expect(diff).toHaveLength(1)
    expect(diff[0].kind).toBe('removed')
    expect(diff[0].path).toBe('engine-config.json')
  })

  it('대상 디렉토리 부재 → 종료 시 생성됐으면 검출 (게이트의 핵심 시나리오)', () => {
    const target = path.join(root, 'agentdeck-dev')
    const before = snapshotDir(target, nodeGuardFs)
    expect(before.exists).toBe(false)

    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'engine-config.json'), '{"activeVersion":null}')

    const diff = diffSnapshot(before, snapshotDir(target, nodeGuardFs))
    // 디렉토리 자신(.) + 그 안의 파일이 모두 added 로 보고된다
    expect(diff.map((d) => d.path)).toEqual(['.', 'engine-config.json'])
    expect(diff.every((d) => d.kind === 'added')).toBe(true)
    expect(diff[0].detail).toMatch(/디렉토리/)
  })

  it('대상 디렉토리 통째 삭제도 검출', () => {
    write('engine-config.json', '{}')
    const before = snapshotDir(root, nodeGuardFs)
    fs.rmSync(root, { recursive: true, force: true })
    const diff = diffSnapshot(before, snapshotDir(root, nodeGuardFs))
    expect(diff[0]).toMatchObject({ kind: 'removed', path: '.' })
  })

  it('여러 변화는 경로 사전순으로 정렬 (출력 결정론)', () => {
    write('b.json', '{}')
    write('c.json', '{}')
    const before = snapshotDir(root, nodeGuardFs)
    write('a.json', '{}')
    write('c.json', '{"x":1}')
    fs.rmSync(path.join(root, 'b.json'))
    const diff = diffSnapshot(before, snapshotDir(root, nodeGuardFs))
    expect(diff.map((d) => `${d.kind}:${d.path}`)).toEqual([
      'added:a.json',
      'removed:b.json',
      'modified:c.json',
    ])
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. formatDiff — 침묵 금지(어느 파일이 어떻게 달라졌는지 에러 메시지에 실린다)
// ══════════════════════════════════════════════════════════════════════════════

describe('formatDiff()', () => {
  it('경로·종류·상세가 모두 문자열에 실린다', () => {
    const before: DirSnapshot = { dir: '/watch', exists: true, entries: {} }
    const after: DirSnapshot = {
      dir: '/watch',
      exists: true,
      entries: { 'engine-config.json': { kind: 'file', size: 27, mtimeMs: 5 } },
    }
    const text = formatDiff('/watch', diffSnapshot(before, after))
    expect(text).toContain('/watch')
    expect(text).toContain('engine-config.json')
    expect(text).toContain('added')
  })
})
