/**
 * zoom.ts — 부팅 시 전역 page zoom 복원 (순수 로직, electron 무의존).
 *
 * FB1 P03: ui-prefs.json에 저장된 zoomFactor(untrusted — 파일 수동 조작·
 * 마이그레이션 버그로 손상 가능)를 ZOOM_FACTOR_RANGE(0.5~2.0)로 클램프한 뒤
 * webContents에 적용한다. 신규 IPC 채널 0(P02/P03 중간안 — 적용은 Electron
 * 기본 View 메뉴 zoom role, 저장은 기존 UI_PREFS_SET 재사용). 이 모듈은
 * "부팅 시 저장값 → 적용값" 계산/오케스트레이션만 담당한다.
 *
 * CRITICAL(적용 시점 함정): 프로덕션 빌드에서 Chromium HostZoomMap이 per-host
 * 줌을 **우발 영속**한다(실측: 재시작 후 factor 유지). 이 앱의 부팅 복원이
 * 항상 마지막에 이겨야 하므로, 호출부(main/index.ts)는 반드시 webContents
 * 'did-finish-load' 이벤트 **이후**(페이지 네비게이션이 HostZoomMap 값을
 * 스스로 적용한 뒤) restoreBootZoom()을 호출해야 한다. did-finish-load 이전
 * (예: BrowserWindow 생성 직후)에 호출하면 이후 네비게이션이 HostZoomMap
 * 값으로 되돌릴 수 있다 — 순서가 뒤집히면 이 앱의 영속값이 무시된다.
 */

import { ZOOM_FACTOR_RANGE } from '../../shared/ipc-contract'

/**
 * 저장된 zoomFactor 원시값(ui-prefs.json에서 온 unknown, untrusted)을
 * 검증 + 클램프한다.
 *
 * 반환 null = 복원 스킵(저장값 없음 · 숫자 아님 · NaN · Infinity/-Infinity).
 * 기본값(1.0)을 강제 설정하지 않는다 — Chromium 우발 영속값을 그대로
 * 존중하기 위해서다(함정: null 반환 시 아무것도 적용하지 않아야 함).
 *
 * 숫자이지만 범위(MIN~MAX) 밖이면 스킵이 아니라 **클램프**한다
 * (예: 0.49 → 0.5, 2.1 → 2.0, 음수/0 → MIN).
 */
export function resolveBootZoomFactor(rawValue: unknown): number | null {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return null
  }
  return Math.min(ZOOM_FACTOR_RANGE.MAX, Math.max(ZOOM_FACTOR_RANGE.MIN, rawValue))
}

/**
 * restoreBootZoom()에 주입할 의존성 — electron을 직접 참조하지 않아
 * node 환경에서 순수 단위 테스트가 가능하다.
 */
export interface ZoomRestoreDeps {
  /**
   * ui-prefs.json 전체 조회(비동기) — main prefs.ts PrefsStore.getAll() 래핑.
   * 반환 객체에 zoomFactor 키가 없어도 무방(undefined 취급).
   */
  getUiPrefs: () => Promise<{ zoomFactor?: unknown }>
  /**
   * 클램프된 zoom factor를 실제로 적용 — win.webContents.setZoomFactor 래핑.
   * resolveBootZoomFactor가 null을 반환하면 이 함수는 호출되지 않는다.
   */
  applyZoomFactor: (factor: number) => void
}

/**
 * 부팅 시 zoomFactor 복원 오케스트레이션.
 *
 * getUiPrefs() → resolveBootZoomFactor(클램프) → (null 아니면) applyZoomFactor.
 * 저장값이 없거나 방어 대상(NaN·문자열 등)이면 조용히 no-op — throw 없음.
 *
 * 호출 시점(main/index.ts 책임): webContents 'did-finish-load' 이후.
 * 클래스 상단 CRITICAL 주석 참고(순서 보장 함정).
 *
 * 하드닝(reviewer 지적): getUiPrefs()의 await 마이크로태스크 갭 사이 창이
 * 닫히는 등 applyZoomFactor가 throw할 수 있다(예: 이미 destroy된
 * webContents.setZoomFactor 호출). 호출부(index.ts)가 이 함수를
 * `void restoreBootZoom(...)`로 fire-and-forget 호출하므로, 여기서 삼키지
 * 않으면 unhandledRejection이 된다 — try/catch로 무시(no-op 취급, throw 0).
 */
export async function restoreBootZoom(deps: ZoomRestoreDeps): Promise<void> {
  const prefs = await deps.getUiPrefs()
  const clamped = resolveBootZoomFactor(prefs?.zoomFactor)
  if (clamped === null) return
  try {
    deps.applyZoomFactor(clamped)
  } catch {
    // 적용 실패(예: 창이 이미 destroy됨)는 무해 — 부팅 복원은 best-effort.
  }
}
