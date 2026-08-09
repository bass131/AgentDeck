import { test, expect } from '@playwright/test'
import { isolatedBoot } from './helpers/isolatedBoot'

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
    const { page, teardown } = await isolatedBoot({ slug: 'lr3p01b' })
    try {
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)

      await page.evaluate(() => {
        window.__p01b = {}
        window.api.onAgentEvent((p) => {
          const rec = (window.__p01b![p.runId] ??= { total: 0, types: {}, lastAt: 0 })
          rec.total++
          rec.types[p.event.type] = (rec.types[p.event.type] ?? 0) + 1
          rec.lastAt = Date.now()
        })
      })

      const replToggle = page.locator('.pane.chat').getByRole('button', { name: 'REPL 지속세션 모드 토글' })
      if ((await replToggle.getAttribute('aria-pressed')) !== 'true') await replToggle.click()
      const input = page.getByLabel('메시지 입력')
      await input.click()
      await input.fill('/loop 1m Reply with exactly TICK and nothing else. Do not use any tools.')
      await input.press('Enter')
      await expect(page.locator('.loop-indicator.loop-sdk')).toBeVisible({ timeout: 180_000 })

      const loopRunIds = await page.evaluate(() => Object.keys(window.__p01b!))
      console.log('[P01-b] 루프 세션 runId:', loopRunIds)

      await replToggle.click()
      expect(await replToggle.getAttribute('aria-pressed')).toBe('false')
      await input.click()
      await input.fill('Reply with exactly SECOND and nothing else.')
      await input.press('Enter')
      await page.waitForTimeout(15_000)

      const midCounts = await page.evaluate(() => JSON.parse(JSON.stringify(window.__p01b)))
      console.log('[P01-b] OFF 토글+새 메시지 직후 카운트:', JSON.stringify(midCounts))

      await page.getByRole('button', { name: /새 대화/ }).click()

      const before = await page.evaluate(
        (ids) => Object.fromEntries(ids.map((id) => [id, window.__p01b![id]?.total ?? 0])),
        loopRunIds
      )
      await page.waitForTimeout(150_000)
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
      await teardown()
    }
  })
})
