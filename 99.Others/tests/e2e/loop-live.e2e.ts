/**
 * loop-live.e2e.ts — /loop 실 SDK 라이브 검증 (opt-in: LIVE_SDK=1).
 *
 * 배경(LR3-03, 03-app-timer-loop-retire.md): 앱 타이머 /loop(같은 프롬프트를 renderer
 * 타이머가 직접 재전송)는 영호가 "토큰 맥싱"으로 폐기 확정했다. 이 스펙이 검증하던
 * "앱 레벨 재호출이 실제로 반복 발사되는지"는 더 이상 이 기능의 본질이 아니다.
 *
 * 새 본질: `/loop`는 항상 원문 그대로 SDK로 통과하고, Claude가 내장 크론(Cron 도구)으로
 * 매 틱 스스로 판단·갱신·종료한다(SDK 빌트인 루프). P02(AUTO 세션 수명)가 held-open
 * 턴을 idle 시 자동 정리하므로, replMode ON(기본)에서 크론이 기본 경로에서 생존한다.
 * 이 스펙은 LR2-03 스크린샷 하네스(lr2-03-loop-gui-screens.e2e.ts)의 LIVE 블록을
 * 승격·통합한 것 — SDK 크론 배너(.loop-indicator.loop-sdk) 등장 + 정지(세션 abort)로
 * 반복 호출이 멎는지를 실 Electron + 실 SDK로 검증한다.
 *
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/loop-live.e2e.ts
 *
 * 검증:
 *   ① REPL ON(persistent) + `/loop 1m <프롬프트>` → SDK CronCreate → loops 이벤트 →
 *      통합 배너 sdk 변형(.loop-indicator.loop-sdk) 표시.
 *   ② 정지 버튼(.loop-sdk-stop) 클릭 → 세션 abort → 배너 사라짐(반복 호출 중단).
 *
 * CRITICAL: 앱 타이머의 안전가드(최대 틱 수·30분 누적시간 상한 등, loopCommand.ts 상수들)는
 * 그 모듈 자체와 함께 폐기됐다 — SDK 루프의 안전장치는 세션 스코프(abort로 소멸)와
 * 사용자 정지 버튼뿐이다. 이 스펙의 ②가 그 유일한 안전장치를 실측 검증한다(과금 방지 겸용).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('/loop 실 SDK 경로 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')
  // 크론 생성은 모델 재량이라 간헐 미발동(2026-07-03 실측: 동일 프롬프트 3회 중 1회 무도구
  // 직답) — 라이브 한정 재시도로 플레이크 완화. 진단은 아래 [loop-live] raw 이벤트 로거로.
  test.describe.configure({ retries: 2 })

  let app: ElectronApplication
  let page: Page
  let workspace: string

  test.beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-loop-'))
    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace,
        AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
      },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  test('REPL ON /loop 1m → SDK 크론 배너 등장 + 정지 버튼으로 반복 중단', async () => {
    test.setTimeout(300_000)

    // 부팅 오버레이 방어
    const nick = page.locator('#nickname')
    if (await nick.isVisible().catch(() => false)) {
      await nick.fill('tester')
      await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    await expect(page.locator('.pane.chat')).toBeVisible()

    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) await pickFolder.click()

    // 격리: 직전 e2e 런들의 대화가 lastActiveId로 복원되면 stale sessionId resume이
    // 다른 cwd에서 "No conversation found with session ID"로 죽는다(실측) — 새 대화로 시작.
    await page.getByRole('button', { name: /새 대화/ }).click()
    await page.waitForTimeout(500)

    // 진단 로거: preload raw 이벤트 관측(renderer 드롭 경로와 독립) — 실패 시 원인 판별용.
    page.on('console', (msg) => {
      if (msg.text().startsWith('[loop-live]')) console.log(msg.text())
    })
    await page.evaluate(() => {
      const api = (window as unknown as { api: { onAgentEvent: (cb: (p: { runId: string; event: Record<string, unknown> }) => void) => void } }).api
      api.onAgentEvent((p) => {
        const e = p.event
        const brief = e.type === 'text' ? JSON.stringify(String(e.delta ?? '').slice(0, 30)) : JSON.stringify(e).slice(0, 140)
        console.log(`[loop-live] run=${p.runId.slice(0, 8)} ${String(e.type)} ${brief}`)
      })
    })

    // replMode 기본값이 LR3-03부터 true(held-open)이므로 REPL 토글은 보통 이미 ON —
    // 그래도 방어적으로 확인(회귀 시에도 이 스펙이 통과하도록).
    const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
    await expect(replToggle).toBeVisible()
    if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()

    // SDK 네이티브 /loop → CronCreate → loops 이벤트 → 통합 배너 sdk 변형.
    // 실측(2026-07-03): interval 없는 /loop은 ScheduleWakeup(self-paced) 경로라
    // CronCreate가 안 떠 CronTracker에 미포착 — 명시 interval로 크론 모드 강제.
    const input = page.getByLabel('메시지 입력')
    await input.click()
    // 주의: "Do not use any tools" 류 지시를 넣지 말 것 — CronCreate 자체를 금지로 해석해
    // 크론 미생성(1회 응답 후 종료)이 실측됨(2026-07-03, 모델 재량).
    await input.fill('/loop 1m Reply with exactly TICK and nothing else.')
    await input.press('Enter')

    // ① SDK 크론 배너 표시
    await expect(page.locator('.loop-indicator.loop-sdk')).toBeVisible({ timeout: 180_000 })
    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'loop-live-sdk-banner.png') })

    // ② 정지(세션 abort → 크론 사멸) — 반복 과금 방지 + 안전장치 실측
    await page.locator('.loop-indicator .loop-sdk-stop').click()
    await expect(page.locator('.loop-indicator.loop-sdk')).toBeHidden({ timeout: 30_000 })
  })
})
