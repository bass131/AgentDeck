/**
 * gap1-p13-live-mode-switch.e2e.ts — GAP1 P13 진행 중 세션 라이브 모드 전환 라이브 스펙 (opt-in).
 *
 * dogfood ④ 실측 결함 A(2026-07-14, gap1-dogfood-live2.e2e.ts 헤더)의 **역전 시나리오**:
 *   1차 통주에서 "REPL 진행 중 세션의 모드 피커 '플랜' 전환이 엔진에 전달되지 않아
 *   ExitPlanMode 카드가 영영 안 뜨는" 조용한 no-op이 실측됐다. dogfood-live2 B)는 이를
 *   우회해 *새 대화에서 모드를 먼저* 설정했지만, 본 스펙은 P13 구현 후 **진행 중 세션에서**
 *   같은 전환이 성립함을 그대로 검증한다(우회 없이).
 *
 * 시나리오:
 *   워크스페이스 열기 → REPL 세션(모드 '일반')에서 가벼운 턴 1회(세션 개시·held-open 확립)
 *   → ★ 진행 중 세션에서 모드 피커 '플랜' 전환(라이브 setPermissionMode 경로)
 *   → 파일 편집 요청 전송 → ExitPlanMode planReview 카드 등장 단정(dogfood ④ 역전)
 *   → ScreenShot/p13-live-plan-switch.png 캡처 → (정리) 실행 승인 → 턴 정착.
 *
 * 실행(opt-in — CI 무해, 미설정 시 skip):
 *   GAP1P13=1 npx playwright test 99.Others/tests/e2e/gap1-p13-live-mode-switch.e2e.ts
 * ⚠️ AGENTDECK_E2E 미설정(실 SDK — live-sdk.e2e.ts 선례). 사전 `npm run build` 필요.
 *
 * 헬퍼: passBootGates/openWorkspace(helpers/bootGates) + PERM_CARD(helpers/permSelectors)
 *   재사용. pick/send/waitTurnSettled/capture는 gap1-dogfood-live2.e2e.ts 파일-로컬 헬퍼 미러.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.GAP1P13 === '1'

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

test.describe('GAP1 P13 라이브 모드 전환 통주 (opt-in: GAP1P13=1)', () => {
  test.skip(!RUN, 'P13 라이브 인수 — GAP1P13=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(90_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-p13-'))
    writeFileSync(join(workspace, 'sample.ts'), SAMPLE_TS)

    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-p13-udata-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    await passBootGates(page, { nickname: 'p13live' })
    await openWorkspace(page, { waitForTree: true })
    await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('진행 중 REPL 세션에서 플랜 전환 → ExitPlanMode planReview 카드 성립 (dogfood ④ 역전)', async () => {
    test.setTimeout(600_000)

    // ── 1) REPL 세션 개시 — 모드 '일반'으로 가벼운 턴 1회(held-open 세션 확립) ─────
    // 이 턴이 끝나도 REPL(기본 ON) 세션은 살아있다 — 이후 전환은 "진행 중 세션" 대상.
    await pick('모드 선택', '일반')
    await send(
      'Reply with exactly READY and end your turn. Do not use any tools.'
    )
    await waitTurnSettled()

    // ── 2) ★ 진행 중 세션에서 모드 피커 '플랜' 라이브 전환 ─────────────────────────
    // P13 이전: UI 상태만 바뀌고 엔진 무전달(조용한 no-op — 결함 A).
    // P13 이후: setPickerMode → agentSetMode IPC → 어댑터 Query.setPermissionMode('plan')
    //   → 이후 도구 요청부터 plan 프로토콜(읽기 전용 강제 + ExitPlanMode) 성립.
    await pick('모드 선택', '플랜')

    // ── 3) 파일 편집 요청 — plan 모드가 실적용됐다면 ExitPlanMode로 승인을 요청한다 ──
    await send(
      'Plan the following change: add a function `farewell(name: string): string` that returns ' +
        '`Bye, ${name}` to sample.ts. Keep the plan short (under 6 lines), then exit plan mode ' +
        'to request approval.'
    )

    // ── 4) ExitPlanMode planReview 카드 등장 단정 — dogfood ④ 1차 실패의 역전 지점 ──
    // 전환이 여전히 no-op이면 모델이 곧장 편집(일반 모드 권한 카드) 또는 무카드 완주
    // → 이 대기가 타임아웃으로 실패한다(결함 A 재현 = 스펙 실패).
    const planCard = page.locator(`${PERM_CARD}[data-plan-mode]`)
    await planCard.waitFor({ state: 'visible', timeout: 300_000 })

    const toggle = planCard.locator('[data-plan-toggle]')
    if (await toggle.count()) await toggle.click()
    await page.waitForTimeout(300)
    await capture('p13-live-plan-switch')

    // plan 카드 계약(P07): 2액션 + allow_always 없음 — 회귀 대조.
    expect(await planCard.locator('[data-perm-choice="allow_always"]').count()).toBe(0)

    // ── 5) 정리 — 실행 승인 → 후속 권한 카드 허용 루프 → 턴 정착(파일 반영 확인) ─────
    await planCard.locator('[data-perm-choice="allow"]').click()

    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const nonPlanCard = page.locator(`${PERM_CARD}:not([data-plan-mode])`)
      if (await nonPlanCard.isVisible().catch(() => false)) {
        await nonPlanCard.locator('[data-perm-choice="allow"]').click()
        await page.waitForTimeout(800)
        continue
      }
      const running = await page.getByLabel('실행 중단').isVisible().catch(() => false)
      if (!running) break
      await page.waitForTimeout(1000)
    }
    await waitTurnSettled(60_000)

    // 파일 반영 실증(승인 후 실행 경로까지 완주) — 라이브 전환 전 과정의 종단 증거.
    const edited = readFileSync(join(workspace, 'sample.ts'), 'utf8')
    expect(edited).toContain('farewell')
    await capture('p13-live-plan-executed')
  })
})
