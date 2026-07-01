/**
 * lr3-p01b-stale-session.e2e.ts — LR3 P01-(b) 잔존 held-open·크론 실측 (opt-in: LIVE_SDK=1 + P01B=1).
 *
 * 질문: REPL ON에서 크론 루프를 만든 뒤 ① OFF 토글 + 새 메시지 ② "새 대화" 전환을 해도
 * 옛 held-open 세션의 크론이 백그라운드에서 계속 LLM 호출(토큰 소모)을 만드는가?
 *
 * 관측법: preload `window.api.onAgentEvent`에 raw 카운터를 심어 runId별 이벤트 수를 기록
 * (renderer 앱 로직의 경로3 드롭과 무관하게 원 이벤트를 관측). 크론 interval(1m) 경과 후
 * 옛 runId로 새 이벤트가 오면 = 잔존 크론 실재.
 *
 * 정리: 테스트 종료 시 app.close() → main closeAll이 전 세션 kill(크론 소멸 보장).
 * 판정은 01.Phases/LR3-loop-ux/_probe-findings.md에 박제.
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RUN = process.env.LIVE_SDK === '1' && process.env.P01B === '1'

declare global {
  interface Window {
    api: { onAgentEvent: (cb: (p: { runId: string; event: { type: string } }) => void) => () => void }
    __p01b?: Record<string, { total: number; types: Record<string, number>; lastAt: number }>
  }
}

test.describe('LR3 P01-(b): 잔존 held-open·크론 백그라운드 소모 (LIVE_SDK=1 P01B=1)', () => {
  test.skip(!RUN, '라이브 probe — LIVE_SDK=1 P01B=1로 명시 실행')

  test('REPL ON 크론 생성 → OFF 토글·새 대화 후 옛 runId 이벤트 잔존 관측', async () => {
    test.setTimeout(420_000)
    const workspace = mkdtempSync(join(tmpdir(), 'lr3p01b-'))
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

      // 격리: 이전 런 대화 복원 차단(새 대화) — lr2-03 하네스 교훈
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)

      // raw 이벤트 카운터 설치 (preload 구독 — 앱 로직 경로와 독립)
      await page.evaluate(() => {
        window.__p01b = {}
        window.api.onAgentEvent((p) => {
          const rec = (window.__p01b![p.runId] ??= { total: 0, types: {}, lastAt: 0 })
          rec.total++
          rec.types[p.event.type] = (rec.types[p.event.type] ?? 0) + 1
          rec.lastAt = Date.now()
        })
      })

      // REPL ON + 크론 루프 생성
      const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
      if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()
      const input = page.getByLabel('메시지 입력')
      await input.click()
      await input.fill('/loop 1m Reply with exactly TICK and nothing else. Do not use any tools.')
      await input.press('Enter')
      await expect(page.locator('.loop-indicator.loop-sdk')).toBeVisible({ timeout: 180_000 })

      // 옛(루프) 세션 runId 식별 — 지금까지 이벤트를 받은 runId
      const loopRunIds = await page.evaluate(() => Object.keys(window.__p01b!))
      console.log('[P01-b] 루프 세션 runId:', loopRunIds)

      // ① OFF 토글 + 일반 메시지(단발 새 run)
      await replToggle.click()
      expect(await replToggle.getAttribute('aria-pressed')).toBe('false')
      await input.click()
      await input.fill('Reply with exactly SECOND and nothing else.')
      await input.press('Enter')
      await page.waitForTimeout(15_000)

      const midCounts = await page.evaluate(() => JSON.parse(JSON.stringify(window.__p01b)))
      console.log('[P01-b] OFF 토글+새 메시지 직후 카운트:', JSON.stringify(midCounts))

      // ② 새 대화 전환
      await page.getByRole('button', { name: /새 대화/ }).click()

      // 크론 interval(1m) + 여유 경과 대기 → 옛 runId의 신규 이벤트 관측
      const before = await page.evaluate(
        (ids) => Object.fromEntries(ids.map((id) => [id, window.__p01b![id]?.total ?? 0])),
        loopRunIds
      )
      await page.waitForTimeout(150_000) // 2 interval+여유
      const after = await page.evaluate(() => JSON.parse(JSON.stringify(window.__p01b)))
      console.log('[P01-b] 150s 대기 후 전체 카운트:', JSON.stringify(after))

      let staleActive = false
      for (const id of loopRunIds) {
        const grew = (after[id]?.total ?? 0) > (before[id] ?? 0)
        console.log(`[P01-b] 옛 runId=${id.slice(0, 12)} before=${before[id]} after=${after[id]?.total} 증가=${grew}`)
        if (grew) staleActive = true
      }
      console.log(
        staleActive
          ? '[P01-b] 판정: ⚠ 잔존 크론이 OFF 토글·새 대화 후에도 계속 발화(백그라운드 토큰 소모 실재)'
          : '[P01-b] 판정: ✅ OFF 토글·새 대화 후 옛 세션 이벤트 증가 없음(잔존 소모 미관측)'
      )
    } finally {
      await app.close() // closeAll → 전 세션 kill(크론 정리 보장)
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
