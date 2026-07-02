/**
 * bf2-interrupt-probe2.e2e.ts — 채팅 ■(중단) 버튼 결함 **재실측** probe (진단 전용, 수리 X).
 *
 * 배경: 직전 probe(bf2-interrupt-probe.e2e.ts)는 실 userData(개발자 prefs·대화 히스토리)를
 *   공유한 오염 환경에서 측정됐고 핵심 발견("interrupt 후 대화 벽돌")이 단일 표본이었다.
 *   이 재실측은 (1) --user-data-dir 격리로 환경을 청정화하고 (2) N=4 반복으로 재현률을 확정한다.
 *
 * === 환경 격리(선행 과제 0) — 실증 완료 ===
 *   - Electron/Chromium 스위치 `--user-data-dir=<tmp>`를 out/main/index.js 앞에 두면
 *     app.getPath('userData')가 tmp로 바뀐다(engine-state 인증은 ~/.claude/.credentials.json —
 *     홈 디렉토리라 격리와 무관하게 유지 → 라이브 SDK 정상).
 *   - ⚠️ 직전 에이전트의 "titlebar 미마운트" 실패 원인 규명: 신규 userData면 profile이 없어
 *     AppGate가 '온보딩' 단계로 진입하는데, 이 단계에는 Shell(=titlebar)이 마운트되지 않는다.
 *     `.titlebar`를 곧바로 기다리면 타임아웃 → 그걸 "--user-data-dir가 앱을 깬다"로 오진했다.
 *     실제 원인은 부트 헬퍼가 온보딩(#nickname)을 먼저 처리하지 않은 것.
 *     bootToChat이 온보딩 → engine-gate skip → titlebar 순으로 처리하면 격리가 완벽 작동한다
 *     (스모크로 실증: tmp userData에 chats/·profile.json·ui-prefs.json·multi-agent.json 기록됨).
 *   - 인자 순서(before/after)는 실제로 무관(Chromium이 전역 파싱). before로 통일(관례).
 *
 * opt-in: LIVE_SDK=1 + BF2INT2=1 (라이브 SDK 필요 — mock이면 interrupt 진단 무의미).
 * ⚠️ AGENTDECK_E2E 절대 설정 금지(EchoBackend 모크가 됨). WORKSPACE/NO_ENGINE_UPDATE만.
 * 로그 prefix: [BF2INT2]. expect는 최소(진단 연속성 — 실패도 데이터).
 *
 * 실행:
 *   LIVE_SDK=1 BF2INT2=1 npx playwright test 99.Others/tests/e2e/bf2-interrupt-probe2.e2e.ts
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'

const RUN = process.env.LIVE_SDK === '1' && process.env.BF2INT2 === '1'

// 스크린샷 저장 경로(scratchpad — 프로젝트 밖). 실패 시점 1장씩.
const SHOT_DIR =
  'C:/Users/bass1/AppData/Local/Temp/claude/C--Dev-AgentDeck/2f0d0413-5986-463c-ba39-640ba73f7e5c/scratchpad'

// 태스크 지정 프롬프트 — 장문 스트리밍 유도(300줄 = 넉넉한 interrupt 창).
const COUNT_PROMPT = '1부터 300까지 숫자만 줄바꿈으로 세줘'

// 셀렉터 상수(소스 실측 기준) ─────────────────────────────────────────────────
const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]' // isRunning && !content
const SCHED = 'button[aria-label="예약"]' // isRunning && content (큐)
const SEND = 'button[aria-label="전송"]' // !isRunning
const USER_BUBBLE = `${CHAT} .thread .msg.user`
const AI_MSG = `${CHAT} .thread .msg.ai-msg`
const SCHED_ITEM = `${CHAT} .sched .sched-item`
const PERM_MODAL = '.perm-modal[role="dialog"]'

function log(...a: unknown[]): void {
  console.log('[BF2INT2]', ...a)
}
function elapsed(t0: number): string {
  return `${((Date.now() - t0) / 1000).toFixed(1)}s`
}

/** 로케이터 innerText 길이(안전). 없으면 0, 실패 시 -1. */
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

/** 단일챗 전송/중단 버튼 3종 중 어느 게 떠 있는지 + placeholder. */
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

/** 정지버튼 클릭 시도 — 절대 throw 안 함. */
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

// 부트(온보딩→engine-gate→titlebar→WhatsNew→단일탭→워크스페이스 오픈)는 공용 헬퍼
// isolatedBoot()로 추출됨(helpers/isolatedBoot.ts) — 이 probe가 규명한 --user-data-dir 격리
// 부트가 그 헬퍼의 기반이다. 각 테스트는 isolatedBoot({ slug:'bf2int2' })로 { page, teardown }을 받는다.

/** 새 대화(단일) — clearConversation으로 thread·isRunning·queue·currentRunId 리셋. */
async function freshConversation(page: Page, tag: string): Promise<void> {
  await page.getByRole('button', { name: '새 대화' }).click().catch(() => {})
  await page.waitForTimeout(300)
  const threadN = await count(page, `${CHAT} .thread`)
  log(`${tag} '새 대화' — .thread count=${threadN}(0=클린)`)
}

/** REPL 지속세션 모드 강제 ON(interrupt 경로). */
async function ensureReplOn(page: Page, tag: string): Promise<void> {
  const toggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  const pressed = await toggle.getAttribute('aria-pressed').catch(() => null)
  log(`${tag} REPL aria-pressed 초기=${pressed}`)
  if (pressed !== 'true') {
    await toggle.click().catch(() => {})
    log(`${tag} REPL OFF였음 → ON 토글`)
  }
}

// 격리 실행(--user-data-dir)·teardown도 isolatedBoot() 헬퍼로 이관됨(위 주석 참조).

test.describe('BF2 interrupt 재실측 probe (LIVE_SDK=1 BF2INT2=1, --user-data-dir 격리)', () => {
  test.skip(!RUN, '라이브 재실측 probe — LIVE_SDK=1 BF2INT2=1로 명시 실행')

  // ── S1' — interrupt 후 "대화 벽돌" 확정 (N=4, 각 회차 신규 앱 + 새 대화) ──────
  for (const iter of [1, 2, 3, 4]) {
    test(`S1' #${iter} interrupt 후 후속 전송 벽돌 여부`, async () => {
      test.setTimeout(240_000)
      const { page, teardown } = await isolatedBoot({ slug: 'bf2int2' })
      try {
        await freshConversation(page, `S1'#${iter}`)
        await ensureReplOn(page, `S1'#${iter}`)
        const input = page.locator(CHAT).locator(INPUT)

        // 1) 장문 스트리밍 유도
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

        // 스트리밍 성장 확인
        let prev = await textLen(page, `${CHAT} .thread`)
        let grew = false
        for (let i = 0; i < 20 && !grew; i++) {
          await page.waitForTimeout(300)
          const cur = await textLen(page, `${CHAT} .thread`)
          if (cur > prev + 2) grew = true
          prev = cur
        }
        log(`S1'#${iter} 스트리밍 성장=${grew}, thread길이=${prev}`)

        // 태스크 지정: 스트리밍 확인 후 3s 대기 → ■ 클릭
        await page.waitForTimeout(3_000)
        const stateBeforeStop = await composerState(page)
        log(`S1'#${iter} ■클릭 직전 composer=${JSON.stringify(stateBeforeStop)}`)
        const t0 = Date.now()
        const clickRes = await clickStop(page)
        log(`S1'#${iter} ■ 클릭 normal=${clickRes.normal} dispatched=${clickRes.dispatched}`)

        // 정지 확인: 20s 폴링 — 버튼 소멸(=isRunning 해제) 시각
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

        // 2) 정지 확인 후 5s 대기
        await page.waitForTimeout(5_000)

        // (d) 후속 전송 직전 상태
        const userBefore = await count(page, USER_BUBBLE)
        const aiBefore = await count(page, AI_MSG)
        const schedBefore = await count(page, SCHED_ITEM)
        const stateBeforeFollow = await composerState(page)
        log(
          `S1'#${iter} [전송직전] composer=${JSON.stringify(stateBeforeFollow)} userBubbles=${userBefore} aiMsgs=${aiBefore} schedItems=${schedBefore}`,
        )

        // (a) 입력창 텍스트 투입 → 전송 후 비워짐?
        await input.click().catch(() => {})
        await input.fill('OK라고만 답해.')
        const valAfterFill = await page.locator(CHAT).locator(INPUT).inputValue().catch(() => '(읽기실패)')
        // 타이핑 직후(전송 전) 버튼 상태 — isRunning 고착이면 여기서 '예약'이 뜬다(강한 신호)
        const stateTyped = await composerState(page)
        log(`S1'#${iter} [타이핑후·전송전] inputValue="${valAfterFill}" composer=${JSON.stringify(stateTyped)}`)
        await input.press('Enter')
        await page.waitForTimeout(500)
        const valAfterSend = await page.locator(CHAT).locator(INPUT).inputValue().catch(() => '(읽기실패)')
        log(`S1'#${iter} [전송직후] inputValue="${valAfterSend}"(빈문자열=비워짐)`)

        // (b) 유저 버블이 3s 내 스레드에 렌더됐는가 / 큐로 갔는가
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

        // (c) 유저 버블 떴으면 60s 내 assistant 응답?
        let assistantResponded = false
        if (userBubbleAppeared) {
          for (let i = 0; i < 60 && !assistantResponded; i++) {
            await page.waitForTimeout(1_000)
            if ((await count(page, AI_MSG)) > aiBefore) assistantResponded = true
          }
          log(`S1'#${iter} [후속응답] assistant 60s내 응답=${assistantResponded}`)
        }

        // 집계 분류
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

  // ── S2' — 권한 모달 대기 중 interrupt (모달 강제: 모드=일반 + 셸 명령) ─────────
  test(`S2' 권한 모달 중 ■ 클릭 → 불변식 붕괴(행) 여부`, async () => {
    test.setTimeout(300_000)
    const { page, teardown } = await isolatedBoot({ slug: 'bf2int2' })
    try {
      await freshConversation(page, 'S2')
      await ensureReplOn(page, 'S2')
      const input = page.locator(CHAT).locator(INPUT)

      // 모드 피커를 '일반'(normal — 변경마다 승인)으로 변경해 Bash 도구 시 모달 강제.
      // 단일 기본은 'auto'(전부 자동허용)라 그대로면 모달이 안 뜬다(직전 probe 미검증 원인).
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
        log(`S2 전송(모달유도): "${p}"`)
        for (let i = 0; i < 90 && !modalUp; i++) {
          if (await page.locator(PERM_MODAL).isVisible().catch(() => false)) {
            modalUp = true
            break
          }
          const running = (await count(page, STOP)) > 0
          if (!running && i > 4) {
            log(`S2 이 프롬프트는 모달 없이 종료(자동승인/무도구) @ +${i}s — 다음 프롬프트 시도`)
            break
          }
          await page.waitForTimeout(1_000)
        }
        if (modalUp) break
        // 다음 프롬프트 전 새 대화로 리셋
        await freshConversation(page, 'S2-retry')
        await ensureReplOn(page, 'S2-retry')
      }

      if (!modalUp) {
        log(`S2 판정: 이 환경에서 권한 모달 유발 불가(시도 프롬프트: ${JSON.stringify(prompts)}, 모드=일반). 스킵.`)
        expect(true).toBe(true)
        return
      }
      log(`S2 권한 모달(.perm-modal) 등장 — 유발 프롬프트="${usedPrompt}". 이 상태에서 ■ 클릭.`)

      const t0 = Date.now()
      const clickRes = await clickStop(page)
      log(`S2 ■ 클릭(권한대기중) normal=${clickRes.normal} dispatched=${clickRes.dispatched}`)

      let modalGoneAt = -1
      let runningGoneAt = -1
      for (let sec = 0; sec <= 20; sec++) {
        const modalVisible = await page.locator(PERM_MODAL).isVisible().catch(() => false)
        const running = (await count(page, STOP)) > 0
        if (!modalVisible && modalGoneAt < 0) {
          modalGoneAt = sec
          log(`S2 모달 닫힘 @ +${sec}s (${elapsed(t0)})`)
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
        log(`S2 ★판정: 정지 반영 — 모달닫힘 ${modalGoneAt}s / isRunning해제 ${runningGoneAt}s`)
      }

      // 후속 생존 확인
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

  // ── S3' — 멀티패널 정지 버튼 심화 (바인딩 vs 미시작 분리, 2회 반복) ────────────
  for (const iter of [1, 2]) {
    test(`S3' #${iter} 멀티패널 정지 버튼 원인 분리`, async () => {
      test.setTimeout(300_000)
      const { page, teardown } = await isolatedBoot({ slug: 'bf2int2' })
      try {
        await freshConversation(page, `S3'#${iter}`) // 단일 잔재 정리(전역 workspaceRoot는 유지)

        await page.getByRole('tab', { name: /멀티 에이전트/ }).click().catch(() => {})
        const panel0 = page.locator('.ma-panel[data-slot="0"]')
        const p0 = await panel0
          .waitFor({ state: 'visible', timeout: 15_000 })
          .then(() => true)
          .catch(() => false)
        if (!p0) {
          log(`S3'#${iter} 패널0 미등장 — 멀티 진입 실패. 무효.`)
          expect(true).toBe(true)
          return
        }
        // 새 작업(멀티 새 대화)
        await page.getByRole('button', { name: '새 대화' }).click().catch(() => {})
        await page.waitForTimeout(500)
        const emptyVisible = await page
          .locator('.ma-panel[data-slot="0"] .ma-p-empty')
          .isVisible()
          .catch(() => false)
        log(`S3'#${iter} 멀티 진입 + 새 작업 — 패널0 empty=${emptyVisible}`)

        const pInput = panel0.locator(INPUT)
        const ready = await pInput
          .waitFor({ state: 'visible', timeout: 10_000 })
          .then(() => true)
          .catch(() => false)
        const disabled = await pInput.isDisabled().catch(() => true)
        log(`S3'#${iter} 패널0 입력 준비=${ready} disabled=${disabled}`)
        if (!ready || disabled) {
          log(`S3'#${iter} 패널0 입력 비활성(workspaceRoot 미상속?) — 전송경로 문제. 무효.`)
          expect(true).toBe(true)
          return
        }

        const P_THREAD = '.ma-panel[data-slot="0"] .ma-p-thread'
        const P_STOP = '.ma-panel[data-slot="0"] button[aria-label="중단"]'
        const P_SEND = '.ma-panel[data-slot="0"] button[aria-label="전송"]'
        const P_STATUS = '.ma-panel[data-slot="0"] .ma-status'

        await pInput.click()
        await pInput.fill(COUNT_PROMPT)
        await pInput.press('Enter')
        log(`S3'#${iter} 패널0 전송: "${COUNT_PROMPT}"`)

        // 1s 폴링 30s: 스레드 성장(런 실행?) + stop 버튼 존재·disabled·클래스 + 상태 배지
        let stopEverPresent = false
        let stopEverEnabled = false
        let threadEverGrew = false
        const t0Text = await textLen(page, P_THREAD)
        let stopFirstClickableAt = -1
        for (let sec = 0; sec < 30; sec++) {
          const tlen = await textLen(page, P_THREAD)
          const stopN = await count(page, P_STOP)
          let stopDisabled: boolean | null = null
          let stopClass: string | null = null
          if (stopN > 0) {
            stopEverPresent = true
            stopDisabled = await page.locator(P_STOP).first().isDisabled().catch(() => null)
            stopClass = await page.locator(P_STOP).first().getAttribute('class').catch(() => null)
            if (stopDisabled === false) {
              stopEverEnabled = true
              if (stopFirstClickableAt < 0) stopFirstClickableAt = sec
            }
          }
          const statusText = await page.locator(P_STATUS).first().innerText({ timeout: 1_000 }).catch(() => '(없음)')
          if (tlen > t0Text + 2) threadEverGrew = true
          if (sec % 3 === 0 || (stopN > 0 && stopFirstClickableAt === sec)) {
            log(
              `S3'#${iter} +${sec}s thread=${tlen} stopN=${stopN} stopDisabled=${stopDisabled} status="${statusText}" stopClass="${stopClass}"`,
            )
          }
          // stop이 클릭 가능해지면 즉시 클릭해 정지 측정하고 폴링 종료
          if (stopN > 0 && stopDisabled === false) {
            log(`S3'#${iter} stop 클릭가능 @ +${sec}s — 클릭 시도`)
            const t0 = Date.now()
            await page.locator(P_STOP).first().click({ timeout: 3_000 }).catch((e) => log('  패널 stop 클릭실패', String(e).split('\n')[0]))
            let goneAt = -1
            for (let s = 0; s <= 20; s++) {
              if ((await count(page, P_STOP)) === 0) {
                goneAt = s
                break
              }
              await page.waitForTimeout(1_000)
            }
            log(`S3'#${iter} 패널 정지 반영: stop소멸=${goneAt}s (${elapsed(t0)})`)
            break
          }
          await page.waitForTimeout(1_000)
        }

        // 판정: 바인딩 결함 vs 런 미시작
        let verdict: string
        if (threadEverGrew && !stopEverPresent) {
          verdict = 'BINDING결함 — 스레드는 자라는데 stop 버튼이 아예 없음(isRunning 바인딩 누락). renderer'
        } else if (threadEverGrew && stopEverPresent && !stopEverEnabled) {
          verdict = 'BINDING결함 — stop 버튼 있으나 계속 disabled(활성 바인딩 누락). renderer'
        } else if (!threadEverGrew && !stopEverPresent) {
          verdict = '런 미시작 — 스레드도 안 자라고 stop도 없음(전송 경로 문제). main/agent 또는 renderer 전송'
        } else {
          verdict = `정상계열 — stopPresent=${stopEverPresent} stopEnabled=${stopEverEnabled} threadGrew=${threadEverGrew}`
        }
        log(`S3'#${iter} ★판정: ${verdict} | stopFirstClickableAt=${stopFirstClickableAt}s`)

        if (verdict.startsWith('BINDING') || verdict.startsWith('런 미시작')) {
          const shot = join(SHOT_DIR, `s3-iter${iter}-defect.png`)
          await page.screenshot({ path: shot }).catch(() => {})
          log(`S3'#${iter} 스크린샷=${shot}`)
        }

        // 맥락 회상: 같은 패널 재전송
        const beforeLen = await textLen(page, P_THREAD)
        await page.locator(P_SEND).waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {})
        await pInput.click().catch(() => {})
        await pInput.fill('방금 내가 뭘 세달라고 했지? 한 문장으로만.')
        await pInput.press('Enter')
        let recall = false
        for (let i = 0; i < 60 && !recall; i++) {
          await page.waitForTimeout(1_000)
          if ((await textLen(page, P_THREAD)) > beforeLen + 2) recall = true
        }
        const tail = await panel0.innerText({ timeout: 2_000 }).then((t) => t.slice(-200)).catch(() => '(읽기실패)')
        log(`S3'#${iter} 맥락회상 응답=${recall} tail(-200)=${JSON.stringify(tail)}`)
        expect(true).toBe(true)
      } finally {
        await teardown()
      }
    })
  }
})
