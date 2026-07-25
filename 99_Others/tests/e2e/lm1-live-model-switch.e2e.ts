/**
 * lm1-live-model-switch.e2e.ts — LM1 진행 중 REPL 세션 라이브 모델 전환 라이브 스펙 (opt-in).
 *
 * gap1-p13-live-mode-switch.e2e.ts(모드 라이브 전환)의 모델판 미러. P01~P04 구현 후
 * **진행 중 REPL 세션에서** 컴포저 모델 피커 전환이 세션을 깨지 않고 성립함을 검증한다.
 *
 * 시나리오:
 *   워크스페이스 열기 → REPL 세션(기본 모델 Opus 4.8)에서 가벼운 턴 1회(held-open 확립)
 *   → ★ 진행 중 세션에서 모델 피커 펼침 → P04 정본 안내('다음 응답부터 적용') 노트 확인 +
 *     피커 상태 캡처 → 다른 모델(Sonnet 5)로 라이브 전환(setSelectedModel →
 *     requestLiveModelSwitch → agentSetModel IPC → 어댑터 setModel 위임)
 *   → 전환 위임 흔적 확인(피커 값이 새 모델로 갱신 = selectedModel 반영)
 *   → 후속 턴(턴2) 전송 → 응답 성립 단정(같은 세션이 안 깨지고 완주) → 캡처.
 *
 * 단정 경계(Phase 정본 ⚠ + P02 계약): "응답 성립 + 전환 위임 흔적"까지만 단정한다.
 *   모델은 역통지 이벤트가 없어(2026-07-17 확정) UI에 "전환됨" 배지가 없다 — 반영 정본은
 *   assistant message.model이고 그건 SDK 라이브 프로브(lm1-setmodel-live-probe.test.ts)가
 *   기계 검증한다. e2e는 UI 관측 가능한 흔적(피커 값 갱신)과 턴2 완주까지만 본다.
 *   모델별 출력 *품질*은 절대 단정하지 않는다(플레이크 원천 — Phase 함정).
 *
 * 실행(opt-in — CI 무해, 미설정 시 skip):
 *   LM1E2E=1 npx playwright test 99.Others/tests/e2e/lm1-live-model-switch.e2e.ts
 * ⚠️ AGENTDECK_E2E 미설정(실 SDK — gap1-p13 선례). 사전 `npm run build` 필요.
 *
 * 헬퍼: passBootGates/openWorkspace(helpers/bootGates) 재사용. pick/send/waitTurnSettled/
 *   capture는 gap1-p13-live-mode-switch.e2e.ts 파일-로컬 헬퍼 미러.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const RUN = process.env.LM1E2E === '1'

const SHOT_DIR = join(process.cwd(), '01.Phases', '19_LM1-live-model-switch', 'ScreenShot')

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

    // ── 1) REPL 세션 개시 — 기본 모델(Opus 4.8)로 가벼운 턴 1회(held-open 확립) ─────
    // 이 턴이 끝나도 REPL(기본 ON) 세션은 살아있다 — 이후 전환은 "진행 중 세션" 대상.
    await send('Reply with exactly READY and end your turn. Do not use any tools.')
    await waitTurnSettled()
    await capture('01-repl-turn1-default-model')

    // ── 2) ★ 진행 중 세션에서 모델 피커 펼침 — P04 정본 안내 노트 확인 + 상태 캡처 ─────
    // P04가 문구를 교체했다: 새 정본은 '다음 응답부터 적용'(옛 '새 대화(세션)부터 적용').
    // 포함 문구 최소 단정(전체 문장 리터럴은 회귀에 취약).
    await page.getByLabel('모델 선택').click()
    await expect(page.locator('.pick-menu')).toBeVisible()
    await expect(page.locator('.pick-menu-note')).toContainText('다음 응답부터 적용')
    await capture('02-model-picker-note-open')

    // ── 3) 다른 모델(Sonnet 5)로 라이브 전환 — 기본 Opus 4.8과 다른 KNOWN_MODEL ───────
    await page.locator('.pick-menu .pick-opt', { hasText: 'Sonnet 5' }).first().click()
    await expect(page.locator('.pick-menu')).toHaveCount(0)

    // ── 4) 전환 위임 흔적 — 피커 트리거 값이 새 모델로 갱신(selectedModel 반영) ────────
    // setSelectedModel → requestLiveModelSwitch(replMode+runId 게이트 통과) → agentSetModel
    // IPC 발화의 UI 관측 가능한 흔적. (역통지 이벤트 부재 — 반영 정본은 라이브 프로브가 검증.)
    await expect(page.getByLabel('모델 선택').locator('.pick-val')).toHaveText('Sonnet 5')
    await capture('03-model-switched-picker-value')

    // ── 5) 같은 REPL 세션에서 후속 턴(턴2) — 전환이 세션을 깨지 않고 완주해야 한다 ──────
    await send('Reply exactly MODEL_TURN_OK and nothing else. Do not use any tools.')
    await expect(page.locator('.msg.ai-msg .content').last()).toContainText('MODEL_TURN_OK', {
      timeout: 240_000
    })
    await waitTurnSettled(60_000)
    await capture('04-model-changed-followup-turn')

    // 종단 단정: 턴2 응답 성립(같은 세션 완주) + 전환 위임 흔적(피커 값) 둘 다 확인됨.
    // 모델별 출력 품질 단정 없음(플레이크 방지) — MODEL_TURN_OK 지시어 준수만.
    await expect(page.getByLabel('모델 선택').locator('.pick-val')).toHaveText('Sonnet 5')
  })
})
