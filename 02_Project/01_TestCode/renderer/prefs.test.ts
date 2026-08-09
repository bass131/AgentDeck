import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let storedPrefs: Record<string, unknown> = {}

const mockGetUiPrefs = vi.fn(async (): Promise<Record<string, unknown>> => ({
  ...storedPrefs,
}))
const mockSetUiPref = vi.fn(async (_req: { key: string; value: unknown }): Promise<{ ok: boolean }> => {
  storedPrefs[_req.key] = _req.value
  return { ok: true }
})

Object.defineProperty(globalThis, 'window', {
  value: {
    api: {
      getUiPrefs: mockGetUiPrefs,
      setUiPref: mockSetUiPref,
    },
    clearTimeout: globalThis.clearTimeout,
    setTimeout: globalThis.setTimeout,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
  configurable: true,
})

async function freshPrefs(): Promise<typeof import('../../../02_Project/00_Source/renderer/src/lib/prefs')> {
  vi.resetModules()
  return import('../../../02_Project/00_Source/renderer/src/lib/prefs')
}

beforeEach(() => {
  storedPrefs = {}
  vi.clearAllMocks()
})

afterEach(() => {
  vi.resetModules()
})

describe('loadPrefs — boot 시 IPC 호출 → 캐시 채움', () => {
  it('loadPrefs()는 window.api.getUiPrefs를 1회 호출한다', async () => {
    storedPrefs = { theme: 'dark', 'workspace.mode': 'single' }
    const { loadPrefs } = await freshPrefs()

    await loadPrefs()

    expect(mockGetUiPrefs).toHaveBeenCalledTimes(1)
  })

  it('loadPrefs() 완료 후 getPref가 저장된 값을 반환한다', async () => {
    storedPrefs = { theme: 'light', zoomFactor: 1.2 }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('theme', 'dark')).toBe('light')
    expect(getPref('zoomFactor', 1.0)).toBe(1.2)
  })

  it('loadPrefs() 호출 전 getPref는 fallback을 반환한다', async () => {
    storedPrefs = { theme: 'light' }
    const { getPref } = await freshPrefs()

    expect(getPref('theme', 'dark')).toBe('dark')
    expect(getPref('zoomFactor', 1.0)).toBe(1.0)
  })

  it('getUiPrefs IPC 실패 시 graceful — 캐시 빈 상태로도 getPref가 fallback을 반환', async () => {
    mockGetUiPrefs.mockRejectedValueOnce(new Error('IPC error'))
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('theme', 'dark')).toBe('dark')
    expect(getPref('missing', 42)).toBe(42)
  })

  it('getUiPrefs가 null/undefined 반환 시 빈 캐시로 초기화된다 (graceful)', async () => {
    mockGetUiPrefs.mockResolvedValueOnce(null as unknown as Record<string, unknown>)
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('anyKey', 'fallback')).toBe('fallback')
  })
})

describe('getPref — 동기 캐시 읽기', () => {
  it('존재하는 키는 T 타입으로 반환한다', async () => {
    storedPrefs = { panelSize: 300, seenWhatsNew: true }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref<number>('panelSize', 0)).toBe(300)
    expect(getPref<boolean>('seenWhatsNew', false)).toBe(true)
  })

  it('존재하지 않는 키는 fallback을 반환한다', async () => {
    storedPrefs = {}
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('nonExistent', 'default')).toBe('default')
    expect(getPref('missingNum', 99)).toBe(99)
  })

  it('값이 null이면 fallback을 반환한다', async () => {
    storedPrefs = { nullKey: null }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('nullKey', 'fallback')).toBe('fallback')
  })

  it('값이 undefined이면 fallback을 반환한다', async () => {
    storedPrefs = { undefinedKey: undefined }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('undefinedKey', 'fallback')).toBe('fallback')
  })

  it('값이 0(falsy)이면 0을 반환한다 (fallback 아님)', async () => {
    storedPrefs = { zoomFactor: 0 }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref<number>('zoomFactor', 1.0)).toBe(0)
  })

  it('값이 false(falsy)이면 false를 반환한다 (fallback 아님)', async () => {
    storedPrefs = { seenWhatsNew: false }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref<boolean>('seenWhatsNew', true)).toBe(false)
  })
})

describe('setPref — 캐시 갱신 + setUiPref IPC 비동기 호출', () => {
  it('setPref(key, value) 후 getPref가 즉시 갱신된 값을 반환한다 (동기)', async () => {
    const { loadPrefs, getPref, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('theme', 'light')

    expect(getPref('theme', 'dark')).toBe('light')
  })

  it('setPref(key, value) 는 window.api.setUiPref를 {key, value} 인자로 호출한다', async () => {
    const { loadPrefs, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('workspace.mode', 'multi')

    await new Promise((r) => setTimeout(r, 50))

    expect(mockSetUiPref).toHaveBeenCalledWith({ key: 'workspace.mode', value: 'multi' })
  })

  it('setPref 여러 번 호출 시 마지막 값이 캐시에 반영된다', async () => {
    const { loadPrefs, getPref, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('theme', 'light')
    setPref('theme', 'dark')

    expect(getPref('theme', 'light')).toBe('dark')
  })

  it('setPref IPC 실패는 무시된다 (캐시 갱신은 유지)', async () => {
    mockSetUiPref.mockRejectedValueOnce(new Error('IPC write error'))
    const { loadPrefs, getPref, setPref } = await freshPrefs()

    await loadPrefs()

    expect(() => setPref('theme', 'light')).not.toThrow()

    expect(getPref('theme', 'dark')).toBe('light')
  })

  it('setPref(key, value) 인자 구조: {key, value} 형태로 정확히 전달한다', async () => {
    const { loadPrefs, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('panelSize', 320)

    await new Promise((r) => setTimeout(r, 50))

    const calls = mockSetUiPref.mock.calls
    expect(calls.length).toBeGreaterThanOrEqual(1)
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall).toEqual({ key: 'panelSize', value: 320 })
  })
})

describe('workspace.mode 영속 — getPref/setPref 인터페이스 계약', () => {
  it('getPref("workspace.mode", "single") — 저장 값 없으면 "single" fallback', async () => {
    storedPrefs = {}
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('workspace.mode', 'single')).toBe('single')
  })

  it('getPref("workspace.mode", "single") — 저장된 "multi" 반환', async () => {
    storedPrefs = { 'workspace.mode': 'multi' }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('workspace.mode', 'single')).toBe('multi')
  })

  it('setPref("workspace.mode", "multi") → 캐시 즉시 갱신 + IPC 호출', async () => {
    const { loadPrefs, getPref, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('workspace.mode', 'multi')

    expect(getPref('workspace.mode', 'single')).toBe('multi')

    await new Promise((r) => setTimeout(r, 50))

    expect(mockSetUiPref).toHaveBeenCalledWith({ key: 'workspace.mode', value: 'multi' })
  })
})

describe('replMode 영속 — getPref/setPref 인터페이스 계약 (LR3-03)', () => {
  it('getPref("replMode", true) — 저장 값 없으면 true 폴백(가법 하위호환)', async () => {
    storedPrefs = {}
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('replMode', true)).toBe(true)
  })

  it('getPref("replMode", true) — 저장된 false 반환(사용자가 옵트아웃한 값 보존)', async () => {
    storedPrefs = { replMode: false }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('replMode', true)).toBe(false)
  })

  it('setPref("replMode", false) → 캐시 즉시 갱신 + IPC 호출(재시작 후 복원 왕복의 저장측)', async () => {
    const { loadPrefs, getPref, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('replMode', false)

    expect(getPref('replMode', true)).toBe(false)

    await new Promise((r) => setTimeout(r, 50))

    expect(mockSetUiPref).toHaveBeenCalledWith({ key: 'replMode', value: false })
  })

  it('저장(setPref) → 재로드(loadPrefs, 재시작 시뮬레이션) 왕복 — 값이 그대로 복원된다', async () => {
    const first = await freshPrefs()
    await first.loadPrefs()
    first.setPref('replMode', false)
    await new Promise((r) => setTimeout(r, 20))

    const second = await freshPrefs()
    await second.loadPrefs()

    expect(second.getPref('replMode', true)).toBe(false)
  })
})

describe('theme 영속 — getPref/setPref 인터페이스 계약', () => {
  it('getPref("theme", "dark") — 저장된 "light" 반환', async () => {
    storedPrefs = { theme: 'light' }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref('theme', 'dark')).toBe('light')
  })

  it('setPref("theme", "dark") → IPC setUiPref 호출 인자 검증', async () => {
    const { loadPrefs, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('theme', 'dark')

    await new Promise((r) => setTimeout(r, 50))

    expect(mockSetUiPref).toHaveBeenCalledWith({ key: 'theme', value: 'dark' })
  })
})

describe('기존 회귀 — 독립적 동작 보장', () => {
  it('loadPrefs를 2회 호출해도 캐시가 올바르게 유지된다', async () => {
    storedPrefs = { key1: 'val1' }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()
    storedPrefs = { key1: 'val2' }
    await loadPrefs()

    expect(getPref('key1', 'fallback')).toBe('val2')
  })

  it('getPref 타입 파라미터 T — string/number/boolean/object 모두 지원', async () => {
    storedPrefs = {
      strKey: 'hello',
      numKey: 42,
      boolKey: true,
      objKey: { nested: 'value' },
    }
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs()

    expect(getPref<string>('strKey', '')).toBe('hello')
    expect(getPref<number>('numKey', 0)).toBe(42)
    expect(getPref<boolean>('boolKey', false)).toBe(true)
    expect(getPref<{ nested: string }>('objKey', { nested: '' })).toEqual({ nested: 'value' })
  })

  it('여러 키 setPref 후 각각 독립적으로 캐시에 저장된다', async () => {
    const { loadPrefs, getPref, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('keyA', 'valueA')
    setPref('keyB', 100)
    setPref('keyC', false)

    expect(getPref('keyA', '')).toBe('valueA')
    expect(getPref('keyB', 0)).toBe(100)
    expect(getPref('keyC', true)).toBe(false)
  })
})
