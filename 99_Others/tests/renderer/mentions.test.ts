/**
 * mentions.test.ts — lib/mentions TDD (M4-2 작업1).
 * 실패 우선 → 구현 → green.
 */
import { describe, it, expect } from 'vitest'
import { extractMentions, mentionEntries } from '../../../02.Source/renderer/src/lib/mentions'

// ── extractMentions ───────────────────────────────────────────────────────────

describe('extractMentions', () => {
  it('@src/x.ts @a.ts → 두 경로 추출 (공백구분)', () => {
    const result = extractMentions('@src/x.ts @a.ts')
    expect(result).toEqual(['src/x.ts', 'a.ts'])
  })

  it('후행 / 제외 — @src/ 는 빈 결과', () => {
    const result = extractMentions('@src/')
    expect(result).toEqual([])
  })

  it('후행 / 제외 — @src/components/ 도 제외', () => {
    const result = extractMentions('@src/components/')
    expect(result).toEqual([])
  })

  it('이메일 a@b.com 제외 (@ 앞에 단어 문자)', () => {
    const result = extractMentions('a@b.com')
    expect(result).toEqual([])
  })

  it('이메일 혼합 텍스트 — 이메일 제외 + 파일 멘션 포함', () => {
    const result = extractMentions('a@b.com @foo.ts')
    expect(result).toEqual(['foo.ts'])
  })

  it('중복 제거 — 같은 경로 두 번 → 하나만', () => {
    const result = extractMentions('@src/a.ts @src/a.ts')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('src/a.ts')
  })

  it('멘션 없으면 빈 배열', () => {
    expect(extractMentions('일반 텍스트')).toEqual([])
    expect(extractMentions('')).toEqual([])
  })

  it('텍스트 시작 @path (공백 없음) → 추출', () => {
    const result = extractMentions('@README.md 확인해줘')
    expect(result).toContain('README.md')
  })
})

// ── mentionEntries ────────────────────────────────────────────────────────────

const FLAT = ['src/a.ts', 'src/sub/b.ts', 'pkg.json']

describe('mentionEntries — browse/search', () => {
  it('query "" → mode:browse, base:"", 루트 자식: dir src + file pkg.json', () => {
    const res = mentionEntries(FLAT, '')
    expect(res.mode).toBe('browse')
    expect(res.base).toBe('')
    const kinds = res.entries.map((e) => e.kind)
    // dirs 먼저
    expect(kinds[0]).toBe('dir')
    const names = res.entries.map((e) => e.name)
    expect(names).toContain('src')
    expect(names).toContain('pkg.json')
    // src/sub/b.ts 는 루트에서 즉시자식 아닌 dir 'src'로만 등장
    expect(names).not.toContain('sub')
    expect(names).not.toContain('b.ts')
  })

  it('"src/" → mode:browse, base:"src/", src 즉시자식만: dir sub + file a.ts', () => {
    const res = mentionEntries(FLAT, 'src/')
    expect(res.mode).toBe('browse')
    expect(res.base).toBe('src/')
    const names = res.entries.map((e) => e.name)
    expect(names).toContain('sub')
    expect(names).toContain('a.ts')
    // pkg.json은 src/ 아님
    expect(names).not.toContain('pkg.json')
  })

  it('4자 이상 term → mode:search, 재귀', () => {
    // 'b.ts' 검색 — 4글자, src/sub/b.ts 에 해당
    const res = mentionEntries(FLAT, 'b.ts')
    expect(res.mode).toBe('search')
    const names = res.entries.map((e) => e.name)
    expect(names).toContain('b.ts')
  })

  it('4자 이상 검색이 base 하위 재귀 — "src/b.ts" 형태 쿼리', () => {
    // src/ 아래에서 b.ts 검색 (term 4자)
    const res = mentionEntries(FLAT, 'src/b.ts')
    expect(res.mode).toBe('search')
    const names = res.entries.map((e) => e.name)
    expect(names).toContain('b.ts')
  })

  it('결과 엔트리 타입 검증 (MentionEntry shape)', () => {
    const res = mentionEntries(FLAT, '')
    for (const e of res.entries) {
      expect(typeof e.kind).toBe('string')
      expect(typeof e.full).toBe('string')
      expect(typeof e.name).toBe('string')
      expect(typeof e.dir).toBe('string')
    }
  })

  it('빈 파일 목록 → entries 빈 배열', () => {
    const res = mentionEntries([], '')
    expect(res.entries).toEqual([])
  })

  it('dir-우선 정렬: dirs가 files보다 앞에', () => {
    const files = ['alpha.ts', 'beta/x.ts', 'gamma.ts']
    const res = mentionEntries(files, '')
    const dirIdx = res.entries.findIndex((e) => e.kind === 'dir')
    const fileIdx = res.entries.findIndex((e) => e.kind === 'file')
    // dir이 있고 file도 있을 때 dir이 먼저
    if (dirIdx !== -1 && fileIdx !== -1) {
      expect(dirIdx).toBeLessThan(fileIdx)
    }
  })
})
