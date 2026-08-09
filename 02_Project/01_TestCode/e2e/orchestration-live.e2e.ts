import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

const LIVE = process.env.LIVE_SDK === '1'

test.describe('UltraCode 서브에이전트 오케스트레이션 라이브 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, 'real-SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let workspace: string
  let userDataDir: string

  test.beforeAll(async () => {
    test.setTimeout(60_000)
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-orch-'))
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-orch-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: 'tester' })
    await openWorkspace(page, { waitForTree: false })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('UltraCode ON → 서브에이전트 실시간 표시(오른쪽 패널) + 결과 합성', async () => {
    test.setTimeout(300_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    if (!(await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).toHaveClass(/orch-on/)

    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

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

    await expect(page.locator('.subagent').first()).toBeVisible({ timeout: 240_000 })
    const subCount = await page.locator('.subagent').count()
    console.log('[orch-live] .subagent 카드 수:', subCount)
    const saNames = await page.locator('.subagent .sa-name').allInnerTexts().catch(() => [])
    console.log('[orch-live] 서브에이전트 이름:', JSON.stringify(saNames))

    await expect(page.locator('.sa-inline').first()).toBeVisible({ timeout: 30_000 })
    const inlineCount = await page.locator('.sa-inline').count()
    console.log('[orch-live] .sa-inline(채팅 인라인) 카드 수:', inlineCount)
    expect(inlineCount).toBeGreaterThanOrEqual(1)

    await settleTurn(page, { timeoutMs: 240_000 })

    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('ALPHA-BRAVO', { timeout: 10_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'orchestration-live.png') })

    expect(subCount).toBeGreaterThanOrEqual(1)
  })

  test('UltraCode ON → Workflow 실행 → 결과가 메인 대화 마지막 메시지에 도달(F-B)', async () => {
    test.setTimeout(480_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    await page.getByRole('button', { name: '새 대화' }).click()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    const toggleClassBefore = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 시작 시 UltraCode 토글 class:', toggleClassBefore)
    if (!toggleClassBefore?.includes('orch-on')) {
      console.log('[orch-live] UltraCode OFF 확인 — ON으로 토글')
      await toggle.click()
    }
    await expect(toggle).toHaveClass(/orch-on/)
    const toggleClassConfirmed = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 UltraCode 확정 상태(메시지 전송 전):', toggleClassConfirmed)

    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'Call the Workflow tool IMMEDIATELY as your very first action — do not read files, do not ' +
      'explore the codebase, do not use any other tool first. The workflow: a meta block named ' +
      '"probe" and a single agent() call whose prompt asks it to reply with the exact string ' +
      'WORKFLOW_RESULT_OK. Keep it to ONE agent only. After the workflow finishes, reply to me ' +
      'with the workflow result string.'
    )
    const toggleClassAtSend = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 전송 직전 UltraCode 토글 class:', toggleClassAtSend)
    if (!toggleClassAtSend?.includes('orch-on')) {
      console.log('[orch-live] ⚠ 전송 직전 UltraCode가 다시 OFF로 확인됨 — 재토글 후 전송')
      await toggle.click()
      await expect(toggle).toHaveClass(/orch-on/)
    }
    await input.press('Enter')

    const toggleClassAfterSend = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test2 전송 직후 UltraCode 토글 class:', toggleClassAfterSend)
    const permCard = page.locator(PERM_CARD)
    await expect(permCard).toBeVisible({ timeout: 180_000 })
    await permCard.locator(permChoiceSelector('allow')).click()

    await expect(page.locator('.orch-card').first()).toBeVisible({ timeout: 120_000 })

    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('WORKFLOW_RESULT_OK', { timeout: 240_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'workflow-result-live.png') })
  })

  test('mid-session: 같은 대화 후속 턴에서 UltraCode OFF→ON 플립 → Workflow → perm-card → 결과(ADR-032 ①\')', async () => {
    test.setTimeout(600_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    await page.getByRole('button', { name: '새 대화' }).click()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()

    if ((await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).not.toHaveClass(/orch-on/)
    console.log('[orch-live] Test3 턴1 토글 OFF 확정 — 세션을 OFF로 생성')

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill('Reply with exactly the single word READY. Do not use any tools, do not write files.')
    await input.press('Enter')

    await settleTurn(page, { timeoutMs: 240_000 })
    const firstMsg = page.locator('.msg.ai-msg .content').last()
    await expect(firstMsg).toContainText('READY', { timeout: 10_000 })
    console.log('[orch-live] Test3 턴1(OFF) 완료 — held-open 세션 성립')

    const toggleBefore = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test3 턴2 진입 시 토글 class(OFF 기대, 지속 토글):', toggleBefore)
    if (!toggleBefore?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).toHaveClass(/orch-on/)
    console.log('[orch-live] Test3 턴2 토글 ON 확정 — mid-session 플립 완료')

    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })
    await input.click()
    await input.fill(
      'Call the Workflow tool IMMEDIATELY as your very first action — do not read files, do not ' +
      'explore the codebase, do not use any other tool first. The workflow: a meta block named ' +
      '"probe3" and a single agent() call whose prompt asks it to reply with the exact string ' +
      'MIDSESSION_OK. Keep it to ONE agent only. After the workflow finishes, reply to me with ' +
      'the workflow result string.'
    )
    const toggleAtSend = await toggle.getAttribute('class').catch(() => null)
    if (!toggleAtSend?.includes('orch-on')) {
      await toggle.click()
      await expect(toggle).toHaveClass(/orch-on/)
    }
    await input.press('Enter')

    const permCard = page.locator(PERM_CARD)
    await expect(permCard).toBeVisible({ timeout: 180_000 })
    console.log('[orch-live] Test3 perm-card 등장 — mid-session ON 게이트 실효 증거')
    await permCard.locator(permChoiceSelector('allow')).click()

    await expect(page.locator('.orch-card').first()).toBeVisible({ timeout: 120_000 })

    const lastMsg = page.locator('.msg.ai-msg .content').last()
    await expect(lastMsg).toContainText('MIDSESSION_OK', { timeout: 240_000 })

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'orchestration-midsession-live.png') })
  })

  test('비승격 + G4 deny 가시화: 토글 OFF + "ultracode" 언급 → 승격 없음 → .notice-row deny 라인(ADR-032 v2 ②\'+⑥)', async () => {
    test.setTimeout(300_000)

    await expect(page.locator('.pane.chat')).toBeVisible()

    await page.getByRole('button', { name: '새 대화' }).click()
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })

    const toggle = page.locator('.composer .orch-toggle')
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('class'))?.includes('orch-on')) {
      await toggle.click()
    }
    await expect(toggle).not.toHaveClass(/orch-on/)
    console.log('[orch-live] Test4 토글 OFF 확정 — 명시적 차단 의사')

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'I want to use ultracode for this. Call the Workflow tool IMMEDIATELY as your very first ' +
      'action — do not read files, do not explore, do not use any other tool first. The workflow: ' +
      'a meta block named "probe4" and a single agent() call asking it to reply with WORKFLOW_TRY. ' +
      'Attempt the Workflow tool call even if you think it may be blocked.'
    )
    const toggleAtSend = await toggle.getAttribute('class').catch(() => null)
    console.log('[orch-live] Test4 전송 직전 토글 class(OFF 기대 — 키워드 언급에도 비승격):', toggleAtSend)
    if (toggleAtSend?.includes('orch-on')) {
      await toggle.click()
      await expect(toggle).not.toHaveClass(/orch-on/)
    }
    await input.press('Enter')

    const denyLine = page.locator('.notice-row', { hasText: 'UltraCode가 꺼져 있어' })
    await expect(denyLine).toBeVisible({ timeout: 180_000 })
    const denyText = await denyLine.locator('.notice-text').innerText().catch(() => '')
    console.log('[orch-live] Test4 deny 시스템 라인 텍스트:', JSON.stringify(denyText))
    expect(denyText).toContain('차단')

    await page.screenshot({ path: join(process.cwd(), 'artifacts', 'orchestration-denied-live.png') })

    await settleTurn(page, { timeoutMs: 120_000 }).catch(() => {})
  })
})
