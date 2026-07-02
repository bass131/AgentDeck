/**
 * lr3-p07-multipanel-continuity.e2e.ts — LR3 Phase 07 라이브 e2e PROBE (LIVE_SDK=1).
 *
 * 목적(01.Phases/LR3-loop-ux/07-multipanel-continuity.md §라이브 재현 시나리오 1번):
 *   "멀티 패널1 카운트 스트리밍 중 → single 전환 → 3s → multi 복귀 = 부분 텍스트에서
 *   멈춤+idle(예상)" — 야간2 진단(63526a5)이 정적 분석으로 확정한 스트림 증발을 실
 *   Electron 런타임으로 재확인하고, Phase 07 수리(usePanelSlot 앱 수명 승격 + Shell
 *   수명 subscribeAgentEvents) 후 이어짐(seamless)을 실측한다.
 *
 * 코드 실측(정적 분석 근거, 02.Source 읽기전용 — 이 파일에서 수정 X):
 *   - Shell.tsx는 workspaceMode==='multi'일 때 <MultiWorkspace key={activeMultiSessionId}>를
 *     렌더하고 단일챗 <Conversation>은 렌더하지 않는다(원본 조건문 무변경).
 *   - Phase 07 이전: usePanelSession()의 상태(useReducer)·구독(onAgentEvent)이 MultiWorkspace
 *     마운트에 묶여 있어, single로 전환하면 MultiWorkspace가 통째로 언마운트되고 진행 중
 *     run의 이벤트가 영구 증발했다(구독 해제 + 상태 소멸).
 *   - Phase 07 수리: usePanelSlot(sessionKey, slot) — 상태·전역 구독을 모듈 스코프 매니저로
 *     승격(store/panelSession.ts). MultiWorkspace가 몇 번을 언마운트→재마운트해도 같은
 *     (활성멀티세션ID, 슬롯) 키의 진행은 이어진다.
 *
 * 이 probe가 실측할 값(로그 + PRIMARY assert):
 *   beforeSwitch(전환 직전 패널1 최대 카운트) → single 전환 → 3초 대기 → multi 복귀
 *   → afterReturn(복귀 직후 최대 카운트) → idle 대기 + late-event 버퍼 → finalMax.
 *   PRIMARY: afterReturn > beforeSwitch(백그라운드로 이어짐) 또는 finalMax가 목표치 근접
 *   (완주) = seamless. 갭(afterReturn===beforeSwitch, finalMax도 정체) = RED = 진단서
 *   증상 재현(스트림 증발).
 *
 *   LIVE_SDK=1 npx playwright test 99.Others/tests/e2e/lr3-p07-multipanel-continuity.e2e.ts
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

const COUNT_MESSAGE = '1부터 40까지 아주 천천히, 각 숫자마다 짧은 한마디를 붙여 한 줄씩 세어줘.'

/**
 * AI 메시지 텍스트에서 "보이는 최대 숫자"를 파싱.
 * switch-continuity-seamless.e2e.ts의 parseMaxCount와 동형(패턴 공유 — 신규 발명 0).
 */
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
  // PanelComposer 실측(components/00_shell/panel/PanelComposer.tsx:344-346):
  // isRunning일 때 `<button className="ma-send ma-stop" aria-label="중단">` 렌더.
  // 단일챗 ComposerBar의 aria-label="실행 중단"과는 다른 라벨(패널 전용 컴포넌트) — 혼동 주의.
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
    /* authed */
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
  // 멀티 모드로 전환
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

    // ── 1) 패널1에서 긴 카운트 턴 시작 ──────────────────────────────────────
    const ta = page.locator('.ma-panel').first().locator('.ma-composer-ta')
    await ta.click()
    await ta.fill(COUNT_MESSAGE)
    await ta.press('Enter')

    // ── 2) 스트리밍 시작 + 몇 숫자 나올 때까지 대기 → beforeSwitch ───────────
    const before = await waitForPanel1MaxCountAtLeast(page, 3, 90_000)
    const runningAtSwitch = await panel1IsRunning(page)
    console.log('[P07] beforeSwitch 최대 카운트:', before.max, '| 스트리밍중:', runningAtSwitch)
    console.log('[P07] beforeSwitch 원문(일부):', before.raw.slice(0, 200))

    // ── 3) single 모드로 전환 (Shell.tsx가 MultiWorkspace를 언마운트) ───────
    await page.locator('.sb-mode .sb-mode-btn').nth(0).click()
    await expect(page.locator('.pane.chat')).toBeVisible()
    await expect(page.locator('.multi')).toHaveCount(0)

    // ── 4) ~3초 대기 (패널1이 언마운트 상태에서도 백그라운드로 이어지는지) ──
    await page.waitForTimeout(3_000)

    // ── 5) multi 모드로 복귀 ─────────────────────────────────────────────
    await page.locator('.sb-mode .sb-mode-btn').nth(1).click()
    await expect(page.locator('.multi')).toBeVisible()
    await page.waitForTimeout(1000)

    const after = await readPanel1MaxCount(page)
    const runningAfterReturn = await panel1IsRunning(page)
    console.log('[P07] afterReturn 최대 카운트:', after.max, '| 복귀 직후 스트리밍중:', runningAfterReturn)
    console.log('[P07] afterReturn 원문(일부):', after.raw.slice(0, 200))

    // ── 6) idle까지 대기 + late-event 버퍼 → finalMax ────────────────────
    await waitPanel1Idle(page, 90_000)
    await page.waitForTimeout(8_000)
    const final = await readPanel1MaxCount(page)
    const runningAtFinal = await panel1IsRunning(page)
    console.log('[P07] finalMax 최대 카운트:', final.max, '| 최종 스트리밍중:', runningAtFinal)
    console.log('[P07] finalMax 원문(일부):', final.raw.slice(0, 200))

    await app.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 잠금 */ }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { /* 잠금 */ }

    // ── PRIMARY: seamless 기대 — Phase 07 수리 후 백그라운드로 이어지거나
    //    (afterReturn>beforeSwitch) 최종적으로 40 근접 완주(finalMax>=35)해야 한다.
    //    갭이면(진단서 예상) 스트림 증발이 남아있다는 뜻.
    const seamless = after.max > before.max || final.max >= 35
    expect(
      seamless,
      `PRIMARY: 멀티→단일→멀티 전환 중 패널1 진행이 끊기지 않아야 함 — beforeSwitch=${before.max}, ` +
      `afterReturn=${after.max}, finalMax=${final.max}, 전환직전스트리밍=${runningAtSwitch}, ` +
      `복귀직후스트리밍=${runningAfterReturn}`,
    ).toBe(true)
  })
})
