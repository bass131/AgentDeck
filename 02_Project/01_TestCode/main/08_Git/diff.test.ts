import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { computeDiff } from '@main/08_Git/diff'
import type { DiffLine } from '@shared/ipcContract'

describe('08_Git 파일 의존', () => {
  it('폴더 안 상대 import에 순환이 없다', () => {
    const dir = path.resolve(__dirname, '../../../00_Source/main/08_Git')
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3))
    const edges = new Map<string, string[]>()
    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, `${f}.ts`), 'utf8')
      const local = [...src.matchAll(/from '(?:\.\/|@main\/08_Git\/)([A-Za-z]+)'/g)].map((m) => m[1])
      edges.set(f, local.filter((t) => files.includes(t)))
    }
    const cycles: string[] = []
    const walk = (node: string, trail: string[]): void => {
      if (trail.includes(node)) { cycles.push([...trail, node].join(' → ')); return }
      for (const next of edges.get(node) ?? []) walk(next, [...trail, node])
    }
    for (const f of files) walk(f, [])
    expect(cycles).toEqual([])
  })
})

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

// 상한을 넘으면 앞뒤 공통 줄만 문맥으로, 가운데는 지운 줄·더한 줄로 보인다
describe('computeDiff 크기 상한 (M11 G3)', () => {
  const big = (n: number, f: (i: number) => string): string => Array.from({ length: n }, (_, i) => f(i)).join('\n')

  it('[M11-G3 M11-21] 상한을 넘으면 앞뒤 공통 줄만 문맥이고 가운데는 지운 줄 뒤 더한 줄이다', () => {
    const n = 2601
    const oldText = big(n, (i) => `k${i}`)
    const newText = big(n, (i) => (i >= 5 && i < n - 5 && (i - 5) % 2 === 0 ? `new${i}` : `k${i}`))
    const lines = computeDiff(oldText, newText)
    const kinds = lines.map((l) => l.kind)
    expect(kinds.filter((k) => k === 'context')).toHaveLength(10)
    expect(kinds.slice(0, 5).every((k) => k === 'context')).toBe(true)
    expect(kinds.slice(-5).every((k) => k === 'context')).toBe(true)
    const mid = lines.slice(5, -5)
    expect(mid.filter((l) => l.kind === 'remove')).toHaveLength(n - 10)
    expect(mid.findIndex((l) => l.kind === 'add')).toBe(n - 10)
    expect(lines[5]).toMatchObject({ kind: 'remove', content: 'k5', lineOld: 6 })
    expect(lines[lines.length - 6]).toMatchObject({ kind: 'add', content: `new${n - 6}`, lineNew: n - 5 })
    expect(lines[lines.length - 1]).toMatchObject({ kind: 'context', lineOld: n, lineNew: n })
  })

  it('[M11-G3 M11-21] 상한 안의 작은 파일은 지금처럼 LCS로 맞춘다', () => {
    const lines = computeDiff('a\nb\nc\nd', 'a\nx\nc\nd')
    expect(lines.map((l) => l.kind)).toEqual(['context', 'remove', 'add', 'context', 'context'])
  })
})
