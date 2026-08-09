import type { Page } from '@playwright/test'
import { PERM_CARD, permChoiceSelector, type PermChoice } from './permSelectors'

export interface BootGateOptions {
  nickname?: string
  egAuthTimeoutMs?: number
  titlebarTimeoutMs?: number
  startupModalTimeoutMs?: number
  engineNoticeTimeoutMs?: number
}

export async function dismissStartupModal(page: Page, timeoutMs = 8000): Promise<void> {
  const modal = page.locator('.wn-overlay, .un-overlay')
  try {
    await modal.first().waitFor({ state: 'visible', timeout: timeoutMs })
  } catch { return }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(400)
    if (!(await modal.first().isVisible().catch(() => false))) return
    const btn = page.locator('.wn-nav-cta, .un-cta').first()
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
    await page.waitForTimeout(400)
  }
}

export async function dismissEngineNotice(page: Page, timeoutMs = 4000): Promise<void> {
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: timeoutMs })
    await later.click()
    await page.waitForTimeout(400)
  } catch { }
}

export async function passBootGates(page: Page, opts: BootGateOptions = {}): Promise<void> {
  const {
    nickname = 'e2e테스트',
    egAuthTimeoutMs = 4000,
    titlebarTimeoutMs = 15_000,
    startupModalTimeoutMs = 10_000,
    engineNoticeTimeoutMs = 12_000,
  } = opts

  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    await nick.fill(nickname)
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  const egSkip = page.locator('.eg-auth-dialog .sd-go')
  try {
    await egSkip.waitFor({ state: 'visible', timeout: egAuthTimeoutMs })
    await egSkip.click()
  } catch { }
  await page.waitForSelector('.titlebar', { timeout: titlebarTimeoutMs })
  await dismissStartupModal(page, startupModalTimeoutMs)
  await dismissEngineNotice(page, engineNoticeTimeoutMs)
}

export interface OpenWorkspaceOptions {
  waitForTree?: boolean
  treeTimeoutMs?: number
}

export async function openWorkspace(page: Page, opts: OpenWorkspaceOptions = {}): Promise<void> {
  const { waitForTree = true, treeTimeoutMs = 10_000 } = opts
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) {
    await pickFolder.click()
  }
  if (waitForTree) {
    await page.locator('.fe-node-name').first().waitFor({ state: 'visible', timeout: treeTimeoutMs })
  }
}

export interface SettleTurnOptions {
  timeoutMs?: number
  autoApprove?: PermChoice | false
}

export async function settleTurn(page: Page, opts: SettleTurnOptions = {}): Promise<void> {
  const { timeoutMs = 180_000, autoApprove = 'allow_always' } = opts
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (autoApprove) {
      const perm = page.locator(PERM_CARD)
      if (await perm.isVisible().catch(() => false)) {
        const opt = perm.locator(permChoiceSelector(autoApprove))
        await opt.click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
    }
    const running = page.getByLabel('실행 중단')
    const isRunning = await running.isVisible().catch(() => false)
    if (!isRunning) {
      await page.waitForTimeout(1500)
      return
    }
    await page.waitForTimeout(1200)
  }
}
