/**
 * lr3-p06-stop-cleanup.e2e.ts — 영호 육안 피드백 검증 probe (opt-in: LIVE_SDK=1 + P06STOP=1).
 *
 * 관찰(2026-07-03 육안 투어): "loop 중단버튼 클릭 시 UI만 종료되고 내부 크론/스케줄은
 * 정리가 안 되는 것 같다."
 * 코드 독해로는 배너 정지 → abortRun → main abort → 세션 프로세스 kill → 크론 사멸이
 * 맞아 보이나, 관찰과 갈리므로 실측으로 판정한다(수정은 실측으로 검증).
 *
 * 방법: 크론 생성 → 턴 idle 대기 → 배너 정지 클릭 → 80s(1m 틱 경과) 동안 raw 이벤트
 * 카운터(P01-(b) 기법)로 옛 runId 이벤트를 event.type별로 집계.
 *
 * 판정(BF2-mini P1 정련): "비-loops 이벤트 증가 = 0" 그리고 "loops 이벤트 증가 ≤ 1".
 *   - BF2-mini P1 fix(abort 후 loops 통과 화이트리스트)로 정지 직후 정리 스냅샷 loops:[] 1개가
 *     renderer에 정상 전달된다 — 이는 이벤트 드롭 근본수리의 *의도된 신호*이지 누수가 아니다.
 *   - 진짜 누수 신호 = 비-loops(text/tool_call/done…) 성장. 크론 틱이 살아 있으면 턴마다
 *     비-loops가 반드시 붙는다(실측: 틱당 ~11). 정지 후엔 정확히 loops:[] +1 뒤 동결이 정상.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.LIVE_SDK === '1' && process.env.P06STOP === '1'

test.describe('LR3 P06 정지 버튼 내부 정리 실측 (LIVE_SDK=1 P06STOP=1)', () => {
  test.skip(!RUN, '라이브 probe — LIVE_SDK=1 P06STOP=1로 명시 실행')
  test.describe.configure({ retries: 2 }) // 크론 생성은 모델 재량(간헐 미발동)

  test('크론 생성 → idle에서 배너 정지 → 80s간 옛 runId 이벤트 증가 0', async () => {
    test.setTimeout(420_000)
    const workspace = mkdtempSync(join(tmpdir(), 'lr3p06stop-'))
    const app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
    })
    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('.titlebar', { timeout: 20_000 })
      const nick = page.locator('#nickname')
      if (await nick.isVisible().catch(() => false)) {
        await nick.fill('tester')
        await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
      }
      await page.keyboard.press('Escape').catch(() => {})
      const pickFolder = page.getByRole('button', { name: '폴더 선택' })
      if (await pickFolder.isVisible().catch(() => false)) await pickFolder.click()
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)

      // raw 이벤트 카운터(P01-(b) 기법 — renderer 드롭 경로와 독립).
      // BF2-mini P1: runId별 total뿐 아니라 event.type별 집계(byType)까지 수집한다.
      // 판정이 "총 증가 0"에서 "비-loops 증가 0 + loops 증가 ≤1"로 정련됐기 때문(아래 판정부 참조).
      page.on('console', (msg) => {
        if (msg.text().startsWith('[P06stop]')) console.log(msg.text())
      })
      await page.evaluate(() => {
        const w = window as unknown as {
          __p06stop: Record<string, { total: number; byType: Record<string, number> }>
          api: {
            onAgentEvent: (
              cb: (p: { runId: string; event: { type: string; loops?: unknown[] } }) => void
            ) => void
          }
        }
        w.__p06stop = {}
        w.api.onAgentEvent((p) => {
          const rec = (w.__p06stop[p.runId] ??= { total: 0, byType: {} })
          rec.total++
          rec.byType[p.event.type] = (rec.byType[p.event.type] ?? 0) + 1
          // abort 정리 스냅샷 로그: loops:[] (빈 배열=정리 신호)를 관측하면 남긴다.
          if (p.event.type === 'loops') {
            const len = Array.isArray(p.event.loops) ? p.event.loops.length : -1
            console.log(`[P06stop] loops 이벤트 관측 run=${p.runId.slice(0, 8)} loops.length=${len}`)
          }
        })
      })

      const input = page.getByLabel('메시지 입력')
      await input.click()
      await input.fill('/loop 1m Reply with exactly TICK and nothing else.')
      await input.press('Enter')

      const banner = page.locator('.loop-indicator.loop-sdk')
      await expect(banner).toBeVisible({ timeout: 180_000 })
      // 턴 종료(idle) 대기 — 전송 버튼이 다시 활성화될 때까지(스케줄링 턴 완료)
      await page.waitForTimeout(8_000)

      type StopRec = { total: number; byType: Record<string, number> }
      const snapshot = (): Promise<Record<string, StopRec>> =>
        page.evaluate(() =>
          JSON.parse(
            JSON.stringify((window as unknown as { __p06stop: Record<string, StopRec> }).__p06stop)
          )
        )
      const nonLoops = (r?: StopRec): number => (r ? r.total - (r.byType.loops ?? 0) : 0)
      const loopsOf = (r?: StopRec): number => r?.byType.loops ?? 0

      const loopRunIds = await page.evaluate(() =>
        Object.keys((window as unknown as { __p06stop: Record<string, StopRec> }).__p06stop)
      )
      const before = await snapshot()
      console.log('[P06stop] 정지 직전 카운트:', JSON.stringify(before))

      // idle 상태에서 배너 정지 클릭 — 영호 관찰 시나리오 재현
      await page.locator('.loop-sdk-stop').click()
      await expect(banner).toBeHidden({ timeout: 30_000 })

      // 80s 대기(1m 틱 + 여유) → 옛 runId 이벤트 증가 관측
      await page.waitForTimeout(80_000)
      const after = await snapshot()
      console.log('[P06stop] 80s 후 카운트:', JSON.stringify(after))

      // ── 판정(BF2-mini P1 정련) ──────────────────────────────────────────────
      // BF2-mini P1 fix(abort 후 loops 통과 화이트리스트)로 정지 직후 loops:[] 1개가 renderer에
      // 정상 전달된다 — 이는 근본수리의 의도된 신호이지 누수가 아님. 누수 판정 = 비-loops 성장.
      // 크론 틱이 살아 있으면 턴마다 text/tool_call/done(비-loops)이 반드시 붙는다(실측: 틱당 ~11).
      // loops는 정리 스냅샷 1개(loops:[])까지 허용(≤1).
      let nonLoopsGrew = false
      let loopsGrewBeyond1 = false
      for (const id of loopRunIds) {
        const dNon = nonLoops(after[id]) - nonLoops(before[id])
        const dLoops = loopsOf(after[id]) - loopsOf(before[id])
        console.log(`[P06stop] runId=${id.slice(0, 12)} 비-loops증가=${dNon} loops증가=${dLoops}`)
        if (dNon > 0) nonLoopsGrew = true
        if (dLoops > 1) loopsGrewBeyond1 = true
      }
      console.log(
        !nonLoopsGrew && !loopsGrewBeyond1
          ? '[P06stop] 판정: ✅ 정지 후 비-loops 증가 0 + loops ≤1(정리 스냅샷만) — 내부 정리 정상'
          : '[P06stop] 판정: ⚠ 정지 후 잔존(비-loops 성장 또는 loops>1) — 누수 실재'
      )
      // 근본수리 불변조건: 비-loops 성장 0(진짜 누수 신호) AND loops 증가 ≤1(abort 정리 스냅샷 허용)
      expect(nonLoopsGrew).toBe(false)
      expect(loopsGrewBeyond1).toBe(false)
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })

  /**
   * 크론 부활 가설 검증 (영호 실측 2026-07-03 — 정지 후 CronList에 크론 잔존 관찰).
   *
   * 가설: abort는 세션 프로세스만 죽인다. 크론 정의는 세션 트랜스크립트에 영속 →
   * 다음 메시지가 P02 AUTO의 resumeSessionId로 세션을 되살릴 때 크론도 부활한다.
   * 위 1번 probe(정지 후 무전송 80s 증가 0)와 영호 관찰(정지 후 질문 전송 → CronList
   * 잔존)이 동시에 참이 되는 유일한 설명 — 여기서 "부활한 크론이 실제 틱을 재개하는지"
   * (진짜 토큰 누수 여부)까지 확정한다.
   */
  test('크론 생성 → 정지 → 새 메시지(resume) → 90s간 자율 틱 재개 여부', async () => {
    test.setTimeout(480_000)
    const workspace = mkdtempSync(join(tmpdir(), 'lr3p06rev-'))
    const app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
    })
    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('.titlebar', { timeout: 20_000 })
      const nick = page.locator('#nickname')
      if (await nick.isVisible().catch(() => false)) {
        await nick.fill('tester')
        await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
      }
      await page.keyboard.press('Escape').catch(() => {})
      const pickFolder = page.getByRole('button', { name: '폴더 선택' })
      if (await pickFolder.isVisible().catch(() => false)) await pickFolder.click()
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)

      type RevRec = { total: number; byType: Record<string, number> }
      await page.evaluate(() => {
        const w = window as unknown as {
          __p06rev: Record<string, { total: number; byType: Record<string, number> }>
          api: {
            onAgentEvent: (cb: (p: { runId: string; event: { type: string } }) => void) => void
          }
        }
        w.__p06rev = {}
        w.api.onAgentEvent((p) => {
          const rec = (w.__p06rev[p.runId] ??= { total: 0, byType: {} })
          rec.total++
          rec.byType[p.event.type] = (rec.byType[p.event.type] ?? 0) + 1
        })
      })
      const counts = async (): Promise<Record<string, RevRec>> =>
        page.evaluate(() =>
          JSON.parse(JSON.stringify((window as unknown as { __p06rev: Record<string, RevRec> }).__p06rev))
        )
      const revNonLoops = (r?: RevRec): number => (r ? r.total - (r.byType.loops ?? 0) : 0)

      const input = page.getByLabel('메시지 입력')
      await input.click()
      await input.fill('/loop 1m Reply with exactly TICK and nothing else.')
      await input.press('Enter')
      const banner = page.locator('.loop-indicator.loop-sdk')
      await expect(banner).toBeVisible({ timeout: 180_000 })
      await page.waitForTimeout(8_000)

      // 정지 — 세션 프로세스 kill(1번 probe에서 무전송 시 정리 확인됨)
      await page.locator('.loop-sdk-stop').click()
      await expect(page.locator('.loop-indicator.loop-stopped')).toBeVisible({ timeout: 30_000 })
      console.log('[P06rev] 정지 완료. resume 트리거 메시지 전송…')

      // 새 메시지 → replMode ON 경로가 resumeSessionId로 세션 부활
      await input.click()
      await input.fill('OK라고만 답해줘. 다른 어떤 도구도 쓰지 마.')
      await input.press('Enter')
      // 응답 완료 대기(중단 버튼 소멸)
      await expect(page.getByRole('button', { name: '실행 중단' })).toHaveCount(0, { timeout: 60_000 })
      const afterResume = await counts()
      console.log('[P06rev] resume 턴 완료 시점 카운트:', JSON.stringify(afterResume))

      // 90s 대기(1m 틱 + 여유) — 자율 틱이 재개되면 카운트가 는다
      await page.waitForTimeout(90_000)
      const final = await counts()
      console.log('[P06rev] 90s 후 카운트:', JSON.stringify(final))

      // 부활 신호 = 비-loops(text/tool_call/done) 성장. resume 직후 loops:[] 정리 스냅샷
      // 1개가 정상 통과할 수 있으므로(BF2-mini P1 화이트리스트) loops 증가는 부활 판정에서 제외.
      let grew = false
      for (const id of Object.keys(final)) {
        const dNon = revNonLoops(final[id]) - revNonLoops(afterResume[id])
        const dLoops = (final[id]?.byType.loops ?? 0) - (afterResume[id]?.byType.loops ?? 0)
        console.log(`[P06rev] runId=${id.slice(0, 12)} 비-loops증가=${dNon} loops증가=${dLoops}`)
        if (dNon > 0) grew = true
      }
      // 배너 재표시 여부(비가시 잔존이면 false인 채 틱만 돈다 — P01-(b) 본질 재림 판정)
      const bannerBack = await banner.isVisible().catch(() => false)
      console.log(`[P06rev] 배너 재표시: ${bannerBack}`)
      console.log(grew
        ? '[P06rev] 판정: ⚠ 크론 부활 확정 — resume 후 자율 틱(비-loops) 재개(정지가 CronDelete가 아님)'
        : '[P06rev] 판정: ✅ resume 후 비-loops 틱 없음(크론 정의만 잔존, 스케줄 미재개)')
      // 사실 확정용 probe — 어느 쪽이든 기록이 목적이라 실패 처리하지 않는다
      expect(true).toBe(true)
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
