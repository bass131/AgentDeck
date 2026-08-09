import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const RUN = process.env.GAP1HUNT4 === '1'

const SHOT_DIR = join(process.cwd(), '01_Phases', '17_GAP1-core-parity', 'ScreenShot')

const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
const SPLIT_DOCK = '.pane.agent.sag-split'
const GRID_CELL = '.sag-grid [data-subagent-id]'
const QUEUE_STRIP = '.sag-queue'
const INLINE_SA = `${CHAT} .thread .sa-inline`

const CODEWORDS = {
  'alpha.txt': 'ALFA-R4-31',
  'beta.txt': 'BRAVO-R4-62',
  'gamma.txt': 'CHARLIE-R4-93',
} as const

function log(...a: unknown[]): void {
  console.log('[P15R4]', ...a)
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

interface SplitSample {
  cells: number
  countText: string
  queueVisible: boolean
  queueText: string
  activeHighlight: boolean
  statusTexts: string[]
}

async function sampleSplitView(page: Page): Promise<SplitSample> {
  return page.evaluate(
    ({ gridCell, queueStrip }) => {
      const cells = document.querySelectorAll(gridCell).length
      const countEl = document.querySelector('.sag-count')
      const queueEl = document.querySelector(queueStrip)
      const activeHighlight = document.querySelector('.sag-cell--active') !== null
      const statusTexts = [...document.querySelectorAll(`${gridCell} .ma-status`)].map(
        (el) => (el.textContent ?? '').trim()
      )
      return {
        cells,
        countText: (countEl?.textContent ?? '').trim(),
        queueVisible: queueEl !== null,
        queueText: (queueEl?.textContent ?? '').trim(),
        activeHighlight,
        statusTexts,
      }
    },
    { gridCell: GRID_CELL, queueStrip: QUEUE_STRIP }
  )
}

test.describe('GAP1 P15 R4-L1: 라이브 서브에이전트 스플릿 뷰 — 실 SDK Task 병행 → 도크 전환·자동 정리 (opt-in: GAP1HUNT4=1)', () => {
  test.skip(!RUN, 'P15 라운드 4 라이브 헌팅 — GAP1HUNT4=1로 명시 실행')

  test('Task 3병행 유도 → 스플릿 그리드 라이브 전환 → 결과 왕복 → 린저 자동 정리 → AgentPanel 복귀', async () => {
    test.setTimeout(600_000)
    mkdirSync(SHOT_DIR, { recursive: true })

    const { app, page, workspace, teardown } = await isolatedBoot({ slug: 'p15r4-l1' })
    const tapped = attachMainConsoleTap(app)
    try {
      for (const [file, word] of Object.entries(CODEWORDS)) {
        writeFileSync(join(workspace, file), `codeword: ${word}\n`)
      }
      await ensureRepl(page)

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

      let maxCells = 0
      let firstCellAtMs = -1
      let highlightObserved = false
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
          if (maxCells >= 2 && maxCells > lastShotMax) {
            lastShotMax = maxCells
            await page.screenshot({ path: join(SHOT_DIR, 'p15r4-02-split-grid-parallel.png') })
          }
          if (s.activeHighlight && !highlightObserved) {
            highlightObserved = true
            log('활성 셀 정적 하이라이트(.sag-cell--active) 관측')
          }
          if (s.activeHighlight && !shotZoom) {
            shotZoom = true
            await page.screenshot({ path: join(SHOT_DIR, 'p15r4-03-active-zoom.png') })
          }
          if (s.queueVisible && !queueObserved) {
            queueObserved = true
            log(`대기열 스트립 관측: "${s.queueText}"`)
          }
          for (const st of s.statusTexts) {
            if (st) statusSeen.add(st)
            if (/완료|done/i.test(st)) sawDoneLinger = true
          }
        }
        const running = await page.locator(STOP).isVisible().catch(() => false)
        if (!running) break
        await page.waitForTimeout(400)
      }
      await expect(page.locator(STOP), '턴 480s 내 완주 실패').toBeHidden({ timeout: 10_000 })
      const turnMs = Date.now() - turnStart
      log(`턴 완주 ${Math.round(turnMs / 1000)}s — maxCells=${maxCells} highlight=${highlightObserved} queue=${queueObserved} statusSeen=[${[...statusSeen].join(',')}]`)

      expect(
        maxCells,
        'X3-a 위반 — 실 SDK Task 발화에도 스플릿 그리드 셀 미등장(subagent 이벤트→도크 전환 경로 결함 의심)'
      ).toBeGreaterThanOrEqual(1)
      expect(
        firstCountText,
        `X3-a — 헤더 스트립 "동시 표시 N" 불일치: "${firstCountText}"`
      ).toMatch(/동시 표시 \d+/)
      expect(
        await page.locator(INLINE_SA).count(),
        'X3-a — thread 인라인 서브에이전트 마커(.sa-inline) 부재'
      ).toBeGreaterThanOrEqual(1)

      test.info().annotations.push({
        type: 'X3-live-splitview',
        description:
          `첫 셀 +${firstCellAtMs}ms · 최대 동시 표시 ${maxCells}셀(유도 3) · ` +
          `활성 하이라이트(.sag-cell--active) ${highlightObserved ? '관측' : '미관측'} · ` +
          `대기열 ${queueObserved ? '발생' : '미발생(≤6 정상)'} · ` +
          `done 린저 표시 ${sawDoneLinger ? '관측' : '미관측'} · 상태표기=[${[...statusSeen].join(',')}]`,
      })

      await page.waitForTimeout(1_500)
      const finalText = (await lastAi(page).innerText().catch(() => '')) ?? ''
      expect(finalText, 'X3-f — 종료 토큰(SUBS_DONE) 미회수').toContain('SUBS_DONE')
      for (const [file, word] of Object.entries(CODEWORDS)) {
        expect(finalText, `X3-f — ${file} 코드워드(${word}) 미회수: 서브 tool_result 왕복 유실 의심`).toContain(word)
      }
      await page.screenshot({ path: join(SHOT_DIR, 'p15r4-04-final-response.png') })

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

      expect(
        tapped.rejections.length,
        `X1 위반 — unhandled rejection ${tapped.rejections.length}건: ${tapped.rejections[0] ?? ''}`
      ).toBe(0)
      log(`메인 콘솔 수집 ${tapped.lines.length}줄, rejection 0건`)
    } finally {
      await timedClose(app, 'L1(teardown)')
      await teardown()
    }
  })
})
