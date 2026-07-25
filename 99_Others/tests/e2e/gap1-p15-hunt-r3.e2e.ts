/**
 * gap1-p15-hunt-r3.e2e.ts — GAP1 P15 라이브 버그 헌팅 루프 라운드 3 신규 시나리오 (opt-in).
 *
 * Phase 정본 = `01.Phases/17_GAP1-core-parity/15-live-bug-hunt-loop.md` ① 배터리 확장 —
 * 라운드 3 배정 축(미커버 우선) 2개 + R2 봉합(커밋 9a6c571)의 라이브 확증(W1~W3).
 * 원장 = 15-rounds-log.md. R2 신규 결함 2건(R2-T1·R2-T3)이라 수렴 미충족 — 이번 R3이
 * 신규 0건이면 수렴 1/2.
 *
 *   L1) 재시작 복원 이어가기(신규 축): 같은 userData/워크스페이스로 앱을 2회 기동.
 *       기동 A에서 REPL 세션 2턴(코드워드 ORCHID-77 각인 + 짧은 턴) → 정상 종료(app.close)
 *       → 기동 B에서
 *       - 스레드 복원 무결: user 버블에 코드워드 프롬프트, ai 버블에 SAVED/TURN_TWO_OK
 *         재표시 하드 단정(restoreLastActiveConversation → thread 재구성).
 *       - 세션 정체성: `.ctx-restored-badge`(restoredSession = sessionId 보유 + 메시지≥1)
 *         하드 단정 — resume 대상 세션이 유지된다는 UI 계약.
 *       - 이어진 턴 완주: 복원 세션에서 코드워드 회상 턴(resume 경로, sdkOptions
 *         resumeSessionId) → ORCHID-77 회수 하드 단정.
 *       - [W3/R2-T3 확증] REPL 턴2·복원 후 턴에서 컨텍스트 게이지(.ctx-chip 첫번째)
 *         used가 K/M 단위(캐시 합산 실점유) 하드 단정 — 캐시 미합산이던 R2-T3에서는
 *         input만 계수돼 "9 / 1M 토큰"(한 자릿수)로 고정됐다(gaugeCalc 4항 합산 봉합).
 *       - [W4/R2-T4 관찰] app.close 소요 측정(기동 A 종료·teardown) — 60s 초과 재발 시
 *         티켓 승격 데이터(하드 단정 X, annotation).
 *       (기존 lr2-02 held-open resume 스펙과 별개 — 현 GAP1 UI(복원 배지·게이지·REPL
 *        기본 ON) 기준 신규 작성.)
 *
 *   L2) 권한 거부 후 연속(신규 축): '일반' 모드(변경마다 승인)에서
 *       - 파일 생성 지시 → 권한 카드 **거부**(data-perm-choice="deny") → 에이전트가
 *         거부를 소화하고 턴 종료(DENIED_ACK 회수 + 정지버튼 소멸) + 디스크 미반영
 *         하드 단정(canUseTool deny → "사용자가 거부했습니다." 메시지 경로).
 *       - 같은 세션 후속 무도구 턴 정상 + **거부 잔류 상태 없음**: 턴 진행 중 권한 카드
 *         재등장 0 하드 단정(유령 waiter/카드 잔존 = 결함).
 *       - 같은 지시 재시도 → 이번엔 **승인**(allow) → 디스크 반영 + WRITE_OK 하드 단정.
 *       - 메인 콘솔 unhandled rejection 0(deny resolve 경로 위생 — W5 인접).
 *
 *   L3) R2 봉합 라이브 확증(신규 시나리오 아님 — 봉합 확증 전용):
 *       - [W1/R2-T1 확증] 실 SDK Grep(content) → P08 검색 카드 구조화 렌더
 *         ([data-search-file]/[data-search-match]) **하드 단정** — hunt-r2 L1의 soft를
 *         봉합 후 하드로 승격(claude-stream.ts 빈 filenames 대조 생략).
 *       - [W2/R2-A 확증] 매치(400줄 파일의 350행) 클릭 → CodeViewer가 해당 라인으로
 *         스크롤: `.cm-scroller` scrollTop>0 + 매치 라인 중앙대역(0.2~0.8) 하드 단정
 *         (CodeViewer line prop → EditorView.scrollIntoView {y:'center'}).
 *
 * 실 구독 인증으로 실 SDK를 호출하므로 **opt-in**(hunt-r1/r2 선례):
 *   GAP1HUNT3=1 node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/gap1-p15-hunt-r3.e2e.ts
 *
 * 결정론 주의: 회귀 게이트가 아니라 *헌팅 통주* — 실 모델 응답에 의존한다. 기본 스위트는
 * skip(env 게이트). 프롬프트는 도구·응답 토큰을 명시해 변동성을 줄인다.
 * ⚠️ AGENTDECK_E2E 미설정(설정 시 EchoBackend 모크 — 로컬 부트가 부모 셸 상속을 코드로
 *   차단, isolatedBoot 계약 미러).
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isolatedBoot } from './helpers/isolatedBoot'
import { passBootGates, openWorkspace } from './helpers/bootGates'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.GAP1HUNT3 === '1'

const SHOT_DIR = join(process.cwd(), '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

// ── 셀렉터 상수(소스 실측 — hunt-r1/r2 관례 계승) ───────────────────────────────
const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
const USER_MSG = `${CHAT} .thread .msg.user`
/** LR1 맥락 복원 배지(Conversation.tsx RestoredContextBadge — restoredSession 파생). */
const RESTORED_BADGE = '.ctx-restored-badge'

function log(...a: unknown[]): void {
  console.log('[P15R3]', ...a)
}

/** 메인 프로세스 stdout/stderr 탭 — UnhandledPromiseRejection 채증(hunt-r1/r2 미러). */
function attachMainConsoleTap(app: ElectronApplication): { lines: string[]; rejections: string[] } {
  const lines: string[] = []
  const rejections: string[] = []
  const proc = app.process()
  const tap = (src: 'stdout' | 'stderr') => (chunk: Buffer | string): void => {
    for (const ln of chunk.toString().split(/\r?\n/)) {
      if (!ln.trim()) continue
      lines.push(`[main:${src}] ${ln}`)
      if (/UnhandledPromiseRejection|unhandledRejection|Unhandled promise rejection/i.test(ln)) {
        rejections.push(ln)
        log(`⚠ 메인 콘솔 unhandled rejection 관찰: ${ln}`)
      }
    }
  }
  proc.stdout?.on('data', tap('stdout'))
  proc.stderr?.on('data', tap('stderr'))
  return { lines, rejections }
}

/** 컴포저 전송(단일챗). 공백 포함 텍스트는 슬래시 팔레트가 열리지 않는다(fill 사용). */
async function send(page: Page, text: string): Promise<void> {
  const input = page.locator(CHAT).locator(INPUT)
  await input.click()
  await input.fill(text)
  await input.press('Enter')
}

/** 컴포저 피커(모델/모드) 선택(dogfood 미러). */
async function pick(page: Page, ariaLabel: string, optionText: string): Promise<void> {
  await page.getByLabel(ariaLabel).click()
  await expect(page.locator('.pick-menu')).toBeVisible()
  await page.locator('.pick-menu .pick-opt', { hasText: optionText }).first().click()
  await expect(page.locator('.pick-menu')).toHaveCount(0)
}

/** REPL 지속세션 ON 보장(기본 true — OFF 관찰 시 로그 후 토글, hunt-r1/r2 미러). */
async function ensureRepl(page: Page): Promise<void> {
  const replToggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  const pressed = await replToggle.getAttribute('aria-pressed').catch(() => null)
  log(`REPL aria-pressed=${pressed}`)
  if (pressed !== 'true') {
    await replToggle.click().catch(() => {})
    log('REPL OFF였음 → ON 토글(기본값 회귀 관찰 — 기본은 true여야 함)')
  }
}

/** 마지막 assistant 응답 내용 locator. */
function lastAi(page: Page): ReturnType<Page['locator']> {
  return page.locator(`${AI_MSG} .content`).last()
}

/**
 * 짧은 턴 실행 + 완주 + 응답 토큰 하드 단정(hunt-r2 L5 미러 — 무도구 프롬프트 전용).
 */
async function runShortTurn(page: Page, prompt: string, expectToken: string | RegExp, label: string): Promise<void> {
  await send(page, prompt)
  await expect(page.locator(STOP), `${label} 턴 시작(정지버튼)`).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(STOP), `${label} 180s 내 완주 실패`).toBeHidden({ timeout: 180_000 })
  await page.waitForTimeout(1_500) // reveal·후처리 여유
  await expect(lastAi(page), `${label} 응답 토큰 불일치`).toContainText(expectToken, { timeout: 15_000 })
}

/**
 * [W3/R2-T3 확증] 컨텍스트 게이지 첫 칩(현재 컨텍스트) used가 캐시 합산 실점유인지 단정.
 * 캐시 미합산(R2-T3)에서는 REPL 턴에서 input만 계수돼 used가 한 자릿수("9 / 1M 토큰")로
 * 고정됐다. claude_code preset 시스템 프롬프트만으로도 프롬프트 측 총점유는 수천 토큰
 * 이상 — used 표기가 K/M 단위(fmtTok: ≥1,000 토큰)면 합산 경로가 살아있다는 라이브 증거.
 */
async function assertCtxGaugeNontrivial(page: Page, label: string): Promise<void> {
  const chip = page.locator(`${CHAT} .ctx-chip`).first()
  const detail = (await chip.locator('.cc-detail').innerText().catch(() => '(없음)')).trim()
  const pct = (await chip.locator('.cc-pct').innerText().catch(() => '(없음)')).trim()
  log(`${label} 컨텍스트 칩: used="${detail}" pct="${pct}"`)
  expect(detail, `W3 위반 — 게이지 used가 캐시 미합산 수준(R2-T3 재발): "${detail}"`).toMatch(
    /^\d+(\.\d+)?[KM] \//
  )
  test.info().annotations.push({ type: 'W3-gauge', description: `${label}: ${detail} (${pct})` })
}

/**
 * [W4/R2-T4 관찰] app.close 소요 측정 — R2에서 dogfood ③실패 후 teardown 60s 초과가
 * 1회 관찰됐다(관찰 보류). 하드 단정 X(열린 관찰 항목을 pass/fail로 오염하지 않는다) —
 * 소요치를 annotation으로 남겨 재발 판정 데이터로 쓴다.
 */
async function timedClose(app: ElectronApplication, label: string): Promise<number> {
  const t0 = Date.now()
  await app.close().catch(() => {})
  const ms = Date.now() - t0
  log(`${label} app.close ${ms}ms${ms > 60_000 ? ' — ⚠ R2-T4 재발(60s 초과)' : ''}`)
  test.info().annotations.push({
    type: 'W4-teardown',
    description: `${label} app.close ${ms}ms${ms > 60_000 ? ' — R2-T4 재발(티켓 승격 대상)' : ''}`,
  })
  return ms
}

/**
 * 앱 기동 + 부트 게이트 통과(재사용 가능 — L1은 같은 tmp 2쌍으로 2회 기동한다).
 * 라이브 필수: AGENTDECK_E2E 부모 셸 상속을 코드로 차단(isolatedBoot 계약 미러).
 * 재기동(두 번째 이후)에서는 프로필이 영속돼 온보딩·WhatsNew가 안 뜨고, 워크스페이스는
 * restoreLastActiveConversation이 대화 레코드에서 복원한다 — '폴더 선택'은 폴백으로만.
 */
async function launchApp(
  userDataDir: string,
  workspace: string,
  opts: { nickname?: string; waitForTree?: boolean } = {}
): Promise<{ app: ElectronApplication; page: Page }> {
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    AGENTDECK_E2E_WORKSPACE: workspace,
    AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
  }
  delete childEnv.AGENTDECK_E2E // 라이브 필수 — 부모 셸 상속 차단

  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: childEnv as Record<string, string>,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await passBootGates(page, { nickname: opts.nickname ?? 'p15r3' })

  // 워크스페이스: 첫 기동은 '폴더 선택' 경로, 재기동은 대화 레코드 복원이 먼저 붙을 수
  // 있다 — composer가 이미 활성화면 클릭 생략(openWorkspace가 isVisible 가드).
  const input = page.locator(CHAT).getByLabel('메시지 입력')
  if (!(await input.isEnabled().catch(() => false))) {
    await openWorkspace(page, { waitForTree: opts.waitForTree ?? true })
  }
  await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 15_000 })
  return { app, page }
}

// ═══════════════════════════════════════════════════════════════════════════════
// L1) 재시작 복원 이어가기
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('GAP1 P15 R3-L1: 재시작 복원 이어가기 — 스레드 무결·세션 정체성·resume 턴 + W3/W4 (opt-in: GAP1HUNT3=1)', () => {
  test.skip(!RUN, 'P15 라운드 3 라이브 헌팅 — GAP1HUNT3=1로 명시 실행')

  test('2턴 → 정상 종료 → 재기동 → 복원 스레드 + 복원 배지 + 이어진 회상 턴', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    // tmp 2쌍은 기동 A/B가 공유 — teardown은 시나리오 끝에서만.
    const userDataDir = mkdtempSync(join(tmpdir(), 'p15r3-l1-udd-'))
    const workspace = mkdtempSync(join(tmpdir(), 'p15r3-l1-ws-'))
    writeFileSync(join(workspace, 'README.md'), '# P15 R3 재시작 복원 워크스페이스\n')

    let appB: ElectronApplication | null = null
    try {
      // ── 기동 A: REPL 세션 2턴 ──────────────────────────────────────────────
      const { app: appA, page: pageA } = await launchApp(userDataDir, workspace)
      const tapA = attachMainConsoleTap(appA)
      await ensureRepl(pageA)

      await runShortTurn(
        pageA,
        'Remember this codeword: ORCHID-77. Reply exactly SAVED and nothing else. Do not use any tools.',
        'SAVED',
        '턴1(코드워드)'
      )
      await runShortTurn(
        pageA,
        'Reply exactly TURN_TWO_OK and nothing else. Do not use any tools.',
        'TURN_TWO_OK',
        '턴2'
      )
      // [W3 ①] REPL 턴2 시점 게이지 — 캐시 합산 실점유(R2-T3 봉합 라이브 확증)
      await assertCtxGaugeNontrivial(pageA, '기동A 턴2 후')

      const userCountA = await pageA.locator(USER_MSG).count()
      const aiCountA = await pageA.locator(AI_MSG).count()
      log(`기동A 종료 직전 버블: user=${userCountA} ai=${aiCountA}`)
      await pageA.screenshot({ path: join(SHOT_DIR, 'p15r3-01-two-turns-before-restart.png') })

      expect(
        tapA.rejections.length,
        `기동A unhandled rejection ${tapA.rejections.length}건: ${tapA.rejections[0] ?? ''}`
      ).toBe(0)

      // 영속 flush 여유(done 후 saveConversation → conversationSave IPC) → 정상 종료.
      await pageA.waitForTimeout(2_500)
      await timedClose(appA, '기동A(정상 종료)') // [W4 관찰]

      // ── 기동 B: 복원 확인 + 이어진 턴 ─────────────────────────────────────
      const { app, page: pageB } = await launchApp(userDataDir, workspace, { waitForTree: false })
      appB = app
      const tapB = attachMainConsoleTap(appB)

      // 스레드 복원 무결: 이전 대화(코드워드 프롬프트·SAVED·TURN_TWO_OK)가 다시 표시.
      await expect(
        pageB.locator(USER_MSG).first(),
        '재기동 후 user 버블 미복원(restoreLastActiveConversation 경로 유실 의심)'
      ).toBeVisible({ timeout: 20_000 })
      const userCountB = await pageB.locator(USER_MSG).count()
      const aiCountB = await pageB.locator(AI_MSG).count()
      log(`기동B 복원 버블: user=${userCountB} ai=${aiCountB} (기동A user=${userCountA} ai=${aiCountA})`)
      test.info().annotations.push({
        type: 'L1-restore',
        description: `버블 수 A(user=${userCountA},ai=${aiCountA}) → B(user=${userCountB},ai=${aiCountB})`,
      })
      const threadText = (await pageB.locator(`${CHAT} .thread`).innerText().catch(() => '')) ?? ''
      expect(threadText, '복원 스레드에 코드워드 턴(user) 부재').toContain('ORCHID-77')
      expect(threadText, '복원 스레드에 턴1 응답(SAVED) 부재').toContain('SAVED')
      expect(threadText, '복원 스레드에 턴2 응답(TURN_TWO_OK) 부재').toContain('TURN_TWO_OK')
      expect(userCountB, 'user 버블 수 복원 불일치(2턴 미만)').toBeGreaterThanOrEqual(2)
      expect(aiCountB, 'ai 버블 수 복원 불일치(2턴 미만)').toBeGreaterThanOrEqual(2)

      // 세션 정체성: 복원 배지(restoredSession = sessionId 보유 + 메시지≥1 → resume 활성).
      await expect(
        pageB.locator(RESTORED_BADGE),
        '복원 배지 부재 — sessionId 미영속/미복원 의심(resume 세션 정체성 상실)'
      ).toBeVisible({ timeout: 10_000 })
      await pageB.screenshot({ path: join(SHOT_DIR, 'p15r3-02-restored-thread-badge.png') })

      // REPL 상태 복원 관찰(대화별 replMode 영속 — 기본 true 기대) 후 이어진 턴.
      await ensureRepl(pageB)
      await runShortTurn(
        pageB,
        'What was the codeword I gave you earlier in this conversation? Reply with the codeword only. Do not use any tools.',
        /ORCHID-77/,
        '턴3(재기동 회상)'
      )
      // [W3 ②] 복원 후 resume 턴 게이지 — 캐시 포함 실점유 유지.
      await assertCtxGaugeNontrivial(pageB, '기동B 회상 턴 후')
      await pageB.screenshot({ path: join(SHOT_DIR, 'p15r3-03-resume-turn-recall.png') })

      expect(
        tapB.rejections.length,
        `기동B unhandled rejection ${tapB.rejections.length}건: ${tapB.rejections[0] ?? ''}`
      ).toBe(0)
    } finally {
      if (appB) await timedClose(appB, '기동B(teardown)') // [W4 관찰]
      rmSync(userDataDir, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L2) 권한 거부 후 연속
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('GAP1 P15 R3-L2: 권한 거부 후 연속 — 거부 소화·잔류 0·재시도 승인 (opt-in: GAP1HUNT3=1)', () => {
  test.skip(!RUN, 'P15 라운드 3 라이브 헌팅 — GAP1HUNT3=1로 명시 실행')

  test('거부 → 턴 종료·디스크 미반영 → 무도구 턴 카드 잔류 0 → 승인 → 정상 생성', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, workspace, teardown } = await isolatedBoot({ slug: 'p15r3-l2' })
    const tapped = attachMainConsoleTap(app)
    try {
      await ensureRepl(page)
      // 단일챗 기본 모드는 '자동'(auto — 도구 자동 진행)이라 카드가 안 뜬다.
      // '일반'(변경마다 승인)으로 전환해 권한 게이트를 활성화한다(dogfood ⑤ fallback 선례).
      await pick(page, '모드 선택', '일반')

      const GUARD = join(workspace, 'guard.txt')

      // ── 턴 1: 파일 생성 지시 → 권한 카드 거부 ────────────────────────────────
      await send(
        page,
        'Use the Write tool exactly once to create a file named "guard.txt" in the workspace root ' +
          'containing exactly "GUARD_V1". If the tool permission is denied, do not retry and do not ' +
          'use any other tools or workarounds; reply exactly DENIED_ACK and end your turn.'
      )
      const permCard = page.locator(PERM_CARD)
      await permCard.waitFor({ state: 'visible', timeout: 180_000 })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r3-04-perm-card-deny.png') })
      await permCard.locator('[data-perm-choice="deny"]').click()
      log('권한 카드 거부 클릭')

      // 거부 소화: 추가 카드가 뜨면(프롬프트 이탈 — 우회 시도) 계속 거부하며 턴 종료 대기.
      let extraDenies = 0
      const denyDeadline = Date.now() + 180_000
      while (Date.now() < denyDeadline) {
        if (await permCard.isVisible().catch(() => false)) {
          extraDenies += 1
          await permCard.locator('[data-perm-choice="deny"]').click().catch(() => {})
          log(`⚠ 추가 권한 카드 재등장 → 재거부(${extraDenies}회) — 프롬프트 이탈 관찰`)
          await page.waitForTimeout(800)
          continue
        }
        const running = await page.locator(STOP).isVisible().catch(() => false)
        if (!running) break
        await page.waitForTimeout(1_000)
      }
      await expect(page.locator(STOP), '거부 후 턴 미종료(정지버튼 잔존 — 거부 미소화)').toBeHidden({
        timeout: 10_000,
      })
      await page.waitForTimeout(1_500)
      await expect(lastAi(page), '거부 소화 응답(DENIED_ACK) 미회수').toContainText('DENIED_ACK', {
        timeout: 15_000,
      })
      expect(existsSync(GUARD), '거부했는데 guard.txt가 디스크에 생성됨(거부 무시 — 결함)').toBe(false)
      await expect(page.locator(PERM_CARD), '턴 종료 후 권한 카드 잔존').toHaveCount(0)
      test.info().annotations.push({
        type: 'L2-deny',
        description: `거부 소화 OK — 추가 카드 재등장 ${extraDenies}회(0이 기대치, >0은 모델 이탈 관찰)`,
      })

      // ── 턴 2: 무도구 후속 턴 — 거부 잔류 상태 없음(카드 재등장 0) ────────────
      await send(page, 'Reply exactly CLEAN_TURN and nothing else. Do not use any tools.')
      await expect(page.locator(STOP), '후속 턴 시작').toBeVisible({ timeout: 30_000 })
      let ghostCards = 0
      const cleanDeadline = Date.now() + 120_000
      while (Date.now() < cleanDeadline) {
        if (await permCard.isVisible().catch(() => false)) ghostCards += 1
        const running = await page.locator(STOP).isVisible().catch(() => false)
        if (!running) break
        await page.waitForTimeout(500)
      }
      await expect(page.locator(STOP), '후속 턴 120s 내 완주 실패').toBeHidden({ timeout: 10_000 })
      await page.waitForTimeout(1_500)
      expect(ghostCards, `거부 잔류 — 무도구 턴에서 권한 카드 재등장 ${ghostCards}회(유령 waiter 의심)`).toBe(0)
      await expect(lastAi(page), '후속 턴 응답(CLEAN_TURN) 불일치').toContainText('CLEAN_TURN', {
        timeout: 15_000,
      })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r3-05-after-deny-clean-turn.png') })

      // ── 턴 3: 같은 지시 재시도 → 이번엔 승인 → 정상 생성 ────────────────────
      await send(
        page,
        'Use the Write tool exactly once to create a file named "guard.txt" in the workspace root ' +
          'containing exactly "GUARD_V2". Then reply exactly WRITE_OK and end your turn. ' +
          'Do not use any other tools.'
      )
      await permCard.waitFor({ state: 'visible', timeout: 180_000 })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r3-06-perm-card-approve.png') })
      await permCard.locator('[data-perm-choice="allow"]').click()
      log('권한 카드 승인 클릭')
      const allowDeadline = Date.now() + 180_000
      while (Date.now() < allowDeadline) {
        // 같은 턴 추가 권한 요청(예: 재시도 Write) — 계속 승인(dogfood ⑤ 폴링 미러).
        if (await permCard.isVisible().catch(() => false)) {
          await permCard.locator('[data-perm-choice="allow"]').click().catch(() => {})
          await page.waitForTimeout(800)
          continue
        }
        const running = await page.locator(STOP).isVisible().catch(() => false)
        if (!running) break
        await page.waitForTimeout(1_000)
      }
      await expect(page.locator(STOP), '승인 후 턴 미종료').toBeHidden({ timeout: 10_000 })
      await page.waitForTimeout(1_500)
      await expect(lastAi(page), '승인 턴 응답(WRITE_OK) 미회수').toContainText('WRITE_OK', {
        timeout: 15_000,
      })
      expect(existsSync(GUARD), '승인했는데 guard.txt 미생성').toBe(true)
      expect(readFileSync(GUARD, 'utf8'), 'guard.txt 내용 불일치').toContain('GUARD_V2')
      await page.screenshot({ path: join(SHOT_DIR, 'p15r3-07-deny-then-approve-final.png') })

      // 메인 콘솔 위생(deny resolve 경로 — W5 인접).
      expect(
        tapped.rejections.length,
        `unhandled rejection ${tapped.rejections.length}건: ${tapped.rejections[0] ?? ''}`
      ).toBe(0)
      log(`메인 콘솔 수집 ${tapped.lines.length}줄, rejection 0건`)
    } finally {
      await teardown()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// L3) R2 봉합 라이브 확증 — W1(검색 카드 구조화 렌더 하드) + W2(클릭→라인 중앙 스크롤)
// ═══════════════════════════════════════════════════════════════════════════════

const NEEDLE_FILE = 'needle-hunt.ts'
const NEEDLE_LINE = 350
const NEEDLE_TOTAL = 400

function buildNeedleFile(): string {
  const lines: string[] = []
  lines.push('// needle-hunt.ts — P15 R3 라인 점프 픽스처(생성물, 사람이 편집하지 않음)')
  while (lines.length < NEEDLE_TOTAL) {
    const n = lines.length + 1
    if (n === NEEDLE_LINE) {
      lines.push(`export const HIT_${n} = 'NEEDLE_R3' // marker line ${n}`)
    } else {
      lines.push(`export const v${n} = ${n} // filler ${n}`)
    }
  }
  return lines.join('\n') + '\n'
}

test.describe('GAP1 P15 R3-L3: R2 봉합 라이브 확증 — 검색 카드 구조화 렌더(W1)·매치 클릭 라인 중앙 스크롤(W2) (opt-in: GAP1HUNT3=1)', () => {
  test.skip(!RUN, 'P15 라운드 3 라이브 헌팅 — GAP1HUNT3=1로 명시 실행')

  test('실 SDK Grep(content) → [data-search-*] 하드 렌더 → 350행 매치 클릭 → 중앙 스크롤', async () => {
    test.setTimeout(420_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const userDataDir = mkdtempSync(join(tmpdir(), 'p15r3-l3-udd-'))
    const workspace = mkdtempSync(join(tmpdir(), 'p15r3-l3-ws-'))
    writeFileSync(join(workspace, NEEDLE_FILE), buildNeedleFile())
    writeFileSync(join(workspace, 'README.md'), '# P15 R3 라인 점프 워크스페이스\n')

    let app: ElectronApplication | null = null
    try {
      const boot = await launchApp(userDataDir, workspace)
      app = boot.app
      const page = boot.page
      const tapped = attachMainConsoleTap(app)
      await ensureRepl(page)

      // ── Grep(content) 턴 — 실 SDK는 filenames:[]·numFiles:0으로 반환(R2-T1 기계 증거).
      //    봉합(빈 배열 대조 생략) 후엔 구조화 렌더가 살아야 한다.
      await send(
        page,
        `Call the Grep tool exactly once with pattern "NEEDLE_R3" and output_mode "content" over this ` +
          `workspace, then reply exactly SEARCH_DONE and end your turn. Do not use any other tools ` +
          `and do not read any files.`
      )
      // Grep은 READONLY — 권한 카드 없이 완주(정지버튼 소멸 대기).
      await expect(page.locator(STOP), '검색 턴 시작').toBeVisible({ timeout: 30_000 })
      await expect(page.locator(STOP), '검색 턴 240s 내 완주 실패').toBeHidden({ timeout: 240_000 })
      await page.waitForTimeout(1_500)
      await expect(lastAi(page)).toContainText('SEARCH_DONE', { timeout: 15_000 })

      // [W1 하드] 검색 카드 구조화 렌더 — hunt-r2 L1 soft의 봉합 후 하드 승격.
      const searchCard = page.locator('.t-item.t-search')
      expect(await searchCard.count(), '검색 도구 카드 자체 미렌더(tool_call 렌더 결함)').toBeGreaterThan(0)
      await searchCard.locator('.t-row').last().click()
      await expect(
        page.locator('[data-search-file]').first(),
        'W1 위반 — 검색 카드 구조화 렌더 실패(R2-T1 봉합 회귀: S6b filenames 대조 오드롭)'
      ).toBeVisible({ timeout: 10_000 })
      const matchCount = await page.locator('[data-search-match]').count()
      log(`검색 카드 구조화 렌더 OK — 매치 ${matchCount}건(기대 1 — ${NEEDLE_LINE}행)`)
      expect(matchCount, 'W1 — 매치 라인 버튼 0건').toBeGreaterThan(0)
      test.info().annotations.push({
        type: 'W1-search-card',
        description: `P08 검색 카드 구조화 렌더 라이브 확증 — 매치 ${matchCount}건(기대 1)`,
      })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r3-08-search-card-structured.png') })

      // [W2 하드] 350행 매치 클릭 → CodeViewer 열림 → 해당 라인 중앙 스크롤(R2-A 봉합).
      const targetMatch = page.locator(`[data-search-match][data-line="${NEEDLE_LINE}"]`)
      expect(
        await targetMatch.count(),
        `W2 — data-line="${NEEDLE_LINE}" 매치 버튼 부재(어댑터 라인 파싱 유실 의심)`
      ).toBeGreaterThan(0)
      await targetMatch.first().click()
      await page.waitForSelector('.fv-overlay .cm-editor', { timeout: 20_000 })

      // 스크롤 정착 폴링(scrollIntoView effect는 마운트 직후 dispatch — 안정화 대기).
      const scroller = page.locator('.fv-overlay .cm-scroller')
      let prevTop = -1
      for (let i = 0; i < 20; i++) {
        const top = await scroller.evaluate((el) => Math.round(el.scrollTop)).catch(() => -1)
        if (top === prevTop && top > 0) break
        prevTop = top
        await page.waitForTimeout(250)
      }
      log(`뷰어 scrollTop=${prevTop}px (400줄 중 ${NEEDLE_LINE}행 — 0이면 스크롤 미동작)`)
      expect(prevTop, 'W2 위반 — 매치 클릭 후 뷰어 스크롤 0(라인 점프 미동작, R2-A 회귀)').toBeGreaterThan(0)

      // 중앙대역 단정: 매치 라인의 세로 중심이 스크롤러 뷰포트 0.2~0.8 대역(y:'center' 계약,
      // 폰트 메트릭·클램프 여유를 둔 관대한 대역). 정확 비율은 annotation.
      const ratio = await page.evaluate(() => {
        const sc = document.querySelector('.fv-overlay .cm-scroller')
        if (!sc) return -1
        const target = [...document.querySelectorAll('.fv-overlay .cm-line')].find((l) =>
          (l.textContent ?? '').includes('NEEDLE_R3')
        )
        if (!target) return -2
        const sr = sc.getBoundingClientRect()
        const tr = target.getBoundingClientRect()
        return (tr.top + tr.height / 2 - sr.top) / sr.height
      })
      log(`매치 라인 중심 비율=${typeof ratio === 'number' ? ratio.toFixed(3) : ratio} (0.5=정중앙)`)
      expect(ratio, 'W2 — 매치 라인이 뷰포트에 미렌더(가상화 밖 = 스크롤 미도달)').toBeGreaterThanOrEqual(0)
      expect(ratio, `W2 위반 — 매치 라인이 중앙대역 밖(비율 ${ratio.toFixed(3)})`).toBeGreaterThanOrEqual(0.2)
      expect(ratio, `W2 위반 — 매치 라인이 중앙대역 밖(비율 ${ratio.toFixed(3)})`).toBeLessThanOrEqual(0.8)
      test.info().annotations.push({
        type: 'W2-line-scroll',
        description: `매치 클릭→라인 스크롤 라이브 확증 — scrollTop=${prevTop}px, 중심 비율=${ratio.toFixed(3)}`,
      })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r3-09-search-line-centered.png') })
      await page.keyboard.press('Escape')
      await expect(page.locator('.fv-overlay')).toHaveCount(0)

      expect(
        tapped.rejections.length,
        `unhandled rejection ${tapped.rejections.length}건: ${tapped.rejections[0] ?? ''}`
      ).toBe(0)
    } finally {
      if (app) await timedClose(app, 'L3(teardown)') // [W4 관찰]
      rmSync(userDataDir, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
