import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.GAP1DOGFOOD === '1'

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

const UTIL_TS = `import { greet } from './sample'

export function greetAll(names: string[]): string[] {
  return names.map((n) => greet(n))
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

let step5Path: 'plan-direct' | 'fallback-normal' | 'none' = 'none'

test.describe('GAP1 dogfood 시나리오 통주 (opt-in: GAP1DOGFOOD=1)', () => {
  test.skip(!RUN, 'GAP1 마감 인수 통주 — GAP1DOGFOOD=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(90_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-dogfood-'))
    writeFileSync(join(workspace, 'sample.ts'), SAMPLE_TS)
    writeFileSync(join(workspace, 'util.ts'), UTIL_TS)
    writeFileSync(join(workspace, 'server.mjs'), SERVER_MJS)
    writeFileSync(join(workspace, 'README.md'), '# dogfood 워크스페이스\n\nGAP1 인수 통주용.\n')

    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-dogfood-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: 'dogfood' })
    await openWorkspace(page, { waitForTree: true })
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('① dev 서버 백그라운드 시작 — bg 배지 카드 등장', async () => {
    test.setTimeout(300_000)

    await send(
      'Start the dev server in the background: call the Bash tool exactly once with command ' +
        '`node server.mjs` and `run_in_background: true`. Immediately after starting it, reply ' +
        'exactly BG_STARTED and end your turn. Do not call TaskOutput, Monitor, TaskStop or any ' +
        'other tool, and do not wait for the server.'
    )

    await page.locator('[data-testid="bg-badge"]').first().waitFor({ state: 'visible', timeout: 240_000 })
    await capture('01-bg-dev-server-started')

    await waitTurnSettled()
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('BG_STARTED')
  })

  test('② 증분 로그 라이브 관찰 — tail 성장 + raw 고스트 억제', async () => {
    test.setTimeout(180_000)

    const tail = page.locator('[data-testid="bg-tail-view"]').first()
    await tail.waitFor({ state: 'visible', timeout: 60_000 })
    await expect(tail).toContainText('tick', { timeout: 90_000 })

    const before = (await tail.textContent()) ?? ''
    await page.waitForFunction(
      (prevLen) => {
        const el = document.querySelector('[data-testid="bg-tail-view"]')
        return !!el && (el.textContent ?? '').length > prevLen
      },
      before.length,
      { timeout: 60_000 }
    )

    const bgItem = page.locator('.t-item', { has: page.locator('[data-testid="bg-badge"]') }).first()
    expect(await bgItem.locator('.bo-ghost').count()).toBe(0)

    await capture('02-bg-tail-live')
  })

  test('③ 검색 결과 클릭으로 파일 열기 (P08)', async () => {
    test.setTimeout(300_000)

    await send(
      'Call the Grep tool exactly once with pattern "greet" and output_mode "content" over this ' +
        'workspace, then reply exactly SEARCH_DONE and end your turn. Do not use any other tools.'
    )
    await waitTurnSettled()
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('SEARCH_DONE')

    const searchRow = page.locator('.t-item.t-search .t-row').last()
    await searchRow.click()
    await page.locator('[data-search-file]').first().waitFor({ state: 'visible', timeout: 10_000 })
    await expect(page.locator('[data-search-match]').first()).toBeVisible()
    await capture('03-search-result-render')

    await page.locator('[data-search-match]').first().click()
    await page.waitForSelector('.fv-overlay .diff-head', { timeout: 15_000 })
    await capture('04-search-click-open-file')
    await page.keyboard.press('Escape')
    await expect(page.locator('.fv-overlay')).toHaveCount(0)
  })

  test('④ plan 모드 계획 검토·승인 (P07)', async () => {
    test.setTimeout(360_000)

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
    await capture('05-plan-approval-card')

    expect(await planCard.locator('[data-perm-choice="allow_always"]').count()).toBe(0)
    await planCard.locator('[data-perm-choice="allow"]').click()
  })

  test('⑤ 파일 수정 승인', async () => {
    test.setTimeout(360_000)

    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const nonPlanCard = page.locator(`${PERM_CARD}:not([data-plan-mode])`)
      if (await nonPlanCard.isVisible().catch(() => false)) {
        step5Path = 'plan-direct'
        await capture('06-file-edit-permission')
        await nonPlanCard.locator('[data-perm-choice="allow"]').click()
        await page.waitForTimeout(800)
        continue
      }
      const running = await page.getByLabel('실행 중단').isVisible().catch(() => false)
      if (!running) break
      await page.waitForTimeout(1000)
    }
    await waitTurnSettled(60_000)

    if (step5Path === 'none') {
      await pick('모드 선택', '일반')
      await send(
        'Use the Edit tool exactly once on sample.ts: change the returned greeting prefix from ' +
          '"Hello," to "Hi,". Then reply exactly EDIT_DONE and end your turn.'
      )
      const card = page.locator(`${PERM_CARD}:not([data-plan-mode])`)
      await card.waitFor({ state: 'visible', timeout: 240_000 })
      step5Path = 'fallback-normal'
      await capture('06-file-edit-permission')
      await card.locator('[data-perm-choice="allow"]').click()
      await waitTurnSettled()
    }

    const edited = readFileSync(join(workspace, 'sample.ts'), 'utf8')
    expect(edited === SAMPLE_TS).toBe(false)
    await capture('07-file-edited-thread')
  })

  test('⑥ 모델 변경 후 같은 세션 후속 턴 (P02 semantics b)', async () => {
    test.setTimeout(300_000)

    await page.getByLabel('모델 선택').click()
    await expect(page.locator('.pick-menu')).toBeVisible()
    await expect(page.locator('.pick-menu-note')).toContainText('다음 응답부터 적용')
    await capture('08-model-picker-note')
    await page.locator('.pick-menu .pick-opt', { hasText: 'Sonnet 5' }).first().click()
    await expect(page.locator('.pick-menu')).toHaveCount(0)

    await send('Reply exactly MODEL_TURN_OK and nothing else. Do not use any tools.')
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('MODEL_TURN_OK', {
      timeout: 240_000
    })
    await waitTurnSettled(60_000)
    await capture('09-model-changed-followup-turn')
  })

  test('⑦(추가 채증) 백그라운드 태스크 정지 전이 (P09)', async () => {
    test.setTimeout(120_000)

    const stopBtn = page.locator('[data-testid="bg-stop-btn"]').first()
    await stopBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await stopBtn.click()
    await page
      .locator('[data-testid="bg-stop-btn"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 60_000 })
    await expect(page.locator('[data-testid="bg-tail-view"]').first()).toBeVisible()
    await capture('10-bg-task-stopped')
  })

  test('⑧(조건부 채증) 확장 사고 블록·훅 타임라인·최종 셸', async () => {
    test.setTimeout(120_000)

    const thinking = page.locator('[data-testid="thinking-block"]')
    if (await thinking.count()) {
      await thinking.last().locator('[data-testid="thinking-toggle"]').click()
      await page.waitForTimeout(300)
      await capture('11-thinking-block-live')
      test.info().annotations.push({ type: 'covered', description: 'P06 사고 블록 라이브 채증' })
    } else {
      test.info().annotations.push({ type: 'not-observed', description: 'P06 사고 블록 라이브 미발생 — 하네스로 전환' })
    }

    const hookTl = page.locator('[data-testid="hook-timeline"]')
    if (await hookTl.count()) {
      await hookTl.locator('[data-testid="hook-timeline-summary"]').click()
      await page.waitForTimeout(300)
      await capture('12-hook-timeline-live')
      test.info().annotations.push({ type: 'covered', description: 'P05 훅 타임라인 라이브 채증' })
    } else {
      test.info().annotations.push({ type: 'not-observed', description: 'P05 훅 타임라인 라이브 미발생 — 하네스로 전환' })
    }

    test.info().annotations.push({ type: 'step5-path', description: `파일 수정 승인 경로 = ${step5Path}` })
    await capture('13-shell-final')
  })
})
