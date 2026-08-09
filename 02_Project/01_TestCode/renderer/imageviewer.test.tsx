// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { ImageViewer } from '../../../02_Project/00_Source/renderer/src/features/viewer'
import { Composer } from '../../../02_Project/00_Source/renderer/src/features/conversation/Composer'

afterEach(() => cleanup())

const IMG1 = 'data:image/png;base64,iVBORw0KGgo='
const IMG2 = 'data:image/png;base64,iVBORw0KGgp='
const IMG3 = 'data:image/png;base64,iVBORw0KGgq='

function mkViewerProps(
  images: string[],
  index = 0,
  overrides: Partial<{ onIndexChange: (i: number) => void; onClose: () => void }> = {}
) {
  return {
    images,
    index,
    onIndexChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

describe('ImageViewer — 단일 이미지', () => {
  it('iv-overlay + iv-img 렌더', () => {
    const props = mkViewerProps([IMG1])
    const { container } = render(<ImageViewer {...props} />)
    expect(container.querySelector('.iv-overlay')).toBeTruthy()
    expect(container.querySelector('.iv-img')).toBeTruthy()
  })

  it('파일명이 iv-name에 표시된다', () => {
    const props = mkViewerProps(['/path/to/photo.png'])
    const { container } = render(<ImageViewer {...props} />)
    const name = container.querySelector('.iv-name')
    expect(name?.textContent).toBe('photo.png')
  })

  it('단일 이미지 — iv-count / iv-nav / iv-strip 없음', () => {
    const props = mkViewerProps([IMG1])
    const { container } = render(<ImageViewer {...props} />)
    expect(container.querySelector('.iv-count')).toBeFalsy()
    expect(container.querySelector('.iv-nav')).toBeFalsy()
    expect(container.querySelector('.iv-strip')).toBeFalsy()
  })

  it('닫기 버튼 클릭 → onClose 호출', () => {
    const onClose = vi.fn()
    const { container } = render(<ImageViewer {...mkViewerProps([IMG1], 0, { onClose })} />)
    const closeBtn = container.querySelector('button[aria-label="닫기"]') as HTMLButtonElement
    expect(closeBtn).toBeTruthy()
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('images 빈 배열 → null 반환 (아무것도 렌더 안 됨)', () => {
    const props = mkViewerProps([])
    const { container } = render(<ImageViewer {...props} />)
    expect(container.querySelector('.iv-overlay')).toBeFalsy()
  })
})

describe('ImageViewer — 다중 이미지', () => {
  it('iv-count = "1 / 3" 표시', () => {
    const props = mkViewerProps([IMG1, IMG2, IMG3], 0)
    const { container } = render(<ImageViewer {...props} />)
    const count = container.querySelector('.iv-count')
    expect(count?.textContent).toMatch(/1/)
    expect(count?.textContent).toMatch(/3/)
  })

  it('iv-nav prev + next 버튼 존재', () => {
    const props = mkViewerProps([IMG1, IMG2, IMG3])
    const { container } = render(<ImageViewer {...props} />)
    expect(container.querySelector('.iv-nav.prev')).toBeTruthy()
    expect(container.querySelector('.iv-nav.next')).toBeTruthy()
  })

  it('next 버튼 클릭 → onIndexChange(1) 호출', () => {
    const onIndexChange = vi.fn()
    const props = mkViewerProps([IMG1, IMG2, IMG3], 0, { onIndexChange })
    const { container } = render(<ImageViewer {...props} />)
    const next = container.querySelector('.iv-nav.next') as HTMLButtonElement
    fireEvent.click(next)
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it('prev 버튼 클릭(index=0) → onIndexChange(2) wrap-around', () => {
    const onIndexChange = vi.fn()
    const props = mkViewerProps([IMG1, IMG2, IMG3], 0, { onIndexChange })
    const { container } = render(<ImageViewer {...props} />)
    const prev = container.querySelector('.iv-nav.prev') as HTMLButtonElement
    fireEvent.click(prev)
    expect(onIndexChange).toHaveBeenCalledWith(2)
  })

  it('iv-strip 존재, iv-thumb 개수 = images.length', () => {
    const props = mkViewerProps([IMG1, IMG2, IMG3])
    const { container } = render(<ImageViewer {...props} />)
    const strip = container.querySelector('.iv-strip')
    expect(strip).toBeTruthy()
    expect(container.querySelectorAll('.iv-thumb').length).toBe(3)
  })

  it('활성 썸네일에 .on 클래스', () => {
    const props = mkViewerProps([IMG1, IMG2, IMG3], 1)
    const { container } = render(<ImageViewer {...props} />)
    const thumbs = container.querySelectorAll('.iv-thumb')
    expect(thumbs[0].classList.contains('on')).toBe(false)
    expect(thumbs[1].classList.contains('on')).toBe(true)
    expect(thumbs[2].classList.contains('on')).toBe(false)
  })

  it('iv-thumb 클릭 → onIndexChange 호출', () => {
    const onIndexChange = vi.fn()
    const props = mkViewerProps([IMG1, IMG2, IMG3], 0, { onIndexChange })
    const { container } = render(<ImageViewer {...props} />)
    const thumbs = container.querySelectorAll('.iv-thumb')
    fireEvent.click(thumbs[2])
    expect(onIndexChange).toHaveBeenCalledWith(2)
  })

  it('→ 키 → onIndexChange(1)', () => {
    const onIndexChange = vi.fn()
    render(<ImageViewer {...mkViewerProps([IMG1, IMG2, IMG3], 0, { onIndexChange })} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it('← 키(index=1) → onIndexChange(0)', () => {
    const onIndexChange = vi.fn()
    render(<ImageViewer {...mkViewerProps([IMG1, IMG2, IMG3], 1, { onIndexChange })} />)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onIndexChange).toHaveBeenCalledWith(0)
  })
})

describe('ImageViewer — iv-img 클릭 zoom 토글', () => {
  it('초기: iv-img에 .zoomed 없음', () => {
    const { container } = render(<ImageViewer {...mkViewerProps([IMG1])} />)
    expect(container.querySelector('.iv-img.zoomed')).toBeFalsy()
    expect(container.querySelector('.iv-imgwrap.zoom')).toBeFalsy()
  })

  it('iv-img 클릭 → .zoomed + iv-imgwrap.zoom 토글', () => {
    const { container } = render(<ImageViewer {...mkViewerProps([IMG1])} />)
    const img = container.querySelector('.iv-img') as HTMLImageElement
    fireEvent.click(img)
    expect(container.querySelector('.iv-img.zoomed')).toBeTruthy()
    expect(container.querySelector('.iv-imgwrap.zoom')).toBeTruthy()
  })

  it('두 번 클릭 → zoom 해제', () => {
    const { container } = render(<ImageViewer {...mkViewerProps([IMG1])} />)
    const img = container.querySelector('.iv-img') as HTMLImageElement
    fireEvent.click(img)
    fireEvent.click(img)
    expect(container.querySelector('.iv-img.zoomed')).toBeFalsy()
  })
})

describe('ImageViewer — Esc / 백드롭 닫기', () => {
  it('Esc 키 → onClose 호출', () => {
    const onClose = vi.fn()
    render(<ImageViewer {...mkViewerProps([IMG1], 0, { onClose })} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('iv-overlay 백드롭 mousedown+click → onClose 호출', () => {
    const onClose = vi.fn()
    const { container } = render(<ImageViewer {...mkViewerProps([IMG1], 0, { onClose })} />)
    const overlay = container.querySelector('.iv-overlay') as HTMLDivElement
    fireEvent.mouseDown(overlay, { target: overlay })
    fireEvent.click(overlay, { target: overlay })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('ImageViewer — 콜백 staleness 방어 (latest-ref)', () => {
  it('onClose 교체 후 Esc → 옛 콜백이 아닌 최신 onClose 호출', () => {
    const onCloseOld = vi.fn()
    const onCloseNew = vi.fn()
    const { rerender } = render(<ImageViewer {...mkViewerProps([IMG1], 0, { onClose: onCloseOld })} />)
    rerender(<ImageViewer {...mkViewerProps([IMG1], 0, { onClose: onCloseNew })} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCloseOld).not.toHaveBeenCalled()
    expect(onCloseNew).toHaveBeenCalledOnce()
  })

  it('onIndexChange 교체 후 → 키 → 옛 콜백이 아닌 최신 onIndexChange 호출', () => {
    const onIdxOld = vi.fn()
    const onIdxNew = vi.fn()
    const { rerender } = render(
      <ImageViewer {...mkViewerProps([IMG1, IMG2, IMG3], 0, { onIndexChange: onIdxOld })} />
    )
    rerender(<ImageViewer {...mkViewerProps([IMG1, IMG2, IMG3], 0, { onIndexChange: onIdxNew })} />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIdxOld).not.toHaveBeenCalled()
    expect(onIdxNew).toHaveBeenCalledWith(1)
  })
})

describe('Composer — onOpenImage prop', () => {
  function mkComposerProps(over: Partial<Parameters<typeof Composer>[0]> = {}) {
    return {
      value: '',
      onChange: vi.fn(),
      onSend: vi.fn(),
      onAbort: vi.fn(),
      isRunning: false,
      hasStarted: false,
      queued: [],
      ...over,
    }
  }

  it('onOpenImage 미주입 — img-thumb-open 클릭 시 에러 없음 (no-op)', () => {
    const { container } = render(<Composer {...mkComposerProps()} />)
    expect(container.querySelector('.img-tray')).toBeFalsy()
  })

  it('onOpenImage 주입 — img-thumb-open 클릭 시 콜백 호출', async () => {
    const onOpenImage = vi.fn()
    const props = mkComposerProps({ onOpenImage })
    const { container } = render(<Composer {...props} />)
    expect(typeof props.onOpenImage).toBe('function')
    expect(onOpenImage).not.toHaveBeenCalled()
    expect(container.querySelector('.img-tray')).toBeFalsy()
  })
})
