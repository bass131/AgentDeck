// @vitest-environment jsdom
/**
 * ZoomControl.test.tsx — FB2 P05 TDD (실패 테스트 먼저 → 구현).
 *
 * 검증 대상: 02.Source/renderer/src/components/00_shell/ZoomControl.tsx
 *   - 현재 % 표시(useZoomFactorPct 경유)
 *   - + 버튼 클릭 → window.api.setZoomFactor(getZoomFactor()+STEP)
 *   - − 버튼 클릭 → window.api.setZoomFactor(getZoomFactor()-STEP)
 *   - % pill 클릭 → window.api.setZoomFactor(1) (리셋)
 *   - 클램프 경계(50%/200%)에서 해당 버튼 disabled
 *   - reviewer 🟡-1: % pill aria-label이 라이브 pct를 반영(하드코딩 "(100%)" 아님)
 *   - reviewer 🟡-2: pct===100이면 % pill도 disabled(−/+ 경계 disabled와 일관)
 *
 * 신뢰경계: renderer untrusted — window.api mock만 사용. fs/Node 0.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'

let currentFactor = 1
const mockGetZoomFactor = vi.fn((): number => currentFactor)
const mockSetZoomFactor = vi.fn()

beforeEach(() => {
  currentFactor = 1
  mockGetZoomFactor.mockClear()
  mockSetZoomFactor.mockClear()
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getZoomFactor: mockGetZoomFactor,
    setZoomFactor: mockSetZoomFactor,
  }
  // jsdom은 matchMedia 미구현 — useZoomFactorPct 내부 watchDevicePixelRatio가
  // 등록 시점에 1회 호출한다(useGlobalZoom.test.tsx와 동일 스텁).
  ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = vi.fn(
    (query: string) =>
      ({
        media: query,
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  )
})

afterEach(() => {
  cleanup()
  vi.resetModules()
})

async function freshComponent(): Promise<
  typeof import('../../../02.Source/renderer/src/components/00_shell/ZoomControl')
> {
  vi.resetModules()
  return import('../../../02.Source/renderer/src/components/00_shell/ZoomControl')
}

describe('ZoomControl — 현재 % 표시', () => {
  it('현재 zoom factor를 %로 표시한다', async () => {
    currentFactor = 1.2
    const { ZoomControl } = await freshComponent()
    const { container } = render(<ZoomControl />)
    expect(container.textContent).toContain('120%')
  })
})

describe('ZoomControl — + 버튼', () => {
  it('클릭 시 setZoomFactor(getZoomFactor()+STEP) 호출', async () => {
    currentFactor = 1.2
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    fireEvent.click(getByLabelText('확대'))

    const arg = mockSetZoomFactor.mock.calls[0][0] as number
    expect(arg).toBeCloseTo(1.3, 5)
  })

  it('200%(MAX)에서 disabled', async () => {
    currentFactor = 2.0
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    expect((getByLabelText('확대') as HTMLButtonElement).disabled).toBe(true)
  })

  it('200% 미만에서는 enabled', async () => {
    currentFactor = 1.9
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    expect((getByLabelText('확대') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('ZoomControl — − 버튼', () => {
  it('클릭 시 setZoomFactor(getZoomFactor()-STEP) 호출', async () => {
    currentFactor = 1.2
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    fireEvent.click(getByLabelText('축소'))

    const arg = mockSetZoomFactor.mock.calls[0][0] as number
    expect(arg).toBeCloseTo(1.1, 5)
  })

  it('50%(MIN)에서 disabled', async () => {
    currentFactor = 0.5
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    expect((getByLabelText('축소') as HTMLButtonElement).disabled).toBe(true)
  })

  it('50% 초과에서는 enabled', async () => {
    currentFactor = 0.6
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    expect((getByLabelText('축소') as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('ZoomControl — % pill 클릭(리셋)', () => {
  it('클릭 시 setZoomFactor(1) 호출', async () => {
    currentFactor = 1.5
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    fireEvent.click(getByLabelText('화면 100%로 초기화 (현재 150%)'))

    expect(mockSetZoomFactor).toHaveBeenCalledWith(1)
  })

  // reviewer 🟡-1: aria-label이 시각 텍스트({pct}%)와 같은 라이브 값을 반영해야 한다 —
  // "(100%)" 하드코딩이면 스크린리더 사용자에게 항상 100%라고 안내되는 불일치가 생긴다.
  it('aria-label이 라이브 pct를 반영한다(하드코딩 아님)', async () => {
    currentFactor = 0.8
    const { ZoomControl } = await freshComponent()
    const { getByLabelText, queryByLabelText } = render(<ZoomControl />)

    expect(getByLabelText('화면 100%로 초기화 (현재 80%)')).toBeTruthy()
    expect(queryByLabelText('확대/축소 초기화 (100%)')).toBeNull()
  })

  // reviewer 🟡-2: 이미 100%면 리셋이 no-op이므로 −/+ 경계 disabled와 동일하게 비활성화.
  it('pct===100이면 disabled(−/+ 경계 disabled와 일관)', async () => {
    currentFactor = 1
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    const pill = getByLabelText('화면 100%로 초기화 (현재 100%)') as HTMLButtonElement
    expect(pill.disabled).toBe(true)

    fireEvent.click(pill)
    expect(mockSetZoomFactor).not.toHaveBeenCalled()
  })

  it('pct!==100이면 enabled', async () => {
    currentFactor = 1.5
    const { ZoomControl } = await freshComponent()
    const { getByLabelText } = render(<ZoomControl />)

    const pill = getByLabelText('화면 100%로 초기화 (현재 150%)') as HTMLButtonElement
    expect(pill.disabled).toBe(false)
  })
})
