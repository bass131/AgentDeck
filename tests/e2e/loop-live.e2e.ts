/**
 * loop-live.e2e.ts — 앱 레벨 /loop 실 SDK 라이브 검증 (opt-in: LIVE_SDK=1).
 *
 * 이 기능의 *본질*을 닫는다: SDK 네이티브 /loop은 세션 전용 크론이라 우리 query()-per-message
 * 구조에서 2틱부터 발동 안 함. 앱 레벨 재호출이 실제로 매 run 완료마다 다음 틱을 재발사해
 * 2틱 이상 반복되는지를 실 Electron + 실 SDK로 검증한다.
 *
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/loop-live.e2e.ts
 *
 * 검증:
 *   ① /loop 5s <프롬프트> → 첫 틱 즉시 + 완료 후 5s 뒤 둘째 틱 → user 버블 2개 이상(실 반복).
 *   ② LoopIndicator 표시 + 틱 카운트 증가.
 *   ③ 정지 버튼 클릭 → 인디케이터 사라짐 + 이후 추가 틱 없음(반복 중단).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('앱 레벨 /loop 실 SDK 반복 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

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

  test('/loop 5s → 실제 2틱 이상 반복 + 정지 버튼으로 중단', async () => {
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

    // 짧은 간격으로 단순 토큰 응답 반복 (도구 없이, 워크스페이스 비파괴)
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('/loop 5s Reply with exactly LOOP_TICK and nothing else. Do not use any tools.')
    await input.press('Enter')

    // ② 인디케이터 표시(활성 루프)
    await expect(page.locator('.loop-indicator')).toBeVisible({ timeout: 10_000 })

    // ① 첫 틱 user 버블(= 내부 프롬프트, /loop 원문 아님) 도착
    await expect(page.locator('.msg.user').first()).toContainText('LOOP_TICK', { timeout: 60_000 })

    // ① 실 반복 — 완료 후 5s 뒤 둘째 틱 → user 버블 2개 이상
    await expect
      .poll(async () => page.locator('.msg.user').count(), { timeout: 180_000, intervals: [2000] })
      .toBeGreaterThanOrEqual(2)

    const ticksBeforeStop = await page.locator('.msg.user').count()
    console.log('[loop-live] 정지 전 user 버블(틱) 수:', ticksBeforeStop)
    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'loop-live-ticks.png') })

    // ③ 정지 — 인디케이터 정지 버튼 클릭
    await page.locator('.loop-indicator .loop-stop').click()
    await expect(page.locator('.loop-indicator')).toBeHidden({ timeout: 10_000 })

    // ③ 중단 확인 — 현재 진행 중 run 1개가 끝나도 그 이상 새 틱이 안 생김.
    //   넉넉히 대기 후 버블 수가 (정지 시점 + 진행중 1) 이내로 머무는지 확인.
    await page.waitForTimeout(20_000)
    const ticksAfterStop = await page.locator('.msg.user').count()
    console.log('[loop-live] 정지 20s 후 user 버블 수:', ticksAfterStop)
    expect(ticksAfterStop).toBeLessThanOrEqual(ticksBeforeStop + 1)
  })
})
