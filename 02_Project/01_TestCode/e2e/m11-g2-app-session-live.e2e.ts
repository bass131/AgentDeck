// M11 G2 실앱 확인 (opt-in: M11G2LIVE=1, 출력 폴더 M11G2_OUT). 실제 엔진을 짧게 쓴다(Haiku 5.5, 한 단어 답).
//   A) 상태 줄 가지 칸이 작업 폴더의 실제 가지를 보인다 — 폴더는 main이 아닌 가지의 임시 git 저장소다(M06 Backlog 3).
//   B) 도구를 여러 번 부르는 턴 뒤에도 컨텍스트 계기가 창을 넘지 않는다(M06 Backlog 2·26). 자동 압축 상태를 보인다(27).
//   C) 두 대화가 권한 모드를 따로 기억한다 — 오가도 각자의 모드로 돌아온다(M06 Backlog 1).
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

const RUN = process.env.M11G2LIVE === '1'
const OUT = process.env.M11G2_OUT ?? join(tmpdir(), 'agentdeck-m11-g2-out')
const BRANCH = 'feat/m11-g2-probe'

let app: ElectronApplication
let page: Page
let workspace: string
let userDataDir: string
const report: Record<string, unknown> = {}

async function pick(caption: string, option: string): Promise<void> {
  const chat = page.locator('.pane.chat')
  await chat.locator('.pick-btn', { has: page.locator('.pick-lbl', { hasText: caption }) }).first().click()
  await chat.locator('.po-main', { hasText: option }).first().click()
  await page.waitForTimeout(300)
}

async function pickValue(caption: string): Promise<string> {
  return (await page.locator('.pane.chat .pick-btn', { has: page.locator('.pick-lbl', { hasText: caption }) }).first().locator('.pick-val').innerText()).trim()
}

async function send(text: string): Promise<void> {
  const input = page.locator('.pane.chat').getByLabel('메시지 입력')
  await input.click()
  await input.fill(text)
  await input.press('Enter')
  await page.waitForTimeout(1500)
  await settleTurn(page, { timeoutMs: 180_000 })
}

async function contextChip(): Promise<{ pct: string; detail: string; autoCompact: string | null }> {
  const chip = page.locator('.ctx-strip .ctx-chip').first()
  return {
    pct: (await chip.locator('.cc-pct').innerText()).trim(),
    detail: (await chip.locator('.cc-detail').first().innerText()).trim(),
    autoCompact: await chip.locator('[data-auto-compact]').innerText().catch(() => null),
  }
}

function tokens(s: string): number {
  const m = /^([\d.]+)([KM]?)$/.exec(s.trim())
  if (!m) return NaN
  return Number(m[1]) * (m[2] === 'M' ? 1_000_000 : m[2] === 'K' ? 1000 : 1)
}

test.describe('M11 G2 실앱 확인 (opt-in: M11G2LIVE=1)', () => {
  test.skip(!RUN, 'M11 G2 실앱 — M11G2LIVE=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-m11g2-ws-'))
    writeFileSync(join(workspace, 'README.md'), 'm11 g2 probe\n')
    execFileSync('git', ['init', '-q', '-b', BRANCH], { cwd: workspace })
    execFileSync('git', ['add', '.'], { cwd: workspace })
    execFileSync('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', 'commit', '-q', '-m', 'init'], { cwd: workspace })
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m11g2-udd-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' },
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // 창은 2번 모니터로 옮긴다(사용자 작업 화면을 가리지 않게). 디스플레이가 하나면 그대로 둔다.
    report.display = await app.evaluate(({ BrowserWindow, screen }) => {
      const primary = screen.getPrimaryDisplay()
      const other = screen.getAllDisplays().find((d) => d.id !== primary.id)
      const win = BrowserWindow.getAllWindows()[0]
      if (other && win) win.setBounds({ x: other.workArea.x + 40, y: other.workArea.y + 40, width: 1400, height: 900 })
      return other ? 'secondary' : 'primary-only'
    })
    await passBootGates(page, { nickname: 'm11-g2' })
    await openWorkspace(page, { waitForTree: true })
  })

  test.afterAll(async () => {
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('A) 상태 줄 가지 칸은 실제 가지다', async () => {
    const cell = page.locator('.statusbar [data-status-branch]')
    await expect(cell).toHaveText(BRANCH, { timeout: 10_000 })
    report.branchCell = await cell.innerText()
    await page.locator('.statusbar').screenshot({ path: join(OUT, 'a-statusbar.png') })
  })

  test('B) 여러 도구 턴 뒤 계기는 창 안이고 자동 압축 상태가 보인다', async () => {
    test.setTimeout(240_000)
    await pick('모델', 'Haiku 5.5')
    await pick('모드', 'Bypass')
    await send('Run these bash commands one at a time as separate tool calls: `echo one`, then `echo two`, then `echo three`, then `echo four`. Then reply with only the word done.')
    await page.waitForTimeout(2500)
    const chip = await contextChip()
    report.gaugeAfterTools = chip
    await page.locator('.ctx-strip').screenshot({ path: join(OUT, 'b-gauge.png') })
    await page.screenshot({ path: join(OUT, 'b-conversation-a.png') })
    const [used, win] = chip.detail.replace(' 토큰', '').split(' / ')
    expect(tokens(used)).toBeGreaterThan(0)
    expect(tokens(used)).toBeLessThanOrEqual(tokens(win))
    expect(tokens(win)).toBeLessThanOrEqual(1_000_000)
    expect(Number(chip.pct.replace('%', ''))).toBeLessThanOrEqual(100)
    expect(chip.autoCompact ?? '').toMatch(/^자동 압축/)
  })

  test('C) 두 대화가 권한 모드를 따로 기억한다', async () => {
    test.setTimeout(240_000)
    const titleA = (await page.locator('.sb-item.active, .sb-item[aria-current="true"]').first().innerText().catch(() => '')).split('\n')[0]
    await page.getByRole('button', { name: '새 대화' }).click()
    await page.waitForTimeout(800)
    await pick('모델', 'Haiku 5.5')
    await pick('모드', '플랜')
    await send('Reply with only the word hi.')
    const modeB = await pickValue('모드')
    const items = page.locator('.sb-list .sb-item')
    report.sidebar = await items.allInnerTexts()
    const itemA = titleA ? page.locator('.sb-item', { hasText: titleA.slice(0, 12) }).first() : items.nth(1)
    await itemA.click()
    await page.waitForTimeout(1200)
    const modeA = await pickValue('모드')
    await page.screenshot({ path: join(OUT, 'c-conversation-a-mode.png') })
    await items.first().click()
    await page.waitForTimeout(1200)
    const modeBAgain = await pickValue('모드')
    await page.screenshot({ path: join(OUT, 'c-conversation-b-mode.png') })
    report.modes = { modeB, modeA, modeBAgain, titleA }
    expect(modeA).toBe('Bypass')
    expect(modeB).toBe('플랜')
    expect(modeBAgain).toBe('플랜')
  })
})
