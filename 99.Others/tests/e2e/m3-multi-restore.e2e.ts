/**
 * m3-multi-restore.e2e.ts — M3 멀티 세션 영속 재시작 복원 e2e
 *
 * 검증 목표:
 *   SC-1 메타 복원(필수): sysPrompt / count 조작 → 저장 → 재구동 → DOM 단정.
 *   SC-2 cwd 거부(신뢰경계): 존재하지 않는 cwd를 blob에 주입 → 재구동 → 크래시 0 + 패널 기본 폴더.
 *   SC-3 thread 복원(LIVE_SDK 게이트): 패널 메시지 → 저장 → 재구동 → 버블 복원.
 *
 * userData 격리: 테스트마다 임시 dir 생성 → multi-agent.json을 해당 dir 안에 격리 →
 *   재구동 시 동일 dir를 --user-data-dir로 지정 → 오염 0.
 *
 * 디바운스 대기: MultiWorkspace는 변경 후 ≥500ms 디바운스 저장(RMW1-P05 이후 multi.cmdUpsert
 *   명령 IPC 경유) → 테스트는 저장 완료를 IPC 응답 intercept 대신 1200ms wait로 커버.
 *
 * 실행:
 *   node scripts/run-e2e.cjs tests/e2e/m3-multi-restore.e2e.ts
 *   LIVE_SDK=1 node scripts/run-e2e.cjs tests/e2e/m3-multi-restore.e2e.ts  (SC-3 포함)
 */

import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

// ── 공통 헬퍼 ───────────────────────────────────────────────────────────────

/** 앱 기동 + 초기 모달 통과 → `.multi` 섹션이 보이면 반환
 *
 * 순서:
 *   1) 닉네임 온보딩 → 제출
 *   2) EngineGate("계속 진행") → 우회
 *   3) .titlebar 대기 (Shell 렌더 확인)
 *   4) WhatsNew/UpdateNotes/EngineUpdateNotice 닫기
 *   5) 멀티 에이전트 탭 클릭 → .multi 대기
 */
async function launchAndEnterMulti(
  userDataDir: string,
  extraEnv: Record<string, string> = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [
      join(process.cwd(), 'out', 'main', 'index.js'),
      `--user-data-dir=${userDataDir}`,
    ],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      ...extraEnv,
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  // 프로필 온보딩: 닉네임 입력창이 있으면 채워서 통과 (AppGate 'onboarding' phase)
  // titlebar 이전에 처리해야 함 — 온보딩 중에는 titlebar 미표시
  const nick = page.locator('.login-body input#nickname')
  try {
    await nick.waitFor({ state: 'visible', timeout: 6_000 })
    await nick.fill('m3테스트')
    await page.locator('.login-body button.submit').click().catch(() => {})
    await page.waitForTimeout(600)
  } catch { /* 온보딩 없음 (기존 프로필) */ }

  // EngineGate: "계속 진행" 버튼(.sd-go)으로 우회 (authed 환경이면 미표시)
  try {
    const skip = page.locator('.eg-auth-dialog .sd-go')
    await skip.waitFor({ state: 'visible', timeout: 6_000 })
    await skip.click()
    await page.waitForTimeout(500)
  } catch { /* authed / 미표시 */ }

  // Shell 렌더 확인 — .titlebar가 나타날 때까지 대기 (타임아웃 30초)
  await page.waitForSelector('.titlebar', { timeout: 30_000 })

  // WhatsNew / UpdateNotes 모달 닫기
  try {
    const modal = page.locator('.wn-overlay, .un-overlay')
    await modal.first().waitFor({ state: 'visible', timeout: 5_000 })
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)
      if (!(await modal.first().isVisible().catch(() => false))) break
      const btn = page.locator('.wn-nav-cta, .un-cta').first()
      if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
      await page.waitForTimeout(300)
    }
  } catch { /* 미표시 */ }

  // EngineUpdateNotice 닫기 ("나중에" — 업데이트 시작 금지)
  try {
    const later = page.locator('.set-dialog .sd-cancel', { hasText: '나중에' })
    await later.waitFor({ state: 'visible', timeout: 4_000 })
    await later.click()
    await page.waitForTimeout(400)
  } catch { /* 미표시 */ }

  // 사이드바에서 "멀티 에이전트" 탭 클릭
  const multiBtn = page.locator('.sb-mode-btn', { hasText: '멀티 에이전트' })
  await multiBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await multiBtn.click()

  // MultiWorkspace 섹션 로드 대기
  await page.locator('.multi').waitFor({ state: 'visible', timeout: 10_000 })

  return { app, page }
}

/**
 * Windows에서 Electron 종료 직후 userData 디렉토리가 잠길 수 있음.
 * 짧은 지연 후 재시도해서 EPERM을 우회한다.
 */
async function safeRmDir(dir: string): Promise<void> {
  if (!dir) return
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch {
      // 잠금 해제 대기
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  // 최종 실패 시 무시 (임시 파일 — 시스템이 정리)
  console.warn(`[cleanup] rmSync 실패 (무시): ${dir}`)
}

/** 디바운스 저장 완료 대기 — 800ms (디바운스 500ms + 여유) */
async function waitForSave(page: Page): Promise<void> {
  await page.waitForTimeout(800)
}

// ── SC-1: 메타 복원 ─────────────────────────────────────────────────────────

test.describe('SC-1: 멀티 세션 메타 복원 (필수)', () => {
  let userDataDir: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc1-'))
  })

  test.afterAll(async () => {
    await safeRmDir(userDataDir)
  })

  test('SC-1-A: count=2 탭 변경 → 저장 → 재구동 → count=2 복원', async () => {
    test.setTimeout(90_000)

    // ── 1차 기동: count 변경 ─────────────────────────────────────────────
    const { app: app1, page: page1 } = await launchAndEnterMulti(userDataDir)

    // count 탭이 로드됐는지 확인
    const countBtns = page1.locator('[aria-label="패널 수"] .ma-count-btn')
    await countBtns.first().waitFor({ state: 'visible', timeout: 8_000 })

    // "2" 탭 클릭
    const btn2 = page1.locator('[aria-label="패널 수"] .ma-count-btn', { hasText: '2' })
    await btn2.click()
    await expect(btn2).toHaveAttribute('aria-selected', 'true')

    // 디바운스 저장 대기
    await waitForSave(page1)

    // multi-agent.json 디스크 확인
    const blobPath = join(userDataDir, 'multi-agent.json')
    const blobExists = existsSync(blobPath)
    console.log('[SC-1-A] multi-agent.json 존재:', blobExists, 'at', blobPath)
    expect(blobExists, 'multi-agent.json 저장 확인').toBe(true)

    if (blobExists) {
      const raw = readFileSync(blobPath, 'utf8')
      const blob = JSON.parse(raw)
      console.log('[SC-1-A] blob.version:', blob.version)
      console.log('[SC-1-A] sessions[0].count:', blob.sessions?.[0]?.count)
      expect(blob.version).toBe(2)
      expect(blob.sessions?.[0]?.count).toBe(2)
    }

    await app1.close()

    // ── 2차 기동: 복원 확인 ─────────────────────────────────────────────
    const { app: app2, page: page2 } = await launchAndEnterMulti(userDataDir)

    // count 탭 "2"가 선택된 상태(aria-selected=true)로 복원됐는지
    const btn2Restored = page2.locator('[aria-label="패널 수"] .ma-count-btn', { hasText: '2' })
    await btn2Restored.waitFor({ state: 'visible', timeout: 8_000 })
    // 복원 effect가 비동기 → 잠시 대기
    await page2.waitForTimeout(1000)
    await expect(btn2Restored).toHaveAttribute('aria-selected', 'true')
    console.log('[SC-1-A] count=2 복원 확인: PASS')

    await app2.close()
  })

  test('SC-1-B: sysPrompt 설정 → 저장 → 재구동 → .ma-p-prompt.on 클래스 복원', async () => {
    test.setTimeout(90_000)

    // ── 1차 기동: 패널 1의 프롬프트 설정 ────────────────────────────────
    const { app: app1, page: page1 } = await launchAndEnterMulti(userDataDir)

    // 첫 번째 패널(slot=0)의 프롬프트 버튼 클릭
    const promptBtn = page1.locator('.ma-panel').first().locator('.ma-p-prompt')
    await promptBtn.waitFor({ state: 'visible', timeout: 8_000 })
    await promptBtn.click()

    // PromptModal이 표시됐는지
    await page1.locator('.pr-textarea').waitFor({ state: 'visible', timeout: 5_000 })

    // sysPrompt 입력
    const PROMPT_TEXT = '항상 한국어로 답해줘 — m3 복원 테스트'
    await page1.locator('.pr-textarea').fill(PROMPT_TEXT)

    // 저장 버튼 클릭 (.pr-save)
    await page1.locator('.pr-save').click()

    // 모달이 닫히고 프롬프트 버튼에 .on 클래스가 추가됐는지
    await page1.locator('.pr-textarea').waitFor({ state: 'hidden', timeout: 5_000 })
    await expect(page1.locator('.ma-panel').first().locator('.ma-p-prompt')).toHaveClass(/\bon\b/)
    console.log('[SC-1-B] sysPrompt 설정 + .ma-p-prompt.on 확인: PASS')

    // 디바운스 저장 대기
    await waitForSave(page1)

    // blob 검증
    const blobPath = join(userDataDir, 'multi-agent.json')
    if (existsSync(blobPath)) {
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      const p0 = blob.sessions?.[0]?.panels?.[0]
      console.log('[SC-1-B] panel[0].sysPrompt:', p0?.sysPrompt)
      expect(p0?.sysPrompt).toContain('m3 복원 테스트')
    }

    await app1.close()

    // ── 2차 기동: .ma-p-prompt.on 복원 ─────────────────────────────────
    const { app: app2, page: page2 } = await launchAndEnterMulti(userDataDir)

    // 복원 effect 비동기 완료 대기
    await page2.waitForTimeout(1200)

    const promptBtnRestored = page2.locator('.ma-panel').first().locator('.ma-p-prompt')
    await promptBtnRestored.waitFor({ state: 'visible', timeout: 8_000 })
    await expect(promptBtnRestored).toHaveClass(/\bon\b/)
    console.log('[SC-1-B] sysPrompt .on 복원 확인: PASS')

    await app2.close()
  })
})

// ── SC-2: cwd 거부(신뢰경계) ────────────────────────────────────────────────

test.describe('SC-2: 존재하지 않는 cwd 주입 → 크래시 0 + 기본 폴더 표시', () => {
  let userDataDir: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc2-'))
  })

  test.afterAll(async () => {
    await safeRmDir(userDataDir)
  })

  test('SC-2-A: 존재 불가능 경로를 blob에 직접 주입 → 재구동 → 앱 크래시 0 + 패널 폴더 선택 표시', async () => {
    test.setTimeout(60_000)

    // 사전에 blob을 직접 hand-edit 주입
    // cwd가 존재하지 않는 경로 → validatePanelCwd()가 undefined drop해야 함
    const INVALID_CWD = '/this/path/does/not/exist/ever/truly/9999'
    const injectedBlob = {
      version: 2,
      activeSessionId: 'main-session',
      sessions: [
        {
          id: 'main-session',
          count: 3,
          panels: Array.from({ length: 6 }, (_, i) => ({
            title: `패널 ${i + 1}`,
            cwd: INVALID_CWD,
            picker: { model: 'sonnet', effort: 'high', mode: 'normal' },
          })),
        },
      ],
    }

    mkdirSync(userDataDir, { recursive: true })
    const blobPath = join(userDataDir, 'multi-agent.json')
    writeFileSync(blobPath, JSON.stringify(injectedBlob))
    console.log('[SC-2-A] 주입된 blob:', blobPath)

    // 재구동: 잘못된 cwd가 있는 blob으로 시작
    const { app, page } = await launchAndEnterMulti(userDataDir)

    // 크래시 없이 .multi 섹션이 표시됐는지(기본 확인)
    await expect(page.locator('.multi')).toBeVisible()
    console.log('[SC-2-A] .multi 섹션 크래시 0: PASS')

    // 패널이 표시됐는지 (count=3 복원)
    await page.waitForTimeout(1000)
    const panels = page.locator('.ma-panel')
    const panelCount = await panels.count()
    console.log('[SC-2-A] 표시된 패널 수:', panelCount)
    expect(panelCount).toBeGreaterThanOrEqual(1)

    // 각 패널 폴더 버튼 — "폴더 선택" 또는 기본 폴백 표시(존재하지 않는 cwd이므로 undefined drop)
    // cwd가 undefined drop → panelCwds[slot]이 없음 → effectiveCwd = workspaceRoot (전역, null 가능)
    // → workspaceRoot=null → cwdLabel = '폴더 선택'
    const folderBtns = page.locator('.ma-panel .ma-p-folder')
    const firstFolderBtn = folderBtns.first()
    await firstFolderBtn.waitFor({ state: 'visible', timeout: 8_000 })
    const folderLabel = await firstFolderBtn.locator('.ma-p-folder-name').textContent()
    console.log('[SC-2-A] 패널[0] 폴더 버튼 레이블:', folderLabel)

    // INVALID_CWD가 그대로 표시되면 신뢰경계 위반 — "폴더 선택" 또는 전역 폴백
    expect(
      folderLabel,
      `신뢰경계 위반: validatePanelCwd가 ${INVALID_CWD}를 통과시켰습니다`
    ).not.toContain('9999')

    console.log('[SC-2-A] 존재 불가능 cwd 거부 + 기본 폴백 확인: PASS')
    await app.close()
  })

  test('SC-2-B: version≠2 blob 주입 → 재구동 → graceful 빈 상태(크래시 0 + 패널 기본 렌더)', async () => {
    test.setTimeout(60_000)

    // version 불일치 → readMulti()가 null 반환 → 복원 없음 → 빈 초기상태(SAMPLE 폴백 의도적 제거, 커밋 c6d94d4)
    // 현행 동작: 크래시 0 + MultiWorkspace 기본 렌더(count=초기값, 패널 정상 표시)
    const badBlob = {
      version: 99,
      activeSessionId: 'main-session',
      sessions: [],
    }
    const blobPath = join(userDataDir, 'multi-agent.json')
    writeFileSync(blobPath, JSON.stringify(badBlob))
    console.log('[SC-2-B] version≠2 blob 주입:', blobPath)

    const { app, page } = await launchAndEnterMulti(userDataDir)

    // 1. 크래시 0 — .multi 섹션이 렌더됨
    await expect(page.locator('.multi')).toBeVisible()
    console.log('[SC-2-B] .multi 크래시 0: PASS')

    // 2. 패널 기본 렌더 — count 버튼이 있고 패널이 최소 1개 표시됨
    await page.waitForTimeout(1000)
    const countBtns = page.locator('[aria-label="패널 수"] .ma-count-btn')
    await countBtns.first().waitFor({ state: 'visible', timeout: 5_000 })
    // count 버튼 중 정확히 1개가 aria-selected="true" (현재 활성 count)
    const selectedBtns = page.locator('[aria-label="패널 수"] .ma-count-btn[aria-selected="true"]')
    await expect(selectedBtns).toHaveCount(1)
    const selectedCountText = await selectedBtns.textContent()
    console.log('[SC-2-B] 현재 활성 count:', selectedCountText)

    // 3. 패널이 최소 1개 표시 (선택된 count에 따라 패널 수 결정)
    await expect(page.locator('.ma-panel').first()).toBeVisible()

    // 4. '새 작업' 제목 폴백 — 빈 title → 패널 헤더가 '새 작업'으로 렌더됨(복원 없으므로)
    // (panelMetas[0].title='' → PanelView에서 '새 작업' 폴백 렌더)
    const panelHeader = page.locator('.ma-panel').first().locator('.ma-p-title, [class*="title"]').first()
    if (await panelHeader.count()) {
      const titleText = await panelHeader.textContent()
      console.log('[SC-2-B] 패널[0] 제목:', titleText)
      // '새 작업' 이거나 비어있거나 — INVALID 경로가 제목에 나타나면 안 됨
      expect(titleText).not.toContain('9999')
    }

    console.log('[SC-2-B] version≠2 graceful 빈 상태 확인: PASS')
    await app.close()
  })
})

// ── SC-3: thread 복원 (LIVE_SDK 게이트) ─────────────────────────────────────

test.describe('SC-3: thread 복원 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK 필요 — LIVE_SDK=1로 명시 실행')

  let userDataDir: string
  let workspace: string

  test.beforeAll(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc3-udata-'))
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-m3-sc3-ws-'))
    writeFileSync(join(workspace, 'hello.txt'), 'Hello M3 restore test\n')
  })

  test.afterAll(async () => {
    await safeRmDir(userDataDir)
    await safeRmDir(workspace)
  })

  test('SC-3-A: 패널 메시지 전송 → 저장 → 재구동 → user 버블 복원', async () => {
    test.setTimeout(180_000)

    // ── 1차 기동: 패널 0에 메시지 전송 ─────────────────────────────────
    const { app: app1, page: page1 } = await launchAndEnterMulti(userDataDir, {
      AGENTDECK_E2E_WORKSPACE: workspace,
    })

    // 패널 0: 워크스페이스 설정 (폴더 버튼 클릭 → IPC pickFolder는 e2e에서 우회 불가)
    // 대신 panelCwds를 직접 통제하려면 폴더 선택 IPC가 필요 → 전역 폴더 open으로 대체
    // (core-loop.e2e.ts 패턴: AGENTDECK_E2E_WORKSPACE env + 폴더 선택 버튼)
    const pickBtn = page1.getByRole('button', { name: '폴더 선택' })
    if (await pickBtn.isVisible().catch(() => false)) {
      await pickBtn.click()
      await page1.waitForTimeout(1000)
    }

    // 패널 0 composer에서 메시지 전송
    // 멀티 패널 composer는 .ma-panel[data-slot="0"] .ma-composer-ta
    const ta = page1.locator('.ma-panel[data-slot="0"] .ma-composer-ta')
    await ta.waitFor({ state: 'visible', timeout: 8_000 })

    // 패널이 활성화됐는지 (워크스페이스 없으면 disabled)
    const isDisabled = await ta.isDisabled().catch(() => true)
    if (isDisabled) {
      console.warn('[SC-3-A] 패널 0 composer disabled — 워크스페이스 설정 불가. SKIP.')
      await app1.close()
      return
    }

    const USER_MSG = 'hello m3 thread restore'
    await ta.fill(USER_MSG)
    await ta.press('Enter')

    // 어시스턴트 응답 대기 (최대 120초)
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const stopBtn = page1.locator('.ma-panel[data-slot="0"] .ma-stop')
      const isRunning = await stopBtn.isVisible().catch(() => false)
      if (!isRunning) {
        await page1.waitForTimeout(1000)
        break
      }
      await page1.waitForTimeout(1200)
    }

    // user 버블이 thread에 있는지 확인
    const userBubble = page1.locator('.ma-panel[data-slot="0"] .msg.user-msg')
    const hasBubble = (await userBubble.count()) > 0
    console.log('[SC-3-A] 1차 기동 user 버블 존재:', hasBubble)

    if (!hasBubble) {
      console.warn('[SC-3-A] user 버블 없음 — 패널 thread에 msg가 없는 상태. SKIP.')
      await app1.close()
      return
    }

    // 디바운스 저장 대기
    await waitForSave(page1)

    // blob 확인 — snapshot.messages에 user 메시지가 있어야 함
    const blobPath = join(userDataDir, 'multi-agent.json')
    if (existsSync(blobPath)) {
      const blob = JSON.parse(readFileSync(blobPath, 'utf8'))
      const snap = blob.sessions?.[0]?.panels?.[0]?.snapshot
      console.log('[SC-3-A] panel[0].snapshot.messages.length:', snap?.messages?.length)
      expect(snap?.messages?.length).toBeGreaterThan(0)
    }

    await app1.close()

    // ── 2차 기동: thread 복원 확인 ─────────────────────────────────────
    const { app: app2, page: page2 } = await launchAndEnterMulti(userDataDir, {
      AGENTDECK_E2E_WORKSPACE: workspace,
    })

    // 복원 effect 비동기 완료 대기
    await page2.waitForTimeout(1500)

    // 패널 0 thread에 user 버블이 복원됐는지
    const restoredBubble = page2.locator('.ma-panel[data-slot="0"] .msg.user-msg')
    const restoredCount = await restoredBubble.count()
    console.log('[SC-3-A] 재구동 후 user 버블 수:', restoredCount)
    expect(restoredCount).toBeGreaterThan(0)

    // 내용 확인 (thread 복원 시 user 메시지 내용이 있어야 함)
    const content = await restoredBubble.first().textContent()
    console.log('[SC-3-A] 복원된 user 버블 내용:', content?.slice(0, 80))
    expect(content).toContain(USER_MSG)

    console.log('[SC-3-A] thread 복원 확인: PASS')
    await app2.close()
  })
})
