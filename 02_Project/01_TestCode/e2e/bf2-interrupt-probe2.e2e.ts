import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'
import { PERM_CARD } from './helpers/permSelectors'

const RUN = process.env.LIVE_SDK === '1' && process.env.BF2INT2 === '1'

const SHOT_DIR =
  'C:/Users/bass1/AppData/Local/Temp/claude/C--Dev-AgentDeck/2f0d0413-5986-463c-ba39-640ba73f7e5c/scratchpad'

const COUNT_PROMPT = '1부터 300까지 숫자만 줄바꿈으로 세줘'

const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const SCHED = 'button[aria-label="예약"]'
const SEND = 'button[aria-label="전송"]'
const USER_BUBBLE = `${CHAT} .thread .msg.user`
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
const SCHED_ITEM = `${CHAT} .sched .sched-item`

function log(...a: unknown[]): void {
  console.log('[BF2INT2]', ...a)
}
function elapsed(t0: number): string {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`
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
async function count(page: Page, selector: string): Promise<number> {
  try {
    return await page.locator(selector).count()
  } catch {
    return -1
  }
}

async function composerState(page: Page): Promise<Record<string, unknown>> {
  const [stop, sched, send] = await Promise.all([count(page, STOP), count(page, SCHED), count(page, SEND)])
  let sendDisabled: boolean | null = null
  if (send > 0) sendDisabled = await page.locator(SEND).first().isDisabled().catch(() => null)
  let placeholder: string | null = null
  try {
    placeholder = await page.locator(`${CHAT} ${INPUT}`).first().getAttribute('placeholder')
  } catch {
    placeholder = null
  }
  const btn = stop > 0 ? '실행중단' : sched > 0 ? '예약(큐)' : send > 0 ? '전송' : '(없음)'
  return { btn, sendDisabled, placeholder, stopN: stop, schedN: sched, sendN: send }
}

async function clickStop(page: Page): Promise<{ normal: boolean; dispatched: boolean }> {
  const normal = await page
    .locator(STOP)
    .first()
    .click({ timeout: 4_000 })
    .then(() => true)
    .catch((e) => {
      log('  ■ 일반클릭 실패:', String(e).split('\n')[0])
      return false
    })
  let dispatched = false
  if (!normal) {
    dispatched = await page
      .locator(STOP)
      .first()
      .dispatchEvent('click')
      .then(() => true)
      .catch(() => false)
    log(`  ■ dispatchEvent(강제 발화)=${dispatched}`)
  }
  return { normal, dispatched }
}

async function freshConversation(page: Page, tag: string): Promise<void> {
  await page.getByRole('button', { name: '새 대화' }).click().catch(() => {})
  await page.waitForTimeout(300)
  const threadN = await count(page, `${CHAT} .thread`)
  log(`${tag} '새 대화' — .thread count=${threadN}(0=클린)`)
}

async function ensureReplOn(page: Page, tag: string): Promise<void> {
  const toggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  const pressed = await toggle.getAttribute('aria-pressed').catch(() => null)
  log(`${tag} REPL aria-pressed 초기=${pressed}`)
  if (pressed !== 'true') {
    await toggle.click().catch(() => {})
    log(`${tag} REPL OFF였음 → ON 토글`)
  }
}

test.describe('BF2 interrupt 재실측 probe (LIVE_SDK=1 BF2INT2=1, --user-data-dir 격리)', () => {
  test.skip(!RUN, '라이브 재실측 probe — LIVE_SDK=1 BF2INT2=1로 명시 실행')

  for (const iter of [1, 2, 3, 4]) {
    test(`S1' #${iter} interrupt 후 후속 전송 벽돌 여부`, async () => {
      test.setTimeout(240_000)
      const { page, teardown } = await isolatedBoot({ slug: 'bf2int2' })
      try {
        await freshConversation(page, `S1'#${iter}`)
        await ensureReplOn(page, `S1'#${iter}`)
        const input = page.locator(CHAT).locator(INPUT)

        const tSend = Date.now()
        await input.click()
        await input.fill(COUNT_PROMPT)
        await input.press('Enter')
        log(`S1'#${iter} 전송: "${COUNT_PROMPT}"`)

        const appeared = await page
          .locator(STOP)
          .waitFor({ state: 'visible', timeout: 30_000 })
          .then(() => true)
          .catch(() => false)
        log(`S1'#${iter} ■ 등장=${appeared} (+${elapsed(tSend)})`)
        if (!appeared) {
          log(`S1'#${iter} 판정: ■ 미등장(isRunning 미진입/즉시종료) — 회차 무효.`)
          expect(true).toBe(true)
          return
        }

        let prev = await textLen(page, `${CHAT} .thread`)
        let grew = false
        for (let i = 0; i < 20 && !grew; i++) {
          await page.waitForTimeout(300)
          const cur = await textLen(page, `${CHAT} .thread`)
          if (cur > prev + 2) grew = true
          prev = cur
        }
        log(`S1'#${iter} 스트리밍 성장=${grew}, thread길이=${prev}`)

        await page.waitForTimeout(3_000)
        const stateBeforeStop = await composerState(page)
        log(`S1'#${iter} ■클릭 직전 composer=${JSON.stringify(stateBeforeStop)}`)
        const t0 = Date.now()
        const clickRes = await clickStop(page)
        log(`S1'#${iter} ■ 클릭 normal=${clickRes.normal} dispatched=${clickRes.dispatched}`)

        let stopGoneAt = -1
        for (let sec = 0; sec <= 20; sec++) {
          if ((await count(page, STOP)) === 0 && stopGoneAt < 0) {
            stopGoneAt = sec
            log(`S1'#${iter} ■ 소멸(isRunning 해제) @ +${sec}s (${elapsed(t0)})`)
            break
          }
          await page.waitForTimeout(1_000)
        }
        if (stopGoneAt < 0) log(`S1'#${iter} ⚠ ■ 20s 내 미소멸 — isRunning 고착(행) 의심.`)

        await page.waitForTimeout(5_000)

        const userBefore = await count(page, USER_BUBBLE)
        const aiBefore = await count(page, AI_MSG)
        const schedBefore = await count(page, SCHED_ITEM)
        const stateBeforeFollow = await composerState(page)
        log(
          `S1'#${iter} [전송직전] composer=${JSON.stringify(stateBeforeFollow)} userBubbles=${userBefore} aiMsgs=${aiBefore} schedItems=${schedBefore}`,
        )

        await input.click().catch(() => {})
        await input.fill('OK라고만 답해.')
        const valAfterFill = await page.locator(CHAT).locator(INPUT).inputValue().catch(() => '(읽기실패)')
        const stateTyped = await composerState(page)
        log(`S1'#${iter} [타이핑후·전송전] inputValue="${valAfterFill}" composer=${JSON.stringify(stateTyped)}`)
        await input.press('Enter')
        await page.waitForTimeout(500)
        const valAfterSend = await page.locator(CHAT).locator(INPUT).inputValue().catch(() => '(읽기실패)')
        log(`S1'#${iter} [전송직후] inputValue="${valAfterSend}"(빈문자열=비워짐)`)

        let userBubbleAppeared = false
        let schedAppeared = false
        for (let i = 0; i < 6; i++) {
          await page.waitForTimeout(500)
          if ((await count(page, USER_BUBBLE)) > userBefore) {
            userBubbleAppeared = true
            break
          }
          if ((await count(page, SCHED_ITEM)) > schedBefore) {
            schedAppeared = true
            break
          }
        }
        const userAfter = await count(page, USER_BUBBLE)
        const schedAfter = await count(page, SCHED_ITEM)
        const stateAfterSend = await composerState(page)
        log(
          `S1'#${iter} [전송후 3s] userBubble신규=${userBubbleAppeared}(count ${userBefore}→${userAfter}) sched신규=${schedAppeared}(count ${schedBefore}→${schedAfter}) composer=${JSON.stringify(stateAfterSend)}`,
        )

        let assistantResponded = false
        if (userBubbleAppeared) {
          for (let i = 0; i < 60 && !assistantResponded; i++) {
            await page.waitForTimeout(1_000)
            if ((await count(page, AI_MSG)) > aiBefore) assistantResponded = true
          }
          log(`S1'#${iter} [후속응답] assistant 60s내 응답=${assistantResponded}`)
        }

        let verdict: string
        if (schedAppeared && !userBubbleAppeared) {
          verdict = 'BRICK-b(큐잉) — 유저버블 X, 메시지가 예약(큐)로 감 = isRunning 고착. renderer'
        } else if (!userBubbleAppeared && !schedAppeared) {
          verdict = 'BRICK-b(전송차단) — 유저버블 X + 큐도 X = 전송 자체 무반응. renderer'
        } else if (userBubbleAppeared && !assistantResponded) {
          verdict = 'BRICK-c — 유저버블 O, 60s 무응답 = 백엔드/세션 손상. main/agent'
        } else {
          verdict = 'OK — 유저버블 O + assistant 응답 O(벽돌 아님)'
        }
        log(`S1'#${iter} ★판정: ${verdict} | stopGoneAt=${stopGoneAt}s`)

        if (verdict.startsWith('BRICK')) {
          const shot = join(SHOT_DIR, `s1-iter${iter}-brick.png`)
          await page.screenshot({ path: shot, fullPage: false }).catch(() => {})
          log(`S1'#${iter} 스크린샷=${shot}`)
        }
        expect(true).toBe(true)
      } finally {
        await teardown()
      }
    })
  }

  test(`S2' 권한 카드 대기 중 ■ 클릭 → 가림 없이 직접 클릭 가능 + 불변식 붕괴(행) 여부`, async () => {
    test.setTimeout(300_000)
    const { page, teardown } = await isolatedBoot({ slug: 'bf2int2' })
    try {
      await freshConversation(page, 'S2')
      await ensureReplOn(page, 'S2')
      const input = page.locator(CHAT).locator(INPUT)

      const modeChanged = await (async () => {
        const btn = page.locator(CHAT).getByRole('button', { name: '모드 선택' })
        if (!(await btn.isVisible().catch(() => false))) return false
        await btn.click().catch(() => {})
        await page.waitForTimeout(200)
        const opt = page.getByRole('option', { name: /일반/ })
        if (!(await opt.first().isVisible().catch(() => false))) return false
        await opt.first().click().catch(() => {})
        return true
      })()
      log(`S2 모드 '일반'으로 변경=${modeChanged}`)

      const prompts = [
        "셸 명령으로 'echo HELLO'를 실행해줘",
        '워크스페이스에 bf2-probe2.txt 파일을 만들고 안에 HELLO를 써줘.',
      ]
      let modalUp = false
      let usedPrompt = ''
      for (const p of prompts) {
        usedPrompt = p
        await input.click().catch(() => {})
        await input.fill(p)
        await input.press('Enter')
        log(`S2 전송(카드유도): "${p}"`)
        for (let i = 0; i < 90 && !modalUp; i++) {
          if (await page.locator(PERM_CARD).isVisible().catch(() => false)) {
            modalUp = true
            break
          }
          const running = (await count(page, STOP)) > 0
          if (!running && i > 4) {
            log(`S2 이 프롬프트는 카드 없이 종료(자동승인/무도구) @ +${i}s — 다음 프롬프트 시도`)
            break
          }
          await page.waitForTimeout(1_000)
        }
        if (modalUp) break
        await freshConversation(page, 'S2-retry')
        await ensureReplOn(page, 'S2-retry')
      }

      if (!modalUp) {
        log(`S2 판정: 이 환경에서 권한 카드 유발 불가(시도 프롬프트: ${JSON.stringify(prompts)}, 모드=일반). 스킵.`)
        expect(true).toBe(true)
        return
      }
      log(`S2 권한 카드(.perm-card) 등장 — 유발 프롬프트="${usedPrompt}". 이 상태에서 ■ 클릭.`)

      await expect(page.locator(STOP)).toBeVisible({ timeout: 5_000 })

      const t0 = Date.now()
      const clickRes = await clickStop(page)
      log(`S2 ■ 클릭(권한대기중) normal=${clickRes.normal} dispatched=${clickRes.dispatched}`)
      expect(clickRes.normal, 'S2 ■ 클릭이 정상 경로로 성공해야 함(가림 없음 — force/좌표 우회 불요)').toBe(true)
      expect(clickRes.dispatched, 'S2 ■ 클릭에 dispatchEvent 강제발화 폴백이 쓰이지 않아야 함').toBe(false)

      let modalGoneAt = -1
      let runningGoneAt = -1
      for (let sec = 0; sec <= 20; sec++) {
        const modalVisible = await page.locator(PERM_CARD).isVisible().catch(() => false)
        const running = (await count(page, STOP)) > 0
        if (!modalVisible && modalGoneAt < 0) {
          modalGoneAt = sec
          log(`S2 카드 닫힘 @ +${sec}s (${elapsed(t0)})`)
        }
        if (!running && runningGoneAt < 0) {
          runningGoneAt = sec
          log(`S2 ■ 소멸(isRunning 해제) @ +${sec}s (${elapsed(t0)})`)
        }
        if (modalGoneAt >= 0 && runningGoneAt >= 0) break
        if (sec < 20) await page.waitForTimeout(1_000)
      }
      if (runningGoneAt < 0) {
        log('S2 ★판정: ⚠⚠ 행(HANG) — 권한 대기 중 interrupt 후 20s 내 isRunning 미해제. 불변식 붕괴 강한 후보. main/agent')
        const shot = join(SHOT_DIR, 's2-perm-hang.png')
        await page.screenshot({ path: shot }).catch(() => {})
        log(`S2 스크린샷=${shot}`)
      } else {
        log(`S2 ★판정: 정지 반영 — 카드닫힘 ${modalGoneAt}s / isRunning해제 ${runningGoneAt}s`)
      }

      const userBefore = await count(page, USER_BUBBLE)
      const aiBefore = await count(page, AI_MSG)
      await page.locator(STOP).waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
      await input.click().catch(() => {})
      await input.fill('OK라고만 답해.')
      await input.press('Enter')
      let followUser = false
      let followAi = false
      for (let i = 0; i < 60 && !followAi; i++) {
        await page.waitForTimeout(1_000)
        if (!followUser && (await count(page, USER_BUBBLE)) > userBefore) followUser = true
        if ((await count(page, AI_MSG)) > aiBefore) followAi = true
      }
      log(`S2 후속: 유저버블=${followUser} assistant응답=${followAi} — ${followAi ? '세션 생존' : '⚠ 세션 손상/행 지속'}`)
      expect(true).toBe(true)
    } finally {
      await teardown()
    }
  })
})
