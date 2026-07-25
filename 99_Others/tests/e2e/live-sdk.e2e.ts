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
 * 전제: `npm run build` → run-e2e.cjs가 자동 수행.
 * 네이티브 모듈 없음(JSON fan-out 영속, M1) → ABI 재빌드 불필요.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('실 Agent SDK 라이브 검증 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 검증 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-live-'))
    // 프로필 격리(orchestration-live.e2e.ts 선례, 2026-07 라이브 e2e 일괄 실측): 공유 기본
    // userData를 쓰면 이전 dev/e2e 세션이 누적한 대화 이력을 REPL이 이어받으려다 만료된
    // sessionId로 resume을 시도해 "No conversation found with session ID" 오염이 난다.
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-live-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      // AGENTDECK_E2E 미설정 → 실 ClaudeCodeBackend(SDK). 워크스페이스만 env 우회.
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 진입 대문 통과(로그인 → eg-auth skip → titlebar → 시작모달 → 엔진알림) — 공용 헬퍼.
    await passBootGates(page, { nickname: 'tester' })
    // 워크스페이스 열기(AGENTDECK_E2E_WORKSPACE 우회) — 빈 스크래치 임시 디렉터리(파일 0개)라
    // 트리에 `.fe-node-name`이 나타날 일이 없으므로 waitForTree:false.
    await openWorkspace(page, { waitForTree: false })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('실 SDK 에이전트 실행 → 모델 응답이 대화에 스트리밍된다', async () => {
    test.setTimeout(200_000) // 실 모델 응답 대기(네트워크+추론)

    await expect(page.locator('.pane.chat')).toBeVisible()

    // composer enabled 확인(워크스페이스 오픈 완료 이후에만 활성화됨) — 메시지 입력 전 필수.
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

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
