/**
 * lr2-03-loop-gui-screens.e2e.ts — LR2-03/LR3-06 loop GUI 육안 검토용 스크린샷 하네스.
 *
 * 목적: ui-visual(버킷 b) — 기능은 단위 테스트로 검증 완료, 시각·미감은 영호 육안.
 * 이 스펙은 아침 검토용 스크린샷을 01.Phases/LR2-loop-replmode/ScreenShot/에 생성한다.
 *
 *   LR2_03_SCREENS=1 npx playwright test 99.Others/tests/e2e/lr2-03-loop-gui-screens.e2e.ts
 *
 * LR3-03 갱신: 앱 타이머 /loop 배너(구 04-loop-banner-app.png)는 앱 타이머 /loop 자체가
 * 폐기(영호 확정 "토큰 맥싱")되어 캡처 대상에서 제거됐다. SDK 크론 배너 라이브 샷은
 * loop-live.e2e.ts로 승격·통합됨(중복 방지 — LIVE_SDK=1 블록 이관).
 *
 * LR3-06 확장(06-loop-gui-polish.md, 영호 조정 2026-07-03): 금색 REPL 표시등·전체박스
 * gloss·goal 배너 3샷을 같은 하네스에 추가 — 출력은 01.Phases/LR3-loop-ux/ScreenShot/
 * (이 Phase 소속 폴더)로 분리. REPL 표시등은 조정 후 "ON=상시 점등"(activity 무관)이라
 * p06-repl-gold-lit 샷은 이제 activity 자체보다 "실행 중에도 여전히 점등 유지"를 보여준다.
 * ⚠ 타이밍 주의: EchoBackend(main/01_agents/EchoBackend.ts)는 6스텝을 각 15ms 지연으로
 * 고정 재생(총 ~90ms) — goal 배너/gloss는 pendingCommand가 살아있는 이 짧은 실행창에서만
 * 관측 가능하다(done 즉시 pendingCommand=null → 배너 소멸, 설계상 의도 — LoopStatusBanner.tsx
 * 참조). renderer/main 어느 쪽도 이 창을 인위로 늘릴 수 없어(각 도메인 경계) 정지시점을
 * 기다리는 03-goal-card-done과 달리 이 3샷은 본질적으로 타이밍에 약간 의존한다 — 아래
 * retries로 완화(loop-live.e2e.ts와 동일 관례).
 *
 * 캡처:
 *   01-palette-slash.png        — 슬래시 팔레트('/'): goal·loop 노출
 *   02-palette-goal.png         — '/goal' 필터
 *   03-goal-card-done.png       — /goal 진행 카드(mock 완주: 완료 title + 턴수 + 목표 sub)
 *   p06-repl-gold-lit.png       — REPL ON 상태에서 평범한 메시지 실행 중(루프/goal 무관) →
 *                                  REPL 표시등 상시 점등(형광 pulse), gloss·goal 배너는 없음
 *   p06-loop-gloss-fullbox.png  — /goal 실행 중 → .conversation 전체박스 gloss 링
 *   p06-goal-banner.png         — /goal 실행 중 → 통합 배너 goal 변형("N턴" 뱃지)
 *   p06-stopped-banner.png      — /loop(Echo 결정론 loops 재생) → 정지 클릭 → stopped 확인
 *                                  배너("루프 정지됨 — 예약된 반복이 세션과 함께 정리되었어요",
 *                                  LR3-06 정지 신뢰 피드백 — 영호 육안 피드백 2026-07-03)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SCREENS = process.env.LR2_03_SCREENS === '1'
const SHOT_DIR = join(process.cwd(), '01.Phases', 'LR2-loop-replmode', 'ScreenShot')
// LR3-06: 이 Phase(LR3-loop-ux) 소속 스크린샷은 그 Phase 폴더로 — LR2 폴더와 섞지 않는다.
const SHOT_DIR_P06 = join(process.cwd(), '01.Phases', 'LR3-loop-ux', 'ScreenShot')

async function bootToChat(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.titlebar', { timeout: 20_000 })
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('tester')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
  }
  await page.keyboard.press('Escape').catch(() => {})
  await expect(page.locator('.pane.chat')).toBeVisible()
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) await pickFolder.click()
  return page
}

test.describe('LR2-03 loop GUI 스크린샷 (opt-in: LR2_03_SCREENS=1)', () => {
  test.skip(!SCREENS, '스크린샷 하네스 — LR2_03_SCREENS=1로 명시 실행')
  // LR3-06 3샷은 EchoBackend의 짧은 고정 재생창(~90ms) 안에서 캡처해야 해 약간의 타이밍
  // 의존이 있다(파일 상단 주석 참조) — loop-live.e2e.ts와 동일하게 재시도로 완화.
  test.describe.configure({ retries: 2 })

  test('mock(Echo): 팔레트 · /goal 카드', async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    const workspace = mkdtempSync(join(tmpdir(), 'agentdeck-lr203-'))
    const app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E: '1',
        AGENTDECK_E2E_WORKSPACE: workspace,
        AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
      },
    })
    try {
      const page = await bootToChat(app)
      const input = page.getByLabel('메시지 입력')

      // ── 01/02: 슬래시 팔레트 — goal·loop 노출 ────────────────────────────
      await input.click()
      await input.fill('/')
      await expect(page.getByText('목표를 정하고 자율적으로 추진', { exact: false })).toBeVisible()
      await page.screenshot({ path: join(SHOT_DIR, '01-palette-slash.png') })
      await input.fill('/goal')
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(SHOT_DIR, '02-palette-goal.png') })

      // ── 03: /goal 진행 카드 (Echo 완주: 완료 title + 1턴 + 목표 sub) ──────
      await input.fill('/goal 리팩토링 마무리하기')
      await input.press('Enter')
      await expect(page.locator('.cmd-result-card')).toBeVisible({ timeout: 10_000 })
      // Echo done 후 완료 카드(목표 반복을 마쳤어요 · 1턴)
      await expect(page.locator('.cmd-result-card--done')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('.cmd-result-title')).toContainText('턴')
      await page.screenshot({ path: join(SHOT_DIR, '03-goal-card-done.png') })
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  test('mock(Echo): LR3-06 금색 REPL · 전체박스 gloss · goal 배너', async () => {
    test.setTimeout(120_000)
    mkdirSync(SHOT_DIR_P06, { recursive: true })
    const workspace = mkdtempSync(join(tmpdir(), 'agentdeck-lr306-'))
    const app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E: '1',
        AGENTDECK_E2E_WORKSPACE: workspace,
        AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
      },
    })
    try {
      const page = await bootToChat(app)
      const input = page.getByLabel('메시지 입력')
      const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })

      // REPL 기본값(P03) ON 전제 — 방어적으로 확인(회귀 시에도 이 스펙이 통과하도록).
      await expect(replToggle).toBeVisible()
      if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()

      // ── p06-repl-gold-lit: 평범한 메시지 실행 중 — 루프/goal과 무관하게 REPL 표시등이
      //    점등돼 있어야 한다(영호 조정 2026-07-03: resolveReplLit은 이제 replMode 자체를
      //    반영하는 상시 표시등 — activity 무관, 대기 중에도 이미 점등돼 있다). gloss·goal
      //    배너는 이 시나리오에선 뜨지 않아야 정상(loop/goal 격리 확인 겸용).
      await expect(replToggle).toHaveClass(/repl-lit/)
      await input.click()
      await input.fill('안녕하세요')
      await input.press('Enter')
      await expect(page.locator('.conversation.loop-active')).toHaveCount(0)
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-repl-gold-lit.png') })
      // Echo 완주까지 대기(다음 시나리오와 겹치면 sendMessage가 isRunning 가드로 no-op됨).
      // REPL 표시등은 더 이상 activity를 반영하지 않으므로(상시 점등) 대신 중단 버튼
      // (.send.stop, "실행 중단")이 사라지는 것으로 isRunning=false 전환을 확인한다.
      await expect(page.getByRole('button', { name: '실행 중단' })).toHaveCount(0, { timeout: 10_000 })

      // 새 대화로 격리(직전 런의 잔여 상태가 다음 시나리오에 새지 않도록)
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(300)

      // ── p06-loop-gloss-fullbox / p06-goal-banner: /goal 실행 중 — 동일 실행창에서 순차 캡처.
      //    pendingCommand(name='goal')는 send 시점에 동기 반영(백엔드 응답 대기 없음) — Enter
      //    직후 즉시 체크해 EchoBackend의 done(~90ms) 전에 관측한다(파일 상단 타이밍 주석).
      await input.click()
      await input.fill('/goal 리팩토링 마무리하기')
      await input.press('Enter')
      await expect(page.locator('.conversation.loop-active')).toBeVisible({ timeout: 5_000 })
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-loop-gloss-fullbox.png') })
      await expect(page.locator('.loop-indicator.loop-goal')).toBeVisible({ timeout: 2_000 })
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-goal-banner.png') })

      // ── p06-stopped-banner: /loop(Echo 결정론 loops 재생) → sdk 배너 → 정지 → stopped 확인.
      //    Echo done 후에도 activeLoops는 남으므로(loops 스냅샷) 타이밍 의존 없음 — 정지
      //    클릭이 abortRun → loopsStoppedNotice 점화 → stopped 변형 렌더를 검증 겸 캡처.
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(300)
      await input.click()
      await input.fill('/loop 1m 상태 점검')
      await input.press('Enter')
      await expect(page.locator('.loop-indicator.loop-sdk')).toBeVisible({ timeout: 10_000 })
      await page.locator('.loop-sdk-stop').click()
      await expect(page.locator('.loop-indicator.loop-stopped')).toBeVisible({ timeout: 5_000 })
      await page.screenshot({ path: join(SHOT_DIR_P06, 'p06-stopped-banner.png') })
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
