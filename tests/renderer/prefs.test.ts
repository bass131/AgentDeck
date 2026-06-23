/**
 * prefs.test.ts — P1 ui-prefs lib TDD (실패 테스트 먼저)
 *
 * 검증 대상: src/renderer/src/lib/prefs.ts
 *   - loadPrefs(): boot 시 getUiPrefs IPC 호출 → 인메모리 캐시 채움
 *   - getPref(key, fallback): 캐시 동기 읽기 (로드 전 fallback, 로드 후 실값)
 *   - setPref(key, value): 캐시 즉시 갱신 + setUiPref IPC 비동기 호출
 *   - workspace.mode / theme 영속 연결 (setPref/getPref 인터페이스 검증)
 *   - 기존 회귀 없음
 *
 * Node 환경. window.api mock 포함.
 * 신뢰경계: renderer untrusted — window.api.getUiPrefs / setUiPref 만 호출.
 * CRITICAL: 민감 자격증명(토큰/시크릿)은 저장하지 않는 계약 준수.
 */

// ─────────────────────────────────────────────────────────────────────────────
// window.api mock 셋업
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/** 기본 prefs 저장소 (테스트 간 초기화) */
let storedPrefs: Record<string, unknown> = {}

const mockGetUiPrefs = vi.fn(async (): Promise<Record<string, unknown>> => ({
  ...storedPrefs,
}))
const mockSetUiPref = vi.fn(async (_req: { key: string; value: unknown }): Promise<{ ok: boolean }> => {
  storedPrefs[_req.key] = _req.value
  return { ok: true }
})

// window.api 전역 mock
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

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: 매 테스트마다 모듈을 fresh import (캐시 격리)
// ─────────────────────────────────────────────────────────────────────────────

async function freshPrefs(): Promise<typeof import('../../src/renderer/src/lib/prefs')> {
  vi.resetModules()
  return import('../../src/renderer/src/lib/prefs')
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 전 초기화
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  storedPrefs = {}
  vi.clearAllMocks()
})

afterEach(() => {
  vi.resetModules()
})

// ─────────────────────────────────────────────────────────────────────────────
// 테스트 스위트
// ─────────────────────────────────────────────────────────────────────────────

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
    const { getPref } = await freshPrefs() // loadPrefs 미호출

    // 로드 전이므로 캐시 비어있음 → fallback
    expect(getPref('theme', 'dark')).toBe('dark')
    expect(getPref('zoomFactor', 1.0)).toBe(1.0)
  })

  it('getUiPrefs IPC 실패 시 graceful — 캐시 빈 상태로도 getPref가 fallback을 반환', async () => {
    mockGetUiPrefs.mockRejectedValueOnce(new Error('IPC error'))
    const { loadPrefs, getPref } = await freshPrefs()

    await loadPrefs() // 예외 throw 없이 완료

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

    // 0은 null/undefined가 아니므로 fallback이 아닌 0 반환
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

    // 캐시 즉시 갱신 — IPC 완료를 기다리지 않아도 됨
    expect(getPref('theme', 'dark')).toBe('light')
  })

  it('setPref(key, value) 는 window.api.setUiPref를 {key, value} 인자로 호출한다', async () => {
    const { loadPrefs, setPref } = await freshPrefs()

    await loadPrefs()
    setPref('workspace.mode', 'multi')

    // debounce 타이머가 있는 경우를 위해 약간 대기
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

    // IPC 실패해도 예외가 throw되지 않음
    expect(() => setPref('theme', 'light')).not.toThrow()

    // 캐시는 갱신된 상태 유지
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
    // 두 번째 호출 시 재로드 (원본 동작: 매번 갱신)
    storedPrefs = { key1: 'val2' }
    await loadPrefs()

    // 두 번째 로드의 값이 반영됨
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
