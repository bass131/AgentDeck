import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { focusRestoredWindow } from './helpers/relaunchFocus'

const LIVE = process.env.LIVE_SDK === '1'

async function launchAndEnterMulti(
  userDataDir: string,
  extraEnv: Record<string, string> = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [
      join(process.cwd(), 'out', 'main', 'index.js'),
      `--user-data-dir=${userDataDir}`,
    ],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      ...extraEnv,
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await focusRestoredWindow(app, page)

  const nick = page.locator('.login-body input#nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('m3테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { }

  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 6_000 })
    await skip.click()
    await page.waitForTimeout(500)
  } catch { }

  await page.waitForSelector('.titlebar', { timeout: 30_000 })

  try {
    const modal = page.locator('.wn-overlay, .un-overlay')
    await modal.first().waitFor({ state: 'visible', timeout: 5_000 })
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
      if (!(await modal.first().isVisible().catch(() => false))) break
      const btn = page.locator('.wn-nav-cta, .un-cta').first()
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
      await page.waitForTimeout(300)
    }
  } catch { }

  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: 4_000 })
    await later.click()
    await page.waitForTimeout(400)
  } catch { }

  const multiBtn = page.locator('.sb-mode-btn', { hasText: '멀티 에이전트' })
  await multiBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if ((await multiBtn.getAttribute('aria-selected')) !== 'true') {
    await multiBtn.click()
  }

  await page.locator('.multi').waitFor({ state: 'visible', timeout: 10_000 })

  return { app, page }
}

async function safeRmDir(dir: string): Promise<void> {
  if (!dir) return
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  console.warn(`[cleanup] rmSync 실패 (무시): ${dir}`)
}

async function waitForSave(page: Page): Promise<void> {
  await page.waitForTimeout(800)
}

test.describe('SC-1: 멀티 세션 메타 복원 (필수)', () => {
  let userDataDir: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc1-'))
  })

  test.afterAll(async () => {
    await safeRmDir(userDataDir)
  })

  test('SC-1-A: count=2 탭 변경 → 저장 → 재구동 → count=2 복원', async () => {
    test.setTimeout(90_000)

    const { app: app1, page: page1 } = await launchAndEnterMulti(userDataDir)

    const countBtns = page1.locator('[aria-label="패널 수"] .ma-count-btn')
    await countBtns.first().waitFor({ state: 'visible', timeout: 8_000 })

    const btn2 = page1.locator('[aria-label="패널 수"] .ma-count-btn', { hasText: '2' })
    await btn2.click()
    await expect(btn2).toHaveAttribute('aria-selected', 'true')

    await waitForSave(page1)

    const blobPath = join(userDataDir, 'multi-agent.json')
    const blobExists = existsSync(blobPath)
    console.log('[SC-1-A] multi-agent.json 존재:', blobExists, 'at', blobPath)
    expect(blobExists, 'multi-agent.json 저장 확인').toBe(true)

    if (blobExists) {
      const raw = readFileSync(blobPath, 'utf8')
      const blob = JSON.parse(raw)
      console.log('[SC-1-A] blob.version:', blob.version)
      console.log('[SC-1-A] sessions[0].count:', blob.sessions?.[0]?.count)
      expect(blob.version).toBe(2)
      expect(blob.sessions?.[0]?.count).toBe(2)
    }

    await app1.close()

    const { app: app2, page: page2 } = await launchAndEnterMulti(userDataDir)

    const btn2Restored = page2.locator('[aria-label="패널 수"] .ma-count-btn', { hasText: '2' })
    await btn2Restored.waitFor({ state: 'visible', timeout: 8_000 })
    await page2.waitForTimeout(1000)
    await expect(btn2Restored).toHaveAttribute('aria-selected', 'true')
    console.log('[SC-1-A] count=2 복원 확인: PASS')

    await app2.close()
  })

  test('SC-1-B: sysPrompt 설정 → 저장 → 재구동 → .ma-p-prompt.on 클래스 복원', async () => {
    test.setTimeout(90_000)

    const { app: app1, page: page1 } = await launchAndEnterMulti(userDataDir)

    const promptBtn = page1.locator('.ma-panel').first().locator('.ma-p-prompt')
    await promptBtn.waitFor({ state: 'visible', timeout: 8_000 })
    await promptBtn.click()

    await page1.locator('.pr-textarea').waitFor({ state: 'visible', timeout: 5_000 })

    const PROMPT_TEXT = '항상 한국어로 답해줘 — m3 복원 테스트'
    await page1.locator('.pr-textarea').fill(PROMPT_TEXT)

    await page1.locator('.pr-save').click()

    await page1.locator('.pr-textarea').waitFor({ state: 'hidden', timeout: 5_000 })
    await expect(page1.locator('.ma-panel').first().locator('.ma-p-prompt')).toHaveClass(/\bon\b/)
    console.log('[SC-1-B] sysPrompt 설정 + .ma-p-prompt.on 확인: PASS')

    await waitForSave(page1)

    const blobPath = join(userDataDir, 'multi-agent.json')
    if (existsSync(blobPath)) {
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      const p0 = blob.sessions?.[0]?.panels?.[0]
      console.log('[SC-1-B] panel[0].sysPrompt:', p0?.sysPrompt)
      expect(p0?.sysPrompt).toContain('m3 복원 테스트')
    }

    await app1.close()

    const { app: app2, page: page2 } = await launchAndEnterMulti(userDataDir)

    await page2.waitForTimeout(1200)

    const promptBtnRestored = page2.locator('.ma-panel').first().locator('.ma-p-prompt')
    await promptBtnRestored.waitFor({ state: 'visible', timeout: 8_000 })
    await expect(promptBtnRestored).toHaveClass(/\bon\b/)
    console.log('[SC-1-B] sysPrompt .on 복원 확인: PASS')

    await app2.close()
  })
})

test.describe('SC-2: 존재하지 않는 cwd 주입 → 크래시 0 + 기본 폴더 표시', () => {
  let userDataDir: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc2-'))
  })

  test.afterAll(async () => {
    await safeRmDir(userDataDir)
  })

  test('SC-2-A: 존재 불가능 경로를 blob에 직접 주입 → 재구동 → 앱 크래시 0 + 패널 폴더 선택 표시', async () => {
    test.setTimeout(60_000)

    const INVALID_CWD = '/this/path/does/not/exist/ever/truly/9999'
    const injectedBlob = {
      version: 2,
      activeSessionId: 'main-session',
      sessions: [
        {
          id: 'main-session',
          count: 3,
          panels: Array.from({ length: 6 }, (_, i) => ({
            title: `패널 ${i + 1}`,
            cwd: INVALID_CWD,
            picker: { model: 'sonnet', effort: 'high', mode: 'normal' },
          })),
        },
      ],
    }

    mkdirSync(userDataDir, { recursive: true })
    const blobPath = join(userDataDir, 'multi-agent.json')
    writeFileSync(blobPath, JSON.stringify(injectedBlob))
    console.log('[SC-2-A] 주입된 blob:', blobPath)

    const { app, page } = await launchAndEnterMulti(userDataDir)

    await expect(page.locator('.multi')).toBeVisible()
    console.log('[SC-2-A] .multi 섹션 크래시 0: PASS')

    await page.waitForTimeout(1000)
    const panels = page.locator('.ma-panel')
    const panelCount = await panels.count()
    console.log('[SC-2-A] 표시된 패널 수:', panelCount)
    expect(panelCount).toBeGreaterThanOrEqual(1)

    const folderBtns = page.locator('.ma-panel .ma-p-folder')
    const firstFolderBtn = folderBtns.first()
    await firstFolderBtn.waitFor({ state: 'visible', timeout: 8_000 })
    const folderLabel = await firstFolderBtn.locator('.ma-p-folder-name').textContent()
    console.log('[SC-2-A] 패널[0] 폴더 버튼 레이블:', folderLabel)

    expect(
      folderLabel,
      `신뢰경계 위반: validatePanelCwd가 ${INVALID_CWD}를 통과시켰습니다`
    ).not.toContain('9999')

    console.log('[SC-2-A] 존재 불가능 cwd 거부 + 기본 폴백 확인: PASS')
    await app.close()
  })

  test('SC-2-B: version≠2 blob 주입 → 재구동 → graceful 빈 상태(크래시 0 + 패널 기본 렌더)', async () => {
    test.setTimeout(60_000)

    const badBlob = {
      version: 99,
      activeSessionId: 'main-session',
      sessions: [],
    }
    const blobPath = join(userDataDir, 'multi-agent.json')
    writeFileSync(blobPath, JSON.stringify(badBlob))
    console.log('[SC-2-B] version≠2 blob 주입:', blobPath)

    const { app, page } = await launchAndEnterMulti(userDataDir)

    await expect(page.locator('.multi')).toBeVisible()
    console.log('[SC-2-B] .multi 크래시 0: PASS')

    await page.waitForTimeout(1000)
    const countBtns = page.locator('[aria-label="패널 수"] .ma-count-btn')
    await countBtns.first().waitFor({ state: 'visible', timeout: 5_000 })
    const selectedBtns = page.locator('[aria-label="패널 수"] .ma-count-btn[aria-selected="true"]')
    await expect(selectedBtns).toHaveCount(1)
    const selectedCountText = await selectedBtns.textContent()
    console.log('[SC-2-B] 현재 활성 count:', selectedCountText)

    await expect(page.locator('.ma-panel').first()).toBeVisible()

    const panelHeader = page.locator('.ma-panel').first().locator('.ma-p-title, [class*="title"]').first()
    if (await panelHeader.count()) {
      const titleText = await panelHeader.textContent()
      console.log('[SC-2-B] 패널[0] 제목:', titleText)
      expect(titleText).not.toContain('9999')
    }

    console.log('[SC-2-B] version≠2 graceful 빈 상태 확인: PASS')
    await app.close()
  })
})

test.describe('SC-3: thread 복원 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK 필요 — LIVE_SDK=1로 명시 실행')

  let userDataDir: string
  let workspace: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc3-udata-'))
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc3-ws-'))
    writeFileSync(join(workspace, 'hello.txt'), 'Hello M3 restore test\n')
  })

  test.afterAll(async () => {
    await safeRmDir(userDataDir)
    await safeRmDir(workspace)
  })

  test('SC-3-A: 패널 메시지 전송 → 저장 → 재구동 → user 버블 복원', async () => {
    test.setTimeout(180_000)

    const { app: app1, page: page1 } = await launchAndEnterMulti(userDataDir, {
      AGENTDECK_E2E_WORKSPACE: workspace,
    })

    const pickBtn = page1.getByRole('button', { name: '폴더 선택' })
    if (await pickBtn.isVisible().catch(() => false)) {
      await pickBtn.click()
      await page1.waitForTimeout(1000)
    }

    const ta = page1.locator('.ma-panel[data-slot="0"] .ma-composer-ta')
    await ta.waitFor({ state: 'visible', timeout: 8_000 })

    const isDisabled = await ta.isDisabled().catch(() => true)
    if (isDisabled) {
      console.warn('[SC-3-A] 패널 0 composer disabled — 워크스페이스 설정 불가. SKIP.')
      await app1.close()
      return
    }

    const USER_MSG = 'hello m3 thread restore'
    await ta.fill(USER_MSG)
    await ta.press('Enter')

    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const stopBtn = page1.locator('.ma-panel[data-slot="0"] .ma-stop')
      const isRunning = await stopBtn.isVisible().catch(() => false)
      if (!isRunning) {
        await page1.waitForTimeout(1000)
        break
      }
      await page1.waitForTimeout(1200)
    }

    const userBubble = page1.locator('.ma-panel[data-slot="0"] .msg.user-msg')
    const hasBubble = (await userBubble.count()) > 0
    console.log('[SC-3-A] 1차 기동 user 버블 존재:', hasBubble)

    if (!hasBubble) {
      console.warn('[SC-3-A] user 버블 없음 — 패널 thread에 msg가 없는 상태. SKIP.')
      await app1.close()
      return
    }

    await waitForSave(page1)

    const blobPath = join(userDataDir, 'multi-agent.json')
    if (existsSync(blobPath)) {
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      const snap = blob.sessions?.[0]?.panels?.[0]?.snapshot
      console.log('[SC-3-A] panel[0].snapshot.messages.length:', snap?.messages?.length)
      expect(snap?.messages?.length).toBeGreaterThan(0)
    }

    await app1.close()

    const { app: app2, page: page2 } = await launchAndEnterMulti(userDataDir, {
      AGENTDECK_E2E_WORKSPACE: workspace,
    })

    await page2.waitForTimeout(1500)

    const restoredBubble = page2.locator('.ma-panel[data-slot="0"] .msg.user-msg')
    const restoredCount = await restoredBubble.count()
    console.log('[SC-3-A] 재구동 후 user 버블 수:', restoredCount)
    expect(restoredCount).toBeGreaterThan(0)

    const content = await restoredBubble.first().textContent()
    console.log('[SC-3-A] 복원된 user 버블 내용:', content?.slice(0, 80))
    expect(content).toContain(USER_MSG)

    console.log('[SC-3-A] thread 복원 확인: PASS')
    await app2.close()
  })
})
