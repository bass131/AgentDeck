import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const RUN = process.env.LM1E2E === '1'

const SHOT_DIR = join(process.cwd(), '01_Phases', '19_LM1-live-model-switch', 'ScreenShot')

let app: ElectronApplication
let page: Page
let workspace: string
let userDataDir: string

async function capture(name: string): Promise<void> {
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: false })
}

async function waitTurnSettled(timeoutMs = 240_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const running = await page.getByLabel('실행 중단').isVisible().catch(() => false)
    if (!running) {
      await page.waitForTimeout(1200)
      return
    }
    await page.waitForTimeout(1000)
  }
  throw new Error(`턴이 ${timeoutMs}ms 안에 끝나지 않음`)
}

async function send(text: string): Promise<void> {
  const input = page.getByLabel('메시지 입력')
  await input.click()
  await input.fill(text)
  await input.press('Enter')
}

const SAMPLE_TS = `export interface User {
  id: number
  name: string
}
`

test.describe('LM1 라이브 모델 전환 통주 (opt-in: LM1E2E=1)', () => {
  test.skip(!RUN, 'LM1 라이브 인수 — LM1E2E=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(90_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-lm1-'))
    writeFileSync(join(workspace, 'sample.ts'), SAMPLE_TS)

    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-lm1-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: 'lm1live' })
    await openWorkspace(page, { waitForTree: true })
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('진행 중 REPL 세션에서 모델 라이브 전환 → 후속 턴 응답 성립 (P02 semantics b)', async () => {
    test.setTimeout(600_000)

    await send('Reply with exactly READY and end your turn. Do not use any tools.')
    await waitTurnSettled()
    await capture('01-repl-turn1-default-model')

    await page.getByLabel('모델 선택').click()
    await expect(page.locator('.pick-menu')).toBeVisible()
    await expect(page.locator('.pick-menu-note')).toContainText('다음 응답부터 적용')
    await capture('02-model-picker-note-open')

    await page.locator('.pick-menu .pick-opt', { hasText: 'Sonnet 5' }).first().click()
    await expect(page.locator('.pick-menu')).toHaveCount(0)

    await expect(page.getByLabel('모델 선택').locator('.pick-val')).toHaveText('Sonnet 5')
    await capture('03-model-switched-picker-value')

    await send('Reply exactly MODEL_TURN_OK and nothing else. Do not use any tools.')
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('MODEL_TURN_OK', {
      timeout: 240_000
    })
    await waitTurnSettled(60_000)
    await capture('04-model-changed-followup-turn')

    await expect(page.getByLabel('모델 선택').locator('.pick-val')).toHaveText('Sonnet 5')
  })
})
