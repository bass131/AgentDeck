import { test, expect } from '@playwright/test'
import type { Page, Locator } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot } from './helpers/isolatedBoot'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'

const RUN = process.env.LIVE_SDK === '1' && process.env.BF3SHOTS === '1'
const SHOT_DIR = join(process.cwd(), '01_Phases', '07_BF3-backlog-sweep', 'ScreenShot')

const TRIGGER_PROMPTS = [
  'test.txt 파일을 만들어줘',
  '워크스페이스에 test.txt 파일을 만들고 안에 hello를 써줘.',
]

const CHAT = '.pane.chat'
const INPUT = '[aria-label="메시지 입력"]'
const STOP = 'button[aria-label="실행 중단"]'
const CARD_WAIT_MS = 90_000

function log(...a: unknown[]): void {
  console.log('[BF3P06SHOTS]', ...a)
}

async function freshConversation(page: Page): Promise<void> {
  await page.getByRole('button', { name: '새 대화' }).click().catch(() => {})
  await page.waitForTimeout(300)
}

async function ensureReplOn(page: Page): Promise<void> {
  const toggle = page.locator(CHAT).getByRole('button', { name: 'REPL 지속세션 모드 토글' })
  if ((await toggle.getAttribute('aria-pressed').catch(() => null)) !== 'true') {
    await toggle.click().catch(() => {})
  }
}

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

async function switchThemeViaSettings(page: Page, target: 'light' | 'dark'): Promise<void> {
  const label = target === 'light' ? '라이트' : '다크'
  await page.getByRole('button', { name: '설정 열기' }).click()
  await page.getByRole('dialog', { name: '설정' }).waitFor({ state: 'visible', timeout: 5_000 })
  await page.getByRole('button', { name: '테마' }).click()
  await page.getByRole('button', { name: new RegExp(label) }).first().click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', target, { timeout: 5_000 })
  await page.getByRole('dialog', { name: '설정' }).getByRole('button', { name: '닫기' }).click()
  await page.getByRole('dialog', { name: '설정' }).waitFor({ state: 'hidden', timeout: 5_000 })
}

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
    const { page, teardown } = await isolatedBoot({ slug: 'bf3p06shots' })
    try {
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

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

      await page.screenshot({ path: join(SHOT_DIR, 'p06-card-dark.png'), fullPage: false })
      log('캡처: p06-card-dark.png')

      await switchThemeViaSettings(page, 'light')
      await expect(card).toBeVisible({ timeout: 5_000 })
      await card.scrollIntoViewIfNeeded().catch(() => {})
      await page.screenshot({ path: join(SHOT_DIR, 'p06-card-light.png'), fullPage: false })
      log('캡처: p06-card-light.png')

      await switchThemeViaSettings(page, 'dark')
      await expect(card).toBeVisible({ timeout: 5_000 })

      await card.scrollIntoViewIfNeeded().catch(() => {})
      await card.screenshot({ path: join(SHOT_DIR, 'p06-card-closeup-dark.png') })
      log('캡처: p06-card-closeup-dark.png')

      await card.locator(permChoiceSelector('deny')).click()
      await expect(page.locator(PERM_CARD)).toBeHidden({ timeout: 15_000 })
      await expect(page.locator(CHAT).locator(STOP)).toBeHidden({ timeout: 15_000 })
      log('단일챗: 거부 후 카드 소멸 + ■ 잔존 없음(정상 종료)')

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
      await teardown()
    }
  })
})
