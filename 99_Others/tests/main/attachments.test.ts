import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { safeImageExt, saveImageBytes, IMAGE_EXTS } from '../../../02_Source/main/02_fs/attachments'

let tmp: string

beforeAll(() => {
  tmp = join(tmpdir(), `agentdeck-attach-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
})

afterAll(() => rmSync(tmp, { recursive: true, force: true }))

describe('IMAGE_EXTS', () => {
  it('필수 확장자 포함', () => {
    expect(IMAGE_EXTS['.png']).toBe('image/png')
    expect(IMAGE_EXTS['.jpg']).toBe('image/jpeg')
    expect(IMAGE_EXTS['.jpeg']).toBe('image/jpeg')
    expect(IMAGE_EXTS['.gif']).toBe('image/gif')
    expect(IMAGE_EXTS['.webp']).toBe('image/webp')
    expect(IMAGE_EXTS['.bmp']).toBe('image/bmp')
    expect(IMAGE_EXTS['.svg']).toBe('image/svg+xml')
    expect(IMAGE_EXTS['.avif']).toBe('image/avif')
    expect(IMAGE_EXTS['.ico']).toBe('image/x-icon')
  })
})

describe('safeImageExt', () => {
  it("'png' → '.png'", () => {
    expect(safeImageExt('png')).toBe('.png')
  })

  it("'jpeg' → '.jpeg'", () => {
    expect(safeImageExt('jpeg')).toBe('.jpeg')
  })

  it("'jpg' → '.jpg'", () => {
    expect(safeImageExt('jpg')).toBe('.jpg')
  })

  it("'webp' → '.webp'", () => {
    expect(safeImageExt('webp')).toBe('.webp')
  })

  it("'gif' → '.gif'", () => {
    expect(safeImageExt('gif')).toBe('.gif')
  })

  it("'.png' → '.png' (이미 점 있는 경우)", () => {
    expect(safeImageExt('.png')).toBe('.png')
  })

  it("'exe' → '.png' (화이트리스트 외)", () => {
    expect(safeImageExt('exe')).toBe('.png')
  })

  it("빈 문자열 → '.png'", () => {
    expect(safeImageExt('')).toBe('.png')
  })

  it("'../evil' → '.png' (경로 구분자 포함 → 위험문자 제거 → 화이트리스트 외)", () => {
    expect(safeImageExt('../evil')).toBe('.png')
  })

  it("'..png' → '.png' (선두 점 다중 → 제거 후 화이트리스트 일치 or png 대체)", () => {
    expect(safeImageExt('..png')).toBe('.png')
  })

  it("'path/to/evil.png' → '.png' (슬래시 위험문자 제거 후 화이트리스트 외 → png 대체)", () => {
    expect(safeImageExt('path/to/evil.png')).toBe('.png')
  })

  it("'back\\slash' → '.png' (백슬래시 제거 → 화이트리스트 외)", () => {
    expect(safeImageExt('back\\slash')).toBe('.png')
  })

  it("'PNG' → '.png' (대문자 → 소문자 정규화)", () => {
    expect(safeImageExt('PNG')).toBe('.png')
  })

  it("'JPEG' → '.jpeg'", () => {
    expect(safeImageExt('JPEG')).toBe('.jpeg')
  })
})

describe('saveImageBytes', () => {
  it('반환 경로가 tmp 하위 + paste- 시작 + .png + 파일 실재 + 내용 일치', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xde, 0xad]).buffer
    const result = await saveImageBytes(tmp, bytes, 'png')

    expect(result.startsWith(tmp)).toBe(true)

    expect(basename(result).startsWith('paste-')).toBe(true)

    expect(result.endsWith('.png')).toBe(true)

    expect(existsSync(result)).toBe(true)

    const written = readFileSync(result)
    const expected = Buffer.from(bytes)
    expect(written.equals(expected)).toBe(true)
  })

  it('Buffer도 허용', async () => {
    const buf = Buffer.from([0x01, 0x02, 0x03])
    const result = await saveImageBytes(tmp, buf, 'jpg')

    expect(result.endsWith('.jpg')).toBe(true)
    expect(existsSync(result)).toBe(true)
    const written = readFileSync(result)
    expect(written.equals(buf)).toBe(true)
  })

  it('두 번 호출 시 uuid로 파일명 충돌 없음', async () => {
    const bytes = new Uint8Array([0xff, 0xd8]).buffer
    const r1 = await saveImageBytes(tmp, bytes, 'jpg')
    const r2 = await saveImageBytes(tmp, bytes, 'jpg')

    expect(r1).not.toBe(r2)
    expect(existsSync(r1)).toBe(true)
    expect(existsSync(r2)).toBe(true)
  })

  it('dir 미존재 시 자동 mkdir 후 저장', async () => {
    const nested = join(tmp, 'nested', 'sub')
    const bytes = new Uint8Array([0x00]).buffer
    const result = await saveImageBytes(nested, bytes, 'png')

    expect(existsSync(result)).toBe(true)
  })

  it('위험 ext는 safeImageExt로 정규화되어 저장', async () => {
    const bytes = new Uint8Array([0xaa, 0xbb]).buffer
    const result = await saveImageBytes(tmp, bytes, '../evil')

    expect(result.endsWith('.png')).toBe(true)
    expect(existsSync(result)).toBe(true)
  })
})
