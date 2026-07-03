/**
 * useGlobalZoom.ts — 전역 page zoom 변화 감지 → ui-prefs 영속 + 표시 (FB1 P04).
 *
 * 배경(_milestone-plan.md "스파이크 결과·설계 결정" 참조): Ctrl+=/−/0은 Electron
 * 기본 View 메뉴 zoom role이 이미 처리한다(이 앱은 단축키를 새로 등록하지 않는다).
 * 이 모듈이 담당하는 건 그 결과(webFrame page zoom)가 바뀔 때마다:
 *   1) 현재 factor를 P02 read-only 조회(window.api.getZoomFactor)로 읽고
 *   2) P01 lib/prefs.ts의 setPref('zoomFactor', factor)로 영속(기존 UI_PREFS_SET
 *      재사용 — 신규 IPC 채널 0)해 P03 부팅 복원과 라운드트립을 완성하는 것뿐이다.
 *
 * 감지 메커니즘: page zoom이 바뀌면 devicePixelRatio(DPR)도 함께 바뀐다는 성질을
 * 이용해 `matchMedia('(resolution: <dpr>dppx)')`의 change 이벤트로 감지한다(표준
 * 관례). matchMedia는 *등록 시점 DPR에 고정된 정적 질의*라 DPR이 그 값에서
 * 벗어나는 순간 단 1회만 change를 쏜다 — 계속 감지하려면 change가 올 때마다
 * 리스너를 갈아 끼우고 새 DPR로 media query를 재등록해야 한다(watchDevicePixelRatio).
 *
 * per-region CSS zoom(`lib/zoom.tsx`의 useZoom·ZoomBadge)과는 완전히 별개다 —
 * 저장소(ui-prefs.json vs localStorage)·배지(없음 vs ZoomBadge "N%")·범위 상수
 * (ZOOM_FACTOR_RANGE 0.5~2.0 vs zoom.tsx MIN/MAX 0.5~3) 모두 독립.
 * 공존 정의: `02.Source/shared/ipc/personalization.ts` 파일 끝 주석 참조.
 *
 * CRITICAL: renderer untrusted — window.api 화이트리스트(getZoomFactor)만 호출,
 * fs/Node/webFrame 직접 0. 신규 IPC 채널 0(P02 조회 + 기존 setUiPref 재사용).
 */
import { useEffect, useRef, useState } from 'react'
import { getPref, setPref } from './prefs'

/**
 * devicePixelRatio(DPR) 변화를 감지해 매번 콜백을 호출한다 — 1회성 media query
 * 재등록 패턴(표준 관례). matchMedia는 등록 시점 DPR에 고정된 정적 질의이므로
 * change가 발화할 때마다 기존 리스너를 해제하고 *현재* DPR로 다시 등록해야
 * 다음 변화도 놓치지 않는다.
 *
 * 리스너 중복 등록 방지: 내부적으로 항상 "현재 활성 MediaQueryList 1개"만 유지 —
 * register()가 이전 것을 해제한 뒤에만 새로 만든다.
 *
 * @param onChange - DPR이 바뀔 때마다 호출되는 콜백(인자 없음).
 * @param matchMediaFn - 테스트 주입용(기본값 window.matchMedia). 실제 런타임에서는
 *   생략하고 기본값 사용.
 * @returns cleanup 함수 — 현재 등록된 리스너를 해제(React useEffect cleanup에서 호출).
 */
export function watchDevicePixelRatio(
  onChange: () => void,
  matchMediaFn: (query: string) => MediaQueryList = (q) => window.matchMedia(q),
): () => void {
  let mql: MediaQueryList | null = null

  const listener = (): void => {
    // 발화 즉시 현재 DPR로 재등록해야 다음 변화도 감지된다(표준 관례) — 콜백보다 먼저.
    register()
    onChange()
  }

  function register(): void {
    if (mql) mql.removeEventListener('change', listener)
    mql = matchMediaFn(`(resolution: ${window.devicePixelRatio}dppx)`)
    mql.addEventListener('change', listener)
  }

  register()

  return () => {
    mql?.removeEventListener('change', listener)
    mql = null
  }
}

/** window.api.getZoomFactor 가용 여부 — 미주입 환경(테스트·프리로드 실패) graceful 가드. */
function hasZoomApi(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.getZoomFactor === 'function'
}

/** 현재 zoom factor를 %(정수 반올림)로 읽는다 — API 미가용 시 100(=1.0) 폴백. */
function readCurrentPct(): number {
  if (!hasZoomApi()) return 100
  return Math.round(window.api.getZoomFactor() * 100)
}

/**
 * 현재 전역 page zoom을 %로 반환하는 읽기 전용 훅 — (선택) 표시용.
 *
 * 마운트 시 1회 조회 + 이후 DPR 변화마다 갱신. 영속(setPref) 부작용 없음
 * — useGlobalZoomPersist()와 책임 분리(표시 전용 컴포넌트에서 안전하게 재사용 가능,
 * 예: SettingsModal AppearanceView).
 */
export function useZoomFactorPct(): number {
  const [pct, setPct] = useState<number>(readCurrentPct)

  useEffect(() => {
    if (!hasZoomApi()) return
    const sync = (): void => setPct(readCurrentPct())
    sync()
    return watchDevicePixelRatio(sync)
  }, [])

  return pct
}

/**
 * 전역 page zoom 변화 감지 → ui-prefs 영속 훅 — 부작용 전용(반환값 없음).
 *
 * Shell 수명(항상 마운트) 1곳에서만 호출한다 — per-component 중복 마운트는
 * 리스너 자체는 안전(각자 독립 등록/해제)하지만 저장 IPC가 인스턴스 수만큼
 * 중복 발화할 수 있어 불필요하다.
 *
 * 중복 저장 방지: 마운트 시 ui-prefs 캐시(getPref)에서 마지막 저장값을 시드해,
 * "이전 세션에서 저장한 값 = 지금 복원된 값"인 흔한 경우 불필요한 재저장을
 * 건너뛴다. 이후 DPR 변화로 factor가 실제로 달라졌을 때만 setPref 호출.
 */
export function useGlobalZoomPersist(): void {
  const lastSavedRef = useRef<number | null>(null)

  useEffect(() => {
    if (!hasZoomApi()) return

    // 시드: 이전에 저장된 값(P03 부팅 복원이 적용한 값과 통상 일치) — 없으면 null.
    lastSavedRef.current = getPref<number | null>('zoomFactor', null)

    const sync = (): void => {
      const factor = window.api.getZoomFactor()
      if (lastSavedRef.current === factor) return // 동일 factor 재저장 생략
      lastSavedRef.current = factor
      setPref('zoomFactor', factor)
    }

    sync() // 마운트 시 1회 동기화(시드값과 다르면 즉시 self-heal 저장)

    return watchDevicePixelRatio(sync)
  }, [])
}
