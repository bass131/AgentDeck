/**
 * zoom-readonly-contract.test.ts — FB1 P02 전역 줌 read-only 조회 계약 TDD.
 *
 * TDD 순서: 이 파일이 먼저 작성(실패) → shared/ipc/personalization.ts의
 * ZOOM_FACTOR_RANGE + preload/index.ts의 getZoomFactor 추가 후 통과.
 *
 * 설계 결정(2026-07-04, _milestone-plan.md 스파이크 결과):
 *   신규 IPC 채널 0 — 적용은 Electron 기본 View 메뉴 zoom role(Ctrl+=/−/0),
 *   영속은 기존 UI_PREFS_SET(ui.setPref('zoomFactor')) 재사용. 이 계약이
 *   추가하는 것은 ① 범위 상수(clamp 방어용) ② preload read-only getter뿐.
 *
 * FB2 P03 정합 갱신 노트(2026-07-04): 이 파일 작성 시점엔 setZoomFactor가
 * "노출 금지 대상"이었으나, FB2 P03에서 클램프를 강제하는 setter로 승격
 * 노출됐다(원시 위임이 아니라 검증된 래핑이라 신뢰경계 훼손 아님). 아래
 * "webFrame 원시 노출 안됨" 단언에서 setZoomFactor를 제외하고 별도 존재
 * 단언을 추가했다(케이스 삭제 아님). 클램프 경계·no-op 골든 테스트는
 * `zoom-setter-contract.test.ts`(FB2 P03 신규)에 있다.
 *
 * electron 모킹 패턴은 99.Others/tests/main/window-controls.test.ts 참조.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { IPC_CHANNELS, ZOOM_FACTOR_RANGE } from '../../../02.Source/shared/ipc-contract'

// vi.mock 팩토리는 호이스트되므로 공유 상태는 vi.hoisted로.
const h = vi.hoisted(() => {
  const exposed: { api?: Record<string, unknown> } = {}
  const state = { zoomFactor: 1 }
  return { exposed, state }
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
    // FB2 P03: setZoomFactor는 이 파일에서 값 검증(클램프/no-op)까지는 다루지
    // 않지만(별도 zoom-setter-contract.test.ts 담당), import 시점에 preload가
    // 참조 가능하도록 최소 stub을 둔다.
    setZoomFactor: (f: number): void => {
      h.state.zoomFactor = f
    },
  },
}))

beforeAll(async () => {
  // 모듈 최상단 contextBridge.exposeInMainWorld('api', api) 실행 — 1회만 임포트.
  await import('../../../02.Source/preload/index')
})

// ── ZOOM_FACTOR_RANGE 상수 계약 (main P03 clamp 방어용) ─────────────────────

describe('ZOOM_FACTOR_RANGE 범위상수 (shared, 신규 IPC 채널 0)', () => {
  it('MIN=0.5, MAX=2.0 정확한 값으로 존재한다', () => {
    expect(ZOOM_FACTOR_RANGE.MIN).toBe(0.5)
    expect(ZOOM_FACTOR_RANGE.MAX).toBe(2.0)
  })

  it('MIN < MAX 불변식을 satisfy한다', () => {
    expect(ZOOM_FACTOR_RANGE.MIN).toBeLessThan(ZOOM_FACTOR_RANGE.MAX)
  })

  it('MIN·MAX 두 필드만 포함한다 (최소 표면 계약)', () => {
    const keys = Object.keys(ZOOM_FACTOR_RANGE)
    expect(keys).toEqual(expect.arrayContaining(['MIN', 'MAX']))
    expect(keys).toHaveLength(2)
  })

  it('리터럴 타입 샘플이 ZOOM_FACTOR_RANGE와 동일한 형태의 객체로 컴파일된다 (타입 계약 확인)', () => {
    const sample: { MIN: number; MAX: number } = { MIN: ZOOM_FACTOR_RANGE.MIN, MAX: ZOOM_FACTOR_RANGE.MAX }
    expect(sample).toEqual({ MIN: 0.5, MAX: 2.0 })
  })
})

// ── 신규 IPC 채널 0 회귀 가드 ─────────────────────────────────────────────

describe('줌 관련 신규 IPC 채널이 없다 (P02 설계 결정 — apply/set 채널 0)', () => {
  it('IPC_CHANNELS 어떤 값도 "zoom" 문자열을 포함하지 않는다', () => {
    const values = Object.values(IPC_CHANNELS)
    for (const ch of values) {
      expect(ch.toLowerCase()).not.toContain('zoom')
    }
  })

  it('기존 UI_PREFS_SET 채널은 그대로 유지된다 (영속 재사용 대상, 변경 0)', () => {
    expect(IPC_CHANNELS.UI_PREFS_SET).toBe('ui.setPref')
  })

  it('채널명 유니크 불변식이 유지된다 (P02 작업 전후 동일)', () => {
    const values = Object.values(IPC_CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })
})

// ── preload getZoomFactor 화이트리스트 노출 (신뢰경계) ──────────────────────

describe('preload getZoomFactor 화이트리스트 노출', () => {
  it('window.api.getZoomFactor가 함수로 노출된다', () => {
    const api = h.exposed.api as { getZoomFactor: () => number }
    expect(typeof api.getZoomFactor).toBe('function')
  })

  it('getZoomFactor는 인자를 받지 않는다 (조회 전용 — arity 0)', () => {
    const api = h.exposed.api as { getZoomFactor: () => number }
    expect(api.getZoomFactor.length).toBe(0)
  })

  it('getZoomFactor는 webFrame.getZoomFactor()를 그대로 래핑 반환한다', () => {
    const api = h.exposed.api as { getZoomFactor: () => number }
    h.state.zoomFactor = 1.25
    expect(api.getZoomFactor()).toBe(1.25)
    h.state.zoomFactor = 0.8
    expect(api.getZoomFactor()).toBe(0.8)
  })

  it('webFrame 원시 객체·검증 없는 원시 적용 메서드(zoomIn/zoomOut/resetZoom)는 노출되지 않는다 (신뢰경계 통노출 금지, FB2 P03 정합 갱신)', () => {
    // FB2 P03 정합 갱신 사유: setZoomFactor는 더 이상 "비노출" 대상이 아니다 —
    // 클램프를 강제하는 검증된 setter로 승격 노출됐다(원시 위임이 아니므로
    // 신뢰경계 훼손 아님). 이 단언은 "검증 없는 원시 webFrame 메서드"만 계속
    // 차단됨을 확인한다. 클램프된 setZoomFactor 자체의 존재·동작은 바로 아래
    // describe + zoom-setter-contract.test.ts가 담당.
    const api = h.exposed.api as Record<string, unknown>
    expect(api).not.toHaveProperty('webFrame')
    expect(api).not.toHaveProperty('zoomIn')
    expect(api).not.toHaveProperty('zoomOut')
    expect(api).not.toHaveProperty('resetZoom')
  })
})

// ── preload setZoomFactor 클램프 setter 노출 (FB2 P03, 신뢰경계) ────────────
// 클램프 경계값·no-op(비유한/타입 불일치) 등 값 계약 골든 테스트는
// zoom-setter-contract.test.ts에 분리 — 여기서는 "존재·형태"만 확인한다.

describe('preload setZoomFactor 클램프 setter 노출 (FB2 P03)', () => {
  it('window.api.setZoomFactor가 함수로 노출된다 (원시 위임 아님 — 클램프된 setter)', () => {
    const api = h.exposed.api as { setZoomFactor: (factor: number) => void }
    expect(typeof api.setZoomFactor).toBe('function')
  })

  it('setZoomFactor는 인자 1개(factor)를 받는다', () => {
    const api = h.exposed.api as { setZoomFactor: (factor: number) => void }
    expect(api.setZoomFactor.length).toBe(1)
  })
})
