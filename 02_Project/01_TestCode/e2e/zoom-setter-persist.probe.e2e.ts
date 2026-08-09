import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

test('Q1+Q2: window.api.setZoomFactor 호출이 ui-prefs.json 저장까지 이어지는가', async () => {
  const { app, page, userDataDir, teardown } = await isolatedBoot({
    slug: 'zoom-setter-persist',
    echo: true
  })

  try {
    const prefsPath = join(userDataDir, 'ui-prefs.json')

    const before = existsSync(prefsPath) ? readFileSync(prefsPath, 'utf8') : '(파일 없음)'
    console.log('[zoom-setter-persist][baseline] ui-prefs.json =', before)

    const before2 = await page.evaluate(() => window.api.getZoomFactor())
    console.log('[zoom-setter-persist][Q1] 호출 전 factor =', before2)

    const targets = [before2 + 0.1, before2 + 0.3, before2 + 0.05]
    for (const target of targets) {
      await page.evaluate((f: number) => window.api.setZoomFactor(f), target)
      await page.waitForTimeout(1200)

      const afterFactor = await page.evaluate(() => window.api.getZoomFactor())
      const after = existsSync(prefsPath) ? readFileSync(prefsPath, 'utf8') : '(파일 없음)'
      let diskZoomFactor: unknown = undefined
      if (existsSync(prefsPath)) {
        try {
          diskZoomFactor = JSON.parse(after).zoomFactor
        } catch {
          diskZoomFactor = '(파싱 실패)'
        }
      }
      console.log(
        `[zoom-setter-persist][Q1+Q2] target=${target} → live factor=${afterFactor}` +
          ` | 디스크 zoomFactor=${diskZoomFactor}`
      )

      expect(typeof afterFactor).toBe('number')
      expect(Math.abs(afterFactor - target)).toBeLessThan(0.001)
      expect(typeof diskZoomFactor).toBe('number')
      expect(Math.abs((diskZoomFactor as number) - target)).toBeLessThan(0.001)
    }

    console.log(
      '[zoom-setter-persist] RESULT — window.api.setZoomFactor 호출은 FB1 P04' +
        ' useGlobalZoomPersist(DPR-change 감지) 경유로 ui-prefs.json에 자동 영속된다(3/3 확인).' +
        ' P05는 별도 명시 setPref 호출을 추가할 필요가 없다.'
    )
  } finally {
    await teardown()
    void app
  }
})
