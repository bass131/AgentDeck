// @vitest-environment jsdom
/**
 * ComposerPicker.test.tsx — Picker 드롭다운 하위 컴포넌트 렌더 테스트.
 * Composer.tsx Phase 14 분해: Picker 컴포넌트를 ComposerPicker.tsx로 추출.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, within } from '@testing-library/react'
import { Picker } from '../../../02.Source/renderer/src/components/01_conversation/ComposerPicker'
import { MODELS, EFFORTS } from '../../../02.Source/renderer/src/lib/pickerOptions'

describe('Picker', () => {
  it('버튼 클릭 → .pick-menu 열림', () => {
    const { container } = render(
      <Picker
        ariaLabel="모델 선택"
        caption="모델"
        options={MODELS}
        value={MODELS[0].id}
        onChange={vi.fn()}
      />
    )
    fireEvent.click(container.querySelector('.pick-btn') as HTMLButtonElement)
    expect(container.querySelector('.pick-menu')).toBeTruthy()
  })

  it('옵션 클릭 → onChange 호출 + 메뉴 닫힘', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Picker
        ariaLabel="모델 선택"
        caption="모델"
        options={MODELS}
        value={MODELS[0].id}
        onChange={onChange}
      />
    )
    fireEvent.click(container.querySelector('.pick-btn') as HTMLButtonElement)
    const opts = container.querySelectorAll('.pick-opt')
    fireEvent.click(opts[1])
    expect(onChange).toHaveBeenCalledWith(MODELS[1].id)
    expect(container.querySelector('.pick-menu')).toBeFalsy()
  })

  it('현재 선택 항목에 .po-check 렌더', () => {
    const { container } = render(
      <Picker
        ariaLabel="Effort 선택"
        caption="Effort"
        options={EFFORTS}
        value={EFFORTS[0].id}
        onChange={vi.fn()}
      />
    )
    fireEvent.click(container.querySelector('.pick-btn') as HTMLButtonElement)
    const firstOpt = container.querySelector('.pick-opt')!
    expect(within(firstOpt as HTMLElement).queryByText('', { selector: '.po-check' }) !== null ||
           firstOpt.querySelector('.po-check') !== null).toBe(true)
  })

  it('caption·value .pick-lbl·.pick-val 렌더', () => {
    const { container } = render(
      <Picker
        ariaLabel="모델 선택"
        caption="모델"
        options={MODELS}
        value={MODELS[0].id}
        onChange={vi.fn()}
      />
    )
    expect(container.querySelector('.pick-lbl')?.textContent).toBe('모델')
    expect(container.querySelector('.pick-val')).toBeTruthy()
  })
})
