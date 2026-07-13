/**
 * lr4-p07-repl-per-session-live.e2e.ts — LR4 P07(replMode 전역→세션별 분리) 라이브 사인오프.
 *
 * 배경: replMode(REPL 지속세션 토글, ADR-024)가 전역 단일 필드에서 대화별
 *   (ConversationRecord.replMode)/패널별(PanelThreadSnapshot.replMode) 세션 스코프로 이관됐다
 *   (커밋 77e8d33). 단위/통합 테스트는 이미 green — 이 spec은 **실제 앱 프로세스**로 도는
 *   최종 사인오프 대체 검증이다(라이브 SDK 아님, 결정론 EchoBackend).
 *
 * 결정론: EchoBackend(AGENTDECK_E2E=1) 사용 — 실 SDK/네트워크 없이 send가 스크립트된
 *   echo 응답을 내고 done에서 saveConversation/멀티 스냅샷 영속이 실행된다. LIVE_SDK 게이트
 *   불필요(회상/맥락 검증이 아니라 토글의 세션별 독립·영속·복원만 본다).
 *
 * 시나리오(P07 변경 대상 실물):
 *   S1 단일챗 세션별 독립   — A(OFF)/B(기본 ON)가 전환 시 각자 유지.
 *   S2 재시작 복원(핵심)    — send 후 close → 같은 userData 재기동 → A=OFF·B=ON 복원.
 *   S3 하위호환 마이그레이션 — replMode 필드 없는 옛 대화 JSON 시드 → 크래시 0 + 기본 ON 폴백.
 *   S4 멀티 패널 독립+복원  — 패널0(OFF)/패널1(ON) send → 재시작 → 패널별 복원.
 *
 * 셀렉터 실측(2026-07-12):
 *   단일 토글: `.pane.chat` scope → getByRole('button', { name: 'REPL 지속세션 모드 토글' }),
 *              aria-pressed로 상태(ComposerBar.tsx L146-147).
 *   멀티 토글: `.ma-panel[data-slot=N]` scope → 동일 aria-label(PanelPicker.tsx L260-261).
 *   사이드바:  `.sb-item`(hasText=title) 클릭 → selectConversation. '새 대화' aria-label(Sidebar.tsx L557).
 *   패널 수:   `[aria-label="패널 수"] .ma-count-btn`(hasText=N). 패널 컴포저: `.ma-composer-ta`.
 *
 * 실행:
 *   node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/lr4-p07-repl-per-session-live.e2e.ts
 *   (run-e2e.cjs가 npm run build 선행 후 playwright 실행)
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { focusRestoredWindow } from './helpers/relaunchFocus'

// ── 아티팩트(실패 시 스크린샷) ────────────────────────────────────────────────
const ARTIFACTS = join(tmpdir(), 'lr4-p07-artifacts')

/** 실패 시 스크린샷을 ARTIFACTS/<name>.png로 남기고 재던진다(디버깅 경로 보고용). */
async function withShot(page: Page, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    try {
      mkdirSync(ARTIFACTS, { recursive: true })
      await page.screenshot({ path: join(ARTIFACTS, `${name}.png`), fullPage: true })
      console.log(`[LR4-P07] FAIL 스크린샷: ${join(ARTIFACTS, `${name}.png`)}`)
    } catch { /* 스크린샷 실패는 무시 */ }
    throw e
  }
}

/** Windows: Electron 종료 직후 userData 잠금 → 재시도 rmSync(m3 미러). */
async function safeRmDir(dir: string): Promise<void> {
  if (!dir) return
  for (let attempt = 0; attempt < 5; attempt++) {
    try { rmSync(dir, { recursive: true, force: true }); return }
    catch { await new Promise((r) => setTimeout(r, 500 * (attempt + 1))) }
  }
  console.warn(`[cleanup] rmSync 실패(무시): ${dir}`)
}

/** e2e 워크스페이스 생성(echo file_changed 대상 sample.ts 포함). */
function makeWorkspace(slug: string): string {
  const ws = mkdtempSync(join(tmpdir(), `${slug}-ws-`))
  writeFileSync(join(ws, 'sample.ts'), 'export const sample = 1\nconst value = 2\n')
  return ws
}

// ── 단일챗 부트(격리 userData + EchoBackend) ─────────────────────────────────
// lr2-02 launchSingleChat 미러 + AGENTDECK_E2E=1(Echo). 재시작 시 같은 userDataDir 재사용.
async function launchSingle(
  userDataDir: string,
  workspace: string,
  opts: { openFolder?: boolean } = {},
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_PICK_FOLDER: workspace,
      AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 복원(close→relaunch) 창 OS 포커스/가시성 회복 — rAF 정지로 인한 'stable' 판정 미구동
  //   데드락 방지(BL1 P04 진단, helpers/relaunchFocus.ts). 신규 부트에서는 무해한 no-op.
  await focusRestoredWindow(app, page)

  // 신규 userData면 온보딩(#nickname)이 먼저, titlebar는 미마운트 — 둘 중 먼저 뜨는 것 대기.
  await Promise.race([
    page.waitForSelector('#nickname', { timeout: 25_000 }).catch(() => null),
    page.waitForSelector('.titlebar', { timeout: 25_000 }).catch(() => null),
  ])
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('p07테스트')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  const gate = page.locator('.eg-auth-dialog .sd-go')
  if (await gate.isVisible().catch(() => false)) await gate.click().catch(() => {})

  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) }
  await expect(page.locator('.pane.chat')).toBeVisible({ timeout: 15_000 })

  // 워크스페이스: 재시작 복원(대화 cwd)로 이미 열렸을 수 있음 → composer 미활성일 때만 폴더 선택.
  if (opts.openFolder !== false) {
    await page.waitForTimeout(1500) // restoreLastActiveConversation(비동기) 여유
    const input = page.locator('.pane.chat').getByLabel('메시지 입력')
    if (!(await input.isEnabled().catch(() => false))) {
      const pick = page.getByRole('button', { name: '폴더 선택' })
      if (await pick.isVisible().catch(() => false)) { await pick.click(); await page.waitForTimeout(800) }
    }
  }
  return { app, page }
}

// ── 멀티 부트(m3 launchAndEnterMulti 미러 + workspace/PICK_FOLDER env) ────────
async function launchMulti(
  userDataDir: string,
  workspace: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_PICK_FOLDER: workspace,
      AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 복원(close→relaunch) 창 OS 포커스/가시성 회복 — rAF 정지로 인한 'stable' 판정 미구동
  //   데드락 방지(BL1 P04 진단, helpers/relaunchFocus.ts). 신규 부트에서는 무해한 no-op.
  await focusRestoredWindow(app, page)

  const nick = page.locator('.login-body input#nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('p07테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { /* 기존 프로필 */ }

  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 6_000 })
    await skip.click(); await page.waitForTimeout(500)
  } catch { /* authed */ }

  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  // WhatsNew/UpdateNotes 닫기
  try {
    const modal = page.locator('.wn-overlay, .un-overlay')
    await modal.first().waitFor({ state: 'visible', timeout: 5_000 })
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
      if (!(await modal.first().isVisible().catch(() => false))) break
    }
  } catch { /* 미표시 */ }
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: 4_000 })
    await later.click(); await page.waitForTimeout(400)
  } catch { /* 미표시 */ }

  // 멀티 탭 진입 — 재시작 시 workspace.mode='multi'가 영속돼 이미 선택(aria-selected=true)일 수
  //   있다. 그 경우 클릭을 생략한다(이미 선택된 탭 재클릭은 불필요). 과거 force 우회의 근거였던
  //   "복원 페이지 상시 CSS 애니메이션이 'stable'을 굶긴다"는 BL1 P04 진단으로 반증됐다 —
  //   실원인은 복원 창의 OS 포커스 미획득 → rAF 전달 정지(04-diagnosis-notes.md). 부트 초입의
  //   focusRestoredWindow()가 rAF를 회복시키므로 일반 클릭으로 수렴한다.
  const multiBtn = page.locator('.sb-mode-btn', { hasText: '멀티 에이전트' })
  await multiBtn.waitFor({ state: 'visible', timeout: 10_000 })
  if ((await multiBtn.getAttribute('aria-selected')) !== 'true') {
    await multiBtn.click()
  }
  await page.locator('.multi').waitFor({ state: 'visible', timeout: 10_000 })
  return { app, page }
}

// ── 단일 토글 헬퍼 ────────────────────────────────────────────────────────────
function singleToggle(page: Page) {
  return page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
}
async function setSingleRepl(page: Page, on: boolean): Promise<void> {
  const t = singleToggle(page)
  await t.waitFor({ state: 'visible', timeout: 10_000 })
  const pressed = (await t.getAttribute('aria-pressed')) === 'true'
  if (pressed !== on) {
    await t.click()
    await expect(t).toHaveAttribute('aria-pressed', String(on), { timeout: 5_000 })
  }
}
async function expectSingleRepl(page: Page, on: boolean): Promise<void> {
  await expect(singleToggle(page)).toHaveAttribute('aria-pressed', String(on), { timeout: 10_000 })
}

/** 단일챗 메시지 전송 → echo 응답 확정 대기 → saveConversation(done) 여유. */
async function sendSingle(page: Page, text: string): Promise<void> {
  const input = page.locator('.pane.chat').getByLabel('메시지 입력')
  await input.waitFor({ state: 'visible', timeout: 10_000 })
  await expect(input).toBeEnabled({ timeout: 10_000 })
  await input.click()
  await input.fill(text)
  await input.press('Enter')
  await expect(page.locator('.pane.chat .msg.ai-msg .content').last()).toContainText('echo:', { timeout: 20_000 })
  await page.waitForTimeout(1500) // saveConversation(done) IPC 여유
}

/**
 * 사이드바에서 title로 대화 선택 → selectConversation 비동기 로드 대기.
 *
 * 재시작 직후 page2는 복원 페이지다. 과거엔 이 클릭을 force로 우회하며 "복원 페이지의 상시 CSS
 *   애니메이션(REPL 금색 glow-pulse 등)이 'stable' 액셔너빌리티를 굶긴다"고 봤으나, BL1 P04
 *   진단으로 반증됐다: 실원인은 복원 창이 OS 포커스/가시성을 못 얻어 Chromium이 rAF 전달을
 *   정지시킨 것(→ 'stable' 판정 미구동, 04-diagnosis-notes.md). 신규 세션 경로인 S1이 동일 클릭에
 *   통과하는 것도 이 창-포커스 차이로 설명된다. launchSingle/launchMulti 초입의
 *   focusRestoredWindow()가 rAF를 회복시키므로 이제 일반 클릭이 수렴한다(force 제거).
 */
async function selectSidebar(page: Page, title: string): Promise<void> {
  const item = page.locator('.sb-item', { hasText: title }).first()
  await item.waitFor({ state: 'visible', timeout: 10_000 })
  await item.scrollIntoViewIfNeeded().catch(() => {})
  await item.click()
  await page.waitForTimeout(900) // conversationLoad + replMode 복원 반영
}

// ── 멀티 토글/컴포저 헬퍼 ─────────────────────────────────────────────────────
function panelToggle(page: Page, slot: number) {
  return page.locator(`.ma-panel[data-slot="${slot}"]`).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
}
async function setPanelRepl(page: Page, slot: number, on: boolean): Promise<void> {
  const t = panelToggle(page, slot)
  await t.waitFor({ state: 'visible', timeout: 10_000 })
  const pressed = (await t.getAttribute('aria-pressed')) === 'true'
  if (pressed !== on) {
    await t.click()
    await expect(t).toHaveAttribute('aria-pressed', String(on), { timeout: 5_000 })
  }
}
async function expectPanelRepl(page: Page, slot: number, on: boolean): Promise<void> {
  await expect(panelToggle(page, slot)).toHaveAttribute('aria-pressed', String(on), { timeout: 10_000 })
}
async function setCount(page: Page, n: number): Promise<void> {
  const btn = page.locator('[aria-label="패널 수"] .ma-count-btn', { hasText: String(n) })
  await btn.waitFor({ state: 'visible', timeout: 8_000 })
  await btn.click()
  await expect(btn).toHaveAttribute('aria-selected', 'true', { timeout: 5_000 })
  await page.waitForTimeout(500)
}
/** 패널 폴더 미설정('폴더 선택')이면 pickFolder(AGENTDECK_E2E_PICK_FOLDER)로 워크스페이스 지정. */
async function ensurePanelFolder(page: Page, slot: number): Promise<void> {
  const folderBtn = page.locator(`.ma-panel[data-slot="${slot}"] .ma-p-folder`)
  await folderBtn.waitFor({ state: 'visible', timeout: 8_000 })
  const label = await folderBtn.locator('.ma-p-folder-name').textContent()
  if (label && label.includes('폴더 선택')) {
    await folderBtn.click()
    await page.waitForTimeout(700)
  }
}
/** 패널 메시지 전송 → 실행 완료(.ma-stop 소멸) 대기. */
async function sendPanel(page: Page, slot: number, text: string): Promise<void> {
  const ta = page.locator(`.ma-panel[data-slot="${slot}"] .ma-composer-ta`)
  await ta.waitFor({ state: 'visible', timeout: 8_000 })
  await expect(ta).toBeEnabled({ timeout: 10_000 })
  await ta.fill(text)
  await ta.press('Enter')
  const stop = page.locator(`.ma-panel[data-slot="${slot}"] .ma-stop`)
  const deadline = Date.now() + 20_000
  await page.waitForTimeout(500)
  while (Date.now() < deadline) {
    if (!(await stop.isVisible().catch(() => false))) break
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(500)
}
/** 멀티 디바운스 저장(≥500ms) + IPC 여유. */
async function waitMultiSave(page: Page): Promise<void> {
  await page.waitForTimeout(1400)
}

// ═══════════════════════════════════════════════════════════════════════════════
// S1: 단일챗 세션별 독립
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('LR4-P07 S1: 단일챗 세션별 독립', () => {
  test('A(OFF)/B(기본 ON) — 전환 시 각자 유지', async () => {
    test.setTimeout(120_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s1-udd-'))
    const workspace = makeWorkspace('lr4p07-s1')
    const { app, page } = await launchSingle(userDataDir, workspace)
    try {
      await withShot(page, 's1-flow', async () => {
        // A: 토글 OFF → send (대화 A 생성, replMode=false 영속)
        await setSingleRepl(page, false)
        await sendSingle(page, '메시지 A 독립검증')

        // 새 대화 B: 토글 기본 ON 확인 → send
        await page.getByRole('button', { name: '새 대화' }).click()
        await expectSingleRepl(page, true) // 새 대화 = getReplModeDefault() 폴백(ON)
        await sendSingle(page, '메시지 B 독립검증')

        // A로 전환 → OFF 유지
        await selectSidebar(page, '메시지 A 독립검증')
        await expectSingleRepl(page, false)

        // B로 전환 → ON 유지
        await selectSidebar(page, '메시지 B 독립검증')
        await expectSingleRepl(page, true)
      })
    } finally {
      await app.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// S2: 재시작 복원 (핵심 — JSON 스키마 실전)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('LR4-P07 S2: 재시작 복원', () => {
  test('send 후 close → 같은 userData 재기동 → A=OFF·B=ON 복원', async () => {
    test.setTimeout(150_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s2-udd-'))
    const workspace = makeWorkspace('lr4p07-s2')

    // ── 1차: A(OFF)·B(ON) 상태 구축(빈 대화 토글은 비영속 사양 → 반드시 send 후) ──
    const { app: app1, page: page1 } = await launchSingle(userDataDir, workspace)
    try {
      await withShot(page1, 's2-build', async () => {
        await setSingleRepl(page1, false)
        await sendSingle(page1, '메시지 A 재시작검증')
        await page1.getByRole('button', { name: '새 대화' }).click()
        await expectSingleRepl(page1, true)
        await sendSingle(page1, '메시지 B 재시작검증')
        await page1.waitForTimeout(1500) // 최종 저장 여유
      })

      // 디스크 강단정: 옛 truthy 게이트 회귀(false 소실) 방어 — 한 파일 false, 한 파일 true.
      const chatsDir = join(userDataDir, 'chats')
      const modes: Record<string, boolean | undefined> = {}
      if (existsSync(chatsDir)) {
        for (const f of readdirSync(chatsDir).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
          const rec = JSON.parse(readFileSync(join(chatsDir, f), 'utf8')) as { title?: string; replMode?: boolean }
          if (rec.title?.includes('메시지 A')) modes.A = rec.replMode
          if (rec.title?.includes('메시지 B')) modes.B = rec.replMode
        }
      }
      console.log('[LR4-P07 S2] 디스크 replMode — A:', modes.A, 'B:', modes.B)
      expect(modes.A, '대화 A는 replMode=false 영속(false 소실 방어)').toBe(false)
      expect(modes.B, '대화 B는 replMode=true 영속').toBe(true)
    } finally {
      await app1.close()
    }

    // ── 2차: 같은 userData 재기동 → 복원 ──
    const { app: app2, page: page2 } = await launchSingle(userDataDir, workspace)
    try {
      await withShot(page2, 's2-restore', async () => {
        await page2.waitForTimeout(2000) // restoreLastActiveConversation 비동기
        await selectSidebar(page2, '메시지 A 재시작검증')
        await expectSingleRepl(page2, false)
        await selectSidebar(page2, '메시지 B 재시작검증')
        await expectSingleRepl(page2, true)
      })
    } finally {
      await app2.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// S3: 하위호환 마이그레이션 (replMode 없는 옛 형식 레코드)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('LR4-P07 S3: 하위호환 마이그레이션', () => {
  test('replMode 필드 없는 옛 대화 JSON 시드 → 크래시 0 + 기본 ON 폴백', async () => {
    test.setTimeout(120_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s3-udd-'))
    const workspace = makeWorkspace('lr4p07-s3')

    // 옛 형식(마이그 전) 대화 레코드 시드 — replMode 필드 없음(실물 ChatFile 최소 유효 레코드).
    const chatsDir = join(userDataDir, 'chats')
    mkdirSync(chatsDir, { recursive: true })
    const oldId = randomUUID()
    const oldChat = {
      id: oldId,
      title: '옛 대화 마이그전',
      messages: [
        { role: 'user', content: '예전 질문' },
        { role: 'assistant', content: '예전 응답' },
      ],
      backendId: 'claude-code',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      custom_title: false,
      cwd: workspace.replace(/\\/g, '/'), // 존재 경로 → 로드 시 워크스페이스 복원
      // ⚠️ replMode 필드 의도적 부재 — undefined → getReplModeDefault() 폴백 경로 검증.
    }
    writeFileSync(join(chatsDir, `${oldId}.json`), JSON.stringify(oldChat))
    writeFileSync(join(chatsDir, 'index.json'), JSON.stringify({ version: 1, ids: [oldId] }))
    // ui-prefs: lastActiveId만 시드(replMode 키 부재 = 마이그 전 사용자) → 폴백 시드=true.
    writeFileSync(
      join(userDataDir, 'ui-prefs.json'),
      JSON.stringify({ 'conversation.lastActiveId': oldId, 'workspace.mode': 'single' }, null, 2),
    )

    const { app, page } = await launchSingle(userDataDir, workspace, { openFolder: false })
    try {
      await withShot(page, 's3-migration', async () => {
        // 크래시 0: 셸/채팅 pane 정상 렌더
        await expect(page.locator('.titlebar')).toBeVisible()
        await expect(page.locator('.pane.chat')).toBeVisible()
        await page.waitForTimeout(2000) // 복원 반영

        // 옛 대화 로드 → 토글 기본 ON 폴백(replMode 부재 → getReplModeDefault())
        await selectSidebar(page, '옛 대화 마이그전')
        await expectSingleRepl(page, true)

        // 복원 메시지 존재(로드 자체가 크래시 없이 성공)
        const msgs = await page.locator('.pane.chat .msg').count()
        console.log('[LR4-P07 S3] 복원 msg 수:', msgs)
        expect(msgs, '옛 대화 메시지 로드(크래시 0)').toBeGreaterThan(0)
      })
    } finally {
      await app.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// S4: 멀티 패널 독립 + 복원 (PanelThreadSnapshot.replMode 경로)
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('LR4-P07 S4: 멀티 패널 독립+복원', () => {
  test('패널0(OFF)/패널1(ON) send → 재시작 → 패널별 복원', async () => {
    test.setTimeout(180_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'lr4p07-s4-udd-'))
    const workspace = makeWorkspace('lr4p07-s4')

    // ── 1차: 패널0 OFF·패널1 기본 ON → 각각 send ──
    const { app: app1, page: page1 } = await launchMulti(userDataDir, workspace)
    try {
      await withShot(page1, 's4-build', async () => {
        await setCount(page1, 2)
        await ensurePanelFolder(page1, 0)
        await ensurePanelFolder(page1, 1)

        await setPanelRepl(page1, 0, false)
        await expectPanelRepl(page1, 1, true) // 신규 패널 기본 ON

        await sendPanel(page1, 0, '패널0 독립검증 메시지')
        await sendPanel(page1, 1, '패널1 독립검증 메시지')

        // 독립성: 패널0 OFF, 패널1 ON(서로 새지 않음)
        await expectPanelRepl(page1, 0, false)
        await expectPanelRepl(page1, 1, true)
        await waitMultiSave(page1)
      })

      // 디스크 강단정: 패널별 snapshot.replMode 영속(false 소실 방어)
      const blobPath = join(userDataDir, 'multi-agent.json')
      expect(existsSync(blobPath), 'multi-agent.json 존재').toBe(true)
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      const p0 = blob.sessions?.[0]?.panels?.[0]?.snapshot?.replMode
      const p1 = blob.sessions?.[0]?.panels?.[1]?.snapshot?.replMode
      console.log('[LR4-P07 S4] 디스크 snapshot.replMode — p0:', p0, 'p1:', p1)
      expect(p0, '패널0 snapshot.replMode=false 영속').toBe(false)
      expect(p1, '패널1 snapshot.replMode=true 영속').toBe(true)
    } finally {
      await app1.close()
    }

    // ── 2차: 재기동 → 패널별 복원 ──
    const { app: app2, page: page2 } = await launchMulti(userDataDir, workspace)
    try {
      await withShot(page2, 's4-restore', async () => {
        await page2.waitForTimeout(2000) // 마운트 복원 effect 여유
        await expectPanelRepl(page2, 0, false)
        await expectPanelRepl(page2, 1, true)
      })
    } finally {
      await app2.close()
      await safeRmDir(userDataDir)
      await safeRmDir(workspace)
    }
  })
})
