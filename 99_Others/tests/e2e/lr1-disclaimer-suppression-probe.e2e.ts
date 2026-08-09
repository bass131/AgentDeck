import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const CODENAME = 'MANGO88XR'
const DISCLAIMER = /기억(하지는?|할 수는?)?\s*(못|없)|원문은?\s*남지\s*않|세션이?\s*끝나면/

async function launchSingleChat(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('disclaimer-probe')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  try { const skip = page.locator('.eg-auth-dialog .sd-go'); if (await skip.isVisible().catch(() => false)) await skip.click() } catch { }
  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) }
  await expect(page.locator('.pane.chat')).toBeVisible({ timeout: 15_000 })
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) { await pickFolder.click(); await page.waitForTimeout(1000) }
  return { app, page }
}

async function waitChatIdle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1500)
  while (Date.now() < deadline) {
    const running = await page.locator('.chat-stop, .composer .stop, [aria-label="중지"]').first().isVisible().catch(() => false)
    if (!running) { await page.waitForTimeout(1000); return }
    await page.waitForTimeout(1200)
  }
}

test.describe('LR1: (a) disclaimer 억제 측정 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('메타질문에 disclaimer 억제 + 긍정 회상', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr1-disc-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'lr1-disc-ws-'))

    const { app: app1, page: page1 } = await launchSingleChat(userDataDir, workspace)
    const input1 = page1.getByLabel('메시지 입력')
    await input1.click()
    await input1.fill(`내 프로젝트 코드네임은 ${CODENAME}야. 한 문장으로 "알겠어"라고만 답해. 파일이나 도구는 절대 쓰지 마.`)
    await input1.press('Enter')
    await waitChatIdle(page1, 150_000)
    await page1.waitForTimeout(2500)

    const chatsDir = join(userDataDir, 'chats')
    let savedSessionId: unknown
    if (existsSync(chatsDir)) {
      const files = readdirSync(chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json')
      if (files.length > 0) savedSessionId = (JSON.parse(readFileSync(join(chatsDir, files[0]), 'utf8')) as { sessionId?: string }).sessionId
    }
    console.log('[DISC] 1차 저장 sessionId:', savedSessionId)
    expect(savedSessionId, 'sessionId 영속(resume 전제)').toBeTruthy()
    await app1.close()

    const { app: app2, page: page2 } = await launchSingleChat(userDataDir, workspace)
    await page2.waitForTimeout(2500)

    const input2 = page2.getByLabel('메시지 입력')
    const aiBefore = await page2.locator('.pane.chat .msg.ai-msg').count()
    await input2.click()
    await input2.fill('이전 대화 내역 기억해? 기억나는 게 있으면 말해줘.')
    await input2.press('Enter')
    await expect(page2.locator('.pane.chat .msg.ai-msg')).toHaveCount(aiBefore + 1, { timeout: 150_000 }).catch(() => {})
    await waitChatIdle(page2, 150_000)

    const answer = await page2.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    const hasDisclaimer = DISCLAIMER.test(answer)
    const recalled = answer.includes(CODENAME)
    console.log('[DISC] 메타질문 응답 전문:\n' + answer.slice(0, 400))
    console.log(`[DISC] disclaimer 마커: ${hasDisclaimer ? '❌ 있음(억제 실패)' : '✅ 없음'}`)
    console.log(`[DISC] 코드네임 긍정회상: ${recalled ? '✅ 회상' : '⚠️ 명시 안 함'}`)

    await app2.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { }

    expect(hasDisclaimer, `메타질문에 거짓 disclaimer가 없어야 함 — 응답: ${answer.slice(0, 200)}`).toBe(false)
    expect(recalled, `메타질문에도 심은 코드네임(${CODENAME})을 회상해야 함 — 응답: ${answer.slice(0, 200)}`).toBe(true)
  })
})
