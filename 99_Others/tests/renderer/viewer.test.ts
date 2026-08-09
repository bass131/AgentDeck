import { describe, it, expect } from 'vitest'
import { viewerForPath, IMAGE_EXTENSIONS } from '../../../02_Source/renderer/src/lib/viewer'

describe('viewerForPath', () => {
  it('png → image', () => {
    expect(viewerForPath('photo.png')).toBe('image')
  })

  it('jpg → image', () => {
    expect(viewerForPath('photo.jpg')).toBe('image')
  })

  it('jpeg → image', () => {
    expect(viewerForPath('photo.jpeg')).toBe('image')
  })

  it('gif → image', () => {
    expect(viewerForPath('anim.gif')).toBe('image')
  })

  it('webp → image', () => {
    expect(viewerForPath('photo.webp')).toBe('image')
  })

  it('svg → image', () => {
    expect(viewerForPath('icon.svg')).toBe('image')
  })

  it('bmp → image', () => {
    expect(viewerForPath('bitmap.bmp')).toBe('image')
  })

  it('ico → image', () => {
    expect(viewerForPath('favicon.ico')).toBe('image')
  })

  it('PNG 대문자 → image', () => {
    expect(viewerForPath('PHOTO.PNG')).toBe('image')
  })

  it('JPG 대문자 → image', () => {
    expect(viewerForPath('PHOTO.JPG')).toBe('image')
  })

  it('md → markdown', () => {
    expect(viewerForPath('README.md')).toBe('markdown')
  })

  it('markdown → markdown', () => {
    expect(viewerForPath('guide.markdown')).toBe('markdown')
  })

  it('MD 대문자 → markdown', () => {
    expect(viewerForPath('README.MD')).toBe('markdown')
  })

  it('MARKDOWN 대문자 → markdown', () => {
    expect(viewerForPath('guide.MARKDOWN')).toBe('markdown')
  })

  it('ts → code', () => {
    expect(viewerForPath('src/app.ts')).toBe('code')
  })

  it('tsx → code', () => {
    expect(viewerForPath('App.tsx')).toBe('code')
  })

  it('js → code', () => {
    expect(viewerForPath('index.js')).toBe('code')
  })

  it('txt → code', () => {
    expect(viewerForPath('notes.txt')).toBe('code')
  })

  it('json → code', () => {
    expect(viewerForPath('package.json')).toBe('code')
  })

  it('확장자 없음 → code', () => {
    expect(viewerForPath('Makefile')).toBe('code')
  })

  it('경로 포함 png → image', () => {
    expect(viewerForPath('assets/images/logo.png')).toBe('image')
  })

  it('경로 포함 md → markdown', () => {
    expect(viewerForPath('docs/README.md')).toBe('markdown')
  })
})

describe('IMAGE_EXTENSIONS', () => {
  it('png를 포함한다', () => {
    expect(IMAGE_EXTENSIONS.has('png')).toBe(true)
  })

  it('jpg를 포함한다', () => {
    expect(IMAGE_EXTENSIONS.has('jpg')).toBe(true)
  })

  it('svg를 포함한다', () => {
    expect(IMAGE_EXTENSIONS.has('svg')).toBe(true)
  })

  it('md를 포함하지 않는다', () => {
    expect(IMAGE_EXTENSIONS.has('md')).toBe(false)
  })

  it('ts를 포함하지 않는다', () => {
    expect(IMAGE_EXTENSIONS.has('ts')).toBe(false)
  })
})
