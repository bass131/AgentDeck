/**
 * lr3-p06-stop-cleanup.e2e.ts — 영호 육안 피드백 검증 probe (opt-in: LIVE_SDK=1 + P06STOP=1).
 *
 * 관찰(2026-07-03 육안 투어): "loop 중단버튼 클릭 시 UI만 종료되고 내부 크론/스케줄은
 * 정리가 안 되는 것 같다."
 * 코드 독해로는 배너 정지 → abortRun → main abort → 세션 프로세스 kill → 크론 사멸이
 * 맞아 보이나, 관찰과 갈리므로 실측으로 판정한다(수정은 실측으로 검증).
 *
 * 방법: 크론 생성 → 턴 idle 대기 → 배너 정지 클릭 → 80s(1m 틱 경과) 동안 raw 이벤트
 * 카운터(P01-(b) 기법)로 옛 runId 이벤트 증가 관측. 증가 0 = 내부 정리 정상(UI 문제 아님),
 * 증가 >0 = 누수 실재(수리 필요).
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

      // raw 이벤트 카운터(P01-(b) 기법 — renderer 드롭 경로와 독립)
      await page.evaluate(() => {
        const w = window as unknown as {
          __p06stop: Record<string, number>
          api: { onAgentEvent: (cb: (p: { runId: string }) => void) => void }
        }
        w.__p06stop = {}
        w.api.onAgentEvent((p) => {
          w.__p06stop[p.runId] = (w.__p06stop[p.runId] ?? 0) + 1
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

      const loopRunIds = await page.evaluate(() =>
        Object.keys((window as unknown as { __p06stop: Record<string, number> }).__p06stop)
      )
      const before = await page.evaluate(() =>
        JSON.parse(JSON.stringify((window as unknown as { __p06stop: Record<string, number> }).__p06stop))
      )
      console.log('[P06stop] 정지 직전 카운트:', JSON.stringify(before))

      // idle 상태에서 배너 정지 클릭 — 영호 관찰 시나리오 재현
      await page.locator('.loop-sdk-stop').click()
      await expect(banner).toBeHidden({ timeout: 30_000 })

      // 80s 대기(1m 틱 + 여유) → 옛 runId 이벤트 증가 관측
      await page.waitForTimeout(80_000)
      const after = await page.evaluate(() =>
        JSON.parse(JSON.stringify((window as unknown as { __p06stop: Record<string, number> }).__p06stop))
      )
      console.log('[P06stop] 80s 후 카운트:', JSON.stringify(after))

      let grew = false
      for (const id of loopRunIds) {
        const diff = (after[id] ?? 0) - (before[id] ?? 0)
        console.log(`[P06stop] runId=${id.slice(0, 12)} 증가=${diff}`)
        if (diff > 0) grew = true
      }
      console.log(grew ? '[P06stop] 판정: ⚠ 정지 후에도 내부 크론 잔존(누수 실재)' : '[P06stop] 판정: ✅ 정지 후 내부 이벤트 증가 0(정리 정상)')
      expect(grew).toBe(false)
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

      await page.evaluate(() => {
        const w = window as unknown as {
          __p06rev: Record<string, number>
          api: { onAgentEvent: (cb: (p: { runId: string }) => void) => void }
        }
        w.__p06rev = {}
        w.api.onAgentEvent((p) => {
          w.__p06rev[p.runId] = (w.__p06rev[p.runId] ?? 0) + 1
        })
      })
      const counts = async (): Promise<Record<string, number>> =>
        page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { __p06rev: Record<string, number> }).__p06rev)))

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

      let grew = false
      for (const id of Object.keys(final)) {
        const diff = (final[id] ?? 0) - (afterResume[id] ?? 0)
        console.log(`[P06rev] runId=${id.slice(0, 12)} 증가=${diff}`)
        if (diff > 0) grew = true
      }
      // 배너 재표시 여부(비가시 잔존이면 false인 채 틱만 돈다 — P01-(b) 본질 재림 판정)
      const bannerBack = await banner.isVisible().catch(() => false)
      console.log(`[P06rev] 배너 재표시: ${bannerBack}`)
      console.log(grew
        ? '[P06rev] 판정: ⚠ 크론 부활 확정 — resume 후 자율 틱 재개(정지가 CronDelete가 아님)'
        : '[P06rev] 판정: ✅ resume 후에도 틱 없음(크론 정의만 잔존, 스케줄 미재개)')
      // 사실 확정용 probe — 어느 쪽이든 기록이 목적이라 실패 처리하지 않는다
      expect(true).toBe(true)
    } finally {
      await app.close()
      rmSync(workspace, { recursive: true, force: true })
    }
  })
})
