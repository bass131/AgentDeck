import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { focusRestoredWindow } from './helpers/relaunchFocus'

const ARTIFACTS = join(tmpdir(), 'lr4-p07-artifacts')

async function withShot(page: Page, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    try {
      mkdirSync(ARTIFACTS, { recursive: true })
      await page.screenshot({ path: join(ARTIFACTS, `${name}.png`), fullPage: true })
      console.log(`[LR4-P07] FAIL 스크린샷: ${join(ARTIFACTS, `${name}.png`)}`)
    } catch { }
    throw e
  }
}

async function safeRmDir(dir: string): Promise<void> {
  if (!dir) return
  for (let attempt = 0; attempt < 5; attempt++) {
    try { rmSync(dir, { recursive: true, force: true }); return }
    catch { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))) }
  }
  console.warn(`[cleanup] rmSync 실패(무시): ${dir}`)
}

function makeWorkspace(slug: string): string {
  const ws = mkdtempSync(join(tmpdir(), `${slug}-ws-`))
  writeFileSync(join(ws, 'sample.ts'), 'export const sample = 1\nconst value = 2\n')
  return ws
}

async function launchSingle(
  userDataDir: string,
  workspace: string,
  opts: { openFolder?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_PICK_FOLDER: workspace,
      AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await focusRestoredWindow(app, page)

  await Promise.race([
    page.waitForSelector('#nickname', { timeout: 25_000 }).catch(() => null),
    page.waitForSelector('.titlebar', { timeout: 25_000 }).catch(() => null),
  ])
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('p07테스트')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  const gate = page.locator('.eg-auth-dialog .sd-go')
  if (await gate.isVisible().catch(() => false)) await gate.click().catch(() => {})

  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) }
  await expect(page.locator('.pane.chat')).toBeVisible({ timeout: 15_000 })

  if (opts.openFolder !== false) {
    await page.waitForTimeout(1500)
    const input = page.locator('.pane.chat').getByLabel('메시지 입력')
    if (!(await input.isEnabled().catch(() => false))) {
      const pick = page.getByRole('button', { name: '폴더 선택' })
      if (await pick.isVisible().catch(() => false)) { await pick.click(); await page.waitForTimeout(800) }
    }
  }
  return { app, page }
}

async function launchMulti(
  userDataDir: string,
  workspace: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_PICK_FOLDER: workspace,
      AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await focusRestoredWindow(app, page)

  const nick = page.locator('.login-body input#nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('p07테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { }

  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 6_000 })
    await skip.click(); await page.waitForTimeout(500)
  } catch { }

  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  try {
    const modal = page.locator('.wn-overlay, .un-overlay')
    await modal.first().waitFor({ state: 'visible', timeout: 5_000 })
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
      if (!(await modal.first().isVisible().catch(() => false))) break
    }
  } catch { }
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: 4_000 })
    await later.click(); await page.waitForTimeout(400)
  } catch { }

  const multiBtn = page.locator('.sb-mode-btn', { hasText: '멀티 에이전트' })
  await multiBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if ((await multiBtn.getAttribute('aria-selected')) !== 'true') {
    await multiBtn.click()
  }
  await page.locator('.multi').waitFor({ state: 'visible', timeout: 10_000 })
  return { app, page }
}

function singleToggle(page: Page) {
  return page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
}
async function setSingleRepl(page: Page, on: boolean): Promise<void> {
  const t = singleToggle(page)
  await t.waitFor({ state: 'visible', timeout: 10_000 })
  const pressed = (await t.getAttribute('aria-pressed')) === 'true'
  if (pressed !== on) {
    await t.click()
    await expect(t).toHaveAttribute('aria-pressed', String(on), { timeout: 5_000 })
  }
}
async function expectSingleRepl(page: Page, on: boolean): Promise<void> {
  await expect(singleToggle(page)).toHaveAttribute('aria-pressed', String(on), { timeout: 10_000 })
}

async function sendSingle(page: Page, text: string): Promise<void> {
  const input = page.locator('.pane.chat').getByLabel('메시지 입력')
  await input.waitFor({ state: 'visible', timeout: 10_000 })
  await expect(input).toBeEnabled({ timeout: 10_000 })
  await input.click()
  await input.fill(text)
  await input.press('Enter')
  await expect(page.locator('.pane.chat .msg.ai-msg .content').last()).toContainText('echo:', { timeout: 20_000 })
  await page.waitForTimeout(1500)
}

async function selectSidebar(page: Page, title: string): Promise<void> {
  const item = page.locator('.sb-item', { hasText: title }).first()
  await item.waitFor({ state: 'visible', timeout: 10_000 })
  await item.scrollIntoViewIfNeeded().catch(() => {})
  await item.click()
  await page.waitForTimeout(900)
}

function panelToggle(page: Page, slot: number) {
  return page.locator(`.ma-panel[data-slot="${slot}"]`).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
}
async function setPanelRepl(page: Page, slot: number, on: boolean): Promise<void> {
  const t = panelToggle(page, slot)
  await t.waitFor({ state: 'visible', timeout: 10_000 })
  const pressed = (await t.getAttribute('aria-pressed')) === 'true'
  if (pressed !== on) {
    await t.click()
    await expect(t).toHaveAttribute('aria-pressed', String(on), { timeout: 5_000 })
  }
}
async function expectPanelRepl(page: Page, slot: number, on: boolean): Promise<void> {
  await expect(panelToggle(page, slot)).toHaveAttribute('aria-pressed', String(on), { timeout: 10_000 })
}
async function setCount(page: Page, n: number): Promise<void> {
  const btn = page.locator('[aria-label="패널 수"] .ma-count-btn', { hasText: String(n) })
  await btn.waitFor({ state: 'visible', timeout: 8_000 })
  await btn.click()
  await expect(btn).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 })
  await page.waitForTimeout(500)
}
async function ensurePanelFolder(page: Page, slot: number): Promise<void> {
  const folderBtn = page.locator(`.ma-panel[data-slot="${slot}"] .ma-p-folder`)
  await folderBtn.waitFor({ state: 'visible', timeout: 8_000 })
  const label = await folderBtn.locator('.ma-p-folder-name').textContent()
  if (label && label.includes('폴더 선택')) {
    await folderBtn.click()
    await page.waitForTimeout(700)
  }
}
async function sendPanel(page: Page, slot: number, text: string): Promise<void> {
  const ta = page.locator(`.ma-panel[data-slot="${slot}"] .ma-composer-ta`)
  await ta.waitFor({ state: 'visible', timeout: 8_000 })
  await expect(ta).toBeEnabled({ timeout: 10_000 })
  await ta.fill(text)
  await ta.press('Enter')
  const stop = page.locator(`.ma-panel[data-slot="${slot}"] .ma-stop`)
  const deadline = Date.now() + 20_000
  await page.waitForTimeout(500)
  while (Date.now() < deadline) {
    if (!(await stop.isVisible().catch(() => false))) break
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(500)
}
async function waitMultiSave(page: Page): Promise<void> {
  await page.waitForTimeout(1400)
}

test.describe('LR4-P07 S1: 단일챗 세션별 독립', () => {
  test('A(OFF)/B(기본 ON) — 전환 시 각자 유지', async () => {
    test.setTimeout(120_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s1-udd-'))
    const workspace = makeWorkspace('lr4p07-s1')
    const { app, page } = await launchSingle(userDataDir, workspace)
    try {
      await withShot(page, 's1-flow', async () => {
        await setSingleRepl(page, false)
        await sendSingle(page, '메시지 A 독립검증')

        await page.getByRole('button', { name: '새 대화' }).click()
        await expectSingleRepl(page, true)
        await sendSingle(page, '메시지 B 독립검증')

        await selectSidebar(page, '메시지 A 독립검증')
        await expectSingleRepl(page, false)

        await selectSidebar(page, '메시지 B 독립검증')
        await expectSingleRepl(page, true)
      })
    } finally {
      await app.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})

test.describe('LR4-P07 S2: 재시작 복원', () => {
  test('send 후 close → 같은 userData 재기동 → A=OFF·B=ON 복원', async () => {
    test.setTimeout(150_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s2-udd-'))
    const workspace = makeWorkspace('lr4p07-s2')

    const { app: app1, page: page1 } = await launchSingle(userDataDir, workspace)
    try {
      await withShot(page1, 's2-build', async () => {
        await setSingleRepl(page1, false)
        await sendSingle(page1, '메시지 A 재시작검증')
        await page1.getByRole('button', { name: '새 대화' }).click()
        await expectSingleRepl(page1, true)
        await sendSingle(page1, '메시지 B 재시작검증')
        await page1.waitForTimeout(1500)
      })

      const chatsDir = join(userDataDir, 'chats')
      const modes: Record<string, boolean | undefined> = {}
      if (existsSync(chatsDir)) {
        for (const f of readdirSync(chatsDir).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
          const rec = JSON.parse(readFileSync(join(chatsDir, f), 'utf8')) as { title?: string; replMode?: boolean }
          if (rec.title?.includes('메시지 A')) modes.A = rec.replMode
          if (rec.title?.includes('메시지 B')) modes.B = rec.replMode
        }
      }
      console.log('[LR4-P07 S2] 디스크 replMode — A:', modes.A, 'B:', modes.B)
      expect(modes.A, '대화 A는 replMode=false 영속(false 소실 방어)').toBe(false)
      expect(modes.B, '대화 B는 replMode=true 영속').toBe(true)
    } finally {
      await app1.close()
    }

    const { app: app2, page: page2 } = await launchSingle(userDataDir, workspace)
    try {
      await withShot(page2, 's2-restore', async () => {
        await page2.waitForTimeout(2000)
        await selectSidebar(page2, '메시지 A 재시작검증')
        await expectSingleRepl(page2, false)
        await selectSidebar(page2, '메시지 B 재시작검증')
        await expectSingleRepl(page2, true)
      })
    } finally {
      await app2.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})

test.describe('LR4-P07 S3: 하위호환 마이그레이션', () => {
  test('replMode 필드 없는 옛 대화 JSON 시드 → 크래시 0 + 기본 ON 폴백', async () => {
    test.setTimeout(120_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s3-udd-'))
    const workspace = makeWorkspace('lr4p07-s3')

    const chatsDir = join(userDataDir, 'chats')
    mkdirSync(chatsDir, { recursive: true })
    const oldId = randomUUID()
    const oldChat = {
      id: oldId,
      title: '옛 대화 마이그전',
      messages: [
        { role: 'user', content: '예전 질문' },
        { role: 'assistant', content: '예전 응답' },
      ],
      backendId: 'claude-code',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      custom_title: false,
      cwd: workspace.replace(/\\/g, '/'),
    }
    writeFileSync(join(chatsDir, `${oldId}.json`), JSON.stringify(oldChat))
    writeFileSync(join(chatsDir, 'index.json'), JSON.stringify({ version: 1, ids: [oldId] }))
    writeFileSync(
      join(userDataDir, 'ui-prefs.json'),
      JSON.stringify({ 'conversation.lastActiveId': oldId, 'workspace.mode': 'single' }, null, 2),
    )

    const { app, page } = await launchSingle(userDataDir, workspace, { openFolder: false })
    try {
      await withShot(page, 's3-migration', async () => {
        await expect(page.locator('.titlebar')).toBeVisible()
        await expect(page.locator('.pane.chat')).toBeVisible()
        await page.waitForTimeout(2000)

        await selectSidebar(page, '옛 대화 마이그전')
        await expectSingleRepl(page, true)

        const msgs = await page.locator('.pane.chat .msg').count()
        console.log('[LR4-P07 S3] 복원 msg 수:', msgs)
        expect(msgs, '옛 대화 메시지 로드(크래시 0)').toBeGreaterThan(0)
      })
    } finally {
      await app.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})

test.describe('LR4-P07 S4: 멀티 패널 독립+복원', () => {
  test('패널0(OFF)/패널1(ON) send → 재시작 → 패널별 복원', async () => {
    test.setTimeout(180_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s4-udd-'))
    const workspace = makeWorkspace('lr4p07-s4')

    const { app: app1, page: page1 } = await launchMulti(userDataDir, workspace)
    try {
      await withShot(page1, 's4-build', async () => {
        await setCount(page1, 2)
        await ensurePanelFolder(page1, 0)
        await ensurePanelFolder(page1, 1)

        await setPanelRepl(page1, 0, false)
        await expectPanelRepl(page1, 1, true)

        await sendPanel(page1, 0, '패널0 독립검증 메시지')
        await sendPanel(page1, 1, '패널1 독립검증 메시지')

        await expectPanelRepl(page1, 0, false)
        await expectPanelRepl(page1, 1, true)
        await waitMultiSave(page1)
      })

      const blobPath = join(userDataDir, 'multi-agent.json')
      expect(existsSync(blobPath), 'multi-agent.json 존재').toBe(true)
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      const p0 = blob.sessions?.[0]?.panels?.[0]?.snapshot?.replMode
      const p1 = blob.sessions?.[0]?.panels?.[1]?.snapshot?.replMode
      console.log('[LR4-P07 S4] 디스크 snapshot.replMode — p0:', p0, 'p1:', p1)
      expect(p0, '패널0 snapshot.replMode=false 영속').toBe(false)
      expect(p1, '패널1 snapshot.replMode=true 영속').toBe(true)
    } finally {
      await app1.close()
    }

    const { app: app2, page: page2 } = await launchMulti(userDataDir, workspace)
    try {
      await withShot(page2, 's4-restore', async () => {
        await page2.waitForTimeout(2000)
        await expectPanelRepl(page2, 0, false)
        await expectPanelRepl(page2, 1, true)
      })
    } finally {
      await app2.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})
