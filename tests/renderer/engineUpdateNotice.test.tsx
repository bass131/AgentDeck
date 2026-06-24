// @vitest-environment jsdom
/**
 * engineUpdateNotice.test.tsx — EngineUpdateNotice 컴포넌트 단위 테스트 (TDD).
 *
 * 검증 대상:
 *   - open=false → null 렌더 (미표시)
 *   - open=true → sd-dialog-overlay + 제목 + 현재/최신 버전 텍스트 표시
 *   - "확인" 버튼 클릭 → onClose 호출
 *   - 오버레이 클릭 → onClose 호출
 *   - 인라인 색상 0 (CSS 변수 토큰만)
 *
 * 신뢰경계: window.api 호출 0 — 표시 전용 컴포넌트.
 * TDD: 이 파일을 먼저 작성(실패) → EngineUpdateNotice.tsx 구현 후 green.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { EngineUpdateNotice } from '../../src/renderer/src/components/EngineUpdateNotice'

afterEach(() => cleanup())

// ══════════════════════════════════════════════════════════════════════════════
// open=false → 미렌더
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — open=false → 미렌더', () => {
  it('open=false → null (set-dialog-overlay 없음)', () => {
    const { container } = render(
      <EngineUpdateNotice
        open={false}
        current="1.0.0"
        latest="1.1.0"
        onClose={vi.fn()}
      />
    )
    expect(container.querySelector('.set-dialog-overlay')).toBeFalsy()
    expect(container.firstChild).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// open=true → 렌더
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — open=true 렌더', () => {
  function renderNotice(props?: Partial<Parameters<typeof EngineUpdateNotice>[0]>) {
    const defaults = {
      open: true as const,
      current: '1.0.0',
      latest: '1.1.0',
      onClose: vi.fn(),
    }
    return render(<EngineUpdateNotice {...defaults} {...props} />)
  }

  it('set-dialog-overlay 렌더', () => {
    const { container } = renderNotice()
    expect(container.querySelector('.set-dialog-overlay')).toBeTruthy()
  })

  it('set-dialog 내부 카드 렌더', () => {
    const { container } = renderNotice()
    expect(container.querySelector('.set-dialog')).toBeTruthy()
  })

  it('.sd-ic.warn 아이콘 영역 렌더', () => {
    const { container } = renderNotice()
    const icon = container.querySelector('.sd-ic.warn')
    expect(icon).toBeTruthy()
  })

  it('.sd-title = "새 엔진 버전"', () => {
    const { container } = renderNotice()
    const title = container.querySelector('.sd-title')
    expect(title?.textContent).toContain('새 엔진 버전')
  })

  it('.sd-msg에 현재 버전 텍스트 포함 (current=1.0.0)', () => {
    const { container } = renderNotice({ current: '1.0.0' })
    const msg = container.querySelector('.sd-msg')
    expect(msg?.textContent).toContain('1.0.0')
  })

  it('.sd-msg에 최신 버전 텍스트 포함 (latest=1.1.0)', () => {
    const { container } = renderNotice({ latest: '1.1.0' })
    const msg = container.querySelector('.sd-msg')
    expect(msg?.textContent).toContain('1.1.0')
  })

  it('.sd-btns 렌더', () => {
    const { container } = renderNotice()
    expect(container.querySelector('.sd-btns')).toBeTruthy()
  })

  it('"확인" 버튼 단일 존재 (.sd-go)', () => {
    const { container } = renderNotice()
    const goBtn = container.querySelector('.sd-go')
    expect(goBtn).toBeTruthy()
    expect(goBtn?.textContent).toContain('확인')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 상호작용 — "확인" 클릭 → onClose 호출
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — 상호작용', () => {
  it('"확인" 버튼 클릭 → onClose 1회 호출', () => {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    const goBtn = container.querySelector('.sd-go') as HTMLButtonElement
    fireEvent.click(goBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('오버레이(배경) mousedown → onClose 1회 호출', () => {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    const overlay = container.querySelector('.set-dialog-overlay') as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('카드(.set-dialog) mousedown → onClose 호출 안 됨 (버블 차단)', () => {
    const onClose = vi.fn()
    const { container } = render(
      <EngineUpdateNotice open={true} current="1.0.0" latest="1.1.0" onClose={onClose} />
    )
    const dialog = container.querySelector('.set-dialog') as HTMLElement
    fireEvent.mouseDown(dialog)
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// null current/latest graceful 처리
// ══════════════════════════════════════════════════════════════════════════════

describe('EngineUpdateNotice — null 값 graceful', () => {
  it('current=null, latest=null → 크래시 없이 렌더', () => {
    expect(() =>
      render(
        <EngineUpdateNotice open={true} current={null} latest={null} onClose={vi.fn()} />
      )
    ).not.toThrow()
  })

  it('current=null → .sd-msg 렌더됨', () => {
    const { container } = render(
      <EngineUpdateNotice open={true} current={null} latest="2.0.0" onClose={vi.fn()} />
    )
    expect(container.querySelector('.sd-msg')).toBeTruthy()
  })
})
