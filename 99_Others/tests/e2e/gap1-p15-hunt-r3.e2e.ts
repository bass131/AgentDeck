import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { isolatedBoot } from './helpers/isolatedBoot'
import { passBootGates, openWorkspace } from './helpers/bootGates'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.GAP1HUNT3 === '1'

const SHOT_DIR = join(process.cwd(), '01_Phases', '17_GAP1-core-parity', 'ScreenShot')

const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
const USER_MSG = `${CHAT} .thread .msg.user`
const RESTORED_BADGE = '.ctx-restored-badge'

function log(...a: unknown[]): void {
  console.log('[P15R3]', ...a)
}

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

async function send(page: Page, text: string): Promise<void> {
  const input = page.locator(CHAT).locator(INPUT)
  await input.click()
  await input.fill(text)
  await input.press('Enter')
}

async function pick(page: Page, ariaLabel: string, optionText: string): Promise<void> {
  await page.getByLabel(ariaLabel).click()
  await expect(page.locator('.pick-menu')).toBeVisible()
  await page.locator('.pick-menu .pick-opt', { hasText: optionText }).first().click()
  await expect(page.locator('.pick-menu')).toHaveCount(0)
}

async function ensureRepl(page: Page): Promise<void> {
  const replToggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  const pressed = await replToggle.getAttribute('aria-pressed').catch(() => null)
  log(`REPL aria-pressed=${pressed}`)
  if (pressed !== 'true') {
    await replToggle.click().catch(() => {})
    log('REPL OFF였음 → ON 토글(기본값 회귀 관찰 — 기본은 true여야 함)')
  }
}

function lastAi(page: Page): ReturnType<Page['locator']> {
  return page.locator(`${AI_MSG} .content`).last()
}

async function runShortTurn(page: Page, prompt: string, expectToken: string | RegExp, label: string): Promise<void> {
  await send(page, prompt)
  await expect(page.locator(STOP), `${label} 턴 시작(정지버튼)`).toBeVisible({ timeout: 30_000 })
  await expect(page.locator(STOP), `${label} 180s 내 완주 실패`).toBeHidden({ timeout: 180_000 })
  await page.waitForTimeout(1_500)
  await expect(lastAi(page), `${label} 응답 토큰 불일치`).toContainText(expectToken, { timeout: 15_000 })
}

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
  delete childEnv.AGENTDECK_E2E

  const app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: childEnv as Record<string, string>,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await passBootGates(page, { nickname: opts.nickname ?? 'p15r3' })

  const input = page.locator(CHAT).getByLabel('메시지 입력')
  if (!(await input.isEnabled().catch(() => false))) {
    await openWorkspace(page, { waitForTree: opts.waitForTree ?? true })
  }
  await page.locator('.composer-ta:not([disabled])').waitFor({ state: 'visible', timeout: 15_000 })
  return { app, page }
}

test.describe('GAP1 P15 R3-L1: 재시작 복원 이어가기 — 스레드 무결·세션 정체성·resume 턴 + W3/W4 (opt-in: GAP1HUNT3=1)', () => {
  test.skip(!RUN, 'P15 라운드 3 라이브 헌팅 — GAP1HUNT3=1로 명시 실행')

  test('2턴 → 정상 종료 → 재기동 → 복원 스레드 + 복원 배지 + 이어진 회상 턴', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const userDataDir = mkdtempSync(join(tmpdir(), 'p15r3-l1-udd-'))
    const workspace = mkdtempSync(join(tmpdir(), 'p15r3-l1-ws-'))
    writeFileSync(join(workspace, 'README.md'), '# P15 R3 재시작 복원 워크스페이스\n')

    let appB: ElectronApplication | null = null
    try {
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
      await assertCtxGaugeNontrivial(pageA, '기동A 턴2 후')

      const userCountA = await pageA.locator(USER_MSG).count()
      const aiCountA = await pageA.locator(AI_MSG).count()
      log(`기동A 종료 직전 버블: user=${userCountA} ai=${aiCountA}`)
      await pageA.screenshot({ path: join(SHOT_DIR, 'p15r3-01-two-turns-before-restart.png') })

      expect(
        tapA.rejections.length,
        `기동A unhandled rejection ${tapA.rejections.length}건: ${tapA.rejections[0] ?? ''}`
      ).toBe(0)

      await pageA.waitForTimeout(2_500)
      await timedClose(appA, '기동A(정상 종료)')

      const { app, page: pageB } = await launchApp(userDataDir, workspace, { waitForTree: false })
      appB = app
      const tapB = attachMainConsoleTap(appB)

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

      await expect(
        pageB.locator(RESTORED_BADGE),
        '복원 배지 부재 — sessionId 미영속/미복원 의심(resume 세션 정체성 상실)'
      ).toBeVisible({ timeout: 10_000 })
      await pageB.screenshot({ path: join(SHOT_DIR, 'p15r3-02-restored-thread-badge.png') })

      await ensureRepl(pageB)
      await runShortTurn(
        pageB,
        'What was the codeword I gave you earlier in this conversation? Reply with the codeword only. Do not use any tools.',
        /ORCHID-77/,
        '턴3(재기동 회상)'
      )
      await assertCtxGaugeNontrivial(pageB, '기동B 회상 턴 후')
      await pageB.screenshot({ path: join(SHOT_DIR, 'p15r3-03-resume-turn-recall.png') })

      expect(
        tapB.rejections.length,
        `기동B unhandled rejection ${tapB.rejections.length}건: ${tapB.rejections[0] ?? ''}`
      ).toBe(0)
    } finally {
      if (appB) await timedClose(appB, '기동B(teardown)')
      rmSync(userDataDir, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})

test.describe('GAP1 P15 R3-L2: 권한 거부 후 연속 — 거부 소화·잔류 0·재시도 승인 (opt-in: GAP1HUNT3=1)', () => {
  test.skip(!RUN, 'P15 라운드 3 라이브 헌팅 — GAP1HUNT3=1로 명시 실행')

  test('거부 → 턴 종료·디스크 미반영 → 무도구 턴 카드 잔류 0 → 승인 → 정상 생성', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, workspace, teardown } = await isolatedBoot({ slug: 'p15r3-l2' })
    const tapped = attachMainConsoleTap(app)
    try {
      await ensureRepl(page)
      await pick(page, '모드 선택', '일반')

      const GUARD = join(workspace, 'guard.txt')

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

      await send(
        page,
        `Call the Grep tool exactly once with pattern "NEEDLE_R3" and output_mode "content" over this ` +
          `workspace, then reply exactly SEARCH_DONE and end your turn. Do not use any other tools ` +
          `and do not read any files.`
      )
      await expect(page.locator(STOP), '검색 턴 시작').toBeVisible({ timeout: 30_000 })
      await expect(page.locator(STOP), '검색 턴 240s 내 완주 실패').toBeHidden({ timeout: 240_000 })
      await page.waitForTimeout(1_500)
      await expect(lastAi(page)).toContainText('SEARCH_DONE', { timeout: 15_000 })

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

      const targetMatch = page.locator(`[data-search-match][data-line="${NEEDLE_LINE}"]`)
      expect(
        await targetMatch.count(),
        `W2 — data-line="${NEEDLE_LINE}" 매치 버튼 부재(어댑터 라인 파싱 유실 의심)`
      ).toBeGreaterThan(0)
      await targetMatch.first().click()
      await page.waitForSelector('.fv-overlay .cm-editor', { timeout: 20_000 })

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
      if (app) await timedClose(app, 'L3(teardown)')
      rmSync(userDataDir, { recursive: true, force: true })
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
