/**
 * window-zoom-restore.test.ts — 부팅 시 전역 zoomFactor 복원 (FB1 P03, TDD RED 먼저).
 *
 * 대상: 02.Source/main/06_window/zoom.ts
 *   - resolveBootZoomFactor(rawValue): ui-prefs.json에서 읽은 untrusted 원시값을
 *     ZOOM_FACTOR_RANGE(0.5~2.0)로 클램프. 숫자 아님/NaN/Infinity → null(복원 스킵,
 *     기본값 1.0 강제 설정 X — Chromium HostZoomMap 값 존중). 범위 밖 숫자는
 *     스킵이 아니라 클램프.
 *   - restoreBootZoom(deps): getUiPrefs() → resolveBootZoomFactor → applyZoomFactor
 *     오케스트레이션. electron 무의존(주입형 deps) — node 환경에서 직접 검증.
 *
 * 적용 시점(함정, main/index.ts 몫): win.webContents 'did-finish-load' 이후에
 * restoreBootZoom을 호출해야 Chromium HostZoomMap 우발 영속값보다 항상 나중에
 * 이겨서 순서가 보장된다. 이 테스트 파일은 시점 자체는 검증하지 않는다
 * (electron BrowserWindow 부재 — 순수 로직만 단위 검증).
 */

import { describe, it, expect, vi } from 'vitest'
import { resolveBootZoomFactor, restoreBootZoom } from '../../../02.Source/main/06_window/zoom'

// ═══════════════════════════════════════════════════════════════════════════
describe('resolveBootZoomFactor() — 클램프 + untrusted 방어', () => {
  describe('범위 밖 숫자 → 클램프(스킵 아님)', () => {
    it('0.49 → 0.5로 클램프', () => {
      expect(resolveBootZoomFactor(0.49)).toBe(0.5)
    })

    it('2.1 → 2.0으로 클램프', () => {
      expect(resolveBootZoomFactor(2.1)).toBe(2.0)
    })

    it('음수 → MIN(0.5)로 클램프', () => {
      expect(resolveBootZoomFactor(-1)).toBe(0.5)
    })

    it('0 → MIN(0.5)로 클램프', () => {
      expect(resolveBootZoomFactor(0)).toBe(0.5)
    })

    it('매우 큰 값(100) → MAX(2.0)로 클램프', () => {
      expect(resolveBootZoomFactor(100)).toBe(2.0)
    })
  })

  describe('경계값 — 그대로 통과', () => {
    it('0.5(MIN 경계) → 0.5 그대로', () => {
      expect(resolveBootZoomFactor(0.5)).toBe(0.5)
    })

    it('2.0(MAX 경계) → 2.0 그대로', () => {
      expect(resolveBootZoomFactor(2.0)).toBe(2.0)
    })

    it('범위 내 정상값(1.2) → 그대로', () => {
      expect(resolveBootZoomFactor(1.2)).toBe(1.2)
    })
  })

  describe('숫자 아님/비정상 → null(복원 스킵)', () => {
    it('NaN → null', () => {
      expect(resolveBootZoomFactor(NaN)).toBeNull()
    })

    it('Infinity → null', () => {
      expect(resolveBootZoomFactor(Infinity)).toBeNull()
    })

    it('-Infinity → null', () => {
      expect(resolveBootZoomFactor(-Infinity)).toBeNull()
    })

    it('문자열("1.5") → null', () => {
      expect(resolveBootZoomFactor('1.5')).toBeNull()
    })

    it('undefined(저장값 없음) → null', () => {
      expect(resolveBootZoomFactor(undefined)).toBeNull()
    })

    it('null → null', () => {
      expect(resolveBootZoomFactor(null)).toBeNull()
    })

    it('boolean → null', () => {
      expect(resolveBootZoomFactor(true)).toBeNull()
    })

    it('객체 → null', () => {
      expect(resolveBootZoomFactor({ value: 1.2 })).toBeNull()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
describe('restoreBootZoom() — getUiPrefs → clamp → applyZoomFactor 오케스트레이션', () => {
  it('저장된 zoomFactor가 있으면 클램프 후 적용한다', async () => {
    const applyZoomFactor = vi.fn()
    await restoreBootZoom({
      getUiPrefs: async () => ({ zoomFactor: 1.2 }),
      applyZoomFactor,
    })
    expect(applyZoomFactor).toHaveBeenCalledExactlyOnceWith(1.2)
  })

  it('범위 밖 저장값은 클램프된 값으로 적용한다', async () => {
    const applyZoomFactor = vi.fn()
    await restoreBootZoom({
      getUiPrefs: async () => ({ zoomFactor: 3.5 }),
      applyZoomFactor,
    })
    expect(applyZoomFactor).toHaveBeenCalledExactlyOnceWith(2.0)
  })

  it('저장값 없음(빈 prefs) → applyZoomFactor 호출 안 함(no-op)', async () => {
    const applyZoomFactor = vi.fn()
    await restoreBootZoom({
      getUiPrefs: async () => ({}),
      applyZoomFactor,
    })
    expect(applyZoomFactor).not.toHaveBeenCalled()
  })

  it('저장값이 NaN이면 applyZoomFactor 호출 안 함(no-op)', async () => {
    const applyZoomFactor = vi.fn()
    await restoreBootZoom({
      getUiPrefs: async () => ({ zoomFactor: NaN }),
      applyZoomFactor,
    })
    expect(applyZoomFactor).not.toHaveBeenCalled()
  })

  it('저장값이 문자열이면 applyZoomFactor 호출 안 함(no-op)', async () => {
    const applyZoomFactor = vi.fn()
    await restoreBootZoom({
      getUiPrefs: async () => ({ zoomFactor: '1.5' }),
      applyZoomFactor,
    })
    expect(applyZoomFactor).not.toHaveBeenCalled()
  })

  // ── 하드닝(reviewer): applyZoomFactor throw(예: destroy된 webContents) → 무예외 ──
  it('applyZoomFactor가 throw해도 restoreBootZoom은 reject하지 않는다(무예외 삼킴)', async () => {
    const applyZoomFactor = vi.fn(() => {
      throw new Error('Object has been destroyed')
    })
    await expect(
      restoreBootZoom({
        getUiPrefs: async () => ({ zoomFactor: 1.2 }),
        applyZoomFactor,
      })
    ).resolves.toBeUndefined()
    expect(applyZoomFactor).toHaveBeenCalledExactlyOnceWith(1.2)
  })
})
