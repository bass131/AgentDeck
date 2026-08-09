import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let page: Page

const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

function cmpVer(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

test.beforeAll(async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const workspace = mkdtempSync(join(tmpdir(), 'agentdeck-engupd-'))
  writeFileSync(join(workspace, 'README.md'), '# 엔진 업데이트 e2e\n')
  const userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-engupd-udata-'))

  app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_ENGINE_INSTALL: '1',
      AGENTDECK_E2E_NO_ENGINE_UPDATE: ''
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForSelector('.login-body, .titlebar, .eg-auth-dialog, .boot-splash', { timeout: 15_000 })
  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    await nick.fill('엔진QA')
    await page.locator('.login-body button.submit').click()
  }
  const egSkip = page.locator('.eg-auth-dialog .sd-go')
  try {
    await egSkip.waitFor({ state: 'visible', timeout: 3000 })
    await egSkip.click()
  } catch {
  }
  await page.waitForSelector('.titlebar', { timeout: 15_000 })
})

test.afterAll(async () => {
  await app?.close()
})

test('checkEngineUpdate IPC가 실 npm registry로 generic EngineUpdateInfo를 반환한다', async () => {
  const info = await page.evaluate(() => window.api.checkEngineUpdate())
  console.log('[engine-update] checkEngineUpdate():', JSON.stringify(info))

  expect(Object.keys(info).sort()).toEqual(['current', 'latest', 'updateAvailable'])

  expect(info.current).toMatch(/^\d+\.\d+\.\d+/)

  if (info.latest === null) {
    expect(info.updateAvailable).toBe(false)
    console.log('[engine-update] latest=null (오프라인) — graceful 경로')
    return
  }

  expect(info.latest).toMatch(/^\d+\.\d+\.\d+/)
  expect(info.updateAvailable).toBe(cmpVer(info.current as string, info.latest) < 0)
})

test('"새 엔진 버전" 프롬프트 → "업데이트" 클릭 → 설치 로그 스트리밍 → 완료', async () => {
  const info = await page.evaluate(() => window.api.checkEngineUpdate())

  const wn = page.locator('.wn-overlay')
  try {
    await wn.waitFor({ state: 'visible', timeout: 2000 })
    await page.locator('.wn-overlay .wn-nav-cta').click()
    await expect(wn).toHaveCount(0)
  } catch {
  }

  if (!info.updateAvailable) {
    console.log('[engine-update] updateAvailable=false — 팝업 미표시 정상')
    await expect(page.locator('.set-dialog .sd-title', { hasText: '새 엔진 버전' })).toHaveCount(0)
    return
  }

  const dialog = page.locator('.set-dialog', { has: page.locator('.sd-title', { hasText: '새 엔진 버전' }) })
  await dialog.waitFor({ state: 'visible', timeout: 12_000 })
  const msg = await dialog.locator('.sd-msg').innerText()
  console.log('[engine-update] 프롬프트 메시지:', msg)
  expect(msg).toContain(info.current as string)
  expect(msg).toContain(info.latest as string)
  await expect(dialog.locator('.sd-cancel', { hasText: '나중에' })).toBeVisible()
  const updateBtn = dialog.locator('.sd-go', { hasText: '업데이트' })
  await expect(updateBtn).toBeVisible()
  await page.screenshot({ path: join(SHOT_DIR, 'engine-update-prompt.png'), fullPage: false })

  await updateBtn.click()
  const card = page.locator('.install-card')
  await card.waitFor({ state: 'visible', timeout: 8000 })
  await expect(card.locator('.ic-log .ic-ln').first()).toBeVisible({ timeout: 8000 })
  const logLines = await card.locator('.ic-log .ic-ln').count()
  console.log('[engine-update] 설치 로그 라인 수:', logLines)
  expect(logLines).toBeGreaterThan(0)
  await page.screenshot({ path: join(SHOT_DIR, 'engine-update-installing.png'), fullPage: false })

  await card.locator('.ic-title', { hasText: '설치 완료' }).waitFor({ state: 'visible', timeout: 8000 })
  await page.screenshot({ path: join(SHOT_DIR, 'engine-update-done.png'), fullPage: false })
  await card.locator('.sd-go', { hasText: '확인' }).click()
  await expect(page.locator('.install-card')).toHaveCount(0)
})
