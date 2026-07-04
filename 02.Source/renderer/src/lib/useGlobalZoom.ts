/**
 * useGlobalZoom.ts — 전역 page zoom 변화 감지 → ui-prefs 영속 + 표시 + 조작 (FB1 P04 +
 * FB2 P05 확장).
 *
 * 배경(_milestone-plan.md "스파이크 결과·설계 결정" 참조): Ctrl+=/−/0은 Electron
 * 기본 View 메뉴 zoom role이 이미 처리한다(FB1 — 이 앱은 그 role을 대체하지 않는다).
 * FB2 P05는 그 role이 못 잡는 "Shift 없는 Ctrl+="(영호 버그 리포트)만 보조 경로로
 * 채운다 — 아래 stepZoomFactor/resetZoomFactor가 그 보조 경로의 실제 적용부다.
 * 이 모듈이 담당하는 건:
 *   1) (P04) DPR 변화 감지 → 현재 factor를 P02 read-only 조회(getZoomFactor)로 읽고
 *      P01 lib/prefs.ts의 setPref('zoomFactor', factor)로 영속(기존 UI_PREFS_SET
 *      재사용 — 신규 IPC 채널 0)해 P03 부팅 복원과 라운드트립을 완성.
 *   2) (P05) Ctrl+= 단축키·우하단 ± 버튼이 호출할 stepZoomFactor/resetZoomFactor —
 *      P03 클램프 setter(window.api.setZoomFactor)에 위임만 하고 클램프·영속 로직은
 *      중복하지 않는다(1)의 DPR 감지가 이 경로의 변화도 자동으로 영속시킨다 — 실증은
 *      각 함수 docstring 참조).
 *
 * 감지 메커니즘: page zoom이 바뀌면 devicePixelRatio(DPR)도 함께 바뀐다는 성질을
 * 이용해 `matchMedia('(resolution: <dpr>dppx)')`의 change 이벤트로 감지한다(표준
 * 관례). matchMedia는 *등록 시점 DPR에 고정된 정적 질의*라 DPR이 그 값에서
 * 벗어나는 순간 단 1회만 change를 쏜다 — 계속 감지하려면 change가 올 때마다
 * 리스너를 갈아 끼우고 새 DPR로 media query를 재등록해야 한다(watchDevicePixelRatio).
 * 이 메커니즘은 발화 주체(main의 기본 zoom role vs renderer의 stepZoomFactor)를
 * 가리지 않는다 — 둘 다 결국 같은 per-WebContents 줌 상태를 바꾸기 때문.
 *
 * per-region CSS zoom(`lib/zoom.tsx`의 useZoom·ZoomBadge)과는 완전히 별개다 —
 * 저장소(ui-prefs.json vs localStorage)·배지(없음 vs ZoomBadge "N%")·범위 상수
 * (ZOOM_FACTOR_RANGE 0.5~2.0 vs zoom.tsx MIN/MAX 0.5~3) 모두 독립.
 * 공존 정의: `02.Source/shared/ipc/personalization.ts` 파일 끝 주석 참조.
 *
 * CRITICAL: renderer untrusted — window.api 화이트리스트(getZoomFactor/setZoomFactor)만
 * 호출, fs/Node/webFrame 직접 0. 신규 IPC 채널 0(P02 조회 + P03 setter + 기존
 * setUiPref 재사용).
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

/** window.api.setZoomFactor 가용 여부 — 미주입 환경(테스트·프리로드 실패) graceful 가드. */
function hasZoomSetApi(): boolean {
  return typeof window !== 'undefined' && typeof window.api?.setZoomFactor === 'function'
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

/**
 * 전역 page zoom factor를 delta만큼 가감해 P03 클램프 setter로 적용 (FB2 P05 —
 * Ctrl/⌘+= 단축키·우하단 ± 버튼 공용 로직, 중복 방지를 위해 이 파일 1곳에만 둔다).
 *
 * 클램프 로직은 여기 없다 — `window.api.setZoomFactor`(preload)가 `ZOOM_FACTOR_RANGE`로
 * 이미 clamp하므로 그대로 위임한다(중복 클램프 금지, 단일 소유 원칙).
 *
 * 영속(라이브 e2e 프로브 실증, `99.Others/tests/e2e/zoom-setter-persist.probe.e2e.ts`):
 * 이 함수가 호출하는 `window.api.setZoomFactor`는 `useGlobalZoomPersist`가 감지하는
 * 것과 동일한 DPR(devicePixelRatio) 변화를 발화한다 — 발화 주체가 main(기본 zoom role)
 * 이든 renderer(이 함수, `webFrame.setZoomFactor` 경유)든 Chromium 내부적으로는 같은
 * per-WebContents 줌 상태를 바꾸는 것이기 때문이다. 3회 서로 다른 factor로 반복 실측해
 * ui-prefs.json이 매번 즉시(≤1.2s) 갱신됨을 확인했다 — 그래서 이 함수는 setPref를
 * **명시 호출하지 않는다**(기존 저장 경로가 이미 커버, 중복 저장 로직 0).
 *
 * window.api 미가용 환경(테스트/프리로드 실패)에서는 no-op — throw 없음.
 */
export function stepZoomFactor(delta: number): void {
  if (!hasZoomApi() || !hasZoomSetApi()) return
  window.api.setZoomFactor(window.api.getZoomFactor() + delta)
}

/**
 * 전역 page zoom을 100%(factor 1.0)로 리셋 (우하단 컨트롤 % pill 클릭, FB2 P05).
 *
 * stepZoomFactor와 마찬가지로 P03 setter에 그대로 위임 — 클램프·영속 로직 중복 없음.
 * window.api 미가용 환경에서는 no-op.
 */
export function resetZoomFactor(): void {
  if (!hasZoomSetApi()) return
  window.api.setZoomFactor(1)
}
