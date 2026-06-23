/**
 * live-sdk.e2e.ts — 실 Agent SDK 라이브 검증 (opt-in).
 *
 * Phase 21 엔진 SDK 전환의 *유일한 미검 결합부*를 실 Electron + 실 SDK로 닫는다:
 *   IPC(agent.run) → ClaudeCodeBackend.start() → @anthropic-ai/claude-agent-sdk query()
 *   → 실 모델 응답 → mapClaudeStreamLine → AgentEvent → webContents.send → renderer.
 *
 * echo 백엔드를 쓰지 않는다(AGENTDECK_E2E 미설정 → registry가 실 ClaudeCodeBackend 반환).
 * 실 구독 인증으로 실 API를 호출하므로 **opt-in**: `LIVE_SDK=1`일 때만 실행.
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/live-sdk.e2e.ts
 *
 * 전제: build + better-sqlite3 Electron ABI(run-e2e.cjs가 수행).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('실 Agent SDK 라이브 검증 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 검증 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string

  test.beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-live-'))
    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      // AGENTDECK_E2E 미설정 → 실 ClaudeCodeBackend(SDK). 워크스페이스만 env 우회.
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  test('실 SDK 에이전트 실행 → 모델 응답이 대화에 스트리밍된다', async () => {
    test.setTimeout(200_000) // 실 모델 응답 대기(네트워크+추론)

    // 부팅 오버레이(WhatsNew/UpdateNotes/Profile) 방어적 처리
    const nick = page.locator('#nickname')
    if (await nick.isVisible().catch(() => false)) {
      await nick.fill('tester')
      await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})

    // 셸 렌더 확인
    await expect(page.locator('.pane.chat')).toBeVisible()

    // 워크스페이스 열기(env 우회 — 네이티브 다이얼로그 없음). 빈상태면 버튼 클릭.
    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) {
      await pickFolder.click()
    }

    // 프롬프트 전송 — 도구 없이 토큰만 응답하도록(워크스페이스 비파괴)
    const TOKEN = 'LIVE_SDK_OK'
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(`Reply with exactly the token ${TOKEN} and nothing else. Do not use any tools.`)
    await input.press('Enter')

    // 실 SDK 응답이 확정 assistant 메시지로 도착(IPC→backend→SDK→events→renderer 전 경로)
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText(TOKEN, {
      timeout: 180_000
    })

    // 증거 스크린샷
    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'live-sdk-run.png') })

    // 토큰 게이지가 실 usage로 갱신됐는지(존재 시) — 실패해도 본 검증 비차단
    const gaugeText = await page
      .locator('.ctx-strip, .context-strip, [class*="ctx"], [class*="gauge"]')
      .first()
      .innerText()
      .catch(() => '')
    console.log('[live-sdk] gauge text:', JSON.stringify(gaugeText))
  })
})
