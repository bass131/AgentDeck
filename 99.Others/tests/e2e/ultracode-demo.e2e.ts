/**
 * ultracode-demo.e2e.ts — UltraCode 버튼 실사용 시연 (opt-in, 사용자 "보여줘" 요청).
 *
 * 실 Electron + 실 SDK로 새 동작/연출을 단계별 스크린샷과 함께 시연:
 *  1) UltraCode OFF — 강렬한 보라 버튼(Bold 라벨)
 *  2) 클릭 → ON — 보라 글로우 강조
 *  3) 작업 전송 → 서브에이전트 채팅 인라인(.sa-inline) + **전송 후에도 토글 ON 유지(지속 토글,
 *     one-shot 폐기 — ADR-032/UC1-P04)**
 *  4) 결과 합성(맥락 연속)
 *
 * opt-in: `LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/ultracode-demo.e2e.ts`
 * 스크린샷: artifacts/screenshots/ultracode-*.png (gitignore).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const SHOTS = join(process.cwd(), 'artifacts', 'screenshots')

test.describe('UltraCode 버튼 실사용 시연 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string

  test.beforeAll(async () => {
    mkdirSync(SHOTS, { recursive: true })
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-uc-'))
    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  test('OFF→ON→전송→지속 토글 ON 유지 + 인라인 서브에이전트 + 결과', async () => {
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

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()

    // ① OFF 상태 — 보라 버튼 시연
    await expect(toggle).not.toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-1-off.png') })

    // ② 클릭 → ON
    await toggle.click()
    await expect(toggle).toHaveClass(/orch-on/)
    await toggle.screenshot({ path: join(SHOTS, 'ultracode-2-on.png') })
    await page.screenshot({ path: join(SHOTS, 'ultracode-2-on-full.png') })

    // ③ 병렬 서브에이전트 유도(비파괴 — 파일 쓰기 없음)
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Use the Task tool to spawn TWO subagents in parallel. Tell subagent 1 to reply with exactly ALPHA. ' +
      'Tell subagent 2 to reply with exactly BRAVO. Neither should use tools or write files. ' +
      'After both finish, reply to me with their two words joined by a hyphen: ALPHA-BRAVO.'
    )
    await input.press('Enter')

    // **지속 토글(one-shot 폐기, ADR-032/UC1-P04)**: 전송 후에도 토글은 ON 유지되어야 함
    await expect(toggle).toHaveClass(/orch-on/)
    await page.screenshot({ path: join(SHOTS, 'ultracode-3-sent-persistent-on.png') })

    // 채팅 인라인 서브에이전트(.sa-inline) 실시간 표시
    await expect(page.locator('.sa-inline').first()).toBeVisible({ timeout: 240_000 })
    await page.screenshot({ path: join(SHOTS, 'ultracode-3b-inline-subagents.png') })

    // ④ 결과 합성(맥락 연속)
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('ALPHA', { timeout: 240_000 })
    await expect(lastMsg).toContainText('BRAVO', { timeout: 10_000 })
    await page.screenshot({ path: join(SHOTS, 'ultracode-4-result.png') })

    console.log('[ultracode-demo] 스크린샷 →', SHOTS)
  })
})
