/**
 * fileChangeTracker.test.ts — FileChangeTracker 골든 테스트 (RF1-followup P03)
 *
 * eventNormalizer.ts에서 분리된 파일변경 추적 클래스(record/resolve)의 거동을 고정한다.
 * 분해 전 RunEventNormalizer 내부 _recordFilePending/_resolveFilePending와 1:1 동일.
 *
 * 검증:
 *  - record(tool_use) → resolve(ok=true) → file_changed 이벤트 + diff.
 *  - resolve(ok=false) → 이벤트 없음(유령 마커 방지).
 *  - 미존재 id resolve → 이벤트 없음.
 *  - 비-파일변경 도구 record → pending 미등록.
 *  - 워크스페이스 상대 경로 정규화(POSIX).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileChangeTracker } from '../../../02.Source/main/01_agents/fileChangeTracker'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fct-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('FileChangeTracker', () => {
  it('Write(신규 파일) record → resolve(ok) → add file_changed', () => {
    const t = new FileChangeTracker(dir)
    // record 시점에는 파일 없음 → change='add'
    t.record('id1', 'Write', { file_path: join(dir, 'new.txt') })
    // 파일 생성(도구가 쓴 것을 시뮬레이트)
    writeFileSync(join(dir, 'new.txt'), 'hello\nworld\n')
    const events = t.resolve('id1', true)
    expect(events.length).toBe(1)
    const e = events[0]
    expect(e.type).toBe('file_changed')
    expect((e as { change: string }).change).toBe('add')
    expect((e as { path: string }).path).toBe('new.txt')
    expect((e as { toolId: string }).toolId).toBe('id1')
  })

  it('Edit(기존 파일) record → resolve(ok) → modify file_changed + diff', () => {
    writeFileSync(join(dir, 'a.txt'), 'line1\n')
    const t = new FileChangeTracker(dir)
    t.record('id2', 'Edit', { file_path: join(dir, 'a.txt') })
    writeFileSync(join(dir, 'a.txt'), 'line1\nline2\n')
    const events = t.resolve('id2', true)
    expect(events.length).toBe(1)
    expect((events[0] as { change: string }).change).toBe('modify')
    expect((events[0] as { diff?: unknown }).diff).toBeDefined()
  })

  it('resolve(ok=false) → 이벤트 없음 (유령 마커 방지)', () => {
    const t = new FileChangeTracker(dir)
    t.record('id3', 'Write', { file_path: join(dir, 'x.txt') })
    const events = t.resolve('id3', false)
    expect(events).toEqual([])
  })

  it('미존재 id resolve → 이벤트 없음', () => {
    const t = new FileChangeTracker(dir)
    expect(t.resolve('nope', true)).toEqual([])
  })

  it('비-파일변경 도구 record → pending 미등록 (resolve 무이벤트)', () => {
    const t = new FileChangeTracker(dir)
    t.record('id4', 'Bash', { command: 'ls' })
    expect(t.resolve('id4', true)).toEqual([])
  })

  it('clear() 후 resolve → 이벤트 없음', () => {
    const t = new FileChangeTracker(dir)
    t.record('id5', 'Write', { file_path: join(dir, 'y.txt') })
    t.clear()
    writeFileSync(join(dir, 'y.txt'), 'z')
    expect(t.resolve('id5', true)).toEqual([])
  })
})
