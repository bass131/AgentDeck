import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const CODEWORD = 'BANANA42XR'

async function launchMulti(
  userDataDir: string,
  workspace: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_PICK_FOLDER: workspace,
      AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const nick = page.locator('.login-body input#nickname, #nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('lr1테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { }

  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 5_000 })
    await skip.click()
    await page.waitForTimeout(500)
  } catch { }

  await page.waitForSelector('.titlebar', { timeout: 30_000 })

  for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(200) }
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    if (await later.isVisible().catch(() => false)) await later.click()
  } catch { }

  const multiBtn = page.locator('.sb-mode-btn', { hasText: '멀티 에이전트' })
  await multiBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await multiBtn.click()
  await page.locator('.multi').waitFor({ state: 'visible', timeout: 10_000 })
  return { app, page }
}

async function ensurePanel0Workspace(page: Page): Promise<void> {
  const pick = page.getByRole('button', { name: '폴더 선택' })
  if (await pick.first().isVisible().catch(() => false)) {
    await pick.first().click()
    await page.waitForTimeout(1200)
  }
}

async function waitPanel0Idle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1500)
  while (Date.now() < deadline) {
    const running = await page.locator('.ma-panel[data-slot="0"] .ma-stop').isVisible().catch(() => false)
    if (!running) { await page.waitForTimeout(1000); return }
    await page.waitForTimeout(1200)
  }
}

test.describe('LR1: resume 앱-재시작 실측 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let userDataDir: string
  let workspace: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'lr1-resume-udata-'))
    workspace = mkdtempSync(join(tmpdir(), 'lr1-resume-ws-'))
  })
  test.afterAll(() => {
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { }
  })

  test('재시작 후 코드워드 회상 (멀티패널 resume)', async () => {
    test.setTimeout(420_000)

    const { app: app1, page: page1 } = await launchMulti(userDataDir, workspace)
    await ensurePanel0Workspace(page1)

    const ta1 = page1.locator('.ma-panel[data-slot="0"] .ma-composer-ta')
    await ta1.waitFor({ state: 'visible', timeout: 8_000 })
    expect(await ta1.isDisabled().catch(() => true), '패널0 composer 활성(워크스페이스 설정)').toBe(false)

    await ta1.fill(`코드워드는 ${CODEWORD}. 한 문장으로 알겠다고만 답해. 도구 쓰지 마.`)
    await ta1.press('Enter')
    await page1.locator('.ma-panel[data-slot="0"] .msg.ai-msg').first().waitFor({ state: 'visible', timeout: 150_000 }).catch(() => {})
    await waitPanel0Idle(page1, 150_000)

    const panel0Text1 = await page1.locator('.ma-panel[data-slot="0"]').innerText().catch(() => '(없음)')
    const msgCount1 = await page1.locator('.ma-panel[data-slot="0"] .msg').count()
    console.log('[LR1] 1차 패널0 msg 수:', msgCount1, '| 응답 발췌:', panel0Text1.replace(/\s+/g, ' ').slice(-200))

    await page1.waitForTimeout(1500)
    const blobPath = join(userDataDir, 'multi-agent.json')
    let savedSessionId: string | undefined
    if (existsSync(blobPath)) {
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      savedSessionId = blob.sessions?.[0]?.panels?.[0]?.snapshot?.sessionId
      console.log('[LR1] 1차 저장 sessionId:', savedSessionId, '| messages:', blob.sessions?.[0]?.panels?.[0]?.snapshot?.messages?.length)
    }
    expect(savedSessionId, '1차: sessionId가 디스크에 저장돼야 함').toBeTruthy()

    await app1.close()

    const { app: app2, page: page2 } = await launchMulti(userDataDir, workspace)
    await page2.waitForTimeout(3000)

    const restoredMsgs = await page2.locator('.ma-panel[data-slot="0"] .msg').count()
    const restoredText = await page2.locator('.ma-panel[data-slot="0"]').innerText().catch(() => '')
    console.log('[LR1] 2차 복원 msg 수:', restoredMsgs, '| 복원 텍스트에 코드워드?', restoredText.includes(CODEWORD))
    expect(restoredMsgs, '재시작 후 thread(.msg) 복원').toBeGreaterThan(0)

    const ta2 = page2.locator('.ma-panel[data-slot="0"] .ma-composer-ta')
    await ta2.waitFor({ state: 'visible', timeout: 8_000 })
    expect(await ta2.isDisabled().catch(() => true), '재시작 후 패널0 composer 활성').toBe(false)

    const aiBefore = await page2.locator('.ma-panel[data-slot="0"] .msg.ai-msg').count()

    await ta2.fill('아까 내가 알려준 코드워드가 뭐였지? 코드워드만 답해. 도구 쓰지 마.')
    await ta2.press('Enter')
    await expect(page2.locator('.ma-panel[data-slot="0"] .msg.ai-msg')).toHaveCount(aiBefore + 1, { timeout: 150_000 }).catch(() => {})
    await waitPanel0Idle(page2, 150_000)

    const answer = await page2.locator('.ma-panel[data-slot="0"] .msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    const panel0Text2 = await page2.locator('.ma-panel[data-slot="0"]').innerText().catch(() => '(없음)')
    console.log('[LR1] 2차(재시작 후) 마지막 응답:', answer.slice(0, 200))

    const recalled = answer.includes(CODEWORD) || panel0Text2.slice(-300).includes(CODEWORD)
    console.log(`[LR1] ${recalled ? '✅ PASS' : '❌ FAIL'} — 재시작 후 코드워드 ${recalled ? '회상됨(resume 정상)' : '회상 못 함(resume 끊김=진짜 버그)'}`)
    expect(recalled, `재시작 후 resume 맥락 회상(코드워드 ${CODEWORD}) — 응답: ${answer.slice(0, 120)}`).toBe(true)

    await app2.close()
  })
})
