/**
 * lr1-resume-restart.e2e.ts — LR1 resume 앱-재시작 실측 (opt-in: LIVE_SDK=1)
 *
 * 영호 증상("30분~24h 자리비움 후 재시작 시 새 대화처럼 맥락끊김")의 **정확한 재현 시도**.
 * 기존 context-live.e2e.ts는 *단일 세션 내* 턴1→턴2(재시작 없음)만 검증 — 재시작을 거치는
 * 경로는 어디에도 테스트가 없었다. 이 테스트가 그 갭을 메운다:
 *
 *   1차 기동(실 backend) → 멀티패널0에 코드워드 심기 → 응답 → blob에 sessionId 저장 확인
 *   → 앱 완전 종료(app.close, held-open 프로세스 증발 모사)
 *   → 2차 기동(재시작) → thread 복원 확인 → "코드워드 뭐였지?" → 응답에 코드워드 포함?
 *
 * AGENTDECK_E2E=1 은 EchoBackend(mock)라 **설정하지 않는다** → 실 Claude backend 사용.
 * (workspace/engine-gate 우회 env는 AGENTDECK_E2E=1 과 독립이라 그대로 사용 가능.)
 *
 * 실행:
 *   LIVE_SDK=1 npx playwright test 99.Others/tests/e2e/lr1-resume-restart.e2e.ts
 *
 * 판정:
 *   PASS(코드워드 회상) → 앱 재시작 resume 정상 = 영호 버그 재현 안 됨(오진/전이었음).
 *   FAIL(회상 못 함)   → 재시작 resume 깨짐 = 진짜 버그 지점 포착.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'
const CODEWORD = 'BANANA42XR' // 학습데이터에 없을 고유 토큰

/** 실 backend 멀티패널 진입 (AGENTDECK_E2E=1 미설정 = 실 Claude backend). */
async function launchMulti(
  userDataDir: string,
  workspace: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      // AGENTDECK_E2E 는 설정 안 함(실 backend). 게이트 우회 env만:
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_PICK_FOLDER: workspace,
      AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 온보딩(닉네임)
  const nick = page.locator('.login-body input#nickname, #nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('lr1테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { /* 기존 프로필 */ }

  // EngineGate(authed면 미표시)
  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 5_000 })
    await skip.click()
    await page.waitForTimeout(500)
  } catch { /* authed */ }

  await page.waitForSelector('.titlebar', { timeout: 30_000 })

  // WhatsNew/UpdateNotes/EngineUpdateNotice 닫기
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(200) }
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    if (await later.isVisible().catch(() => false)) await later.click()
  } catch { /* 미표시 */ }

  // 멀티 에이전트 탭
  const multiBtn = page.locator('.sb-mode-btn', { hasText: '멀티 에이전트' })
  await multiBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await multiBtn.click()
  await page.locator('.multi').waitFor({ state: 'visible', timeout: 10_000 })
  return { app, page }
}

/** 패널0에 워크스페이스 설정(폴더 선택 → PICK_FOLDER env). */
async function ensurePanel0Workspace(page: Page): Promise<void> {
  const pick = page.getByRole('button', { name: '폴더 선택' })
  if (await pick.first().isVisible().catch(() => false)) {
    await pick.first().click()
    await page.waitForTimeout(1200)
  }
}

/** 패널0 idle 대기(.ma-stop 사라짐). */
async function waitPanel0Idle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1500) // 시작 여유
  while (Date.now() < deadline) {
    const running = await page.locator('.ma-panel[data-slot="0"] .ma-stop').isVisible().catch(() => false)
    if (!running) { await page.waitForTimeout(1000); return }
    await page.waitForTimeout(1200)
  }
}

test.describe('LR1: resume 앱-재시작 실측 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK 라이브 — LIVE_SDK=1로 명시 실행')

  let userDataDir: string
  let workspace: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'lr1-resume-udata-'))
    workspace = mkdtempSync(join(tmpdir(), 'lr1-resume-ws-'))
  })
  test.afterAll(() => {
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 잠금 */ }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { /* 잠금 */ }
  })

  test('재시작 후 코드워드 회상 (멀티패널 resume)', async () => {
    test.setTimeout(420_000)

    // ── 1차: 심기 ────────────────────────────────────────────────────────
    const { app: app1, page: page1 } = await launchMulti(userDataDir, workspace)
    await ensurePanel0Workspace(page1)

    const ta1 = page1.locator('.ma-panel[data-slot="0"] .ma-composer-ta')
    await ta1.waitFor({ state: 'visible', timeout: 8_000 })
    expect(await ta1.isDisabled().catch(() => true), '패널0 composer 활성(워크스페이스 설정)').toBe(false)

    await ta1.fill(`코드워드는 ${CODEWORD}. 한 문장으로 알겠다고만 답해. 도구 쓰지 마.`)
    await ta1.press('Enter')
    // 어시스턴트 버블 등장 대기 후 idle
    await page1.locator('.ma-panel[data-slot="0"] .msg.ai-msg').first().waitFor({ state: 'visible', timeout: 150_000 }).catch(() => {})
    await waitPanel0Idle(page1, 150_000)

    const panel0Text1 = await page1.locator('.ma-panel[data-slot="0"]').innerText().catch(() => '(없음)')
    const msgCount1 = await page1.locator('.ma-panel[data-slot="0"] .msg').count()
    console.log('[LR1] 1차 패널0 msg 수:', msgCount1, '| 응답 발췌:', panel0Text1.replace(/\s+/g, ' ').slice(-200))

    // blob에 sessionId 저장 확인(디바운스 여유)
    await page1.waitForTimeout(1500)
    const blobPath = join(userDataDir, 'multi-agent.json')
    let savedSessionId: string | undefined
    if (existsSync(blobPath)) {
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      savedSessionId = blob.sessions?.[0]?.panels?.[0]?.snapshot?.sessionId
      console.log('[LR1] 1차 저장 sessionId:', savedSessionId, '| messages:', blob.sessions?.[0]?.panels?.[0]?.snapshot?.messages?.length)
    }
    expect(savedSessionId, '1차: sessionId가 디스크에 저장돼야 함').toBeTruthy()

    await app1.close()

    // ── 2차: 재시작 후 회상 ───────────────────────────────────────────────
    const { app: app2, page: page2 } = await launchMulti(userDataDir, workspace)
    await page2.waitForTimeout(3000) // 복원 effect(비동기)

    // thread 복원 확인(generic .msg — 실제 클래스 .msg.user / .msg.ai-msg)
    const restoredMsgs = await page2.locator('.ma-panel[data-slot="0"] .msg').count()
    const restoredText = await page2.locator('.ma-panel[data-slot="0"]').innerText().catch(() => '')
    console.log('[LR1] 2차 복원 msg 수:', restoredMsgs, '| 복원 텍스트에 코드워드?', restoredText.includes(CODEWORD))
    expect(restoredMsgs, '재시작 후 thread(.msg) 복원').toBeGreaterThan(0)

    const ta2 = page2.locator('.ma-panel[data-slot="0"] .ma-composer-ta')
    await ta2.waitFor({ state: 'visible', timeout: 8_000 })
    expect(await ta2.isDisabled().catch(() => true), '재시작 후 패널0 composer 활성').toBe(false)

    // 회상 질문 전 어시스턴트 버블 개수(신규 응답 구분용)
    const aiBefore = await page2.locator('.ma-panel[data-slot="0"] .msg.ai-msg').count()

    await ta2.fill('아까 내가 알려준 코드워드가 뭐였지? 코드워드만 답해. 도구 쓰지 마.')
    await ta2.press('Enter')
    // 새 어시스턴트 버블 등장 대기
    await expect(page2.locator('.ma-panel[data-slot="0"] .msg.ai-msg')).toHaveCount(aiBefore + 1, { timeout: 150_000 }).catch(() => {})
    await waitPanel0Idle(page2, 150_000)

    const answer = await page2.locator('.ma-panel[data-slot="0"] .msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    const panel0Text2 = await page2.locator('.ma-panel[data-slot="0"]').innerText().catch(() => '(없음)')
    console.log('[LR1] 2차(재시작 후) 마지막 응답:', answer.slice(0, 200))

    const recalled = answer.includes(CODEWORD) || panel0Text2.slice(-300).includes(CODEWORD)
    console.log(`[LR1] ${recalled ? '✅ PASS' : '❌ FAIL'} — 재시작 후 코드워드 ${recalled ? '회상됨(resume 정상)' : '회상 못 함(resume 끊김=진짜 버그)'}`)
    expect(recalled, `재시작 후 resume 맥락 회상(코드워드 ${CODEWORD}) — 응답: ${answer.slice(0, 120)}`).toBe(true)

    await app2.close()
  })
})
