import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const CODENAME = 'ZEBRA49QX'

async function launchSingleChat(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('resume-probe')
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

function findCodenameInMemoryFiles(token: string): string[] {
  const root = join(homedir(), '.claude', 'projects')
  const hits: string[] = []
  if (!existsSync(root)) return hits
  const walk = (dir: string, depth: number): void => {
    if (depth > 4) return
    let entries: string[] = []
    try { entries = readdirSync(dir) } catch { return }
    for (const e of entries) {
      const p = join(dir, e)
      let st
      try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) walk(p, depth + 1)
      else if (/memory/i.test(p) && /\.(md|txt|json)$/i.test(e)) {
        try { if (readFileSync(p, 'utf8').includes(token)) hits.push(p) } catch { }
      }
    }
  }
  walk(root, 0)
  return hits
}

test.describe('LR1: resume 격리 재검증 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('memory 도구·disclaimer 제거 후 순수 resume 회상 검증', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr1-iso-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'lr1-iso-ws-'))

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
    const plantAnswer = await page1.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    console.log('[ISO] 1차 심기 응답:', plantAnswer.slice(0, 120))
    console.log('[ISO] 1차 저장 sessionId:', savedSessionId)
    expect(savedSessionId, '한 턴 후 sessionId 영속').toBeTruthy()

    await app1.close()

    const { app: app2, page: page2 } = await launchSingleChat(userDataDir, workspace)
    await page2.waitForTimeout(2500)

    const restoredMsgs = await page2.locator('.pane.chat .msg').count()
    console.log('[ISO] 2차 복원 msg 수:', restoredMsgs)
    expect(restoredMsgs, '재시작 후 대화 복원').toBeGreaterThan(0)

    const input2 = page2.getByLabel('메시지 입력')
    const aiBefore = await page2.locator('.pane.chat .msg.ai-msg').count()
    await input2.click()
    await input2.fill('내 프로젝트 코드네임이 뭐라고 했지? 코드네임만 답해. 파일이나 도구는 쓰지 마.')
    await input2.press('Enter')
    await expect(page2.locator('.pane.chat .msg.ai-msg')).toHaveCount(aiBefore + 1, { timeout: 150_000 }).catch(() => {})
    await waitChatIdle(page2, 150_000)

    const answer = await page2.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    const chatText = await page2.locator('.pane.chat').innerText().catch(() => '')
    const recalled = answer.includes(CODENAME) || chatText.slice(-300).includes(CODENAME)

    const memHits = findCodenameInMemoryFiles(CODENAME)

    console.log('[ISO] 2차(재시작 후) 응답:', answer.slice(0, 150))
    console.log(`[ISO] 회상: ${recalled ? '✅ 코드네임 회상됨' : '❌ 회상 못 함'}`)
    console.log(`[ISO] memory 파일 코드네임 히트: ${memHits.length === 0 ? '없음 (회상 출처 = resume 확정)' : JSON.stringify(memHits)}`)

    await app2.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { }

    expect(recalled, `재시작 후 순수 resume 회상(${CODENAME}) — 응답: ${answer.slice(0, 120)}`).toBe(true)
    expect(memHits.length, `회상이 memory 파일 출처면 안 됨(격리 무효) — 히트: ${JSON.stringify(memHits)}`).toBe(0)
  })
})
