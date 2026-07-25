/**
 * toolKind.test.ts — F3-03 도구명→{kind,verb,색} + 대상 추출 (순수, TDD RED).
 */
import { describe, it, expect } from 'vitest'
import { toolMetaFor, toolTarget } from '../../../02.Source/renderer/src/lib/toolKind'

describe('toolMetaFor', () => {
  it('대표 도구 매핑(kind/verb)', () => {
    expect(toolMetaFor('Read').kind).toBe('read')
    expect(toolMetaFor('Write').kind).toBe('write')
    expect(toolMetaFor('Edit').kind).toBe('edit')
    expect(toolMetaFor('Bash').kind).toBe('bash')
    expect(toolMetaFor('Grep').kind).toBe('search')
    expect(toolMetaFor('Glob').kind).toBe('search')
    expect(toolMetaFor('WebFetch').kind).toBe('web')
  })

  it('대소문자/구분자 무관', () => {
    expect(toolMetaFor('bash').kind).toBe('bash')
    expect(toolMetaFor('web_fetch').kind).toBe('web')
  })

  it('미지 도구 → other(verb=원본명)', () => {
    const m = toolMetaFor('CustomTool')
    expect(m.kind).toBe('other')
    expect(m.verb).toBe('CustomTool')
  })

  it('색은 oklch/var 토큰 (하드코딩 hex 0)', () => {
    for (const n of ['Read', 'Write', 'Bash', 'Grep', 'WebFetch', 'X']) {
      expect(toolMetaFor(n).color).toMatch(/^(var\(|oklch\()/)
    }
  })
})

describe('toolTarget', () => {
  it('file_path/path/command/pattern/url/query에서 추출', () => {
    expect(toolTarget({ file_path: 'src/a.ts' })).toBe('src/a.ts')
    expect(toolTarget({ command: 'ls -la' })).toBe('ls -la')
    expect(toolTarget({ pattern: 'foo.*' })).toBe('foo.*')
    expect(toolTarget({ url: 'http://x' })).toBe('http://x')
  })

  it('문자열 input은 그대로', () => {
    expect(toolTarget('plain')).toBe('plain')
  })

  it('null/대상없음 → 빈 문자열', () => {
    expect(toolTarget(null)).toBe('')
    expect(toolTarget({ other: 1 })).toBe('')
  })
})
