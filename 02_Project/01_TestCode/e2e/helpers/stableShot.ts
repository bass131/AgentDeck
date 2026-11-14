import type { ElectronApplication, Locator, Page } from '@playwright/test'

// 하네스 창을 2번 모니터에 띄운다(M05 H2, 사용자 요청). 하네스 임시 main의 BrowserWindow 생성 직후
// `win`이 있는 자리에 문자열로 끼워 넣는다. 주 모니터가 아닌 첫 디스플레이의 workArea 왼쪽 위 + 여백으로
// 옮기고 크기는 건드리지 않는다. 디스플레이가 하나뿐이면 주 모니터에 그대로 둔다.
export const MOVE_TO_SECOND_DISPLAY_JS = `
  {
    const { screen: e2eScreen } = require('electron')
    const e2ePrimary = e2eScreen.getPrimaryDisplay()
    const e2eTarget = e2eScreen.getAllDisplays().find((d) => d.id !== e2ePrimary.id)
    if (e2eTarget) win.setPosition(e2eTarget.workArea.x + 40, e2eTarget.workArea.y + 40)
    const e2eShown = e2eTarget || e2ePrimary
    global.__e2eDisplay = {
      secondary: !!e2eTarget,
      id: e2eShown.id,
      bounds: e2eShown.bounds,
      workArea: e2eShown.workArea,
      scaleFactor: e2eShown.scaleFactor,
      primaryScaleFactor: e2ePrimary.scaleFactor,
      position: win.getPosition(),
      size: win.getSize(),
    }
    console.log('[e2e-display]', JSON.stringify(global.__e2eDisplay))
  }
`

export async function logHarnessDisplay(app: ElectronApplication, label: string): Promise<void> {
  const info = await app.evaluate(({ BrowserWindow, screen }) => {
    const g = globalThis as unknown as { __e2eDisplay?: unknown }
    const win = BrowserWindow.getAllWindows()[0]
    const live = win
      ? { position: win.getPosition(), size: win.getSize(), displayId: screen.getDisplayMatching(win.getBounds()).id }
      : null
    return { chosen: g.__e2eDisplay ?? null, live }
  })
  // eslint-disable-next-line no-console
  console.log(`[e2e-display] ${label}`, JSON.stringify(info))
}

// 결정적 캡처 — 같은 코드에서 같은 PNG가 나오게 한다(M05 H2).
// 흔들림 원인별 수단:
// - CSS 애니메이션·트랜지션(진입 rise·fade, 테마 전환 직후 hover 배경, 스피너 회전, pulse, 커서 blink)
//   → 정지 스타일을 주입해 모든 요소를 기본 상태(진입 끝 상태·스피너 0도·커서 표시)로 고정한다.
//     캡처 순간에만 끄는 animations: 'disabled'도 함께 걸어 이중으로 막는다.
// - JS 프레임 루프로 글자를 흘려 보이는 스트리밍 본문(SmoothMarkdown) → DOM이 일정 시간 바뀌지 않을
//   때까지 기다린다. running 상태라 다 흘린 뒤에도 커서가 남아 「실행 중」으로 읽힌다.
// - 글꼴·이미지 로드 순서 → document.fonts.ready와 이미지 decode()를 기다린다.
// - 포인터 hover 갱신 시점 → 포인터를 장면 밖 구석으로 치운다.
// - 합성 레이어의 래스터 이력(반 픽셀 위치의 둥근 모서리) → 레이어를 한 프레임 없앴다 되살린다.
// - 렌더 타이밍 → 마지막에 두 프레임을 기다려 레이아웃·래스터가 끝난 프레임만 찍는다.
const FREEZE_STYLE_ID = 'e2e-stable-shot-freeze'
const FREEZE_CSS = `*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}`
const SHOT_OPTIONS = { animations: 'disabled', caret: 'hide' } as const
const QUIET_MS = 400
const QUIET_TIMEOUT_MS = 10_000

export async function settleFrame(page: Page): Promise<void> {
  // 직전 클릭 자리에 남은 포인터가 레이아웃 변화 뒤 늦게 hover를 갱신하면 그 순간이 실행마다 달라진다.
  // 포인터를 화면 왼쪽 위 구석(장면 밖 여백)으로 치워 hover 상태를 고정한다.
  await page.mouse.move(0, 0)
  await page.evaluate(
    async ({ id, css, quietMs, timeoutMs }) => {
      if (!document.getElementById(id)) {
        const style = document.createElement('style')
        style.id = id
        style.textContent = css
        document.head.appendChild(style)
      }
      await document.fonts.ready
      await Promise.all(
        Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {})))
      )
      const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
      const frames = (): Promise<void> =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const started = performance.now()
      let last = document.body.innerHTML
      let quietSince = performance.now()
      while (performance.now() - quietSince < quietMs) {
        if (performance.now() - started > timeoutMs) throw new Error('stableShot: DOM이 안정되지 않음')
        await sleep(50)
        const now = document.body.innerHTML
        if (now !== last) {
          last = now
          quietSince = performance.now()
        }
      }
      // 합성 레이어 재생성 — 스크롤 컨테이너(분할 셀 본문)와 backdrop-filter 오버레이 위 모달은 별도 레이어로
      // 그려지는데, 레이어가 반 픽셀 위치(y=134.5 등)에 놓이면 그 레이어가 어떤 경로로 그려져 왔는지에 따라
      // 둥근 모서리의 안티앨리어싱이 색 1단계씩 달라진다(텍스트·기하는 같고 모서리 픽셀만 다름).
      // 한 프레임 동안 레이어를 없앴다가(overflow hidden, backdrop-filter none) 되살려 매번 새로 그리게 한다.
      // 스크롤 위치는 저장했다 그대로 되돌리므로 보이는 상태는 같다.
      const all = Array.from(document.querySelectorAll<HTMLElement>('*'))
      const scrollers = all
        .filter((el) => el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
        .filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflow))
        .map((el) => ({ el, top: el.scrollTop, left: el.scrollLeft, overflow: el.style.overflow }))
      const backdrops = all
        .filter((el) => getComputedStyle(el).backdropFilter !== 'none')
        .map((el) => ({ el, backdrop: el.style.backdropFilter }))
      scrollers.forEach((s) => { s.el.style.overflow = 'hidden' })
      backdrops.forEach((b) => { b.el.style.backdropFilter = 'none' })
      await frames()
      backdrops.forEach((b) => { b.el.style.backdropFilter = b.backdrop })
      scrollers.forEach((s) => {
        s.el.style.overflow = s.overflow
        s.el.scrollTop = s.top
        s.el.scrollLeft = s.left
      })
      await frames()
    },
    { id: FREEZE_STYLE_ID, css: FREEZE_CSS, quietMs: QUIET_MS, timeoutMs: QUIET_TIMEOUT_MS }
  )
}

export async function stableShot(page: Page, path: string): Promise<void> {
  await settleFrame(page)
  await page.screenshot({ path, fullPage: false, ...SHOT_OPTIONS })
}

export async function stableElementShot(page: Page, target: Locator, path: string): Promise<void> {
  await settleFrame(page)
  await target.screenshot({ path, ...SHOT_OPTIONS })
}
