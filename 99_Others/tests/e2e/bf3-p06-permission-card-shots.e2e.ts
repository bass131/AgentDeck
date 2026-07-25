/**
 * bf3-p06-permission-card-shots.e2e.ts — BF3 Phase 06 권한 인라인 카드(PermissionCard,
 * ADR-030) 육안 검토용 라이트/다크 스크린샷 캡처 (opt-in 라이브: LIVE_SDK=1 + BF3SHOTS=1).
 *
 * 목적: Phase 06 완료조건 "라이트/다크 양 테마 스크린샷 산출(ScreenShot/ — 단일챗 + 멀티패널)
 * → 영호 육안 승인 후 커밋"을 위한 산출물 생성 스펙. 이 파일 자체는 기계 판정(pass/fail)이
 * 아니라 *육안 게이트용 자료 수집*이 목적이라 단언은 최소(카드 등장·정상 종료 1개씩)로 두고,
 * 나머지는 캡처 실패 시 즉시 드러나도록 각 단계에 짧은 타임아웃을 건다.
 *
 * 패턴 계승:
 *  - isolatedBoot(BF2-mini P2 표준 헬퍼) — 청정 userData(사이드바 잔재 0)로 스크린샷 오염 방지.
 *    isolatedBoot 자체가 "온보딩→engine-gate→titlebar→WhatsNew→단일탭→워크스페이스 오픈"까지
 *    처리하므로 "테스트 프로젝트 폴더 열기"는 이 헬퍼가 이미 완료한 상태에서 테스트가 시작된다.
 *  - lr3-p04-wakeup-banner.e2e.ts — 라이브 probe + page.screenshot 저장(ScreenShot/) 패턴.
 *  - bf2-interrupt-probe2.e2e.ts S2' — 권한 카드 강제 유발(모드='일반' + 부수효과 도구 지시)
 *    · 프롬프트 후보 순회(카드 미등장 시 새 대화로 재시도) 관례.
 *  - helpers/permSelectors.ts — PERM_CARD/permChoiceSelector 계약(renderer PermissionCard.tsx가
 *    SoT). 옛 PermissionModal(.perm-modal, role=dialog 풀오버레이)은 ADR-030으로 폐기됨.
 *
 * 권한 카드 유발 이유(모드='일반' 필요): 기본 모드 'auto'는 도구 실행까지 자동 진행이라
 * 카드가 뜨지 않는다(probe2가 규명). 'normal'(라벨 '일반')은 "변경마다 승인 요청"이라 Write
 * 도구 호출 시 카드가 뜬다.
 *
 * 실행(메인 세션):
 *   LIVE_SDK=1 BF3SHOTS=1 npx playwright test 99.Others/tests/e2e/bf3-p06-permission-card-shots.e2e.ts
 *
 * 산출물: 01.Phases/BF3-backlog-sweep/ScreenShot/
 *   - p06-card-dark.png        (전체 창 — 다크, 기본)
 *   - p06-card-light.png       (전체 창 — 라이트, 설정 모달 경유 전환)
 *   - p06-card-closeup-dark.png(카드 요소 근접샷 — 3버튼+숫자배지 확인용, 다크 원복 후)
 *   - p06-card-panel-dark.png  (스트레치, 멀티패널 — 하네스가 여의치 않으면 로그로 사유만
 *     남기고 생략. 그 경우 육안 검토는 단일챗 샷 + renderer 단위테스트[m4-4-permission 등]로
 *     갈음 — Phase 06 문서 "스트레치" 명시 허용 범위)
 */
import { test, expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'

const RUN = process.env.LIVE_SDK === '1' && process.env.BF3SHOTS === '1'
const SHOT_DIR = join(process.cwd(), '01.Phases', 'BF3-backlog-sweep', 'ScreenShot')

// 부수효과 도구(Write)를 유발하는 지시 후보 — 1순위가 카드를 안 띄우면(모델 판단 편차) 2순위로
// 재시도한다(probe2 S2' 관례). 매 시도 전 새 대화로 리셋해 이전 시도의 세션 오염을 막는다.
const TRIGGER_PROMPTS = [
  'test.txt 파일을 만들어줘',
  '워크스페이스에 test.txt 파일을 만들고 안에 hello를 써줘.',
]

const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const CARD_WAIT_MS = 90_000 // 프롬프트 1개당 카드 대기 상한(장시간 대기 억제 관례)

function log(...a: unknown[]): void {
  console.log('[BF3P06SHOTS]', ...a)
}

/** 새 대화(단일) — thread·isRunning·pendingPermission 리셋. */
async function freshConversation(page: Page): Promise<void> {
  await page.getByRole('button', { name: '새 대화' }).click().catch(() => {})
  await page.waitForTimeout(300)
}

/** REPL 지속세션 모드 강제 ON(probe2/lr3-p04 관례 — 권한 카드 유발 안정성). */
async function ensureReplOn(page: Page): Promise<void> {
  const toggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  if ((await toggle.getAttribute('aria-pressed').catch(() => null)) !== 'true') {
    await toggle.click().catch(() => {})
  }
}

/** 단일챗 모드 피커를 '일반'(변경마다 승인)으로 전환 — 기본 'auto'는 카드를 안 띄운다. */
async function setModeNormal(page: Page): Promise<boolean> {
  const btn = page.locator(CHAT).getByRole('button', { name: '모드 선택' })
  if (!(await btn.isVisible().catch(() => false))) return false
  await btn.click().catch(() => {})
  await page.waitForTimeout(200)
  const opt = page.getByRole('option', { name: /일반/ })
  if (!(await opt.first().isVisible().catch(() => false))) return false
  await opt.first().click().catch(() => {})
  return true
}

/** 설정 모달 경유 테마 전환(SettingsModal AppearanceView — F7). 모달을 닫고 반환. */
async function switchThemeViaSettings(page: Page, target: 'light' | 'dark'): Promise<void> {
  const label = target === 'light' ? '라이트' : '다크'
  await page.getByRole('button', { name: '설정 열기' }).click()
  await page.getByRole('dialog', { name: '설정' }).waitFor({ state: 'visible', timeout: 5_000 })
  await page.getByRole('button', { name: '테마' }).click()
  await page.getByRole('button', { name: new RegExp(label) }).first().click()
  // data-theme 반영 확인 후 모달 닫기(닫기 버튼 — Escape는 포커스 상태에 따라 카드 keydown과
  // 얽힐 여지가 있어 명시적 버튼 클릭으로 결정론 확보).
  await expect(page.locator('html')).toHaveAttribute('data-theme', target, { timeout: 5_000 })
  // '닫기'는 타이틀바 창닫기 버튼과 aria-label이 겹침 — 설정 다이얼로그로 스코프(strict mode)
  await page.getByRole('dialog', { name: '설정' }).getByRole('button', { name: '닫기' }).click()
  await page.getByRole('dialog', { name: '설정' }).waitFor({ state: 'hidden', timeout: 5_000 })
}

/**
 * 프롬프트 후보를 순회하며 권한 카드(cardSelector)를 유발한다. 카드가 뜨면 즉시 반환.
 * 어느 후보도 못 띄우면 false(호출부가 스킵 로그를 남기고 부드럽게 종료).
 */
async function triggerPermCard(
  page: Page,
  input: Locator,
  cardSelector: string,
  tag: string,
): Promise<boolean> {
  for (const prompt of TRIGGER_PROMPTS) {
    await input.click().catch(() => {})
    await input.fill(prompt)
    await input.press('Enter')
    log(`${tag} 전송(카드유도): "${prompt}"`)

    const appeared = await page
      .locator(cardSelector)
      .waitFor({ state: 'visible', timeout: CARD_WAIT_MS })
      .then(() => true)
      .catch(() => false)
    if (appeared) return true

    log(`${tag} 이 프롬프트는 ${CARD_WAIT_MS / 1000}s 내 카드 미등장 — 다음 후보 시도`)
    await freshConversation(page)
    await ensureReplOn(page)
    await setModeNormal(page)
  }
  return false
}

test.describe('BF3 P06: 권한 인라인 카드 육안 스크린샷 (LIVE_SDK=1 BF3SHOTS=1)', () => {
  test.skip(!RUN, '라이브 스크린샷 캡처 — LIVE_SDK=1 BF3SHOTS=1로 명시 실행')

  test('권한 카드 다크/라이트 전체창 + 근접샷 (+스트레치 멀티패널)', async () => {
    test.setTimeout(480_000)
    mkdirSync(SHOT_DIR, { recursive: true })
    // isolatedBoot가 이미 청정 userData + 온보딩 + 워크스페이스 오픈(테스트 프로젝트 폴더 열기)까지
    // 처리한 상태로 채팅 화면에 진입해 있다 — 별도 폴더 열기 단계 불필요.
    const { page, teardown } = await isolatedBoot({ slug: 'bf3p06shots' })
    try {
      // 부팅 직후는 dark 기본(theme.ts DEFAULT_THEME='dark') — 명시 확인.
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

      // ── 1) 단일챗: 카드 유도 ──────────────────────────────────────────────
      await freshConversation(page)
      await ensureReplOn(page)
      const modeSet = await setModeNormal(page)
      log(`단일챗 모드='일반' 전환=${modeSet}`)
      const input = page.locator(CHAT).locator(INPUT)

      const cardUp = await triggerPermCard(page, input, PERM_CARD, '단일챗')
      expect(cardUp, '권한 카드가 어느 후보 프롬프트로도 등장하지 않음 — 캡처 불가').toBe(true)
      log('단일챗 권한 카드(.perm-card) 등장')

      const card = page.locator(PERM_CARD)
      await card.scrollIntoViewIfNeeded().catch(() => {})

      // ── 2) 캡처 ① 다크(기본) 전체 창 ─────────────────────────────────────
      await page.screenshot({ path: join(SHOT_DIR, 'p06-card-dark.png'), fullPage: false })
      log('캡처: p06-card-dark.png')

      // ── 3) 테마 전환(라이트) → 캡처 ② → 다크로 원복 ─────────────────────
      await switchThemeViaSettings(page, 'light')
      await expect(card).toBeVisible({ timeout: 5_000 }) // 모달 열고닫기 동안 run 세션 무영향 확인
      await card.scrollIntoViewIfNeeded().catch(() => {})
      await page.screenshot({ path: join(SHOT_DIR, 'p06-card-light.png'), fullPage: false })
      log('캡처: p06-card-light.png')

      await switchThemeViaSettings(page, 'dark')
      await expect(card).toBeVisible({ timeout: 5_000 })

      // ── 4) 근접샷(다크 원복 후) — 3버튼 + 숫자 배지 프레임 확인용 ────────
      await card.scrollIntoViewIfNeeded().catch(() => {})
      await card.screenshot({ path: join(SHOT_DIR, 'p06-card-closeup-dark.png') })
      log('캡처: p06-card-closeup-dark.png')

      // ── 5) 거부(deny) → 정리 ─────────────────────────────────────────────
      await card.locator(permChoiceSelector('deny')).click()
      await expect(page.locator(PERM_CARD)).toBeHidden({ timeout: 15_000 })
      await expect(page.locator(CHAT).locator(STOP)).toBeHidden({ timeout: 15_000 })
      log('단일챗: 거부 후 카드 소멸 + ■ 잔존 없음(정상 종료)')

      // ── 6) 스트레치: 멀티패널 카드 캡처 ──────────────────────────────────
      // 하네스 복잡도 판단(사전 조사, plan 반영): 멀티패널 진입은 별도 탭 전환 + 패널0
      // workspaceRoot 상속 확인 + 패널 로컬 모드 피커까지 추가로 거쳐야 하고(probe2 S3'가
      // 이 경로에서 "패널 입력 비활성(workspaceRoot 미상속?)" 무효 케이스를 실측한 바 있음),
      // 카드 유도 자체도 재시도가 필요해 전체 소요가 단일챗의 2배 이상으로 늘어난다.
      // 완료조건은 "멀티패널 스크린샷"을 요구하지만 실패해도 하드 실패시키지 않는다 —
      // 이 시나리오가 여의치 않으면 육안 검토는 (a) 위 단일챗 3샷 + (b) renderer 단위 테스트
      // (멀티패널 권한 배선 격리·라우팅 정확성 — Phase 06 완료조건의 별도 항목)로 갈음한다는
      // 문서 명시 허용 범위(01.Phases/BF3-backlog-sweep/06-permission-inline-card.md 참조).
      await freshConversation(page)
      const multiTab = page.getByRole('tab', { name: /멀티 에이전트/ })
      const multiTabVisible = await multiTab.isVisible().catch(() => false)
      if (!multiTabVisible) {
        log('스트레치 스킵: 멀티 에이전트 탭 미노출 — 단일챗 3샷으로 육안 게이트 충족')
      } else {
        await multiTab.click().catch(() => {})
        const panel0 = page.locator('.ma-panel[data-slot="0"]')
        const panelUp = await panel0
          .waitFor({ state: 'visible', timeout: 15_000 })
          .then(() => true)
          .catch(() => false)
        if (!panelUp) {
          log('스트레치 스킵: 패널0 미등장(멀티 진입 실패) — 단일챗 3샷으로 육안 게이트 충족')
        } else {
          await page.getByRole('button', { name: '새 대화' }).click().catch(() => {})
          await page.waitForTimeout(500)
          const pInput = panel0.locator(INPUT)
          const ready = await pInput.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
          const disabled = ready ? await pInput.isDisabled().catch(() => true) : true
          if (!ready || disabled) {
            log(
              `스트레치 스킵: 패널0 입력 미준비(ready=${ready} disabled=${disabled}, workspaceRoot 미상속 추정) — 단일챗 3샷으로 육안 게이트 충족`,
            )
          } else {
            // 패널 로컬 모드 피커('실행 모드 선택')도 '일반'으로 — 없으면(구현 격차) 그냥 진행.
            const pModeBtn = panel0.getByRole('button', { name: '실행 모드 선택' })
            if (await pModeBtn.isVisible().catch(() => false)) {
              await pModeBtn.click().catch(() => {})
              await page.waitForTimeout(200)
              const pOpt = page.getByRole('option', { name: /일반/ })
              if (await pOpt.first().isVisible().catch(() => false)) await pOpt.first().click().catch(() => {})
            }
            const panelCardSel = '.ma-panel[data-slot="0"] .perm-card'
            const panelCardUp = await triggerPermCard(page, pInput, panelCardSel, '패널0')
            if (!panelCardUp) {
              log('스트레치 스킵: 패널0에서 카드 미유발(후보 소진) — 단일챗 3샷으로 육안 게이트 충족')
            } else {
              const panelCard = page.locator(panelCardSel)
              await panelCard.scrollIntoViewIfNeeded().catch(() => {})
              await page.screenshot({ path: join(SHOT_DIR, 'p06-card-panel-dark.png'), fullPage: false })
              log('캡처: p06-card-panel-dark.png')
              await panelCard.locator(permChoiceSelector('deny')).click().catch(() => {})
              await expect(page.locator(panelCardSel)).toBeHidden({ timeout: 15_000 }).catch(() => {})
              log('패널0: 거부 후 카드 소멸(정상 종료)')
            }
          }
        }
      }
    } finally {
      await teardown() // app.close → closeAll(전 세션 kill) + tmp userData·workspace 정리
    }
  })
})
