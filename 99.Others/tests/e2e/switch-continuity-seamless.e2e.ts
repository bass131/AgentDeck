/**
 * switch-continuity-seamless.e2e.ts — 전환-연속성 "새 대화" 제스처 라이브 e2e PROBE (LIVE_SDK=1)
 *
 * 목적(영호 2026-07-02): "진행중인 채팅 냅두고 새로운 채팅 갔다가 다시 이전 채팅" 증상을
 * 실앱으로 재현해 seamless 여부를 확정한다.
 *
 * 코드 실측(정적 분석, 02.Source 읽기전용 — 이 파일에서 수정 X):
 *   - 사이드바 "새 대화" 버튼(aria-label="새 대화") → Sidebar.tsx handleNew → 단일 모드에서
 *     `useAppStore.getState().newConversation()` → sessions.ts `newConversation()`은
 *     `clearConversation()`(conversation.ts) 그대로 재사용.
 *   - `clearConversation()`은 `makeInitialState()`(reducer.ts:43 currentRunId:null 포함)로 상태를
 *     리셋하고, 떠나는 대화(clearedId)가 `bgRuns`에 이미 있으면 그 엔트리만 evict(방어적 정리)한다
 *     — **새로 진행 중인 run을 bgRuns에 스냅샷하는 코드가 없다.**
 *   - 대조군: 사이드바 "기존 대화 클릭" → `selectConversation(id)`(sessions.ts:97-149)는 떠나는
 *     대화가 `currentRunId !== null`(실행 중)이면 진행 상태 전체를 `bgRuns[leaving]`에 스냅샷 저장
 *     후 전환한다(P3b 봉합) — 이 경로는 의도적으로 seamless.
 *   - `subscribeAgentEvents`(runtime.ts:182-250)는 들어오는 이벤트를 3갈래로 라우팅한다:
 *     경로1(현재 활성 run, `payload.runId===currentRunId`) → 정상 반영,
 *     경로2(`bgRuns`의 어떤 엔트리 `currentRunId`와 일치) → 그 스냅샷에 계속 반영(백그라운드 진행),
 *     경로3(어디에도 안 걸림) → **드롭**(경로3 주석: "어디에도 매칭 안 되는 미지 run — 드롭").
 *   - "새 대화" 클릭 시점에 A의 run은 경로1 자격(currentRunId)도 잃고 경로2 자격(bgRuns 엔트리)도
 *     못 얻으므로, 그 순간부터 A의 실제 엔진 이벤트는 전부 경로3로 떨어져 **드롭**된다.
 *     즉 A는 새 대화로 전환한 시점의 상태로 얼려진다(freeze) — seamless 아닐 것으로 강하게 의심.
 *
 * 이 probe가 실측할 값(로그 + PRIMARY assert):
 *   beforeSwitch(전환 직전 A의 최대 카운트) → 새 대화 클릭 → ~10초 대기 → 사이드바에서 A 복귀
 *   → afterReturn(복귀 직후 최대 카운트) → idle 대기 + late-event 버퍼 → finalMax.
 *   PRIMARY: afterReturn > beforeSwitch(백그라운드로 이어짐) 또는 finalMax가 ~40 근접(완주) = seamless.
 *   갭(afterReturn===beforeSwitch, finalMax도 정체) = RED = 영호 증상 재현 확정(경로3 드롭 가설 확인).
 *
 * 선택(2차) 시나리오: 사이드바 "기존 대화 클릭"(selectConversation, P3b) 경로는 대조군으로 seamless
 * 기대(GREEN 예상) — 같은 파일 하단 두 번째 test.
 *
 *   LIVE_SDK=1 npx playwright test 99.Others/tests/e2e/switch-continuity-seamless.e2e.ts
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

// 스트리밍/실행중 인디케이터 — 실측(ComposerBar.tsx:158-165): isRunning && !hasContent일 때만
// `<button className="send stop" aria-label="실행 중단">` 렌더. 참고 harness(lr1-*)의
// `.chat-stop`/`[aria-label="중지"]`는 앱 소스에 존재하지 않는 추정 셀렉터라 여기선 제외.
const RUNNING_SEL = '.composer .stop, [aria-label="실행 중단"]'

async function launchSingleChat(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('switch-probe')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  try { const skip = page.locator('.eg-auth-dialog .sd-go'); if (await skip.isVisible().catch(() => false)) await skip.click() } catch { /* authed */ }
  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) }
  await expect(page.locator('.pane.chat')).toBeVisible({ timeout: 15_000 })
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) { await pickFolder.click(); await page.waitForTimeout(1000) }
  return { app, page }
}

async function isRunningVisible(page: Page): Promise<boolean> {
  return page.locator(RUNNING_SEL).first().isVisible().catch(() => false)
}

async function waitChatIdle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1000)
  while (Date.now() < deadline) {
    if (!(await isRunningVisible(page))) { await page.waitForTimeout(500); return }
    await page.waitForTimeout(1000)
  }
}

/**
 * AI 메시지 텍스트에서 "보이는 최대 숫자"를 파싱.
 * 1순위: 줄 시작 "숫자." / "숫자:" / "숫자)" 패턴 — 모델이 "각 숫자마다 한마디"를 번호목록으로
 *   답할 때 정확히 잡는다. "1부터 40까지"처럼 지시문을 에코하는 문장은 줄 *중간*에 나타나므로
 *   이 패턴엔 걸리지 않음(오탐 방지).
 * 2순위 fallback(1순위 매치 0개일 때만): "N부터"/"N까지" 지시문 에코 패턴을 제거한 나머지에서
 *   전체 숫자 중 최댓값. 완벽하진 않지만(모델이 줄바꿈 없이 답할 가능성 대비) 최선의 근사.
 * 매치 없으면 -1.
 */
function parseMaxCount(text: string): number {
  const lineLead = [...text.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[.:)]/g)].map((m) => Number(m[1]))
  if (lineLead.length > 0) return Math.max(...lineLead)
  const cleaned = text.replace(/\d{1,3}\s*부터/g, '').replace(/\d{1,3}\s*까지/g, '')
  const all = [...cleaned.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]))
  return all.length > 0 ? Math.max(...all) : -1
}

async function readMaxCount(page: Page): Promise<{ max: number; raw: string }> {
  const nodes = page.locator('.pane.chat .msg.ai-msg .content')
  const n = await nodes.count()
  if (n === 0) return { max: -1, raw: '' }
  const texts = await nodes.allInnerTexts()
  const raw = texts.join('\n---\n')
  return { max: parseMaxCount(raw), raw }
}

async function waitForMaxCountAtLeast(page: Page, min: number, timeoutMs: number): Promise<{ max: number; raw: string }> {
  const deadline = Date.now() + timeoutMs
  let last = { max: -1, raw: '' }
  while (Date.now() < deadline) {
    last = await readMaxCount(page)
    if (last.max >= min) return last
    await page.waitForTimeout(1000)
  }
  return last
}

const COUNT_MESSAGE = '1부터 40까지 아주 천천히, 각 숫자마다 짧은 한마디를 붙여 한 줄씩 세어줘.'
const TITLE_PREFIX_A = '1부터 40까지'

test.describe('전환-연속성: "새 대화" 제스처 seamless 확정 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('A 실행중 → "새 대화" 클릭 → ~10초 대기 → 사이드바에서 A 복귀: 진행 이어짐 여부', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'switch-new-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'switch-new-ws-'))

    const { app, page } = await launchSingleChat(userDataDir, workspace)

    // ── 1) A에서 긴 카운트 턴 시작 ──────────────────────────────────────────
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(COUNT_MESSAGE)
    await input.press('Enter')

    // ── 2) 스트리밍 시작 + 몇 숫자 나올 때까지 대기 → beforeSwitch ───────────
    const before = await waitForMaxCountAtLeast(page, 3, 90_000)
    const runningAtSwitch = await isRunningVisible(page)
    console.log('[SWITCH-NEW] beforeSwitch 최대 카운트:', before.max, '| 스트리밍중:', runningAtSwitch)
    console.log('[SWITCH-NEW] beforeSwitch 원문(일부):', before.raw.slice(0, 200))

    // A가 사이드바 목록에 나타나는지 확인(첫 저장 후 목록 반영 — saveConversation → listConversations)
    const sidebarItemA = page.locator('.sb-item').filter({ hasText: TITLE_PREFIX_A })
    const aInSidebarBefore = await sidebarItemA.first().isVisible().catch(() => false)
    console.log('[SWITCH-NEW] 전환 전 A가 사이드바에 표시됨:', aInSidebarBefore)

    // ── 3) "새 대화" 버튼 클릭 (newConversation → clearConversation) ────────
    const newBtn = page.getByRole('button', { name: '새 대화' })
    const newBtnDisabledAtClick = await newBtn.isDisabled().catch(() => false)
    console.log('[SWITCH-NEW] "새 대화" 버튼 disabled(실행중임에도):', newBtnDisabledAtClick)
    await newBtn.click()
    await page.waitForTimeout(500)

    // 빈 새 대화로 전환됐는지 + 교차오염(A의 카운트가 새 대화에 섞였는지) 즉시 확인
    const emptyAtCreate = await page.locator('.pane.chat .msg').count()
    console.log('[SWITCH-NEW] "새 대화" 직후 메시지 수(0이어야 빈 화면):', emptyAtCreate)

    // ── 4) ~10초 대기 (A가 백그라운드로 계속 세는지 여부가 관건) ─────────────
    await page.waitForTimeout(10_000)

    // 대기 후에도 빈 새 대화에 A의 카운트가 새지 않았는지(교차오염) 재확인
    const emptyAfterWait = await page.locator('.pane.chat .msg').count()
    console.log('[SWITCH-NEW] 10초 대기 후 메시지 수(여전히 0이어야 교차오염 없음):', emptyAfterWait)

    // ── 5) 사이드바에서 A 클릭해 복귀(selectConversation) ────────────────────
    await sidebarItemA.first().click()
    await page.waitForTimeout(1500)

    const after = await readMaxCount(page)
    const runningAfterReturn = await isRunningVisible(page)
    console.log('[SWITCH-NEW] afterReturn 최대 카운트:', after.max, '| 복귀 직후 스트리밍중:', runningAfterReturn)
    console.log('[SWITCH-NEW] afterReturn 원문(일부):', after.raw.slice(0, 200))

    // ── 6) idle까지 대기 + late-event 버퍼 → finalMax ────────────────────────
    await waitChatIdle(page, 90_000)
    await page.waitForTimeout(8_000) // 경로3 드롭 가설이 틀렸을 경우의 지연 이벤트를 잡기 위한 여유
    const final = await readMaxCount(page)
    const runningAtFinal = await isRunningVisible(page)
    console.log('[SWITCH-NEW] finalMax 최대 카운트:', final.max, '| 최종 스트리밍중:', runningAtFinal)
    console.log('[SWITCH-NEW] finalMax 원문(일부):', final.raw.slice(0, 200))

    await app.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 잠금 */ }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { /* 잠금 */ }

    // ── 교차오염 assert (빈 새 대화엔 A 카운트가 절대 유입되면 안 됨) ─────────
    expect(emptyAtCreate, '"새 대화" 클릭 직후 빈 화면(메시지 0개)').toBe(0)
    expect(emptyAfterWait, '10초 대기 후에도 빈 새 대화에 A 카운트 유입 없음').toBe(0)

    // ── PRIMARY: seamless 기대 — 봉합됐다면 백그라운드로 이어지거나(afterReturn>beforeSwitch)
    //    최종적으로 40 근접 완주(finalMax>=35)해야 한다. 갭이면 경로3 드롭 가설이 실측 확정된 것.
    const seamless = after.max > before.max || final.max >= 35
    expect(
      seamless,
      `PRIMARY: "새 대화" 전환 중 A 진행이 끊기지 않아야 함 — beforeSwitch=${before.max}, afterReturn=${after.max}, ` +
      `finalMax=${final.max}, 전환직전스트리밍=${runningAtSwitch}, 복귀직후스트리밍=${runningAfterReturn}, ` +
      `새대화버튼disabled=${newBtnDisabledAtClick}`,
    ).toBe(true)
  })
})

// ── 선택(2차) 시나리오: 사이드바 "기존 대화" 스위치(P3b) 대조군 ──────────────────
// selectConversation은 떠나는 실행중 대화를 bgRuns에 스냅샷 후 전환하므로(sessions.ts:106-148)
// 이 경로는 설계상 seamless가 기대된다(GREEN 예상, 위 "새 대화" 시나리오와 대조).
// 실 LLM 왕복이 2회(B 심기 + A 진행) 필요해 비용/시간이 더 든다 — LIVE_SDK 러너가 부담되면
// 위 1차 시나리오만 돌려도 진단 목적은 충분하다.
const SEED_B_MESSAGE = '이건 두 번째 실험용 대화야. 정확히 "네, B 대화입니다."라고만 짧게 답해줘. 다른 말은 붙이지 마.'
const TITLE_PREFIX_B = '이건 두 번째 실험용'

test.describe('전환-연속성: 사이드바 "기존 대화" 스위치(P3b) 대조군 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('A 실행중 → 기존 대화 B 클릭 → A 복귀: P3b 스냅샷으로 seamless 기대', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'switch-sidebar-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'switch-sidebar-ws-'))

    const { app, page } = await launchSingleChat(userDataDir, workspace)

    // ── 1) 대화 B를 먼저 만들고 완료까지 대기(사이드바에 idle 대화로 존재해야 스위치 대상 가능) ──
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(SEED_B_MESSAGE)
    await input.press('Enter')
    await waitChatIdle(page, 90_000)
    await page.waitForTimeout(1500) // saveConversation(done) 여유

    // ── 2) "새 대화"로 빈 화면 → A(긴 카운트) 시작 ───────────────────────────
    await page.getByRole('button', { name: '새 대화' }).click()
    await page.waitForTimeout(500)
    await input.click()
    await input.fill(COUNT_MESSAGE)
    await input.press('Enter')

    const before = await waitForMaxCountAtLeast(page, 3, 90_000)
    const runningAtSwitch = await isRunningVisible(page)
    console.log('[SWITCH-SIDEBAR] beforeSwitch 최대 카운트:', before.max, '| 스트리밍중:', runningAtSwitch)

    // ── 3) 사이드바에서 B 클릭 (selectConversation, A는 실행중 → bgRuns 스냅샷 기대) ──
    const sidebarItemB = page.locator('.sb-item').filter({ hasText: TITLE_PREFIX_B })
    await sidebarItemB.first().click()
    await page.waitForTimeout(1000)
    const onB = await page.locator('.pane.chat').innerText().catch(() => '')
    console.log('[SWITCH-SIDEBAR] B로 전환 확인(B 답변 포함 여부):', onB.includes('B 대화입니다'))

    // ── 4) ~10초 대기 (A가 bgRuns 스냅샷을 통해 백그라운드로 이어지는지) ──────
    await page.waitForTimeout(10_000)

    // ── 5) 사이드바에서 A 클릭해 복귀 ─────────────────────────────────────────
    const sidebarItemA = page.locator('.sb-item').filter({ hasText: TITLE_PREFIX_A })
    await sidebarItemA.first().click()
    await page.waitForTimeout(1500)

    const after = await readMaxCount(page)
    console.log('[SWITCH-SIDEBAR] afterReturn 최대 카운트:', after.max)

    await waitChatIdle(page, 90_000)
    await page.waitForTimeout(8_000)
    const final = await readMaxCount(page)
    console.log('[SWITCH-SIDEBAR] finalMax 최대 카운트:', final.max)

    await app.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 잠금 */ }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { /* 잠금 */ }

    // 대조군 기대: P3b 스냅샷이 실제로 seamless면 진행이 끊기지 않아야 한다.
    const seamless = after.max > before.max || final.max >= 35
    expect(
      seamless,
      `대조군(P3b selectConversation): beforeSwitch=${before.max}, afterReturn=${after.max}, finalMax=${final.max}`,
    ).toBe(true)
  })
})
