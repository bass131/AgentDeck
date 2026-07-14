/**
 * gap1-p15-hunt-r4.e2e.ts — GAP1 P15 라이브 버그 헌팅 루프 라운드 4 신규 시나리오 (opt-in).
 *
 * Phase 정본 = `01.Phases/17_GAP1-core-parity/15-live-bug-hunt-loop.md` ① 배터리 확장 —
 * 라운드 4 배정 축 = **라이브 서브에이전트 스플릿 뷰**(P14 신기능의 라이브 미검증 축).
 * 원장 = 15-rounds-log.md. R3 신규 결함 0(수렴 1/2) — R4는 종결 확증 라운드(결과이지
 * 목표 아님: 결함이 나오면 나오는 대로 티켓·계수한다).
 *
 * 배경(왜 이 축인가): P14 스플릿 뷰는 컴포넌트 하네스(gap1-p14-splitview-shots — store
 * 시드 fixture)로만 시각검증됐다. 라이브 경로(실 SDK Task tool_use → 어댑터 subagent
 * 이벤트 → reducer state.subagents → SubAgentSplitView 병합·린저 타이머)는 실환경
 * 타이밍(병행 도착·done 전이·CLOSE_LINGER_MS=4s 자동 정리)이 얽혀 하네스로는 검증
 * 불가 — 라운드 4에서 라이브로 확증한다.
 *
 *   L1) 라이브 서브에이전트 스플릿 뷰 (단일 시나리오):
 *       실 SDK 세션에서 Task 서브에이전트 3개를 **한 스텝 병행** 발화 유도(각자 파일
 *       1개를 읽고 그 안의 코드워드를 보고 — 코드워드는 파일에만 있고 프롬프트에 없어
 *       회수 = tool_result 왕복의 기계 증거).
 *       - [X3-a 도크 전환 하드] 턴 중 우측 도크가 스플릿 그리드로 전환:
 *         `.pane.agent.sag-split` + `.sag-grid [data-subagent-id]` ≥1 +
 *         `.sag-count` "동시 표시 N" + thread 인라인 마커 `.sa-inline` ≥1.
 *       - [X3-b 병행 관찰] 동시 표시 최대 셀 수·컬럼 분해 — 병행 유도가 실 SDK에서
 *         불안정하면 1개만이라도 확증하고 사정 기록(억지 재현 금지, live-repro-stop-rule)
 *         → 하드는 ≥1, 병행 수치는 annotation.
 *       - [X3-c 활성 확대 관찰] 컬럼에 셀 ≥2일 때 활성 셀 flex-grow=2(rowWeights
 *         ACTIVE_WEIGHT) 관측 여부 — 타이밍 의존(짧은 서브 턴이면 미관측 가능)이라
 *         annotation(하드 단정 X).
 *       - [X3-d 자동 정리 하드] 턴 완주 후 서브 전원 done → 린저(4s) 경과 →
 *         `.sag-split` 소멸 + AgentPanel 복귀(`.agent-panel`) 30s 내 하드 단정
 *         (SubAgentSplitView 린저 setTimeout 체인 — 라이브 실작동 증거).
 *       - [X3-e 대기열 관찰] 대기열(`.sag-queue`)은 7개 이상에서만 발생 — 3병행에선
 *         미발생이 정상. 발생/미발생을 annotation으로 기록(P14 보류 스펙 "수동 승격
 *         어포던스" 판단 입력 — 결함 아님).
 *       - [X3-f 결과 왕복 하드] 최종 응답에 SUBS_DONE + 코드워드 3종(파일에만 존재)
 *         회수 — 서브에이전트 결과가 메인 턴으로 합성됐다는 하드 증거.
 *       - [X1 상주] 메인 콘솔 UnhandledPromiseRejection 0건 하드(R1 S1 봉합 회귀 감시).
 *       - [X2/W4 관찰] app.close 소요 annotation(R2-T4 teardown 60s 초과 재발 감시).
 *
 * 실 구독 인증으로 실 SDK를 호출하므로 **opt-in**(hunt-r1/r2/r3 선례):
 *   GAP1HUNT4=1 node 99.Others/scripts/run-e2e.cjs 99.Others/tests/e2e/gap1-p15-hunt-r4.e2e.ts
 *
 * 결정론 주의: 회귀 게이트가 아니라 *헌팅 통주* — 실 모델 응답에 의존한다. 기본 스위트는
 * skip(env 게이트). 프롬프트는 도구·병행 수·응답 토큰을 명시해 변동성을 줄인다.
 * ⚠️ AGENTDECK_E2E 미설정(설정 시 EchoBackend 모크 — isolatedBoot가 부모 셸 상속을
 *   코드로 차단).
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const RUN = process.env.GAP1HUNT4 === '1'

const SHOT_DIR = join(process.cwd(), '01.Phases', '17_GAP1-core-parity', 'ScreenShot')

// ── 셀렉터 상수(소스 실측 — hunt-r1/r2/r3 관례 계승) ──────────────────────────
const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
/** 스플릿 도크 골격(SubAgentSplitView.tsx) — 셀 존재 시에만 마운트. */
const SPLIT_DOCK = '.pane.agent.sag-split'
const GRID_CELL = '.sag-grid [data-subagent-id]'
const QUEUE_STRIP = '.sag-queue'
/** thread 인라인 서브에이전트 마커 렌더(SubAgentInline.tsx). */
const INLINE_SA = `${CHAT} .thread .sa-inline`

// ── 코드워드 픽스처 — 파일에만 존재(프롬프트 미포함) → 회수 = tool_result 왕복 증거 ──
const CODEWORDS = {
  'alpha.txt': 'ALFA-R4-31',
  'beta.txt': 'BRAVO-R4-62',
  'gamma.txt': 'CHARLIE-R4-93',
} as const

function log(...a: unknown[]): void {
  console.log('[P15R4]', ...a)
}

/** 메인 프로세스 stdout/stderr 탭 — UnhandledPromiseRejection 채증(hunt-r1/r2/r3 미러). */
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

/** REPL 지속세션 ON 보장(기본 true — OFF 관찰 시 로그 후 토글, hunt-r1/r2/r3 미러). */
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
 * [X2/W4 관찰] app.close 소요 측정 — R2-T4(teardown 60s 초과 1회) 재발 감시.
 * 하드 단정 X(열린 관찰 항목을 pass/fail로 오염하지 않는다) — annotation 데이터.
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

/** 폴링 1틱에서 수집하는 스플릿 뷰 라이브 표본. */
interface SplitSample {
  cells: number
  countText: string
  queueVisible: boolean
  queueText: string
  /** 컬럼별 [셀 수, 컬럼 내 flex-grow=2 셀 존재 여부]. */
  zoomInColumns: boolean
  statusTexts: string[]
}

/** 스플릿 뷰 현재 상태 1회 표본 — page.evaluate 1방(폴링 비용 최소화). */
async function sampleSplitView(page: Page): Promise<SplitSample> {
  return page.evaluate(
    ({ gridCell, queueStrip }) => {
      const cells = document.querySelectorAll(gridCell).length
      const countEl = document.querySelector('.sag-count')
      const queueEl = document.querySelector(queueStrip)
      // 활성 확대: 셀 ≥2인 컬럼 안에서 computed flex-grow가 2인 .sag-cell 존재 여부.
      let zoom = false
      for (const col of document.querySelectorAll('.sag-col')) {
        const colCells = col.querySelectorAll('.sag-cell')
        if (colCells.length < 2) continue
        for (const c of colCells) {
          if (getComputedStyle(c as HTMLElement).flexGrow === '2') zoom = true
        }
      }
      const statusTexts = [...document.querySelectorAll(`${gridCell} .ma-status`)].map(
        (el) => (el.textContent ?? '').trim()
      )
      return {
        cells,
        countText: (countEl?.textContent ?? '').trim(),
        queueVisible: queueEl !== null,
        queueText: (queueEl?.textContent ?? '').trim(),
        zoomInColumns: zoom,
        statusTexts,
      }
    },
    { gridCell: GRID_CELL, queueStrip: QUEUE_STRIP }
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// L1) 라이브 서브에이전트 스플릿 뷰 — 도크 전환·병행·활성 확대·자동 정리·대기열
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('GAP1 P15 R4-L1: 라이브 서브에이전트 스플릿 뷰 — 실 SDK Task 병행 → 도크 전환·자동 정리 (opt-in: GAP1HUNT4=1)', () => {
  test.skip(!RUN, 'P15 라운드 4 라이브 헌팅 — GAP1HUNT4=1로 명시 실행')

  test('Task 3병행 유도 → 스플릿 그리드 라이브 전환 → 결과 왕복 → 린저 자동 정리 → AgentPanel 복귀', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, workspace, teardown } = await isolatedBoot({ slug: 'p15r4-l1' })
    const tapped = attachMainConsoleTap(app)
    try {
      // 코드워드 픽스처 시드 — 부트 후 디스크에만 존재(트리 갱신 불요, SDK Read 경로).
      for (const [file, word] of Object.entries(CODEWORDS)) {
        writeFileSync(join(workspace, file), `codeword: ${word}\n`)
      }
      await ensureRepl(page)
      // 모드는 기본 '자동'(auto) 유지 — Task는 상시 허용(READONLY), 서브에이전트의
      // Read도 자동 진행이라 권한 카드 없이 병행 관찰에 집중한다(hunt-r3 L2와 대조 축).

      // ── 턴: Task 3병행 발화 유도 ─────────────────────────────────────────────
      await send(
        page,
        'The workspace root has three files: alpha.txt, beta.txt, gamma.txt. Each contains a ' +
          'secret codeword. Use the Task tool to launch three subagents in parallel in a single ' +
          'step — call the Task tool three times in one response, each with subagent_type ' +
          '"general-purpose": the first reads only alpha.txt, the second only beta.txt, the third ' +
          'only gamma.txt, and each reports the codeword it found. Do not read any files yourself. ' +
          'After all three subagents return, reply exactly: SUBS_DONE <alpha codeword> ' +
          '<beta codeword> <gamma codeword> and end your turn.'
      )
      await expect(page.locator(STOP), '턴 시작(정지버튼)').toBeVisible({ timeout: 30_000 })

      // ── 턴 중 폴링 — 도크 전환·병행·활성 확대·대기열·상태 전이 라이브 표본 ──
      let maxCells = 0
      let firstCellAtMs = -1
      let zoomObserved = false
      let queueObserved = false
      let sawDoneLinger = false
      let firstCountText = ''
      const statusSeen = new Set<string>()
      let shotFirst = false
      let shotZoom = false
      let lastShotMax = 0
      const turnStart = Date.now()
      const pollDeadline = Date.now() + 480_000
      while (Date.now() < pollDeadline) {
        const s = await sampleSplitView(page).catch(() => null)
        if (s) {
          if (s.cells > 0 && firstCellAtMs < 0) {
            firstCellAtMs = Date.now() - turnStart
            firstCountText = s.countText
            log(`첫 셀 등장 +${firstCellAtMs}ms — count="${s.countText}"`)
          }
          if (s.cells > 0 && !shotFirst) {
            shotFirst = true
            await page.screenshot({ path: join(SHOT_DIR, 'p15r4-01-split-grid-first-cell.png') })
          }
          if (s.cells > maxCells) {
            maxCells = s.cells
            log(`동시 표시 셀 ${maxCells} — count="${s.countText}" status=[${s.statusTexts.join(',')}]`)
          }
          // 최대 병행 갱신 시점 스크린샷(≥2부터 — 병행 육안 증거)
          if (maxCells >= 2 && maxCells > lastShotMax) {
            lastShotMax = maxCells
            await page.screenshot({ path: join(SHOT_DIR, 'p15r4-02-split-grid-parallel.png') })
          }
          if (s.zoomInColumns && !zoomObserved) {
            zoomObserved = true
            log('활성 셀 확대(flex-grow=2, 컬럼 셀≥2) 관측')
          }
          if (s.zoomInColumns && !shotZoom) {
            shotZoom = true
            await page.screenshot({ path: join(SHOT_DIR, 'p15r4-03-active-zoom.png') })
          }
          if (s.queueVisible && !queueObserved) {
            queueObserved = true
            log(`대기열 스트립 관측: "${s.queueText}"`)
          }
          for (const st of s.statusTexts) {
            if (st) statusSeen.add(st)
            // done 전이 후 린저 표시(제거 전 잠시 표시) 관측 — 상태 텍스트에 '완료'류.
            if (/완료|done/i.test(st)) sawDoneLinger = true
          }
        }
        const running = await page.locator(STOP).isVisible().catch(() => false)
        if (!running) break
        await page.waitForTimeout(400)
      }
      await expect(page.locator(STOP), '턴 480s 내 완주 실패').toBeHidden({ timeout: 10_000 })
      const turnMs = Date.now() - turnStart
      log(`턴 완주 ${Math.round(turnMs / 1000)}s — maxCells=${maxCells} zoom=${zoomObserved} queue=${queueObserved} statusSeen=[${[...statusSeen].join(',')}]`)

      // [X3-a 하드] 도크 전환 — 턴 중 스플릿 그리드 셀이 실제로 등장했는가.
      expect(
        maxCells,
        'X3-a 위반 — 실 SDK Task 발화에도 스플릿 그리드 셀 미등장(subagent 이벤트→도크 전환 경로 결함 의심)'
      ).toBeGreaterThanOrEqual(1)
      expect(
        firstCountText,
        `X3-a — 헤더 스트립 "동시 표시 N" 불일치: "${firstCountText}"`
      ).toMatch(/동시 표시 \d+/)
      // thread 인라인 마커(F-G) — subagent 이벤트 수신의 대화면 측 증거.
      expect(
        await page.locator(INLINE_SA).count(),
        'X3-a — thread 인라인 서브에이전트 마커(.sa-inline) 부재'
      ).toBeGreaterThanOrEqual(1)

      // [X3-b/c/e 관찰] 병행·활성 확대·대기열 — annotation(하드 단정 X, 관찰 기록).
      test.info().annotations.push({
        type: 'X3-live-splitview',
        description:
          `첫 셀 +${firstCellAtMs}ms · 최대 동시 표시 ${maxCells}셀(유도 3) · ` +
          `활성 확대(flex-grow=2) ${zoomObserved ? '관측' : '미관측'} · ` +
          `대기열 ${queueObserved ? '발생' : '미발생(≤6 정상)'} · ` +
          `done 린저 표시 ${sawDoneLinger ? '관측' : '미관측'} · 상태표기=[${[...statusSeen].join(',')}]`,
      })

      // [X3-f 하드] 결과 왕복 — 코드워드는 파일에만 있다(프롬프트 미포함).
      await page.waitForTimeout(1_500) // reveal 여유
      const finalText = (await lastAi(page).innerText().catch(() => '')) ?? ''
      expect(finalText, 'X3-f — 종료 토큰(SUBS_DONE) 미회수').toContain('SUBS_DONE')
      for (const [file, word] of Object.entries(CODEWORDS)) {
        expect(finalText, `X3-f — ${file} 코드워드(${word}) 미회수: 서브 tool_result 왕복 유실 의심`).toContain(word)
      }
      await page.screenshot({ path: join(SHOT_DIR, 'p15r4-04-final-response.png') })

      // [X3-d 하드] 자동 정리 — 서브 전원 done + 린저(4s) 경과 → 도크가 AgentPanel로 복귀.
      const revertStart = Date.now()
      let revertedInMs = -1
      const revertDeadline = Date.now() + 30_000
      while (Date.now() < revertDeadline) {
        const splitCount = await page.locator(SPLIT_DOCK).count()
        if (splitCount === 0) {
          revertedInMs = Date.now() - revertStart
          break
        }
        await page.waitForTimeout(500)
      }
      log(`도크 복귀(턴 종료 기준) ${revertedInMs}ms (린저 4s 계약)`)
      expect(
        revertedInMs,
        'X3-d 위반 — 턴 완주 후 30s 내 스플릿 도크 미정리(.sag-split 잔존 — 린저 타이머 체인 결함 의심)'
      ).toBeGreaterThanOrEqual(0)
      await expect(
        page.locator('.pane.agent .agent-panel'),
        'X3-d — 도크 정리 후 AgentPanel 미복귀'
      ).toBeVisible({ timeout: 10_000 })
      test.info().annotations.push({
        type: 'X3-auto-cleanup',
        description: `턴 종료 → 도크 복귀 ${revertedInMs}ms (CLOSE_LINGER_MS=4000 계약)`,
      })
      await page.screenshot({ path: join(SHOT_DIR, 'p15r4-05-dock-reverted.png') })

      // [X1 상주 하드] 메인 콘솔 위생 — R1 S1 봉합 회귀 감시(rejection 0).
      expect(
        tapped.rejections.length,
        `X1 위반 — unhandled rejection ${tapped.rejections.length}건: ${tapped.rejections[0] ?? ''}`
      ).toBe(0)
      log(`메인 콘솔 수집 ${tapped.lines.length}줄, rejection 0건`)
    } finally {
      await timedClose(app, 'L1(teardown)') // [X2/W4 관찰] — teardown은 isolatedBoot에 멱등 위임
      await teardown()
    }
  })
})
