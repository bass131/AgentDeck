/**
 * fileType.test.ts — F2-01 파일타입 배지 매핑 (TDD RED 먼저).
 *
 * fileTypeFor(path) → { label(monogram, ''=제네릭), color(oklch/var) }.
 * 색/라벨만 책임 — 언어(viewer)·하이라이트는 별도. 이미지 확장자는 viewer.ts 재사용.
 */
import { describe, it, expect } from 'vitest'
import { fileTypeFor } from '../../src/renderer/src/lib/fileType'

describe('fileTypeFor — 확장자/파일명 → 배지', () => {
  it('대표 확장자 매핑', () => {
    expect(fileTypeFor('a.ts').label).toBe('TS')
    expect(fileTypeFor('a.tsx').label).toBe('TSX')
    expect(fileTypeFor('a.js').label).toBe('JS')
    expect(fileTypeFor('a.json').label).toBe('{}')
    expect(fileTypeFor('a.css').label).toBe('CSS')
    expect(fileTypeFor('README.md').label).toBe('MD')
    expect(fileTypeFor('a.py').label).toBe('PY')
  })

  it('이미지 확장자 → IMG (viewer.ts IMAGE_EXTENSIONS 재사용, 대소문자 무관)', () => {
    expect(fileTypeFor('logo.svg').label).toBe('IMG')
    expect(fileTypeFor('pic.PNG').label).toBe('IMG')
  })

  it('특수 파일명(NAMED)', () => {
    expect(fileTypeFor('Dockerfile').label).toBe('DKR')
    expect(fileTypeFor('Makefile').label).toBe('MK')
    expect(fileTypeFor('.gitignore').label).toBe('GIT')
    expect(fileTypeFor('LICENSE').label).toBe('LIC')
  })

  it('확장자 없음 → 제네릭(label 빈 문자열)', () => {
    expect(fileTypeFor('foobar').label).toBe('')
    expect(fileTypeFor('.env').label).toBe('')
  })

  it('미지 확장자 → 첫4자 대문자 monogram + oklch 색', () => {
    const t = fileTypeFor('weird.xyzzy')
    expect(t.label).toBe('XYZZ')
    expect(t.color).toMatch(/^oklch\(/)
  })

  it('경로에서 파일명만 추출(디렉토리 무시, posix/win)', () => {
    expect(fileTypeFor('src/deep/a.ts').label).toBe('TS')
    expect(fileTypeFor('C:\\x\\b.css').label).toBe('CSS')
  })

  it('색은 oklch 또는 var() — 하드코딩 hex 0', () => {
    for (const p of ['a.ts', 'a.json', 'logo.svg', 'Dockerfile', 'foobar', 'weird.qq']) {
      expect(fileTypeFor(p).color).toMatch(/^(oklch\(|var\()/)
    }
  })
})
