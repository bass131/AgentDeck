import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.GAP1DOGFOOD2 === '1'

const SHOT_DIR = join(process.cwd(), '01_Phases', '17_GAP1-core-parity', 'ScreenShot')

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

async function pick(ariaLabel: string, optionText: string): Promise<void> {
  await page.getByLabel(ariaLabel).click()
  await expect(page.locator('.pick-menu')).toBeVisible()
  await page.locator('.pick-menu .pick-opt', { hasText: optionText }).first().click()
  await expect(page.locator('.pick-menu')).toHaveCount(0)
}

const SAMPLE_TS = `export interface User {
  id: number
  name: string
}

export function greet(name: string): string {
  return \`Hello, \${name}\`
}
`

const SERVER_MJS = `let n = 0
console.log('[dev-server] started — watching for changes')
const t = setInterval(() => {
  n += 1
  console.log('[dev-server] tick ' + n + ' — serving http://localhost:5173')
  if (n >= 600) { clearInterval(t); process.exit(0) }
}, 500)
`

test.describe('GAP1 dogfood 보완 통주 (opt-in: GAP1DOGFOOD2=1)', () => {
  test.skip(!RUN, 'GAP1 마감 인수 보완 — GAP1DOGFOOD2=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(90_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-dogfood2-'))
    writeFileSync(join(workspace, 'sample.ts'), SAMPLE_TS)
    writeFileSync(join(workspace, 'server.mjs'), SERVER_MJS)

    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-dogfood2-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: 'dogfood2' })
    await openWorkspace(page, { waitForTree: true })
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('A) ⑦ 재수행 — 백그라운드 태스크 정지 전이(P09)', async () => {
    test.setTimeout(300_000)

    await send(
      'Start the dev server in the background: call the Bash tool exactly once with command ' +
        '`node server.mjs` and `run_in_background: true`. Immediately after starting it, reply ' +
        'exactly BG_STARTED and end your turn. Do not call TaskOutput, Monitor, TaskStop or any ' +
        'other tool, and do not wait for the server.'
    )

    await page.locator('[data-testid="bg-badge"]').first().waitFor({ state: 'visible', timeout: 240_000 })
    const tail = page.locator('[data-testid="bg-tail-view"]').first()
    await expect(tail).toContainText('tick', { timeout: 90_000 })
    await waitTurnSettled()

    const stopBtn = page.locator('[data-testid="bg-stop-btn"]').first()
    await stopBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await stopBtn.click()
    await page
      .locator('[data-testid="bg-stop-btn"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 60_000 })
    await expect(tail).toBeVisible()
    await capture('10-bg-task-stopped')
  })

  test('B) ④/⑤ 재수행 — 새 대화 + plan 모드 시작 → 계획 검토·승인 → 파일 수정 승인', async () => {
    test.setTimeout(480_000)

    const newChat = page.getByRole('button', { name: /새 대화/ })
    if (await newChat.isVisible().catch(() => false)) {
      await newChat.click()
    } else {
      await page.keyboard.press('Control+n')
    }
    await page.waitForTimeout(800)

    await pick('모드 선택', '플랜')
    await send(
      'Plan the following change: add a function `farewell(name: string): string` that returns ' +
        '`Bye, ${name}` to sample.ts. Keep the plan short (under 6 lines), then exit plan mode ' +
        'to request approval.'
    )

    const planCard = page.locator(`${PERM_CARD}[data-plan-mode]`)
    await planCard.waitFor({ state: 'visible', timeout: 300_000 })

    const toggle = planCard.locator('[data-plan-toggle]')
    if (await toggle.count()) await toggle.click()
    await page.waitForTimeout(300)
    await capture('05-plan-approval-card')

    expect(await planCard.locator('[data-perm-choice="allow_always"]').count()).toBe(0)
    await planCard.locator('[data-perm-choice="allow"]').click()

    let editCardSeen = false
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const nonPlanCard = page.locator(`${PERM_CARD}:not([data-plan-mode])`)
      if (await nonPlanCard.isVisible().catch(() => false)) {
        if (!editCardSeen) {
          editCardSeen = true
          await capture('05b-plan-exec-edit-permission')
        }
        await nonPlanCard.locator('[data-perm-choice="allow"]').click()
        await page.waitForTimeout(800)
        continue
      }
      const running = await page.getByLabel('실행 중단').isVisible().catch(() => false)
      if (!running) break
      await page.waitForTimeout(1000)
    }
    await waitTurnSettled(60_000)
    test.info().annotations.push({
      type: 'plan-exec-path',
      description: editCardSeen ? '실행 단계 권한 카드 승인(plan-direct)' : '권한 카드 없이 자동 실행(관측 기록)',
    })

    const edited = readFileSync(join(workspace, 'sample.ts'), 'utf8')
    expect(edited).toContain('farewell')
    await capture('05c-plan-executed-thread')

    const thinking = page.locator('[data-testid="thinking-block"]')
    if (await thinking.count()) {
      await thinking.last().locator('[data-testid="thinking-toggle"]').click()
      await page.waitForTimeout(300)
      await capture('11-thinking-block-live')
    }
    const hookTl = page.locator('[data-testid="hook-timeline"]')
    if (await hookTl.count()) {
      await hookTl.locator('[data-testid="hook-timeline-summary"]').click()
      await page.waitForTimeout(300)
      await capture('12-hook-timeline-live')
    }
  })
})
