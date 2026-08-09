import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export interface IsolatedBootOptions {
  echo?: boolean
  nickname?: string
  slug?: string
  env?: Record<string, string>
}

export interface IsolatedBootResult {
  app: ElectronApplication
  page: Page
  workspace: string
  userDataDir: string
  teardown: () => Promise<void>
}

export async function isolatedBoot(options: IsolatedBootOptions = {}): Promise<IsolatedBootResult> {
  const slug = options.slug ?? 'agentdeck-e2e'
  const userDataDir = mkdtempSync(join(tmpdir(), `${slug}-udd-`))
  const workspace = mkdtempSync(join(tmpdir(), `${slug}-ws-`))

  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    AGENTDECK_E2E_WORKSPACE: workspace,
    AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    ...(options.env ?? {})
  }
  if (options.echo) childEnv.AGENTDECK_E2E = '1'
  else delete childEnv.AGENTDECK_E2E

  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: childEnv as Record<string, string>
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await Promise.race([
    page.waitForSelector('#nickname', { timeout: 25_000 }).catch(() => null),
    page.waitForSelector('.titlebar', { timeout: 25_000 }).catch(() => null)
  ])

  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill(options.nickname ?? 'tester')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
  }

  const gate = page.getByRole('button', { name: '계속 진행' })
  if (await gate.isVisible().catch(() => false)) await gate.click().catch(() => {})

  await page.waitForSelector('.titlebar', { timeout: 20_000 }).catch(() => {})

  const whatsNew = page.locator('.wn-overlay')
  if (await whatsNew.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '건너뛰기' }).click().catch(() => {})
    await whatsNew.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
  }
  await page.keyboard.press('Escape').catch(() => {})

  const singleTab = page.getByRole('tab', { name: /단일 에이전트/ })
  if (await singleTab.isVisible().catch(() => false)) await singleTab.click().catch(() => {})
  await page.locator('.pane.chat').waitFor({ state: 'visible', timeout: 15_000 })

  const input = page.locator('.pane.chat').getByLabel('메시지 입력')
  if (!(await input.isEnabled().catch(() => false))) {
    await page.keyboard.press('Control+o').catch(() => {})
    await page.waitForTimeout(600)
    const pick = page.getByRole('button', { name: '폴더 선택' })
    if (await pick.isVisible().catch(() => false)) await pick.click().catch(() => {})
    await page.waitForTimeout(600)
  }

  let torn = false
  const teardown = async (): Promise<void> => {
    if (torn) return
    torn = true
    await app.close().catch(() => {})
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(workspace, { recursive: true, force: true })
  }

  return { app, page, workspace, userDataDir, teardown }
}
