/**
 * relaunchFocus.ts — 앱 close→relaunch(복원) 후 창의 OS 포커스/가시성 회복 헬퍼 (BL1 P05).
 *
 * 문제(BL1 P04 진단 — 01.Phases/16_BL1-backlog-closeout/04-diagnosis-notes.md):
 *   동일 userData로 재기동(복원)된 BrowserWindow가 OS 레벨 포커스/가시성을 획득하지 못하면
 *   (Windows 전경 잠금이 자동화 프로세스의 포커스 요청을 거부하는 것으로 추정) Chromium이
 *   그 창을 백그라운드로 간주해 rAF(requestAnimationFrame) 전달을 완전 정지한다(전력 절약).
 *   Playwright의 'stable'(요소 바운딩박스 2프레임 정지) 액셔너빌리티 판정은 내부적으로 rAF
 *   프레임 샘플링에 의존하므로, 복원 창에서 rAF가 0회면 판정이 단 한 번도 수행되지 못한 채
 *   일반 클릭이 30초 타임아웃한다 — 느림이 아니라 '판정 메커니즘 자체 미구동'(P04 §제4유형).
 *   그래서 타임아웃 연장으로는 절대 해소되지 않고, force 우회만 통과했다.
 *
 * 인과 증명(P04 실험 3): 복원 창에 show()+focus() 주입 → 상태 전환 + rAF 회복(1.5초 창 202회)
 *   → 동일 일반 클릭 34ms 성공(개입→효과 직접 인과). page.bringToFront()는 무효(상태 불변,
 *   P04 실험 4) — 반드시 Electron 네이티브 BrowserWindow 핸들 경유해야 한다.
 *
 * 창 해석: BrowserWindow.getAllWindows()[0] 인덱스는 다중 창 상황에서 엉뚱한 창을 겨눌 위험이
 *   있다(plan-auditor 🟡). Playwright가 해당 page에 바인딩해 반환하는 BrowserWindow
 *   (app.browserWindow(page)) 경유로 대상 창을 정확히 특정한다.
 *
 * trade-off: 테스트가 Electron 네이티브 API(BrowserWindow)에 결합되는 비용을 치르는 대신,
 *   실제 실패 메커니즘(복원 창 OS 포커스 미획득)을 정확히 겨냥한다. 대안(제품 main에 포커스
 *   스틸링 로직 추가)은 실사용 UX 해악이 더 커 기각됐다(04-diagnosis-notes.md §기각 1).
 *
 * headless/CI(전경 창 자체가 없는 환경) 유의: show/focus로 rAF가 회복될지는 별개 리스크다.
 *   현 e2e는 attended 로컬(Windows) 위주라 우선도는 낮지만, 무헤드 실행에서 재기동 클릭이
 *   다시 굶으면 이 헬퍼의 전제(포커스 → rAF 회복)를 그 환경에서 재검증할 것.
 *
 * 적용 범위: 앱 부트 헬퍼가 app.firstWindow()로 page를 얻은 직후 1회 호출한다. 신규 부트
 *   (이미 포커스 보유)에서는 show()+focus()가 무해한 no-op이므로 복원/신규 분기 없이 모든
 *   부트에 안전하게 호출할 수 있다(멱등).
 */
import type { ElectronApplication, Page } from '@playwright/test'

/**
 * Playwright page에 바인딩된 BrowserWindow를 특정해 show()+focus()로 OS 포커스/가시성을
 * 회복한다. 복원 창의 rAF 정지(→ 'stable' 판정 미구동 → 일반 클릭 타임아웃)를 예방한다.
 *
 * 멱등·무해: 이미 포커스를 가진 신규 창에서는 no-op에 가깝다. 실패해도(창이 이미 닫힌 경합 등)
 *   부트를 막지 않도록 조용히 삼킨다 — 이 호출은 예방적 보정이지 검증 대상이 아니다.
 */
export async function focusRestoredWindow(app: ElectronApplication, page: Page): Promise<void> {
  try {
    const win = await app.browserWindow(page)
    await win.evaluate((bw) => {
      // bw: Electron BrowserWindow (main 프로세스 컨텍스트에서 실행)
      if (typeof bw.isMinimized === 'function' && bw.isMinimized()) bw.restore()
      bw.show() // 가시성 회복(백그라운드 → 전경 후보)
      bw.focus() // OS 포커스 요청 — 복원 창의 rAF 전달 재개 유도
    })
  } catch {
    /* 창 해석/평가 실패는 예방 보정의 실패일 뿐 — 부트를 막지 않는다 */
  }
}
