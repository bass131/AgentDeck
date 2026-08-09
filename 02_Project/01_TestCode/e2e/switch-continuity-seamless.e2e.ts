import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const LIVE = process.env.LIVE_SDK === '1'

const RUNNING_SEL = '.composer .stop, [aria-label="실행 중단"]'

async function launchSingleChat(userDataDir: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_PICK_FOLDER: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const nick = page.locator('#nickname')
  if (await nick.isVisible().catch(() => false)) {
    await nick.fill('switch-probe')
    await page.getByRole('button', { name: '입장하기' }).click().catch(() => {})
    await page.locator('.login-body button.submit').click().catch(() => {})
  }
  try { const skip = page.locator('.eg-auth-dialog .sd-go'); if (await skip.isVisible().catch(() => false)) await skip.click() } catch { }
  await page.waitForSelector('.titlebar', { timeout: 30_000 })
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) }
  await expect(page.locator('.pane.chat')).toBeVisible({ timeout: 15_000 })
  const pickFolder = page.getByRole('button', { name: '폴더 선택' })
  if (await pickFolder.isVisible().catch(() => false)) { await pickFolder.click(); await page.waitForTimeout(1000) }
  return { app, page }
}

async function isRunningVisible(page: Page): Promise<boolean> {
  return page.locator(RUNNING_SEL).first().isVisible().catch(() => false)
}

async function waitChatIdle(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  await page.waitForTimeout(1000)
  while (Date.now() < deadline) {
    if (!(await isRunningVisible(page))) { await page.waitForTimeout(500); return }
    await page.waitForTimeout(1000)
  }
}

function parseMaxCount(text: string): number {
  const lineLead = [...text.matchAll(/(?:^|\n)\s*(\d{1,3})\s*[.:)]/g)].map((m) => Number(m[1]))
  if (lineLead.length > 0) return Math.max(...lineLead)
  const cleaned = text.replace(/\d{1,3}\s*부터/g, '').replace(/\d{1,3}\s*까지/g, '')
  const all = [...cleaned.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]))
  return all.length > 0 ? Math.max(...all) : -1
}

async function readMaxCount(page: Page): Promise<{ max: number; raw: string }> {
  const nodes = page.locator('.pane.chat .msg.ai-msg .content')
  const n = await nodes.count()
  if (n === 0) return { max: -1, raw: '' }
  const texts = await nodes.allInnerTexts()
  const raw = texts.join('\n---\n')
  return { max: parseMaxCount(raw), raw }
}

async function waitForMaxCountAtLeast(page: Page, min: number, timeoutMs: number): Promise<{ max: number; raw: string }> {
  const deadline = Date.now() + timeoutMs
  let last = { max: -1, raw: '' }
  while (Date.now() < deadline) {
    last = await readMaxCount(page)
    if (last.max >= min) return last
    await page.waitForTimeout(1000)
  }
  return last
}

const COUNT_MESSAGE = '1부터 40까지 아주 천천히, 각 숫자마다 짧은 한마디를 붙여 한 줄씩 세어줘.'
const TITLE_PREFIX_A = '1부터 40까지'

test.describe('전환-연속성: "새 대화" 제스처 seamless 확정 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('A 실행중 → "새 대화" 클릭 → ~10초 대기 → 사이드바에서 A 복귀: 진행 이어짐 여부', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'switch-new-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'switch-new-ws-'))

    const { app, page } = await launchSingleChat(userDataDir, workspace)

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(COUNT_MESSAGE)
    await input.press('Enter')

    const before = await waitForMaxCountAtLeast(page, 3, 90_000)
    const runningAtSwitch = await isRunningVisible(page)
    console.log('[SWITCH-NEW] beforeSwitch 최대 카운트:', before.max, '| 스트리밍중:', runningAtSwitch)
    console.log('[SWITCH-NEW] beforeSwitch 원문(일부):', before.raw.slice(0, 200))

    const sidebarItemA = page.locator('.sb-item').filter({ hasText: TITLE_PREFIX_A })
    const aInSidebarBefore = await sidebarItemA.first().isVisible().catch(() => false)
    console.log('[SWITCH-NEW] 전환 전 A가 사이드바에 표시됨:', aInSidebarBefore)

    const newBtn = page.getByRole('button', { name: '새 대화' })
    const newBtnDisabledAtClick = await newBtn.isDisabled().catch(() => false)
    console.log('[SWITCH-NEW] "새 대화" 버튼 disabled(실행중임에도):', newBtnDisabledAtClick)
    await newBtn.click()
    await page.waitForTimeout(500)

    const emptyAtCreate = await page.locator('.pane.chat .msg').count()
    console.log('[SWITCH-NEW] "새 대화" 직후 메시지 수(0이어야 빈 화면):', emptyAtCreate)

    await page.waitForTimeout(10_000)

    const emptyAfterWait = await page.locator('.pane.chat .msg').count()
    console.log('[SWITCH-NEW] 10초 대기 후 메시지 수(여전히 0이어야 교차오염 없음):', emptyAfterWait)

    await sidebarItemA.first().click()
    await page.waitForTimeout(1500)

    const after = await readMaxCount(page)
    const runningAfterReturn = await isRunningVisible(page)
    console.log('[SWITCH-NEW] afterReturn 최대 카운트:', after.max, '| 복귀 직후 스트리밍중:', runningAfterReturn)
    console.log('[SWITCH-NEW] afterReturn 원문(일부):', after.raw.slice(0, 200))

    await waitChatIdle(page, 90_000)
    await page.waitForTimeout(8_000)
    const final = await readMaxCount(page)
    const runningAtFinal = await isRunningVisible(page)
    console.log('[SWITCH-NEW] finalMax 최대 카운트:', final.max, '| 최종 스트리밍중:', runningAtFinal)
    console.log('[SWITCH-NEW] finalMax 원문(일부):', final.raw.slice(0, 200))

    await app.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { }

    expect(emptyAtCreate, '"새 대화" 클릭 직후 빈 화면(메시지 0개)').toBe(0)
    expect(emptyAfterWait, '10초 대기 후에도 빈 새 대화에 A 카운트 유입 없음').toBe(0)

    const seamless = after.max > before.max || final.max >= 35
    expect(
      seamless,
      `PRIMARY: "새 대화" 전환 중 A 진행이 끊기지 않아야 함 — beforeSwitch=${before.max}, afterReturn=${after.max}, ` +
      `finalMax=${final.max}, 전환직전스트리밍=${runningAtSwitch}, 복귀직후스트리밍=${runningAfterReturn}, ` +
      `새대화버튼disabled=${newBtnDisabledAtClick}`,
    ).toBe(true)
  })
})

const SEED_B_MESSAGE = '이건 두 번째 실험용 대화야. 정확히 "네, B 대화입니다."라고만 짧게 답해줘. 다른 말은 붙이지 마.'
const TITLE_PREFIX_B = '이건 두 번째 실험용'

test.describe('전환-연속성: 사이드바 "기존 대화" 스위치(P3b) 대조군 PROBE (LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK — LIVE_SDK=1')

  test('A 실행중 → 기존 대화 B 클릭 → A 복귀: P3b 스냅샷으로 seamless 기대', async () => {
    test.setTimeout(360_000)
    const userDataDir = mkdtempSync(join(tmpdir(), 'switch-sidebar-udata-'))
    const workspace = mkdtempSync(join(tmpdir(), 'switch-sidebar-ws-'))

    const { app, page } = await launchSingleChat(userDataDir, workspace)

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(SEED_B_MESSAGE)
    await input.press('Enter')
    await waitChatIdle(page, 90_000)
    await page.waitForTimeout(1500)

    await page.getByRole('button', { name: '새 대화' }).click()
    await page.waitForTimeout(500)
    await input.click()
    await input.fill(COUNT_MESSAGE)
    await input.press('Enter')

    const before = await waitForMaxCountAtLeast(page, 3, 90_000)
    const runningAtSwitch = await isRunningVisible(page)
    console.log('[SWITCH-SIDEBAR] beforeSwitch 최대 카운트:', before.max, '| 스트리밍중:', runningAtSwitch)

    const sidebarItemB = page.locator('.sb-item').filter({ hasText: TITLE_PREFIX_B })
    await sidebarItemB.first().click()
    await page.waitForTimeout(1000)
    const onB = await page.locator('.pane.chat').innerText().catch(() => '')
    console.log('[SWITCH-SIDEBAR] B로 전환 확인(B 답변 포함 여부):', onB.includes('B 대화입니다'))

    await page.waitForTimeout(10_000)

    const sidebarItemA = page.locator('.sb-item').filter({ hasText: TITLE_PREFIX_A })
    await sidebarItemA.first().click()
    await page.waitForTimeout(1500)

    const after = await readMaxCount(page)
    console.log('[SWITCH-SIDEBAR] afterReturn 최대 카운트:', after.max)

    await waitChatIdle(page, 90_000)
    await page.waitForTimeout(8_000)
    const final = await readMaxCount(page)
    console.log('[SWITCH-SIDEBAR] finalMax 최대 카운트:', final.max)

    await app.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { }
    try { rmSync(workspace, { recursive: true, force: true }) } catch { }

    const seamless = after.max > before.max || final.max >= 35
    expect(
      seamless,
      `대조군(P3b selectConversation): beforeSwitch=${before.max}, afterReturn=${after.max}, finalMax=${final.max}`,
    ).toBe(true)
  })
})
