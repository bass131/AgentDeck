/**
 * orchestration-live.e2e.ts — UltraCode 오케스트레이션 라이브 검증 (opt-in, "둘 다").
 *
 * 사용자 실측 두 증상(①진행 실시간 안 보임 ②워크플로 결과 맥락 못 이음)이 해소됐는지
 * 실 Electron + 실 SDK로 직접 검증. F-A/F-B/F-C/F-G 통합:
 *  - Test1(Task 서브에이전트 경로): UltraCode ON → Task 서브에이전트 스폰 → 오른쪽 패널
 *    .subagent + 채팅 인라인 .sa-inline(F-G) 실시간 표시 → 결과 tool_result로 메인 복귀(맥락 연속).
 *  - Test2(Workflow 경로): UltraCode ON → Workflow 권한 허용 → orchestration 카드 라이브(F-C)
 *    → 워크플로 결과가 2번째 턴으로 복귀해 메인 대화 마지막 메시지에 도달(F-B 핵심 버그 수정).
 *
 * opt-in: `LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/orchestration-live.e2e.ts`
 * (실 구독 인증으로 실 API 호출 — 서브에이전트/워크플로 스폰, 토큰 소모.)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('UltraCode 서브에이전트 오케스트레이션 라이브 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string

  test.beforeAll(async () => {
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-orch-'))
    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.titlebar', { timeout: 20_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  test('UltraCode ON → 서브에이전트 실시간 표시(오른쪽 패널) + 결과 합성', async () => {
    test.setTimeout(300_000) // 서브에이전트 2개 스폰+실행+합성 대기

    // 부팅 오버레이 방어
    const nick = page.locator('#nickname')
    if (await nick.isVisible().catch(() => false)) {
      await nick.fill('tester')
      await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})

    await expect(page.locator('.pane.chat')).toBeVisible()

    // 워크스페이스 열기(env 우회)
    const pickFolder = page.getByRole('button', { name: '폴더 선택' })
    if (await pickFolder.isVisible().catch(() => false)) {
      await pickFolder.click()
    }

    // UltraCode ON (단일 모드 .composer .orch-toggle)
    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    if (!(await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).toHaveClass(/orch-on/)

    // 병렬 서브에이전트를 명시적으로 유도하는 작업(빠르고 비파괴 — 파일 쓰기 없음).
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Use the Task tool to spawn TWO subagents in parallel. ' +
      'Tell subagent 1 to reply with exactly the single word ALPHA. ' +
      'Tell subagent 2 to reply with exactly the single word BRAVO. ' +
      'Neither subagent should use any tools or write files. ' +
      'After both subagents finish, reply to me with their two words joined by a hyphen: ALPHA-BRAVO.'
    )
    await input.press('Enter')

    // ① 관측: 오른쪽 AgentPanel에 .subagent 카드가 실시간으로 나타남(서브에이전트 스폰됨).
    await expect(page.locator('.subagent').first()).toBeVisible({ timeout: 240_000 })
    const subCount = await page.locator('.subagent').count()
    console.log('[orch-live] .subagent 카드 수:', subCount)
    const saNames = await page.locator('.subagent .sa-name').allInnerTexts().catch(() => [])
    console.log('[orch-live] 서브에이전트 이름:', JSON.stringify(saNames))

    // ①-b F-G: 채팅 인라인 서브에이전트 카드(.sa-inline)도 thread에 나타남(단일·멀티 공통).
    await expect(page.locator('.sa-inline').first()).toBeVisible({ timeout: 30_000 })
    const inlineCount = await page.locator('.sa-inline').count()
    console.log('[orch-live] .sa-inline(채팅 인라인) 카드 수:', inlineCount)
    expect(inlineCount).toBeGreaterThanOrEqual(1)

    // ② 연속: 서브에이전트 결과(ALPHA/BRAVO)가 메인으로 복귀해 최종 응답에 합성됨.
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('ALPHA', { timeout: 240_000 })
    await expect(lastMsg).toContainText('BRAVO', { timeout: 10_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'orchestration-live.png') })

    // 최소 1개 서브에이전트가 관측됐어야 함(관측 증명).
    expect(subCount).toBeGreaterThanOrEqual(1)
  })

  test('UltraCode ON → Workflow 실행 → 결과가 메인 대화 마지막 메시지에 도달(F-B)', async () => {
    test.setTimeout(300_000) // Workflow 백그라운드 실행 + 2턴 대기

    // 부팅 오버레이 방어
    const nick = page.locator('#nickname')
    if (await nick.isVisible().catch(() => false)) {
      await nick.fill('tester')
      await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})

    await expect(page.locator('.pane.chat')).toBeVisible()

    // UltraCode ON
    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    if (!(await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).toHaveClass(/orch-on/)

    // Workflow 명시 유도 — 단일 에이전트가 WORKFLOW_RESULT_OK 반환
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Use the Workflow tool to run a minimal workflow: a meta block named "probe" and a single ' +
      'agent() call whose prompt asks it to reply with the exact string WORKFLOW_RESULT_OK. Keep it ' +
      'to ONE agent only. After the workflow finishes, reply to me with the workflow result string.'
    )
    await input.press('Enter')

    // Workflow는 canUseTool 권한 게이트(ON→permission_request) → 카드 허용(BF3 P06/ADR-030
    // 인라인 카드 — "허용" 버튼 직접 클릭. 옛 풀오버레이 모달의 숫자키 전역 리스너는 폐기됨).
    const permCard = page.locator(PERM_CARD)
    await expect(permCard).toBeVisible({ timeout: 60_000 })
    await permCard.locator(permChoiceSelector('allow')).click() // 허용

    // 진행: orchestration 카드(.orch-card)가 thread에 나타남(F-C 라이브).
    await expect(page.locator('.orch-card').first()).toBeVisible({ timeout: 120_000 })

    // 핵심(F-B): 워크플로 결과가 2번째 턴으로 복귀해 메인 대화 마지막 AI 메시지에 도달.
    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('WORKFLOW_RESULT_OK', { timeout: 240_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'workflow-result-live.png') })
  })
})
