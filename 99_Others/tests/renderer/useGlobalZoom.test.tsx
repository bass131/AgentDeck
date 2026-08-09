// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

interface FakeMql {
  query: string
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  fire: () => void
}

function makeFakeMatchMedia(): {
  matchMediaFn: (query: string) => MediaQueryList
  created: FakeMql[]
} {
  const created: FakeMql[] = []
  const matchMediaFn = (query: string): MediaQueryList => {
    let listener: (() => void) | null = null
    const mql: FakeMql = {
      query,
      addEventListener: vi.fn((_type: string, cb: () => void) => {
        listener = cb
      }),
      removeEventListener: vi.fn((_type: string, cb: () => void) => {
        if (listener === cb) listener = null
      }),
      fire: () => listener?.(),
    }
    created.push(mql)
    return mql as unknown as MediaQueryList
  }
  return { matchMediaFn, created }
}

let currentFactor = 1
let storedPrefs: Record<string, unknown> = {}
const mockGetZoomFactor = vi.fn((): number => currentFactor)
const mockSetUiPref = vi.fn(async (req: { key: string; value: unknown }) => {
  storedPrefs[req.key] = req.value
  return { ok: true }
})
const mockGetUiPrefs = vi.fn(async () => ({ ...storedPrefs }))

beforeEach(() => {
  currentFactor = 1
  storedPrefs = {}
  vi.clearAllMocks()
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getZoomFactor: mockGetZoomFactor,
    setUiPref: mockSetUiPref,
    getUiPrefs: mockGetUiPrefs,
  }
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

async function freshModule(): Promise<typeof import('../../../02_Source/renderer/src/lib/useGlobalZoom')> {
  vi.resetModules()
  return import('../../../02_Source/renderer/src/lib/useGlobalZoom')
}

async function freshPrefs(): Promise<typeof import('../../../02_Source/renderer/src/lib/prefs')> {
  return import('../../../02_Source/renderer/src/lib/prefs')
}

describe('watchDevicePixelRatio — DPR 변화 재등록 패턴', () => {
  it('등록 시 matchMedia를 현재 devicePixelRatio로 1회 호출한다', async () => {
    const { watchDevicePixelRatio } = await freshModule()
    const { matchMediaFn, created } = makeFakeMatchMedia()

    const cleanupFn = watchDevicePixelRatio(() => {}, matchMediaFn)

    expect(created).toHaveLength(1)
    expect(created[0].addEventListener).toHaveBeenCalledTimes(1)
    cleanupFn()
  })

  it('change 발화마다 이전 리스너를 해제하고 새 MediaQueryList를 재등록한다(리스너 중복 등록 방지)', async () => {
    const { watchDevicePixelRatio } = await freshModule()
    const { matchMediaFn, created } = makeFakeMatchMedia()
    const onChange = vi.fn()

    const cleanupFn = watchDevicePixelRatio(onChange, matchMediaFn)

    created[0].fire()
    expect(created).toHaveLength(2)
    expect(created[0].removeEventListener).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)

    created[1].fire()
    expect(created).toHaveLength(3)
    expect(created[1].removeEventListener).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(2)

    expect(created[0].removeEventListener).toHaveBeenCalledTimes(1)

    cleanupFn()
  })

  it('cleanup 호출 시 현재 활성 MediaQueryList의 리스너를 해제한다', async () => {
    const { watchDevicePixelRatio } = await freshModule()
    const { matchMediaFn, created } = makeFakeMatchMedia()

    const cleanupFn = watchDevicePixelRatio(() => {}, matchMediaFn)
    cleanupFn()

    expect(created[0].removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('cleanup 이후에는 이전에 등록된 리스너가 발화해도 재등록되지 않는다', async () => {
    const { watchDevicePixelRatio } = await freshModule()
    const { matchMediaFn, created } = makeFakeMatchMedia()
    const onChange = vi.fn()

    const cleanupFn = watchDevicePixelRatio(onChange, matchMediaFn)
    cleanupFn()

    created[0].fire()
    expect(onChange).not.toHaveBeenCalled()
    expect(created).toHaveLength(1)
  })
})

describe('useGlobalZoomPersist — 감지된 factor를 ui.setPref로 저장', () => {
  it('마운트 시 저장된 값이 없으면 현재 factor를 저장한다', async () => {
    currentFactor = 1
    const { useGlobalZoomPersist } = await freshModule()

    renderHook(() => useGlobalZoomPersist())
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockSetUiPref).toHaveBeenCalledWith({ key: 'zoomFactor', value: 1 })
  })

  it('마운트 시 저장된 값과 현재 factor가 같으면 저장을 생략한다(중복 방지)', async () => {
    storedPrefs = { zoomFactor: 1.2 }
    currentFactor = 1.2
    const prefs = await freshPrefs()
    await prefs.loadPrefs()
    const { useGlobalZoomPersist } = await import('../../../02_Source/renderer/src/lib/useGlobalZoom')

    renderHook(() => useGlobalZoomPersist())
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockSetUiPref).not.toHaveBeenCalled()
  })

  it('DPR 변화 감지 후 바뀐 factor를 읽어 저장한다', async () => {
    currentFactor = 1
    const { watchDevicePixelRatio } = await freshModule()
    const { matchMediaFn, created } = makeFakeMatchMedia()

    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
      matchMediaFn as unknown as typeof window.matchMedia

    const { useGlobalZoomPersist } = await import('../../../02_Source/renderer/src/lib/useGlobalZoom')
    renderHook(() => useGlobalZoomPersist())
    await act(async () => {
      await Promise.resolve()
    })
    mockSetUiPref.mockClear()

    currentFactor = 1.2
    act(() => {
      created[created.length - 1].fire()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockSetUiPref).toHaveBeenCalledWith({ key: 'zoomFactor', value: 1.2 })
    void watchDevicePixelRatio
  })

  it('동일 factor로 여러 번 변화가 감지돼도 저장은 값이 바뀔 때만 발생한다', async () => {
    currentFactor = 1
    const { matchMediaFn, created } = makeFakeMatchMedia()
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
      matchMediaFn as unknown as typeof window.matchMedia

    const { useGlobalZoomPersist } = await freshModule()
    renderHook(() => useGlobalZoomPersist())
    await act(async () => {
      await Promise.resolve()
    })
    mockSetUiPref.mockClear()

    act(() => {
      created[created.length - 1].fire()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockSetUiPref).not.toHaveBeenCalled()
  })

  it('window.api.getZoomFactor 미가용(테스트/프리로드 실패) 환경에서도 크래시 없이 no-op', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {}
    const { useGlobalZoomPersist } = await freshModule()

    expect(() => renderHook(() => useGlobalZoomPersist())).not.toThrow()
    expect(mockSetUiPref).not.toHaveBeenCalled()
  })

  it('언마운트 후에는 DPR 변화가 감지돼도 더 이상 저장하지 않는다(cleanup)', async () => {
    currentFactor = 1
    const { matchMediaFn, created } = makeFakeMatchMedia()
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
      matchMediaFn as unknown as typeof window.matchMedia

    const { useGlobalZoomPersist } = await freshModule()
    const { unmount } = renderHook(() => useGlobalZoomPersist())
    await act(async () => {
      await Promise.resolve()
    })

    unmount()
    mockSetUiPref.mockClear()

    currentFactor = 1.5
    created[created.length - 1].fire()

    expect(mockSetUiPref).not.toHaveBeenCalled()
  })
})

describe('useZoomFactorPct — 현재 zoom %를 반환(부작용 없음)', () => {
  it('현재 factor를 %(정수 반올림)로 반환한다', async () => {
    currentFactor = 1.2
    const { useZoomFactorPct } = await freshModule()

    const { result } = renderHook(() => useZoomFactorPct())

    expect(result.current).toBe(120)
  })

  it('DPR 변화 감지 후 갱신된 %를 반환한다', async () => {
    currentFactor = 1
    const { matchMediaFn, created } = makeFakeMatchMedia()
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
      matchMediaFn as unknown as typeof window.matchMedia

    const { useZoomFactorPct } = await freshModule()
    const { result } = renderHook(() => useZoomFactorPct())

    expect(result.current).toBe(100)

    currentFactor = 1.44
    act(() => {
      created[created.length - 1].fire()
    })

    expect(result.current).toBe(144)
  })

  it('호출로 인해 setUiPref(저장)가 발생하지 않는다 — 표시 전용', async () => {
    currentFactor = 1.3
    const { useZoomFactorPct } = await freshModule()

    renderHook(() => useZoomFactorPct())
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockSetUiPref).not.toHaveBeenCalled()
  })

  it('window.api 미가용 환경에서 100(기본값) 폴백', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {}
    const { useZoomFactorPct } = await freshModule()

    const { result } = renderHook(() => useZoomFactorPct())

    expect(result.current).toBe(100)
  })
})
