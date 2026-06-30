// @vitest-environment jsdom
/**
 * SchedStrip.test.tsx — 예약 메시지 큐 스트립 하위 컴포넌트 렌더 테스트.
 * Composer.tsx Phase 14 분해: sched 큐 JSX를 SchedStrip.tsx로 추출.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { SchedStrip } from '../../../02.Source/renderer/src/components/01_conversation/SchedStrip'

const SAMPLE_QUEUE = [
  { id: 'q1', text: '첫 번째 예약', images: [] },
  { id: 'q2', text: '두 번째 예약', images: [] },
]

describe('SchedStrip', () => {
  it('queued=[] → .sched 미표시', () => {
    const { container } = render(
      <SchedStrip queued={[]} onRemoveQueued={vi.fn()} />
    )
    expect(container.querySelector('.sched')).toBeFalsy()
  })

  it('queued.length > 0 → .sched 표시 + "예약된 메시지 N"', () => {
    const { container } = render(
      <SchedStrip queued={SAMPLE_QUEUE} onRemoveQueued={vi.fn()} />
    )
    expect(container.querySelector('.sched')).toBeTruthy()
    expect(container.textContent).toContain('예약된 메시지 2')
  })

  it('sched-item 수 = queued.length', () => {
    const { container } = render(
      <SchedStrip queued={SAMPLE_QUEUE} onRemoveQueued={vi.fn()} />
    )
    expect(container.querySelectorAll('.sched-item').length).toBe(2)
  })

  it('sched-x 클릭 → onRemoveQueued("q1") 호출', () => {
    const onRemoveQueued = vi.fn()
    const { container } = render(
      <SchedStrip queued={SAMPLE_QUEUE} onRemoveQueued={onRemoveQueued} />
    )
    fireEvent.click(container.querySelector('.sched-x') as HTMLButtonElement)
    expect(onRemoveQueued).toHaveBeenCalledWith('q1')
  })

  it('이미지 있는 큐 항목 → sched-img 표시', () => {
    const queue = [{ id: 'q1', text: '텍스트', images: ['data:image/png;base64,abc'] }]
    const { container } = render(
      <SchedStrip queued={queue} onRemoveQueued={vi.fn()} />
    )
    expect(container.querySelector('.sched-img')).toBeTruthy()
  })

  it('sched-item에 sched-num + sched-text 표시', () => {
    const { container } = render(
      <SchedStrip queued={SAMPLE_QUEUE} onRemoveQueued={vi.fn()} />
    )
    const item = container.querySelector('.sched-item')!
    expect(item.querySelector('.sched-num')).toBeTruthy()
    expect(item.querySelector('.sched-text')).toBeTruthy()
  })
})
