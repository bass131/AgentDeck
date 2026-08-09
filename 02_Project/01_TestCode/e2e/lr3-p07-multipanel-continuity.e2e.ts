import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

const COUNT_MESSAGE = '1부터 40까지 아주 천천히, 각 숫자마다 짧은 한마디를 붙여 한 줄씩 세어줘.'

function parseMaxCount(text: string): number {
  const lineLead = [...text.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[.:)]/g)].map((m) => Number(m[1]))
  if (lineLead.length > 0) return Math.max(...lineLead)
  const cleaned = text.replace(/\d{1,3}\s*부터/g, '').replace(/\d{1,3}\s*까지/g, '')
  const all = [...cleaned.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]))
  return all.length > 0 ? Math.max(...all) : -1
}

async function readPanel1MaxCount(page: Page): Promise<{ max: number; raw: string }> {
  const nodes = page.locator('.ma-panel').first().locator('.msg.ai-msg .content')
  const n = await nodes.count()
  if (n === 0) return { max: -1, raw: '' }
  const texts = await nodes.allInnerTexts()
  const raw = texts.join('\n---\n')
  return { max: parseMaxCount(raw), raw }
}

async function waitForPanel1MaxCountAtLeast(page: Page, min: number, timeoutMs: number): Promise<{ max: number; raw: string }> {
  const deadline = Date.now() + timeoutMs
  let last = { max: -1, raw: '' }
  while (Date.now() < deadline) {
    last = await readPanel1MaxCount(page)
    if (last.max >= min) return last
    await page.waitForTimeout(1000)
  }
  return last
}

async function panel1IsRunning(page: Page): Promise<boolean> {
  return page
    .locator('.ma-panel')
    .first()
    .locator('.ma-stop, [aria-label="중단"]')
    .first()
    .isVisible()
    .catch(() => false)
}

async function waitPanel1Idle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1000)
  while (Date.now() < deadline) {
    if (!(await panel1IsRunning(page))) {
      await page.waitForTimeout(500)
      return
    }
    await page.waitForTimeout(1000)
  }
}

async function launchAndEnterMulti(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('p07-probe')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    if (await skip.isVisible().catch(() => false)) await skip.click()
  } catch {
  }
  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(150)
  }
  await expect(page.locator('.pane.chat')).toBeVisible({ timeout: 15_000 })
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) {
    await pickFolder.click()
    await page.waitForTimeout(1000)
  }
  await page.locator('.sb-mode .sb-mode-btn').nth(1).click()
  await expect(page.locator('.multi')).toBeVisible()
  return { app, page }
}

test.describe('LR3 Phase 07: 멀티패널 전환-연속성(스트림 증발) 라이브 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('패널1 카운트 스트리밍 중 → single 전환 → 3초 대기 → multi 복귀: 진행 이어짐 여부', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'p07-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'p07-ws-'))

    const { app, page } = await launchAndEnterMulti(userDataDir, workspace)

    const ta = page.locator('.ma-panel').first().locator('.ma-composer-ta')
    await ta.click()
    await ta.fill(COUNT_MESSAGE)
    await ta.press('Enter')

    const before = await waitForPanel1MaxCountAtLeast(page, 3, 90_000)
    const runningAtSwitch = await panel1IsRunning(page)
    console.log('[P07] beforeSwitch 최대 카운트:', before.max, '| 스트리밍중:', runningAtSwitch)
    console.log('[P07] beforeSwitch 원문(일부):', before.raw.slice(0, 200))

    await page.locator('.sb-mode .sb-mode-btn').nth(0).click()
    await expect(page.locator('.pane.chat')).toBeVisible()
    await expect(page.locator('.multi')).toHaveCount(0)

    await page.waitForTimeout(3_000)

    await page.locator('.sb-mode .sb-mode-btn').nth(1).click()
    await expect(page.locator('.multi')).toBeVisible()
    await page.waitForTimeout(1000)

    const after = await readPanel1MaxCount(page)
    const runningAfterReturn = await panel1IsRunning(page)
    console.log('[P07] afterReturn 최대 카운트:', after.max, '| 복귀 직후 스트리밍중:', runningAfterReturn)
    console.log('[P07] afterReturn 원문(일부):', after.raw.slice(0, 200))

    await waitPanel1Idle(page, 90_000)
    await page.waitForTimeout(8_000)
    const final = await readPanel1MaxCount(page)
    const runningAtFinal = await panel1IsRunning(page)
    console.log('[P07] finalMax 최대 카운트:', final.max, '| 최종 스트리밍중:', runningAtFinal)
    console.log('[P07] finalMax 원문(일부):', final.raw.slice(0, 200))

    await app.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { }

    const seamless = after.max > before.max || final.max >= 35
    expect(
      seamless,
      `PRIMARY: 멀티→단일→멀티 전환 중 패널1 진행이 끊기지 않아야 함 — beforeSwitch=${before.max}, ` +
      `afterReturn=${after.max}, finalMax=${final.max}, 전환직전스트리밍=${runningAtSwitch}, ` +
      `복귀직후스트리밍=${runningAfterReturn}`,
    ).toBe(true)
  })
})
