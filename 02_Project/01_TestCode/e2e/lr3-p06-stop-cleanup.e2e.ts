import { test, expect } from '@playwright/test'
import { isolatedBoot } from './helpers/isolatedBoot'

const RUN = process.env.LIVE_SDK === '1' && process.env.P06STOP === '1'

test.describe('LR3 P06 정지 버튼 내부 정리 실측 (LIVE_SDK=1 P06STOP=1)', () => {
  test.skip(!RUN, '라이브 probe — LIVE_SDK=1 P06STOP=1로 명시 실행')
  test.describe.configure({ retries: 2 })

  test('크론 생성 → idle에서 배너 정지 → 80s간 옛 runId 이벤트 증가 0', async () => {
    test.setTimeout(420_000)
    const { page, teardown } = await isolatedBoot({ slug: 'lr3p06stop' })
    try {
      await page.getByRole('button', { name: /새 대화/ }).click()
      await page.waitForTimeout(500)

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

      await page.locator('.loop-sdk-stop').click()
      await expect(banner).toBeHidden({ timeout: 30_000 })

      await page.waitForTimeout(80_000)
      const after = await snapshot()
      console.log('[P06stop] 80s 후 카운트:', JSON.stringify(after))

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
      expect(nonLoopsGrew).toBe(false)
      expect(loopsGrewBeyond1).toBe(false)
    } finally {
      await teardown()
    }
  })

  test('크론 생성 → 정지 → 새 메시지(resume) → 90s간 자율 틱 재개 여부', async () => {
    test.setTimeout(480_000)
    const { page, teardown } = await isolatedBoot({ slug: 'lr3p06rev' })
    try {
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

      await page.locator('.loop-sdk-stop').click()
      await expect(page.locator('.loop-indicator.loop-stopped')).toBeVisible({ timeout: 30_000 })
      console.log('[P06rev] 정지 완료. resume 트리거 메시지 전송…')

      await input.click()
      await input.fill('OK라고만 답해줘. 다른 어떤 도구도 쓰지 마.')
      await input.press('Enter')
      await expect(page.getByRole('button', { name: '실행 중단' })).toHaveCount(0, { timeout: 60_000 })
      const afterResume = await counts()
      console.log('[P06rev] resume 턴 완료 시점 카운트:', JSON.stringify(afterResume))

      await page.waitForTimeout(90_000)
      const final = await counts()
      console.log('[P06rev] 90s 후 카운트:', JSON.stringify(final))

      let grew = false
      for (const id of Object.keys(final)) {
        const dNon = revNonLoops(final[id]) - revNonLoops(afterResume[id])
        const dLoops = (final[id]?.byType.loops ?? 0) - (afterResume[id]?.byType.loops ?? 0)
        console.log(`[P06rev] runId=${id.slice(0, 12)} 비-loops증가=${dNon} loops증가=${dLoops}`)
        if (dNon > 0) grew = true
      }
      const bannerBack = await banner.isVisible().catch(() => false)
      console.log(`[P06rev] 배너 재표시: ${bannerBack}`)
      console.log(grew
        ? '[P06rev] 판정: ⚠ 크론 부활 확정 — resume 후 자율 틱(비-loops) 재개(정지가 CronDelete가 아님)'
        : '[P06rev] 판정: ✅ resume 후 비-loops 틱 없음(크론 정의만 잔존, 스케줄 미재개)')
      expect(true).toBe(true)
    } finally {
      await teardown()
    }
  })
})
