/**
 * gap1-p15-hunt-r1.e2e.ts — GAP1 P15 라이브 버그 헌팅 루프 라운드 1 신규 시나리오 (opt-in).
 *
 * Phase 정본 = `01.Phases/17_GAP1-core-parity/15-live-bug-hunt-loop.md` ① 배터리 확장 —
 * 라운드 1 배정 축(미커버 우선) 2개:
 *
 *   H1) 연속 인터럽트: 실 SDK REPL 세션에서 긴 스트리밍 턴 → 턴 중간 인터럽트 → 즉시
 *       재지시 → 또 인터럽트(3연속) → 마지막 정상 턴 완주. 검증 축:
 *       - 세션 연속성: 마지막 턴에서 앞선 3개 요청(인터럽트로 잘린 턴 포함)의 맥락 회상 —
 *         held-open 세션이 인터럽트를 넘어 유지된다는 종단 증거(ADR-024).
 *       - 이벤트 잔류/좀비 부재: 인터럽트 후 done 도달(정지버튼 소멸) → 스레드 텍스트
 *         수렴 확인 뒤 관찰창에서 성장 0 하드 단정(늦은 이벤트 유입 = 결함).
 *       - 잘린 assistant 메시지 UI 채증: "중단됨" 마커 부재(라운드 0 시드 결함)의 라이브
 *         재확인 — 하드 단정하지 않고 annotation+스크린샷으로 관찰 기록(결함을 기대
 *         거동으로 박제하지 않는다).
 *       - 메인 프로세스 콘솔(stdout/stderr) 탭: interrupt() Promise reject unhandled
 *         (claudeAgentRun.ts `void this._queryHandle.interrupt()` 2개소 — 시드 결함)의
 *         UnhandledPromiseRejection 출현 여부 관찰 기록.
 *
 *   H2) 다중 세션 병행: 멀티 워크스페이스 3패널에서 동시에 턴 실행(서로 다른 파일 작업
 *       지시 — 패널별 cwd 분리는 AGENTDECK_E2E_PICK_FOLDER가 단일값 env라 e2e 게이트로
 *       불가능해 같은 워크스페이스의 서로 다른 파일로 격리 축을 검증). 검증 축:
 *       - 이벤트 라우팅 격리: 각 패널 스레드에 자기 토큰만 존재(교차 오염 0 하드 단정).
 *       - 각 세션 정상 완주: 3패널 전부 시작(정지버튼 등장) → 정착(소멸) + 디스크 반영.
 *       - 토큰/상태 표시 혼선: 패널별 .ma-status/.ma-ctx-detail 채록 + 스크린샷(관찰).
 *
 * 실 구독 인증으로 실 SDK를 호출하므로 **opt-in**(dogfood-live 선례):
 *   GAP1HUNT1=1 node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/gap1-p15-hunt-r1.e2e.ts
 *
 * 결정론 주의: 회귀 게이트가 아니라 *헌팅 통주* — 실 모델 응답에 의존한다. 기본 스위트는
 * skip(env 게이트). 프롬프트는 응답 토큰을 명시해 변동성을 줄인다.
 * ⚠️ AGENTDECK_E2E 미설정(설정 시 EchoBackend 모크 — isolatedBoot가 라이브 모드에서
 *   부모 셸 상속을 코드로 차단).
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const RUN = process.env.GAP1HUNT1 === '1'

const SHOT_DIR = join(process.cwd(), '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

// ── 셀렉터 상수(소스 실측 — bf2-interrupt-probe2/lr3-p07 관례 계승) ────────────
const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]' // 단일챗(ComposerBar) — replMode ON이면 interrupt 경로
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
const panelSel = (n: number): string => `.ma-panel[data-slot="${n}"]`

function log(...a: unknown[]): void {
  console.log('[P15R1]', ...a)
}

/** 메인 프로세스 stdout/stderr 탭 — UnhandledPromiseRejection 관찰(시드 결함 채증). */
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

/** 스레드 innerText 길이(안전) — 성장/수렴 측정용. */
async function textLen(page: Page, selector: string): Promise<number> {
  try {
    const loc = page.locator(selector)
    if ((await loc.count()) === 0) return 0
    return (await loc.first().innerText({ timeout: 2_000 })).length
  } catch {
    return -1
  }
}

/**
 * 어시스턴트 스트리밍 성장 대기 — 새 ai-msg 버블 등장 + content ≥minChars(mid-turn 확보).
 * (P15 R2 수리 — hunt-r2와 동일 신호로 교체) 종전의 스레드 전체 텍스트 성장 신호는
 * user 버블 자체 성장에 조기 발화한다 — r2 1차 통주 실측: 어시스턴트 첫 토큰 전(+200ms)
 * 인터럽트가 눌려 openMsgId null → S3 마킹 no-op(잠복 flake). AI 버블 content 성장은
 * openMsgId가 설정된 상태(텍스트 스트리밍 중)를 구조적으로 보장한다.
 */
async function waitAiStreamGrowth(page: Page, prevAiCount: number, minChars: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const count = await page.locator(AI_MSG).count().catch(() => 0)
    if (count > prevAiCount) {
      const txt = await page
        .locator(`${AI_MSG} .content`)
        .last()
        .innerText({ timeout: 2_000 })
        .catch(() => '')
      if (txt.length >= minChars) return true
    }
    await page.waitForTimeout(300)
  }
  return false
}

/**
 * 스레드 텍스트 reveal 수렴 대기(관찰용, 하드 단정 아님) — 1.5초 간격 스냅샷이 N회
 * 연속 동일할 때까지(최대 maxMs). SmoothMarkdown 점진 reveal(RAF)은 이미 도착한
 * 토큰을 done 이후에도 애니메이션으로 표출하므로(청크 사이 짧은 정지 있음), 2회 연속
 * 동일만으로는 reveal 도중 micro-pause에 조기 수렴 판정될 수 있다(1차 통주 실측:
 * 45→183 reveal 지연을 좀비로 오판). 3회 연속(=3초 안정)으로 강화하되, 이 값은 로그
 * 관찰에만 쓰고 pass/fail 단정에는 reveal 무관 신호(버블 수·정지버튼)를 쓴다.
 */
async function waitThreadRevealSettled(page: Page, maxMs: number): Promise<number> {
  const deadline = Date.now() + maxMs
  let prev = await textLen(page, `${CHAT} .thread`)
  let stable = 0
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_500)
    const cur = await textLen(page, `${CHAT} .thread`)
    if (cur === prev) {
      if (++stable >= 2) return cur // prev + 2 equal reads = 3 동일 스냅샷
    } else {
      stable = 0
    }
    prev = cur
  }
  return prev
}

/** 전경 스레드의 assistant 버블 수 — SmoothMarkdown reveal에 불변(좀비 판정 기준). */
async function aiBubbleCount(page: Page): Promise<number> {
  return page.locator(`${AI_MSG}`).count().catch(() => -1)
}

test.describe('GAP1 P15 R1-H1: 연속 인터럽트 — 세션 연속성·좀비 부재·잘림 UI 채증 (opt-in: GAP1HUNT1=1)', () => {
  test.skip(!RUN, 'P15 라운드 1 라이브 헌팅 — GAP1HUNT1=1로 명시 실행')

  test('긴 턴 3연속 인터럽트 → 마지막 정상 턴 완주 + 맥락 회상', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, teardown } = await isolatedBoot({ slug: 'p15hunt-h1' })
    const tapped = attachMainConsoleTap(app)
    try {
      const input = page.locator(CHAT).locator(INPUT)

      // REPL 지속세션 ON 확인(기본 true — interrupt 경로 전제. OFF면 정지=abort로 다른 시나리오가 됨)
      const replToggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
      const pressed = await replToggle.getAttribute('aria-pressed').catch(() => null)
      log(`REPL aria-pressed=${pressed}`)
      if (pressed !== 'true') {
        await replToggle.click().catch(() => {})
        log('REPL OFF였음 → ON 토글(기본값 회귀 관찰 — 기본은 true여야 함)')
      }

      // ── 인터럽트 3연속 — 각 회차: 긴 카운트 턴 → mid-turn 인터럽트 → 정착 → 좀비 관찰 ──
      const turns = [
        { prompt: '1부터 300까지 숫자만 줄바꿈으로 세줘. 도구는 쓰지 마.', tag: 'int1' },
        { prompt: '500부터 800까지 숫자만 줄바꿈으로 세줘. 도구는 쓰지 마.', tag: 'int2' },
        { prompt: '1000부터 1300까지 숫자만 줄바꿈으로 세줘. 도구는 쓰지 마.', tag: 'int3' },
      ]
      for (const [i, t] of turns.entries()) {
        const aiBefore = await page.locator(AI_MSG).count()
        await input.click()
        await input.fill(t.prompt)
        await input.press('Enter')
        log(`#${i + 1} 전송: "${t.prompt}"`)

        // 턴 시작(정지버튼 등장) + mid-turn 확보 — AI 버블 content ≥40자(어시스턴트
        // 텍스트 스트리밍 중 보장. 스레드 전체 길이 신호는 user 버블에 조기 발화 — 함수 주석)
        await expect(page.locator(STOP), `#${i + 1} 정지버튼 등장(턴 시작)`).toBeVisible({ timeout: 30_000 })
        const grew = await waitAiStreamGrowth(page, aiBefore, 40, 60_000)
        log(`#${i + 1} 어시스턴트 스트리밍 성장=${grew}`)
        expect(grew, `#${i + 1} 인터럽트 창 확보 실패 — 어시스턴트 스트리밍 미관찰`).toBe(true)
        await page.waitForTimeout(1_500) // 확실한 mid-turn

        // ★ 인터럽트(정지버튼 = replMode ON + 루프 0 → interrupt, 세션 유지)
        const t0 = Date.now()
        await page.locator(STOP).first().click()
        await expect(
          page.locator(STOP),
          `#${i + 1} 인터럽트 후 45s 내 정지버튼 소멸(done 도달) — 미소멸이면 isRunning 고착(행)`
        ).toBeHidden({ timeout: 45_000 })
        log(`#${i + 1} 인터럽트 반영 ${((Date.now() - t0) / 1000).toFixed(1)}s`)

        // 좀비 이벤트 헌팅 — reveal 무관 신호로 판정(1차 통주 교훈: 텍스트 길이 단정은
        // SmoothMarkdown reveal 지연과 경합해 flaky). done 시점 버블 수를 고정한 뒤
        // reveal이 충분히 끝나도록 넉넉히 정착 대기 → 5s 관찰창에서 (a) 정지버튼 재등장 0
        // (b) assistant 버블 수 불변을 하드 단정. 실제 좀비(늦은 turn/유령 run)는 버블을
        // 늘리거나 정지버튼을 되살리므로 이 둘로 구조적으로 잡힌다. 텍스트 길이 성장은
        // 관찰 로그로만 남긴다(reveal 잔여 표출과 진성 좀비를 길이로 구분 불가).
        const bubblesAtDone = await aiBubbleCount(page)
        const revealed = await waitThreadRevealSettled(page, 30_000)
        const bubblesSettled = await aiBubbleCount(page)
        await page.waitForTimeout(5_000)
        const lenAfter = await textLen(page, `${CHAT} .thread`)
        const bubblesAfter = await aiBubbleCount(page)
        const stopBack = await page.locator(STOP).isVisible().catch(() => false)
        log(
          `#${i + 1} 좀비 관찰: 버블 done=${bubblesAtDone}→settle=${bubblesSettled}→+5s=${bubblesAfter}, ` +
            `reveal길이=${revealed}→+5s=${lenAfter}, 정지버튼 재등장=${stopBack}`
        )
        expect(stopBack, `#${i + 1} done 후 정지버튼 재등장 — 유령 run(좀비) 의심`).toBe(false)
        expect(
          bubblesAfter,
          `#${i + 1} done 후 assistant 버블 수 증가 — 늦은 turn/이벤트 잔류(좀비) 의심`
        ).toBe(bubblesSettled)

        // 잘린 assistant 메시지 UI 채증(시드: "중단됨" 마커 부재 — 관찰 기록, 하드 단정 X)
        const threadText = (await page.locator(`${CHAT} .thread`).innerText().catch(() => '')) ?? ''
        const hasMarker = threadText.includes('중단됨')
        test.info().annotations.push({
          type: 'seed-observed',
          description: `인터럽트 #${i + 1} 잘린 메시지 "중단됨" 마커 ${hasMarker ? '있음' : '부재(시드 결함 재확인)'}`,
        })
        await page.screenshot({ path: join(SHOT_DIR, `p15r1-0${i + 1}-interrupt${i + 1}-truncated.png`) })
      }

      // ── 마지막 정상 턴: 완주 + 맥락 회상(세션 연속성 종단 증거) ────────────────
      await input.click()
      await input.fill(
        '이 대화에서 내가 지금까지 세어달라고 요청한 각 구간의 시작 숫자를 순서대로 쉼표로 나열해서 그대로만 답해. 도구는 쓰지 마.'
      )
      await input.press('Enter')
      await expect(page.locator(STOP)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator(STOP), '마지막 정상 턴 완주(정지버튼 소멸)').toBeHidden({ timeout: 240_000 })
      await page.waitForTimeout(1_500)

      const lastAi = page.locator(`${AI_MSG} .content`).last()
      const recall = (await lastAi.innerText().catch(() => '')) ?? ''
      log(`맥락 회상 응답: ${JSON.stringify(recall.slice(0, 200))}`)
      // 인터럽트로 잘린 턴 2·3의 시작 숫자(500·1000)가 회상되면 같은 세션 유지 확정.
      expect(recall, '세션 연속성 — 잘린 턴 2(500) 맥락 회상 실패(세션 단절 의심)').toMatch(/\b500\b/)
      expect(recall, '세션 연속성 — 잘린 턴 3(1000) 맥락 회상 실패(세션 단절 의심)').toMatch(/\b1000\b/)
      await page.screenshot({ path: join(SHOT_DIR, 'p15r1-04-final-turn-recall.png') })

      // ── 메인 프로세스 콘솔 관찰 보고(unhandled rejection — 시드 결함 채증) ───────
      log(`메인 콘솔 수집 ${tapped.lines.length}줄, unhandled rejection ${tapped.rejections.length}건`)
      for (const r of tapped.rejections) log(`  rejection: ${r}`)
      test.info().annotations.push({
        type: 'main-console',
        description: `unhandled rejection ${tapped.rejections.length}건 / 전체 ${tapped.lines.length}줄` +
          (tapped.rejections.length > 0 ? ` — ${tapped.rejections[0].slice(0, 160)}` : ''),
      })
    } finally {
      await teardown()
    }
  })
})

test.describe('GAP1 P15 R1-H2: 다중 세션 병행 — 라우팅 격리·동시 완주·표시 혼선 (opt-in: GAP1HUNT1=1)', () => {
  test.skip(!RUN, 'P15 라운드 1 라이브 헌팅 — GAP1HUNT1=1로 명시 실행')

  test('3패널 동시 턴(서로 다른 파일 작업) → 교차 오염 0 + 전 패널 완주 + 디스크 반영', async () => {
    test.setTimeout(480_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, workspace, teardown } = await isolatedBoot({ slug: 'p15hunt-h2' })
    const tapped = attachMainConsoleTap(app)
    try {
      // ── 멀티 워크스페이스 진입 + 3패널 ────────────────────────────────────────
      const multiTab = page.getByRole('tab', { name: /멀티 에이전트/ })
      if (await multiTab.isVisible().catch(() => false)) {
        await multiTab.click()
      } else {
        await page.locator('.sb-mode .sb-mode-btn').nth(1).click() // lr3-p07 폴백 경로
      }
      await expect(page.locator(panelSel(0))).toBeVisible({ timeout: 15_000 })
      await page.locator('.ma-count').getByRole('tab', { name: '3', exact: true }).click()
      for (const n of [0, 1, 2]) {
        await expect(page.locator(panelSel(n))).toBeVisible({ timeout: 10_000 })
        const ta = page.locator(panelSel(n)).locator('.ma-composer-ta')
        await expect(ta, `패널${n} 컴포저 활성(전역 workspaceRoot 상속)`).toBeEnabled({ timeout: 10_000 })
      }

      // ── 3패널 병행 지시 — 서로 다른 파일 + 서로 다른 응답 토큰 ─────────────────
      // (패널별 cwd 분리는 AGENTDECK_E2E_PICK_FOLDER 단일값 제약으로 불가 — 같은
      //  워크스페이스의 파일 3개로 격리를 검증. 파일 헤더 주석 참조)
      const jobs = [
        { file: 'alpha.txt', content: 'ALPHA_R1', token: 'ALPHA_DONE' },
        { file: 'bravo.txt', content: 'BRAVO_R1', token: 'BRAVO_DONE' },
        { file: 'charlie.txt', content: 'CHARLIE_R1', token: 'CHARLIE_DONE' },
      ]
      for (const [n, j] of jobs.entries()) {
        const ta = page.locator(panelSel(n)).locator('.ma-composer-ta')
        await ta.click()
        await ta.fill(
          `Use the Write tool exactly once to create a file named "${j.file}" in the workspace root ` +
            `containing exactly "${j.content}". Then reply exactly ${j.token} and end your turn. ` +
            'Do not use any other tools.'
        )
        await ta.press('Enter')
        log(`패널${n} 전송: ${j.file} → ${j.token}`)
      }

      // ── 전 패널 시작 확인(정지버튼 등장) → 병행 실행 채증 ─────────────────────
      for (const n of [0, 1, 2]) {
        await expect(
          page.locator(panelSel(n)).locator('[aria-label="중단"]'),
          `패널${n} 턴 시작(정지버튼 등장)`
        ).toBeVisible({ timeout: 30_000 })
      }
      await page.screenshot({ path: join(SHOT_DIR, 'p15r1-10-multi-3panels-running.png') })
      // 실행 중 상태 표시 채록(혼선 관찰용)
      for (const n of [0, 1, 2]) {
        const st = await page.locator(panelSel(n)).locator('.ma-status').innerText().catch(() => '(없음)')
        log(`패널${n} 실행 중 상태 배지="${st.trim()}"`)
      }

      // ── 전 패널 정착 대기(권한 카드 자동 허용 안전망 — 기본 bypass라 보통 미발화) ──
      const deadline = Date.now() + 240_000
      while (Date.now() < deadline) {
        let anyCard = false
        for (const n of [0, 1, 2]) {
          const allowBtn = page.locator(panelSel(n)).locator('.perm-card [data-perm-choice="allow"]')
          if (await allowBtn.isVisible().catch(() => false)) {
            anyCard = true
            await allowBtn.click().catch(() => {})
            log(`패널${n} 권한 카드 자동 허용(안전망 발화 — 기본 bypass 예상 밖)`)
          }
        }
        if (anyCard) {
          await page.waitForTimeout(800)
          continue
        }
        const runningFlags = await Promise.all(
          [0, 1, 2].map((n) =>
            page.locator(panelSel(n)).locator('[aria-label="중단"]').isVisible().catch(() => false)
          )
        )
        if (runningFlags.every((r) => !r)) break
        await page.waitForTimeout(1_000)
      }
      for (const n of [0, 1, 2]) {
        await expect(
          page.locator(panelSel(n)).locator('[aria-label="중단"]'),
          `패널${n} 240s 내 완주(정지버튼 소멸)`
        ).toBeHidden({ timeout: 5_000 })
      }
      await page.waitForTimeout(2_000) // 후처리(디스크 flush·상태 배지 전이) 여유

      // ── 이벤트 라우팅 격리: 각 패널 스레드에 자기 토큰만(교차 오염 0 하드 단정) ────
      const threads = await Promise.all(
        [0, 1, 2].map((n) => page.locator(panelSel(n)).locator('.ma-p-thread').innerText().catch(() => ''))
      )
      const marks = ['ALPHA', 'BRAVO', 'CHARLIE']
      for (const [n, j] of jobs.entries()) {
        expect(threads[n], `패널${n} 자기 완료 토큰(${j.token}) 미도착 — 라우팅 유실 의심`).toContain(j.token)
        for (const [m, mark] of marks.entries()) {
          if (m === n) continue
          expect(
            threads[n].includes(mark),
            `패널${n} 스레드에 패널${m} 산출물(${mark}) 혼입 — 이벤트 교차 오염`
          ).toBe(false)
        }
      }

      // ── 디스크 반영(각 세션이 자기 파일을 정확히 씀) ─────────────────────────────
      for (const j of jobs) {
        const onDisk = readFileSync(join(workspace, j.file), 'utf8')
        expect(onDisk, `${j.file} 내용 불일치`).toContain(j.content)
      }

      // ── 토큰/상태 표시 혼선 관찰(하드 단정 X — 채록 + 스크린샷) ───────────────────
      for (const n of [0, 1, 2]) {
        const st = await page.locator(panelSel(n)).locator('.ma-status').innerText().catch(() => '(없음)')
        const ctx = await page.locator(panelSel(n)).locator('.ma-ctx-detail').innerText().catch(() => '(없음)')
        log(`패널${n} 완주 후 상태 배지="${st.trim()}" 컨텍스트 게이지="${ctx.trim()}"`)
        test.info().annotations.push({
          type: 'panel-display',
          description: `패널${n}: status="${st.trim()}" ctx="${ctx.trim()}"`,
        })
      }
      await page.screenshot({ path: join(SHOT_DIR, 'p15r1-11-multi-3panels-done.png') })

      log(`메인 콘솔 수집 ${tapped.lines.length}줄, unhandled rejection ${tapped.rejections.length}건`)
      test.info().annotations.push({
        type: 'main-console',
        description: `unhandled rejection ${tapped.rejections.length}건 / 전체 ${tapped.lines.length}줄`,
      })
    } finally {
      await teardown()
    }
  })
})
