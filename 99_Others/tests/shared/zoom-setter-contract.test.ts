import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { ZOOM_FACTOR_RANGE, ZOOM_FACTOR_STEP } from '../../../02_Source/shared/ipcContract'

const h = vi.hoisted(() => {
  const exposed: { api?: Record<string, unknown> } = {}
  const state = { zoomFactor: 1 }
  const setZoomFactor = vi.fn((f: number) => {
    state.zoomFactor = f
  })
  return { exposed, state, setZoomFactor }
})

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown): void => {
      h.exposed[key as 'api'] = value as Record<string, unknown>
    },
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  webUtils: {
    getPathForFile: vi.fn(() => ''),
  },
  webFrame: {
    getZoomFactor: (): number => h.state.zoomFactor,
    setZoomFactor: h.setZoomFactor,
  },
}))

beforeAll(async () => {
  await import('../../../02_Source/preload/index')
})

beforeEach(() => {
  h.setZoomFactor.mockClear()
  h.state.zoomFactor = 1
})

describe('ZOOM_FACTOR_STEP 증분 상수 (shared, P05 소비용)', () => {
  it('0.1로 존재한다', () => {
    expect(ZOOM_FACTOR_STEP).toBe(0.1)
  })

  it('ZOOM_FACTOR_RANGE 폭(1.5)보다 작다 (최소 1회 이상 스텝 가능해야 함)', () => {
    expect(ZOOM_FACTOR_STEP).toBeLessThan(ZOOM_FACTOR_RANGE.MAX - ZOOM_FACTOR_RANGE.MIN)
  })
})

describe('preload setZoomFactor 클램프 경계 (노출 지점에서 강제)', () => {
  it('MIN 미만 입력은 MIN으로 스냅된다 (0.49 → 0.5)', () => {
    const api = h.exposed.api as { setZoomFactor: (f: number) => void }
    api.setZoomFactor(0.49)
    expect(h.setZoomFactor).toHaveBeenCalledTimes(1)
    expect(h.setZoomFactor).toHaveBeenCalledWith(0.5)
  })

  it('MAX 초과 입력은 MAX로 스냅된다 (2.1 → 2.0)', () => {
    const api = h.exposed.api as { setZoomFactor: (f: number) => void }
    api.setZoomFactor(2.1)
    expect(h.setZoomFactor).toHaveBeenCalledTimes(1)
    expect(h.setZoomFactor).toHaveBeenCalledWith(2.0)
  })

  it('범위 경계값(MIN·MAX) 자체는 값 변형 없이 그대로 전달된다', () => {
    const api = h.exposed.api as { setZoomFactor: (f: number) => void }
    api.setZoomFactor(ZOOM_FACTOR_RANGE.MIN)
    expect(h.setZoomFactor).toHaveBeenLastCalledWith(ZOOM_FACTOR_RANGE.MIN)
    api.setZoomFactor(ZOOM_FACTOR_RANGE.MAX)
    expect(h.setZoomFactor).toHaveBeenLastCalledWith(ZOOM_FACTOR_RANGE.MAX)
  })

  it('범위 내 값은 클램프 없이 그대로 전달된다 (1.3)', () => {
    const api = h.exposed.api as { setZoomFactor: (f: number) => void }
    api.setZoomFactor(1.3)
    expect(h.setZoomFactor).toHaveBeenCalledWith(1.3)
  })
})

describe('preload setZoomFactor no-op (비유한값/타입 불일치는 webFrame 호출 자체를 생략)', () => {
  it('NaN은 webFrame.setZoomFactor를 호출하지 않는다', () => {
    const api = h.exposed.api as { setZoomFactor: (f: number) => void }
    api.setZoomFactor(NaN)
    expect(h.setZoomFactor).not.toHaveBeenCalled()
  })

  it('Infinity·-Infinity는 no-op이다', () => {
    const api = h.exposed.api as { setZoomFactor: (f: number) => void }
    api.setZoomFactor(Infinity)
    api.setZoomFactor(-Infinity)
    expect(h.setZoomFactor).not.toHaveBeenCalled()
  })

  it('문자열(타입 불일치)은 no-op이다 — 호출부가 타입을 우회해도 런타임 방어', () => {
    const api = h.exposed.api as unknown as { setZoomFactor: (f: unknown) => void }
    api.setZoomFactor('1.5')
    expect(h.setZoomFactor).not.toHaveBeenCalled()
  })

  it('null·undefined(타입 불일치)는 no-op이다', () => {
    const api = h.exposed.api as unknown as { setZoomFactor: (f: unknown) => void }
    api.setZoomFactor(null)
    api.setZoomFactor(undefined)
    expect(h.setZoomFactor).not.toHaveBeenCalled()
  })

  it('no-op 입력 후에도 조회값(getZoomFactor)이 변하지 않는다 (부작용 0 재확인)', () => {
    const api = h.exposed.api as {
      getZoomFactor: () => number
      setZoomFactor: (f: unknown) => void
    }
    h.state.zoomFactor = 1.1
    api.setZoomFactor(NaN)
    expect(api.getZoomFactor()).toBe(1.1)
  })
})
