/**
 * gap1-dogfood-live2.e2e.ts — GAP1 dogfood 통주 보완 라이브 스펙 (opt-in).
 *
 * 1차 통주(gap1-dogfood-live.e2e.ts) 실측에서 두 단계가 실패했다:
 *   ④ plan 승인 카드 미등장 — **원인 실측**: REPL 지속세션(ADR-024) 중 모드 피커 변경이
 *     세션에 적용되지 않는다. SDK permissionMode는 세션 생성 시 고정 + canUseTool도
 *     `makeCanUseTool(this._req.mode, …)`(claudeAgentRun.ts:1018)로 run 생성 시점 고정 —
 *     진행 중 세션에서 '플랜' 전환은 무효(모델 피커의 P02 semantics-b와 동류이나 모드
 *     피커에는 UI 안내조차 없음 — 결함 보고 대상, qa는 수정 X).
 *   ⑦ 정지 버튼 부재 — ④ 실패로 Playwright 워커가 재시작되며 bg 태스크가 있던 앱
 *     인스턴스가 닫혔고(하네스 사정), ticker 자체 5분 안전 종료와 겹침. 결함 아님.
 *
 * 본 스펙은 위 실측을 반영해 같은 단계를 성립 가능한 형태로 재수행한다:
 *   A) 정지 전이(⑦): bg 시작 직후 정지 버튼 클릭 → 터미널 전이 캡처.
 *   B) plan 승인(④/⑤ plan-direct): **새 대화에서 모드를 '플랜'으로 먼저** 설정한 뒤
 *      첫 턴을 시작 → ExitPlanMode planReview 카드 → 실행 승인 → (plan 고정 모드에서)
 *      파일 편집 권한 카드 → 승인 → 파일 반영. + 사고 블록/훅 타임라인 조건부 채증.
 *
 * 실행: GAP1DOGFOOD2=1 npx playwright test 99.Others/tests/e2e/gap1-dogfood-live2.e2e.ts
 * ⚠️ AGENTDECK_E2E 미설정(실 SDK) — live-sdk.e2e.ts 선례.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.GAP1DOGFOOD2 === '1'

const SHOT_DIR = join(process.cwd(), '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

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

    // 정지 전이: 실행 중 정지 버튼 → 클릭 → 터미널 상태(버튼 소멸) + 로그 보존
    const stopBtn = page.locator('[data-testid="bg-stop-btn"]').first()
    await stopBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await stopBtn.click()
    await page
      .locator('[data-testid="bg-stop-btn"]')
      .first()
      .waitFor({ state: 'hidden', timeout: 60_000 })
    await expect(tail).toBeVisible() // 종료 후에도 로그 보존
    await capture('10-bg-task-stopped')
  })

  test('B) ④/⑤ 재수행 — 새 대화 + plan 모드 시작 → 계획 검토·승인 → 파일 수정 승인', async () => {
    test.setTimeout(480_000)

    // 새 대화(새 REPL 세션) — 진행 중 세션에는 모드 변경이 적용되지 않으므로(실측 결함,
    // 파일 상단 주석) plan 모드는 세션 시작 전에 설정해야 성립한다.
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

    // ExitPlanMode → planReview 카드(data-plan-mode)
    const planCard = page.locator(`${PERM_CARD}[data-plan-mode]`)
    await planCard.waitFor({ state: 'visible', timeout: 300_000 })

    const toggle = planCard.locator('[data-plan-toggle]')
    if (await toggle.count()) await toggle.click()
    await page.waitForTimeout(300)
    await capture('05-plan-approval-card')

    // plan 카드 계약: 2액션 + allow_always 없음
    expect(await planCard.locator('[data-perm-choice="allow_always"]').count()).toBe(0)
    await planCard.locator('[data-perm-choice="allow"]').click()

    // plan 승인 후 실행 — plan 고정 모드에서 Edit/Write는 권한 카드를 띄운다.
    // (SDK가 승인과 함께 편집 자동수락으로 전환하면 카드 없이 완주할 수 있다 — 관측 기록)
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

    // 파일 반영 실증
    const edited = readFileSync(join(workspace, 'sample.ts'), 'utf8')
    expect(edited).toContain('farewell')
    await capture('05c-plan-executed-thread')

    // 조건부 채증: 확장 사고 블록(P06) / 훅 타임라인(P05)
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
