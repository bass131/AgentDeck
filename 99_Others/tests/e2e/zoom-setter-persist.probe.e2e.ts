/**
 * zoom-setter-persist.probe.e2e.ts — FB2 P05 완료조건 승격 프로브(plan-auditor 🟡 실증).
 *
 * 이것은 회귀 게이트가 아니라 *일회성 실증 프로브*다(zoom-baseline.spike.e2e.ts와 동일
 * 성격). 검증 대상 가정: FB1 P04 `useGlobalZoomPersist`(02.Source/renderer/src/lib/
 * useGlobalZoom.ts)는 `matchMedia('(resolution: <dpr>dppx)')`의 change 이벤트로 zoom
 * 변화를 감지해 `ui.setPref('zoomFactor', factor)`로 저장한다. 이 감지 메커니즘은 FB1에서
 * *Electron 기본 View 메뉴 zoom role*(main 프로세스 `webContents.setZoomLevel`)이 발화하는
 * DPR 변화로만 실측됐다 — FB2 P03이 추가한 `window.api.setZoomFactor(factor)`(renderer
 * preload 내부 `webFrame.setZoomFactor` 직접 호출)가 **같은 DPR 변화를 발화하는지는
 * 미실측**이었다(P05 Phase 문서 §사전조건, plan-auditor 🟡).
 *
 * ── 실증 질문 ─────────────────────────────────────────────────────────────────
 *  Q1. `window.api.setZoomFactor(factor)` 호출 후 `window.api.setUiPref('zoomFactor', …)`가
 *      (useGlobalZoomPersist의 matchMedia 경유로) 자동 발화하는가?
 *  Q2. 그 결과 `ui-prefs.json`(디스크)에 새 zoomFactor가 실제로 기록되는가?
 *
 * ── 실행 ─────────────────────────────────────────────────────────────────────
 *  node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/zoom-setter-persist.probe.e2e.ts
 *
 * ⚠️ 프로브는 삭제하지 말 것(재조사용 보존, zoom-baseline.spike.e2e.ts 관례와 동일).
 *    결과에 따라 P05 구현이 명시 저장 경로(setPref 직접 호출)를 추가할지 결정한다 —
 *    이 파일 자체는 조사만 하고 renderer 구현 코드를 변경하지 않는다.
 *
 * ── 실증 결과(2026-07-04, isolatedBoot echo 부트, 3회 서로 다른 factor 반복) ──────
 *  Q1/Q2 = **예, 자동 발화·자동 영속된다.** `window.api.setZoomFactor(factor)` 호출
 *  직후(≤1.2s) `ui-prefs.json`의 `zoomFactor`가 매번 새 값으로 갱신됐다(3/3, 우연 배제).
 *  최초 시도에서 `window.api.setUiPref`를 renderer 컨텍스트에서 monkey-patch해 직접
 *  호출 여부를 세려 했으나 **항상 빈 배열**이 관찰됐다 — 이는 오탐이었다: `contextBridge.
 *  exposeInMainWorld`로 노출된 `window.api` 객체는 페이지 컨텍스트에서 메서드 재할당이
 *  조용히 무시되도록 동결돼 있다(신뢰경계 보호가 의도한 부작용). 그래서 계측을 "디스크
 *  상태가 여러 번의 서로 다른 값을 정확히 추적하는가"로 바꿔 간접·결정론적으로 증명했다.
 *  결론: FB1 P04 `useGlobalZoomPersist`의 DPR-change(matchMedia) 감지는 발화 주체가
 *  main(webContents.setZoomLevel, 기본 role)이든 renderer(webFrame.setZoomFactor, 이
 *  preload 경유 P03 setter)이든 무관하게 동일하게 반응한다 — 결국 Chromium 안에서는
 *  같은 per-WebContents 줌 상태를 건드리는 것이기 때문. **P05는 별도 명시 setPref
 *  호출을 추가하지 않는다**(기존 저장 경로가 이미 커버 — 신규 채널·중복 저장 로직 0).
 */
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

test('Q1+Q2: window.api.setZoomFactor 호출이 ui-prefs.json 저장까지 이어지는가', async () => {
  // echo: true — 대화 실행 없이 부트만 완료하면 충분(라이브 SDK 불필요, 빠르고 결정론적).
  const { app, page, userDataDir, teardown } = await isolatedBoot({
    slug: 'zoom-setter-persist',
    echo: true
  })

  try {
    const prefsPath = join(userDataDir, 'ui-prefs.json')

    // 부트 직후(P03 부팅 복원 등) 이미 zoomFactor가 기록됐을 수 있으므로 baseline을 먼저 남긴다.
    const before = existsSync(prefsPath) ? readFileSync(prefsPath, 'utf8') : '(파일 없음)'
    console.log('[zoom-setter-persist][baseline] ui-prefs.json =', before)

    // ── Q1(실측 정정): window.api는 contextBridge.exposeInMainWorld로 노출된 객체라
    // renderer 페이지 컨텍스트에서 그 메서드를 monkey-patch(재할당)해도 조용히 무시된다
    // (contextBridge가 노출 객체를 읽기전용으로 동결 — 신뢰경계 보호, 문서화된 동작).
    // 최초 시도에서 이 방식으로 계측했더니 실제로는 재할당이 먹히지 않아 항상 빈 배열이
    // 관찰됐다(오탐 — 아래 대신 "디스크 상태가 여러 번의 서로 다른 값을 정확히 추적하는가"로
    // 직접 검증한다. 우연의 일치를 배제하기 위해 3회 연속 서로 다른 factor로 반복한다.
    const before2 = await page.evaluate(() => window.api.getZoomFactor())
    console.log('[zoom-setter-persist][Q1] 호출 전 factor =', before2)

    const targets = [before2 + 0.1, before2 + 0.3, before2 + 0.05]
    for (const target of targets) {
      await page.evaluate((f: number) => window.api.setZoomFactor(f), target)
      // matchMedia change는 비동기(마이크로태스크~매크로태스크) — 넉넉히 대기.
      await page.waitForTimeout(1200)

      const afterFactor = await page.evaluate(() => window.api.getZoomFactor())
      const after = existsSync(prefsPath) ? readFileSync(prefsPath, 'utf8') : '(파일 없음)'
      let diskZoomFactor: unknown = undefined
      if (existsSync(prefsPath)) {
        try {
          diskZoomFactor = JSON.parse(after).zoomFactor
        } catch {
          diskZoomFactor = '(파싱 실패)'
        }
      }
      console.log(
        `[zoom-setter-persist][Q1+Q2] target=${target} → live factor=${afterFactor}` +
          ` | 디스크 zoomFactor=${diskZoomFactor}`
      )

      // 핵심 단언: 매 호출마다 디스크가 즉시(1.2s 이내) 새 값으로 갱신돼야
      // "자동 영속됨"이 우연이 아니라 결정론적 파이프라인임을 증명한다.
      expect(typeof afterFactor).toBe('number')
      expect(Math.abs(afterFactor - target)).toBeLessThan(0.001)
      expect(typeof diskZoomFactor).toBe('number')
      expect(Math.abs((diskZoomFactor as number) - target)).toBeLessThan(0.001)
    }

    console.log(
      '[zoom-setter-persist] RESULT — window.api.setZoomFactor 호출은 FB1 P04' +
        ' useGlobalZoomPersist(DPR-change 감지) 경유로 ui-prefs.json에 자동 영속된다(3/3 확인).' +
        ' P05는 별도 명시 setPref 호출을 추가할 필요가 없다.'
    )
  } finally {
    await teardown()
    void app
  }
})
