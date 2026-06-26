/**
 * diff.test.ts — 워크트리 vs 스냅샷 라인 diff 단위 테스트
 *
 * electron을 import하지 않는 순수 모듈.
 * DiffLine 타입은 shared/ipc-contract에서 import.
 */

import { describe, it, expect } from 'vitest'
import { computeDiff } from '../../src/main/02_fs/diff'
import type { DiffLine } from '../../src/shared/ipc-contract'

describe('computeDiff', () => {
  it('동일한 내용이면 모두 context 라인을 반환한다', () => {
    const lines = computeDiff('hello\nworld', 'hello\nworld')
    expect(lines.every((l) => l.kind === 'context')).toBe(true)
    expect(lines.length).toBe(2)
  })

  it('라인이 추가된 경우 add 라인을 포함한다', () => {
    const lines = computeDiff('hello', 'hello\nworld')
    const adds = lines.filter((l) => l.kind === 'add')
    expect(adds.length).toBe(1)
    expect(adds[0].content).toBe('world')
  })

  it('라인이 삭제된 경우 remove 라인을 포함한다', () => {
    const lines = computeDiff('hello\nworld', 'hello')
    const removes = lines.filter((l) => l.kind === 'remove')
    expect(removes.length).toBe(1)
    expect(removes[0].content).toBe('world')
  })

  it('add 라인에 lineNew 번호가 있다', () => {
    const lines = computeDiff('', 'alpha\nbeta')
    const adds = lines.filter((l) => l.kind === 'add')
    expect(adds[0].lineNew).toBeDefined()
    expect(adds[0].lineOld).toBeUndefined()
  })

  it('remove 라인에 lineOld 번호가 있다', () => {
    const lines = computeDiff('alpha\nbeta', '')
    const removes = lines.filter((l) => l.kind === 'remove')
    expect(removes[0].lineOld).toBeDefined()
    expect(removes[0].lineNew).toBeUndefined()
  })

  it('context 라인에 lineOld와 lineNew가 모두 있다', () => {
    const lines = computeDiff('ctx\nchanged', 'ctx\nnew')
    const ctxLines = lines.filter((l) => l.kind === 'context')
    for (const c of ctxLines) {
      expect(c.lineOld).toBeDefined()
      expect(c.lineNew).toBeDefined()
    }
  })

  it('스냅샷이 빈 문자열이면 전부 add다', () => {
    const lines = computeDiff('', 'a\nb\nc')
    expect(lines.every((l) => l.kind === 'add')).toBe(true)
    expect(lines.length).toBe(3)
  })

  it('워크트리가 빈 문자열이면 전부 remove다', () => {
    const lines = computeDiff('a\nb\nc', '')
    expect(lines.every((l) => l.kind === 'remove')).toBe(true)
    expect(lines.length).toBe(3)
  })

  it('중간 라인 변경 골든 케이스', () => {
    const old = 'line1\nline2\nline3'
    const next = 'line1\nmodified\nline3'
    const lines = computeDiff(old, next)

    const removes = lines.filter((l) => l.kind === 'remove')
    const adds = lines.filter((l) => l.kind === 'add')
    const ctx = lines.filter((l) => l.kind === 'context')

    expect(removes.some((l) => l.content === 'line2')).toBe(true)
    expect(adds.some((l) => l.content === 'modified')).toBe(true)
    expect(ctx.some((l) => l.content === 'line1')).toBe(true)
    expect(ctx.some((l) => l.content === 'line3')).toBe(true)
  })

  it('DiffLine 타입이 content 문자열을 갖는다', () => {
    const lines: DiffLine[] = computeDiff('a', 'b')
    for (const l of lines) {
      expect(typeof l.content).toBe('string')
    }
  })

  it('양 쪽 모두 빈 문자열이면 빈 배열을 반환한다', () => {
    const lines = computeDiff('', '')
    expect(lines).toEqual([])
  })
})
