import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSafe, detectLanguage } from '../../src/main/02_fs/read'

// fs.read 단일 채널(텍스트+바이너리) 순수 로직 — node 환경.

let root: string

beforeAll(() => {
  root = join(tmpdir(), `agentdeck-read-${Date.now()}`)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'a.ts'), 'export const a: number = 1\n')
  writeFileSync(join(root, 'note.md'), '# title\n')
  // 바이너리(널바이트 포함)
  writeFileSync(join(root, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]))
  // 가짜 PNG(이미지 확장자 + 바이트)
  writeFileSync(join(root, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))
  // 대용량
  writeFileSync(join(root, 'big.txt'), 'x'.repeat(2 * 1024 * 1024))
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('detectLanguage', () => {
  it('확장자 → 언어', () => {
    expect(detectLanguage('a.ts')).toBe('typescript')
    expect(detectLanguage('x.py')).toBe('python')
    expect(detectLanguage('r.md')).toBe('markdown')
    expect(detectLanguage('unknown.xyz')).toBe('text')
  })
})

describe('readFileSafe', () => {
  it('텍스트 파일 → kind:text + 내용 + 언어', () => {
    const r = readFileSafe(root, 'a.ts')
    expect(r.kind).toBe('text')
    if (r.kind === 'text') {
      expect(r.content).toContain('export const a')
      expect(r.language).toBe('typescript')
    }
  })

  it('경로 탈출(../) → not-found (정보 은닉)', () => {
    expect(readFileSafe(root, '../../etc/passwd').kind).toBe('not-found')
  })

  it('절대경로로 루트 밖 직접 지정 → not-found (채널 경계 회귀)', () => {
    const abs = process.platform === 'win32' ? 'C:/Windows/System32/drivers/etc/hosts' : '/etc/passwd'
    expect(readFileSafe(root, abs).kind).toBe('not-found')
  })

  it('없는 파일 → not-found', () => {
    expect(readFileSafe(root, 'nope.ts').kind).toBe('not-found')
  })

  it('대용량 → too-large', () => {
    expect(readFileSafe(root, 'big.txt', { maxBytes: 1024 * 1024 }).kind).toBe('too-large')
  })

  it('바이너리(비이미지) + asBinary 미지정 → binary-skipped', () => {
    expect(readFileSafe(root, 'blob.bin').kind).toBe('binary-skipped')
  })

  it('이미지 + asBinary → kind:binary + dataUrl + mime', () => {
    const r = readFileSafe(root, 'pic.png', { asBinary: true })
    expect(r.kind).toBe('binary')
    if (r.kind === 'binary') {
      expect(r.mime).toBe('image/png')
      expect(r.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    }
  })

  it('비이미지 + asBinary → binary-skipped', () => {
    expect(readFileSafe(root, 'a.ts', { asBinary: true }).kind).toBe('binary-skipped')
  })
})
