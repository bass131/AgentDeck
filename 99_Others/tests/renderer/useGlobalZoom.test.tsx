// @vitest-environment jsdom
/**
 * useGlobalZoom.test.tsx — FB1 P04 TDD (실패 테스트 먼저 → 구현).
 *
 * 검증 대상: 02.Source/renderer/src/lib/useGlobalZoom.ts
 *   - watchDevicePixelRatio: DPR 변화 감지 재등록 패턴(리스너 중복 등록 방지 + cleanup)
 *   - useGlobalZoomPersist: 감지 → window.api.getZoomFactor() 조회 → setPref('zoomFactor') 저장
 *     · 동일 factor 재감지 시 중복 저장 생략
 *     · 언마운트 후 리스너 cleanup(더 이상 변화에 반응하지 않음)
 *   - useZoomFactorPct: 표시 전용(부작용 없음) — 현재 zoom %를 반환
 *
 * 신뢰경계: renderer untrusted — window.api mock만 사용. fs/Node 0.
 * per-region CSS zoom(lib/zoom.tsx)과 무관 — 이 테스트는 전역 page zoom만 다룬다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

// ─────────────────────────────────────────────────────────────────────────────
// matchMedia mock — MediaQueryList 스텁(리스너 등록/해제 + 수동 발화 지원)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// window.api mock — getZoomFactor(가변) + setUiPref/getUiPrefs(prefs.ts 경유)
// ─────────────────────────────────────────────────────────────────────────────

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
  // jsdom은 matchMedia 미구현 — 기본 no-op 스텁(개별 테스트가 필요 시 makeFakeMatchMedia로 교체).
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

async function freshModule(): Promise<typeof import('../../../02.Source/renderer/src/lib/useGlobalZoom')> {
  vi.resetModules()
  return import('../../../02.Source/renderer/src/lib/useGlobalZoom')
}

async function freshPrefs(): Promise<typeof import('../../../02.Source/renderer/src/lib/prefs')> {
  return import('../../../02.Source/renderer/src/lib/prefs')
}

// ─────────────────────────────────────────────────────────────────────────────
// watchDevicePixelRatio — 재등록 패턴 단위 테스트
// ─────────────────────────────────────────────────────────────────────────────

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

    created[0].fire() // 1차 변화
    expect(created).toHaveLength(2) // 재등록됨
    expect(created[0].removeEventListener).toHaveBeenCalledTimes(1) // 이전 것 해제
    expect(onChange).toHaveBeenCalledTimes(1)

    created[1].fire() // 2차 변화
    expect(created).toHaveLength(3)
    expect(created[1].removeEventListener).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(2)

    // 동시에 활성 리스너는 항상 1개뿐 — 이전 것들은 모두 해제된 채로 남는다.
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

    // cleanup 후 fire()는 removeEventListener로 인해 listener가 null이 되어 무반응.
    created[0].fire()
    expect(onChange).not.toHaveBeenCalled()
    expect(created).toHaveLength(1) // 재등록 없음
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// useGlobalZoomPersist — 감지 → 저장 매핑
// ─────────────────────────────────────────────────────────────────────────────

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
    await prefs.loadPrefs() // 인메모리 캐시에 zoomFactor=1.2 시드
    const { useGlobalZoomPersist } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')

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

    // useGlobalZoomPersist 내부는 window.matchMedia를 직접 참조하므로,
    // 전역 matchMedia를 fake로 교체해 훅 내부 watchDevicePixelRatio 호출을 가로챈다.
    ;(window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
      matchMediaFn as unknown as typeof window.matchMedia

    const { useGlobalZoomPersist } = await import('../../../02.Source/renderer/src/lib/useGlobalZoom')
    renderHook(() => useGlobalZoomPersist())
    await act(async () => {
      await Promise.resolve()
    })
    mockSetUiPref.mockClear()

    // 줌 변화 시뮬레이션: factor 갱신 후 DPR 변화 이벤트 발화
    currentFactor = 1.2
    act(() => {
      created[created.length - 1].fire()
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mockSetUiPref).toHaveBeenCalledWith({ key: 'zoomFactor', value: 1.2 })
    void watchDevicePixelRatio // 사용 표시(위 재등록 패턴 함수는 이 테스트에서 간접 검증)
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

    // factor 변경 없이 change만 재발화(예: 다른 resolution 속성 변화) — 저장 생략돼야 함.
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
    // 언마운트 후 마지막으로 활성이던 mql의 리스너는 이미 해제됐어야 함.
    created[created.length - 1].fire()

    expect(mockSetUiPref).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// useZoomFactorPct — 표시 전용(부작용 없음)
// ─────────────────────────────────────────────────────────────────────────────

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
