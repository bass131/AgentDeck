// @vitest-environment jsdom
/**
 * toolcard.test.tsx — F3-03 .t-row 도구 행 DOM 단언.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ToolCallCard } from '../../src/renderer/src/components/ToolCallCard'
import type { ToolCard } from '../../src/renderer/src/store/reducer'

afterEach(() => cleanup())

const card = (over: Partial<ToolCard>): ToolCard => ({
  id: 't1', name: 'Read', input: { file_path: 'src/a.ts' }, status: 'done', result: '내용', ...over,
})

describe('ToolCallCard — .t-row (F3-03)', () => {
  it('verb → target → 종류 클래스', () => {
    const { container } = render(<ToolCallCard card={card({ name: 'Read' })} />)
    expect(container.querySelector('.t-row')).toBeTruthy()
    expect(container.querySelector('.t-item.t-read')).toBeTruthy()
    expect(screen.getByText('Read')).toBeTruthy()
    expect(screen.getByText('src/a.ts')).toBeTruthy()
  })

  it('실행중 → .t-spin', () => {
    const { container } = render(<ToolCallCard card={card({ status: 'running', result: undefined })} />)
    expect(container.querySelector('.t-spin')).toBeTruthy()
  })

  it('에러 → "오류"(.t-res-err)', () => {
    const { container } = render(<ToolCallCard card={card({ status: 'error' })} />)
    expect(container.querySelector('.t-res-err')).toBeTruthy()
  })

  it('클릭 → 상세(.bo-block) 토글', () => {
    const { container } = render(<ToolCallCard card={card({})} />)
    expect(container.querySelector('.bo-block')).toBeFalsy()
    fireEvent.click(container.querySelector('.t-row')!)
    expect(container.querySelector('.bo-block')).toBeTruthy()
  })

  it('bash 도구 → .t-bash 종류', () => {
    const { container } = render(
      <ToolCallCard card={card({ name: 'Bash', input: { command: 'ls' } })} />
    )
    expect(container.querySelector('.t-item.t-bash')).toBeTruthy()
    expect(screen.getByText('ls')).toBeTruthy()
  })
})
