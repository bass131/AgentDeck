// @vitest-environment node
/**
 * images.test.ts — lib/images.ts 순수 함수 단위 테스트 (TDD-first, 22c).
 *
 * 검증 범위:
 *   - isImagePath: png/jpg/jpeg/gif/webp → true, txt/ts/undefined-ext → false
 *   - imageName: 경로 tail 추출 (슬래시/백슬래시 모두)
 *   - extOf: file.name 우선, type 폴백, svg+xml→svg, jpeg→jpg, 알 수 없으면 png
 */
import { describe, it, expect } from 'vitest'
import { isImagePath, imageName, extOf } from '../../../02.Source/renderer/src/lib/images'

// ── isImagePath ───────────────────────────────────────────────────────────────

describe('isImagePath', () => {
  it('png 파일 경로 → true', () => {
    expect(isImagePath('photo.png')).toBe(true)
  })

  it('jpg 파일 경로 → true', () => {
    expect(isImagePath('photo.jpg')).toBe(true)
  })

  it('jpeg 파일 경로 → true', () => {
    expect(isImagePath('photo.jpeg')).toBe(true)
  })

  it('gif 파일 경로 → true', () => {
    expect(isImagePath('anim.gif')).toBe(true)
  })

  it('webp 파일 경로 → true', () => {
    expect(isImagePath('img.webp')).toBe(true)
  })

  it('svg 파일 경로 → true', () => {
    expect(isImagePath('icon.svg')).toBe(true)
  })

  it('avif 파일 경로 → true', () => {
    expect(isImagePath('img.avif')).toBe(true)
  })

  it('bmp 파일 경로 → true', () => {
    expect(isImagePath('img.bmp')).toBe(true)
  })

  it('ico 파일 경로 → true', () => {
    expect(isImagePath('favicon.ico')).toBe(true)
  })

  it('절대 경로 내 png → true', () => {
    expect(isImagePath('/home/user/docs/screenshot.png')).toBe(true)
  })

  it('Windows 절대 경로 내 jpg → true', () => {
    expect(isImagePath('C:\\Users\\user\\photo.jpg')).toBe(true)
  })

  it('txt 파일 → false', () => {
    expect(isImagePath('readme.txt')).toBe(false)
  })

  it('ts 파일 → false', () => {
    expect(isImagePath('index.ts')).toBe(false)
  })

  it('확장자 없는 경로 → false', () => {
    expect(isImagePath('Makefile')).toBe(false)
  })

  it('빈 문자열 → false', () => {
    expect(isImagePath('')).toBe(false)
  })

  it('대소문자 무관(PNG) → true', () => {
    expect(isImagePath('image.PNG')).toBe(true)
  })
})

// ── imageName ─────────────────────────────────────────────────────────────────

describe('imageName', () => {
  it('POSIX 경로 → 파일명 tail', () => {
    expect(imageName('/home/user/photo.png')).toBe('photo.png')
  })

  it('Windows 경로 → 파일명 tail', () => {
    expect(imageName('C:\\Users\\user\\photo.png')).toBe('photo.png')
  })

  it('슬래시 없는 이름 → 그대로', () => {
    expect(imageName('photo.png')).toBe('photo.png')
  })

  it('빈 문자열 → 빈 문자열', () => {
    expect(imageName('')).toBe('')
  })
})

// ── extOf ─────────────────────────────────────────────────────────────────────

describe('extOf', () => {
  function mockFile(name: string, type: string): File {
    return { name, type } as File
  }

  it('file.name에 확장자 있으면 name 우선 → png', () => {
    expect(extOf(mockFile('photo.png', 'image/png'))).toBe('png')
  })

  it('file.name에 확장자 있으면 name 우선 → jpg', () => {
    expect(extOf(mockFile('photo.jpg', 'image/jpeg'))).toBe('jpg')
  })

  it('file.name 확장자 없으면 type에서 폴백 → png', () => {
    expect(extOf(mockFile('clipboard-paste', 'image/png'))).toBe('png')
  })

  it('file.name 확장자 없고 type이 image/jpeg → jpg (jpeg→jpg 변환)', () => {
    expect(extOf(mockFile('pasted', 'image/jpeg'))).toBe('jpg')
  })

  it('file.name 확장자 없고 type이 image/svg+xml → svg', () => {
    expect(extOf(mockFile('icon', 'image/svg+xml'))).toBe('svg')
  })

  it('file.name 확장자 없고 type도 없으면 png 폴백', () => {
    expect(extOf(mockFile('unknown', ''))).toBe('png')
  })

  it('file.name 확장자가 SVG → svg (소문자)', () => {
    expect(extOf(mockFile('icon.SVG', 'image/svg+xml'))).toBe('svg')
  })

  it('file.name 확장자가 webp → webp', () => {
    expect(extOf(mockFile('image.webp', 'image/webp'))).toBe('webp')
  })
})
