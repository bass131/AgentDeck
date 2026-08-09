import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const RUN = process.env.GAP1HUNT1 === '1'

const SHOT_DIR = join(process.cwd(), '01_Phases', '17_GAP1-core-parity', 'ScreenShot')

const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
const panelSel = (n: number): string => `.ma-panel[data-slot="${n}"]`

function log(...a: unknown[]): void {
  console.log('[P15R1]', ...a)
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

async function textLen(page: Page, selector: string): Promise<number> {
  try {
    const loc = page.locator(selector)
    if ((await loc.count()) === 0) return 0
    return (await loc.first().innerText({ timeout: 2_000 })).length
  } catch {
    return -1
  }
}

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

async function waitThreadRevealSettled(page: Page, maxMs: number): Promise<number> {
  const deadline = Date.now() + maxMs
  let prev = await textLen(page, `${CHAT} .thread`)
  let stable = 0
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_500)
    const cur = await textLen(page, `${CHAT} .thread`)
    if (cur === prev) {
      if (++stable >= 2) return cur
    } else {
      stable = 0
    }
    prev = cur
  }
  return prev
}

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

      const replToggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
      const pressed = await replToggle.getAttribute('aria-pressed').catch(() => null)
      log(`REPL aria-pressed=${pressed}`)
      if (pressed !== 'true') {
        await replToggle.click().catch(() => {})
        log('REPL OFF였음 → ON 토글(기본값 회귀 관찰 — 기본은 true여야 함)')
      }

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

        await expect(page.locator(STOP), `#${i + 1} 정지버튼 등장(턴 시작)`).toBeVisible({ timeout: 30_000 })
        const grew = await waitAiStreamGrowth(page, aiBefore, 40, 60_000)
        log(`#${i + 1} 어시스턴트 스트리밍 성장=${grew}`)
        expect(grew, `#${i + 1} 인터럽트 창 확보 실패 — 어시스턴트 스트리밍 미관찰`).toBe(true)
        await page.waitForTimeout(1_500)

        const t0 = Date.now()
        await page.locator(STOP).first().click()
        await expect(
          page.locator(STOP),
          `#${i + 1} 인터럽트 후 45s 내 정지버튼 소멸(done 도달) — 미소멸이면 isRunning 고착(행)`
        ).toBeHidden({ timeout: 45_000 })
        log(`#${i + 1} 인터럽트 반영 ${((Date.now() - t0) / 1000).toFixed(1)}s`)

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

        const threadText = (await page.locator(`${CHAT} .thread`).innerText().catch(() => '')) ?? ''
        const hasMarker = threadText.includes('중단됨')
        test.info().annotations.push({
          type: 'seed-observed',
          description: `인터럽트 #${i + 1} 잘린 메시지 "중단됨" 마커 ${hasMarker ? '있음' : '부재(시드 결함 재확인)'}`,
        })
        await page.screenshot({ path: join(SHOT_DIR, `p15r1-0${i + 1}-interrupt${i + 1}-truncated.png`) })
      }

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
      expect(recall, '세션 연속성 — 잘린 턴 2(500) 맥락 회상 실패(세션 단절 의심)').toMatch(/\b500\b/)
      expect(recall, '세션 연속성 — 잘린 턴 3(1000) 맥락 회상 실패(세션 단절 의심)').toMatch(/\b1000\b/)
      await page.screenshot({ path: join(SHOT_DIR, 'p15r1-04-final-turn-recall.png') })

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
      const multiTab = page.getByRole('tab', { name: /멀티 에이전트/ })
      if (await multiTab.isVisible().catch(() => false)) {
        await multiTab.click()
      } else {
        await page.locator('.sb-mode .sb-mode-btn').nth(1).click()
      }
      await expect(page.locator(panelSel(0))).toBeVisible({ timeout: 15_000 })
      await page.locator('.ma-count').getByRole('tab', { name: '3', exact: true }).click()
      for (const n of [0, 1, 2]) {
        await expect(page.locator(panelSel(n))).toBeVisible({ timeout: 10_000 })
        const ta = page.locator(panelSel(n)).locator('.ma-composer-ta')
        await expect(ta, `패널${n} 컴포저 활성(전역 workspaceRoot 상속)`).toBeEnabled({ timeout: 10_000 })
      }

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

      for (const n of [0, 1, 2]) {
        await expect(
          page.locator(panelSel(n)).locator('[aria-label="중단"]'),
          `패널${n} 턴 시작(정지버튼 등장)`
        ).toBeVisible({ timeout: 30_000 })
      }
      await page.screenshot({ path: join(SHOT_DIR, 'p15r1-10-multi-3panels-running.png') })
      for (const n of [0, 1, 2]) {
        const st = await page.locator(panelSel(n)).locator('.ma-status').innerText().catch(() => '(없음)')
        log(`패널${n} 실행 중 상태 배지="${st.trim()}"`)
      }

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
      await page.waitForTimeout(2_000)

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

      for (const j of jobs) {
        const onDisk = readFileSync(join(workspace, j.file), 'utf8')
        expect(onDisk, `${j.file} 내용 불일치`).toContain(j.content)
      }

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
