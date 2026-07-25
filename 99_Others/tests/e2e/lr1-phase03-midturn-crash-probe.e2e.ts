/**
 * lr1-phase03-midturn-crash-probe.e2e.ts — 갈래 A(session 즉시저장) 라이브 검증 PROBE (LIVE_SDK=1)
 *
 * 목적(영호 2026-07-02): LR1 Phase 03 갈래 A — "session 이벤트 수신 즉시 saveConversation →
 * 턴이 done 前 중단(crash/interrupt)돼도 그 턴 sessionId가 디스크에 남아 resume 가능" —
 * 을 실앱 crash로 실측한다. (기존: sessionId는 done 시점에만 저장 → done 前 crash면 유실.)
 *
 * 격리 설계:
 *   1) 폴더 연 단일채팅(AgentDeck은 폴더 필수)에서 긴 카운트(1→60) 턴 시작.
 *   2) session 이벤트 발화(~1-2s) + 갈래A 저장 완료 후, done 前 시점(~6s)에 **SIGKILL**
 *      = main 프로세스 강제 종료(graceful before-quit 우회 = 진짜 crash 모사).
 *   3) 재시작 후 chats/<id>.json에 sessionId가 남아있으면 = 갈래 A 효과 확정.
 *      (갈래 A 없으면 done 미발화 → saveConversation 미호출 → 레코드/ sessionId 없음.)
 *   4) 보너스: 재시작 후 "어디까지 셌어?" → resume이 crash 直前 부분 카운트를 잇는지 진단 로그.
 *
 * 판정: 재시작 후 sessionId 영속 = PRIMARY assert(갈래 A 계약). resume 회상은 진단 로그.
 *
 *   LIVE_SDK=1 npx playwright test 99.Others/tests/e2e/lr1-phase03-midturn-crash-probe.e2e.ts
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

async function launchSingleChat(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('crash-probe')
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

async function waitChatIdle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1500)
  while (Date.now() < deadline) {
    const running = await page.locator('.chat-stop, .composer .stop, [aria-label="중지"]').first().isVisible().catch(() => false)
    if (!running) { await page.waitForTimeout(1000); return }
    await page.waitForTimeout(1200)
  }
}

function readSavedSession(chatsDir: string): { sessionId?: string; msgCount: number } | null {
  if (!existsSync(chatsDir)) return null
  const files = readdirSync(chatsDir).filter((f) => f.endsWith('.json') && f !== 'index.json')
  if (files.length === 0) return null
  const rec = JSON.parse(readFileSync(join(chatsDir, files[0]), 'utf8')) as { sessionId?: string; messages?: unknown[] }
  return { sessionId: rec.sessionId, msgCount: rec.messages?.length ?? 0 }
}

test.describe('LR1 Phase03: 갈래 A mid-turn crash sessionId 생존 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('done 前 SIGKILL(crash) 후 재시작 시 sessionId 영속 + resume 잔존', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr1-p03-crash-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'lr1-p03-crash-ws-'))
    const chatsDir = join(userDataDir, 'chats')

    // ── 1차: 긴 카운트 턴 시작 → done 前 SIGKILL ──────────────────────────────
    const { app: app1, page: page1 } = await launchSingleChat(userDataDir, workspace)
    const input1 = page1.getByLabel('메시지 입력')
    await input1.click()
    await input1.fill('1부터 60까지, 각 숫자마다 짧은 한마디를 붙여서, 아주 천천히 한 줄씩 세어줘.')
    await input1.press('Enter')

    // session 이벤트 발화(~1-2s) + 갈래A 저장 완료 대기 후, done 前에 crash.
    await page1.waitForTimeout(6500)
    const runningAtKill = await page1.locator('.chat-stop, .composer .stop, [aria-label="중지"]').first().isVisible().catch(() => false)
    const savedBeforeKill = readSavedSession(chatsDir) // 갈래A가 이미 저장했는지(crash 前 디스크 상태)
    console.log('[CRASH] kill 시점 스트리밍 진행중:', runningAtKill)
    console.log('[CRASH] kill 前 디스크 sessionId:', savedBeforeKill?.sessionId ?? '(없음)', '| msgCount:', savedBeforeKill?.msgCount ?? 0)

    // SIGKILL — main 프로세스 강제 종료(graceful 우회 = crash 모사).
    const pid = app1.process().pid
    console.log('[CRASH] main pid:', pid, '→ SIGKILL')
    if (pid) { try { process.kill(pid, 'SIGKILL') } catch (e) { console.log('[CRASH] kill err', String(e)) } }
    await page1.waitForTimeout(3000) // OS 핸들/락 해제 여유
    try { await app1.close() } catch { /* 이미 죽음 */ }

    // ── crash 직후 디스크 상태 = 갈래 A 검증의 PRIMARY ────────────────────────
    const afterCrash = readSavedSession(chatsDir)
    console.log('[CRASH] crash 後 디스크 sessionId:', afterCrash?.sessionId ?? '(없음)', '| msgCount:', afterCrash?.msgCount ?? 0)

    // ── 2차: 재시작 → 복원 → 카운트 잇기(resume 진단) ─────────────────────────
    const { app: app2, page: page2 } = await launchSingleChat(userDataDir, workspace)
    await page2.waitForTimeout(2500) // restoreLastActiveConversation

    const restoredMsgs = await page2.locator('.pane.chat .msg').count()
    console.log('[CRASH] 2차 복원 msg 수:', restoredMsgs)

    const input2 = page2.getByLabel('메시지 입력')
    const aiBefore = await page2.locator('.pane.chat .msg.ai-msg').count()
    await input2.click()
    await input2.fill('방금 세다가 중단됐지? 다시 세지 말고, 아까 어디까지 셌었는지 그 숫자만 답해.')
    await input2.press('Enter')
    await expect(page2.locator('.pane.chat .msg.ai-msg')).toHaveCount(aiBefore + 1, { timeout: 150_000 }).catch(() => {})
    await waitChatIdle(page2, 150_000)
    const answer = await page2.locator('.msg.ai-msg .content').last().innerText().catch(() => '(없음)')
    console.log('[CRASH] 재시작 후 "어디까지 셌어?" 응답:', answer.slice(0, 200))
    // 참고(갈래A 계약과 무관): crash로 부분 assistant 출력은 SDK가 세션 transcript에 미커밋할 수 있어
    // 모델이 "센 기록 없음"이라 솔직히 답할 수 있다 = 정상. 갈래A 핵심은 sessionId·user msg 생존.
    // 지어내지 않고 솔직히 답하면 (a) MEMORY_CONTINUITY_GUIDE의 confabulation guard도 함께 작동 중.

    await app2.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* 잠금 */ }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { /* 잠금 */ }

    // PRIMARY(갈래 A 계약): done 前 crash에도 sessionId가 디스크에 남아야 한다.
    expect(afterCrash, 'crash 後 대화 레코드가 디스크에 존재(갈래 A 저장)').not.toBeNull()
    expect(afterCrash?.sessionId, `done 前 crash에도 sessionId 영속(갈래 A) — kill前 진행중=${runningAtKill}`).toBeTruthy()
  })
})
