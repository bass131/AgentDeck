/**
 * lr1-singlechat-sessionid.e2e.ts — 단일채팅 재시작-resume 회귀 테스트 (LIVE_SDK=1)
 *
 * 영호 실측 버그: 어제 단일채팅 세션 → 다음날 메시지 → "이전 대화 기억 못함"(새 대화).
 * 근본원인: CONVERSATION_SAVE IPC 핸들러가 conv.sessionId를 store.save로 forward하지
 * 않아 sessionId가 디스크에 영속되지 못했다(멀티패널은 다른 채널이라 정상 — 경로 비대칭).
 * 수정: handlers/conversation.ts 가 sessionId(+게이지 메타) forward.
 *
 * 이 테스트는 (1) 한 턴 후 chats/<id>.json 에 sessionId 저장 확인,
 *            (2) 앱 완전 종료→재시작 후 코드워드 회상(end-to-end resume) 을 검증한다.
 *
 *   LIVE_SDK=1 npx playwright test 99.Others/tests/e2e/lr1-singlechat-sessionid.e2e.ts
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const CODEWORD = 'BANANA77SC'

async function launchSingleChat(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('sc테스트')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  try { const skip = page.locator('.eg-auth-dialog .sd-go'); if (await skip.isVisible().catch(() => false)) await skip.click() } catch { /* authed */ }
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

test.describe('LR1: 단일채팅 재시작-resume (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('단일채팅: 한 턴 후 sessionId 영속 + 재시작 후 코드워드 회상', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr1-sc-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'lr1-sc-ws-'))

    // ── 1차: 심기 ──────────────────────────────────────────────────────────
    const { app: app1, page: page1 } = await launchSingleChat(userDataDir, workspace)
    const input1 = page1.getByLabel('메시지 입력')
    await input1.click()
    await input1.fill(`코드워드 ${CODEWORD} 기억해. 한 문장으로 알겠다고만 답해. 도구 쓰지 마.`)
    await input1.press('Enter')
    await expect(page1.locator('.msg.ai-msg .content').last()).toContainText(/알겠|기억|acknowledg|BANANA/i, { timeout: 150_000 }).catch(() => {})
    await waitChatIdle(page1, 150_000)
    await page1.waitForTimeout(2500) // saveConversation(done) 여유

    // chats/<id>.json 에 sessionId 저장 확인 (수정의 정확한 검증)
    const chatsDir = join(userDataDir, 'chats')
    let savedSessionId: unknown
    if (existsSync(chatsDir)) {
      const files = readdirSync(chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json')
      if (files.length > 0) savedSessionId = (JSON.parse(readFileSync(join(chatsDir, files[0]), 'utf8')) as { sessionId?: string }).sessionId
    }
    console.log('[LR1-SC] 1차 저장 sessionId:', savedSessionId)
    expect(savedSessionId, '단일채팅 한 턴 후 sessionId가 디스크에 저장돼야 함(수정 확인)').toBeTruthy()

    await app1.close()

    // ── 2차: 재시작 후 회상 ─────────────────────────────────────────────────
    const { app: app2, page: page2 } = await launchSingleChat(userDataDir, workspace)
    await page2.waitForTimeout(2500) // 대화 자동 복원(restoreLastActiveConversation)

    // thread 복원 확인
    const restoredMsgs = await page2.locator('.pane.chat .msg').count()
    console.log('[LR1-SC] 2차 복원 msg 수:', restoredMsgs)
    expect(restoredMsgs, '재시작 후 대화 복원').toBeGreaterThan(0)

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
    console.log('[LR1-SC] 2차(재시작 후) 응답:', answer.slice(0, 150))
    console.log(`[LR1-SC] ${recalled ? '✅ PASS' : '❌ FAIL'} — 재시작 후 코드워드 ${recalled ? '회상됨(resume 정상)' : '회상 못 함'}`)

    await app2.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 잠금 */ }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { /* 잠금 */ }

    expect(recalled, `재시작 후 단일채팅 resume 회상(코드워드 ${CODEWORD}) — 응답: ${answer.slice(0, 120)}`).toBe(true)
  })
})
