// @vitest-environment jsdom
/**
 * ImageTray.test.tsx — 이미지 첨부 트레이 하위 컴포넌트 렌더 테스트.
 * Composer.tsx Phase 14 분해: img-tray + drop-hint + 숨김 file input 추출.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ImageTray } from '../../../02.Source/renderer/src/components/01_conversation/ImageTray'

const SAMPLE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('ImageTray', () => {
  it('attachedImages=[] + dragOver=false → img-tray 미표시, drop-hint 미표시', () => {
    const { container } = render(
      <ImageTray
        attachedImages={[]}
        dragOver={false}
        fileInputRef={{ current: null }}
        handleFileInputChange={vi.fn()}
        onOpenImage={vi.fn()}
        onRemoveImage={vi.fn()}
      />
    )
    expect(container.querySelector('.img-tray')).toBeFalsy()
    expect(container.querySelector('.drop-hint')).toBeFalsy()
  })

  it('attachedImages=[url] → img-tray + img-thumb 표시', () => {
    const { container } = render(
      <ImageTray
        attachedImages={[SAMPLE_URL]}
        dragOver={false}
        fileInputRef={{ current: null }}
        handleFileInputChange={vi.fn()}
        onOpenImage={vi.fn()}
        onRemoveImage={vi.fn()}
      />
    )
    expect(container.querySelector('.img-tray')).toBeTruthy()
    expect(container.querySelector('.img-thumb')).toBeTruthy()
  })

  it('attachedImages 2개 → img-thumb 2개', () => {
    const { container } = render(
      <ImageTray
        attachedImages={[SAMPLE_URL, SAMPLE_URL]}
        dragOver={false}
        fileInputRef={{ current: null }}
        handleFileInputChange={vi.fn()}
        onOpenImage={vi.fn()}
        onRemoveImage={vi.fn()}
      />
    )
    expect(container.querySelectorAll('.img-thumb').length).toBe(2)
  })

  it('dragOver=true → drop-hint 표시', () => {
    const { container } = render(
      <ImageTray
        attachedImages={[]}
        dragOver={true}
        fileInputRef={{ current: null }}
        handleFileInputChange={vi.fn()}
        onOpenImage={vi.fn()}
        onRemoveImage={vi.fn()}
      />
    )
    expect(container.querySelector('.drop-hint')).toBeTruthy()
  })

  it('숨김 file input 항상 렌더(display:none)', () => {
    const { container } = render(
      <ImageTray
        attachedImages={[]}
        dragOver={false}
        fileInputRef={{ current: null }}
        handleFileInputChange={vi.fn()}
        onOpenImage={vi.fn()}
        onRemoveImage={vi.fn()}
      />
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.style.display).toBe('none')
  })

  it('img-thumb-x 클릭 → onRemoveImage(0) 호출', () => {
    const onRemoveImage = vi.fn()
    const { container } = render(
      <ImageTray
        attachedImages={[SAMPLE_URL]}
        dragOver={false}
        fileInputRef={{ current: null }}
        handleFileInputChange={vi.fn()}
        onOpenImage={vi.fn()}
        onRemoveImage={onRemoveImage}
      />
    )
    fireEvent.click(container.querySelector('.img-thumb-x') as HTMLButtonElement)
    expect(onRemoveImage).toHaveBeenCalledWith(0)
  })
})
