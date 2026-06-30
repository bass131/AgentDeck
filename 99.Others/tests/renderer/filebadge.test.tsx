// @vitest-environment jsdom
/**
 * filebadge.test.tsx — F2-01 FileBadge 렌더.
 * label 있는 파일 = monogram 칩(.ftbadge), 없는 파일 = 제네릭 아이콘(.ftbadge-generic).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { FileBadge } from '../../../02.Source/renderer/src/components/02_file/FileBadge'

afterEach(() => cleanup())

describe('FileBadge', () => {
  it('확장자 있는 파일 → monogram 칩(.ftbadge)에 라벨', () => {
    const { container } = render(<FileBadge path="src/app.ts" />)
    const badge = container.querySelector('.ftbadge')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toBe('TS')
  })

  it('타입색이 동적 --ft 변수로 주입된다(하드코딩 hex 없음)', () => {
    const { container } = render(<FileBadge path="a.css" />)
    const badge = container.querySelector('.ftbadge') as HTMLElement
    expect(badge.style.getPropertyValue('--ft')).toMatch(/^oklch\(/)
  })

  it('확장자 없는 파일 → 제네릭 아이콘(.ftbadge-generic), 칩 없음', () => {
    const { container } = render(<FileBadge path="foobar" />)
    expect(container.querySelector('.ftbadge-generic')).toBeTruthy()
    expect(container.querySelector('.ftbadge')).toBeFalsy()
  })

  it('이미지 → IMG 칩', () => {
    const { container } = render(<FileBadge path="logo.svg" />)
    expect(container.querySelector('.ftbadge')?.textContent).toBe('IMG')
  })
})
