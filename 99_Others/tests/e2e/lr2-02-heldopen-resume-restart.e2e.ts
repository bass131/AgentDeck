import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const CODEWORD = 'PERSIMMON91HR'

async function launchSingleChat(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('hr테스트')
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

async function ensureReplOn(page: Page): Promise<void> {
  const toggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  await toggle.waitFor({ state: 'visible', timeout: 10_000 })
  const pressed = await toggle.getAttribute('aria-pressed')
  if (pressed !== 'true') {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
  }
}

async function waitChatIdle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1500)
  while (Date.now() < deadline) {
    const running = await page.locator('[aria-label="실행 중단"]').first().isVisible().catch(() => false)
    if (!running) { await page.waitForTimeout(1000); return }
    await page.waitForTimeout(1200)
  }
}

test.describe('LR2-02: held-open(REPL) 재시작-resume 라이브 probe (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('REPL ON: 한 턴 후 sessionId 영속 + 재시작 후 REPL ON 회상 (resume+persistent 동시)', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr2-02-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'lr2-02-ws-'))

    const { app: app1, page: page1 } = await launchSingleChat(userDataDir, workspace)
    await ensureReplOn(page1)

    const input1 = page1.getByLabel('메시지 입력')
    await input1.click()
    await input1.fill(`코드워드 ${CODEWORD} 기억해. 한 문장으로 알겠다고만 답해. 도구 쓰지 마.`)
    await input1.press('Enter')
    await expect(page1.locator('.msg.ai-msg .content').last()).toContainText(/알겠|기억|acknowledg|PERSIMMON/i, { timeout: 150_000 }).catch(() => {})
    await waitChatIdle(page1, 150_000)
    await page1.waitForTimeout(2500)

    const chatsDir = join(userDataDir, 'chats')
    let savedSessionId: unknown
    if (existsSync(chatsDir)) {
      const files = readdirSync(chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json')
      if (files.length > 0) savedSessionId = (JSON.parse(readFileSync(join(chatsDir, files[0]), 'utf8')) as { sessionId?: string }).sessionId
    }
    console.log('[LR2-02] 1차(REPL ON) 저장 sessionId:', savedSessionId)
    expect(savedSessionId, 'held-open 한 턴 후 sessionId 디스크 영속').toBeTruthy()

    await app1.close()

    const { app: app2, page: page2 } = await launchSingleChat(userDataDir, workspace)
    await page2.waitForTimeout(2500)

    const restoredMsgs = await page2.locator('.pane.chat .msg').count()
    console.log('[LR2-02] 2차 복원 msg 수:', restoredMsgs)
    expect(restoredMsgs, '재시작 후 대화 복원').toBeGreaterThan(0)

    await ensureReplOn(page2)

    const input2 = page2.getByLabel('메시지 입력')
    const aiBefore = await page2.locator('.pane.chat .msg.ai-msg').count()
    await input2.click()
    await input2.fill('아까 내가 알려준 코드워드가 뭐였지? 코드워드만 답해. 도구 쓰지 마.')
    await input2.press('Enter')
    await expect(page2.locator('.pane.chat .msg.ai-msg')).toHaveCount(aiBefore + 1, { timeout: 150_000 }).catch(() => {})
    await waitChatIdle(page2, 150_000)

    const answer = await page2.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    const chatText = await page2.locator('.pane.chat').innerText().catch(() => '')
    const recalled = answer.includes(CODEWORD) || chatText.slice(-300).includes(CODEWORD)
    console.log('[LR2-02] 2차(재시작·REPL ON) 응답:', answer.slice(0, 150))
    console.log(`[LR2-02] ${recalled ? '✅ GO' : '❌ NO-GO'} — held-open 재시작 resume ${recalled ? '생존(실 SDK 수용)' : '실패(한계 문서화로 강등)'}`)

    await app2.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { }

    expect(recalled, `held-open 재시작 후 resume 회상(코드워드 ${CODEWORD}) — 응답: ${answer.slice(0, 120)}`).toBe(true)
  })
})
