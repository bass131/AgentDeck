// M11 G3 실앱 확인 (opt-in: M11G3LIVE=1, 출력 폴더 M11G3_OUT). 병합 버튼은 누르지 않는다 — 카드 읽기만 본다.
// 연습 저장소(bass131/AgentDeck_Test)의 `main`은 고전 보호 없이 룰셋(main-protect)으로만 지킨다.
// PR 카드가 그 base를 「보호가 없다」가 아니라 룰셋으로 읽는지 본다(M07-24·M09-11·M10-23).
// M11G3_TOKEN_FILE(연습 저장소 전용 fine-grained 토큰 파일)을 주면 앱 프로세스에만 GH_TOKEN으로 넣는다. 값은 출력하지 않는다.
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const RUN = process.env.M11G3LIVE === '1'
const OUT = process.env.M11G3_OUT ?? join(tmpdir(), 'agentdeck-m11-g3-out')
const PR = process.env.M11G3_PR ?? '6'
const REPO = 'bass131/AgentDeck_Test'
const PRACTICE_UDD = join(homedir(), '.agentdeck-practice', 'udd')
const TOKEN_FILE = process.env.M11G3_TOKEN_FILE ?? ''

let app: ElectronApplication
let page: Page
let workspace: string

test.describe('M11 G3 룰셋 base의 PR 카드 (opt-in: M11G3LIVE=1)', () => {
  test.skip(!RUN, 'M11 G3 실앱 — M11G3LIVE=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-m11g3-ws-'))
    writeFileSync(join(workspace, 'README.md'), 'm11 g3 probe\n')
    execFileSync('git', ['init', '-q'], { cwd: workspace })
    execFileSync('git', ['remote', 'add', 'origin', `https://github.com/${REPO}.git`], { cwd: workspace })
    const env: Record<string, string | undefined> = { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    if (TOKEN_FILE) {
      const token = readFileSync(TOKEN_FILE, 'utf8').trim()
      if (!/^github_pat_[A-Za-z0-9_]+$/.test(token)) throw new Error('M11G3_TOKEN_FILE에 fine-grained 토큰 한 줄이 아니다')
      delete env.GITHUB_TOKEN
      env.GH_TOKEN = token
    }
    delete env.ELECTRON_RUN_AS_NODE
    app = await electron.launch({
      args: [`--user-data-dir=${PRACTICE_UDD}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: env as Record<string, string>,
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await app.evaluate(({ BrowserWindow, screen }) => {
      const primary = screen.getPrimaryDisplay()
      const other = screen.getAllDisplays().find((d) => d.id !== primary.id)
      const win = BrowserWindow.getAllWindows()[0]
      if (other && win) win.setBounds({ x: other.workArea.x + 40, y: other.workArea.y + 40, width: 1400, height: 900 })
    })
    await passBootGates(page, { nickname: 'g3-probe' })
    // 연습 앱 데이터는 작업 모드와 연습 저장소 폴더로 열린다 — 채팅 모드로 옮긴 뒤, 폴더가 없을 때만 임시 폴더를 연다
    const chatTab = page.getByRole('tab', { name: '채팅' })
    if (await chatTab.isVisible().catch(() => false)) await chatTab.click({ force: true })
    await page.screenshot({ path: join(OUT, 'after-boot.png') })
    if (await page.getByRole('button', { name: '폴더 선택' }).isVisible().catch(() => false)) await openWorkspace(page, { waitForTree: true })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
  })

  test('룰셋으로만 지키는 main을 「보호가 없다」로 보이지 않는다', async () => {
    test.setTimeout(90_000)
    await page.getByLabel('Git').first().click()
    await expect(page.locator('.gitm-overlay')).toBeVisible()
    await page.getByLabel('PR 번호').fill(PR)
    await page.getByRole('button', { name: '불러오기' }).click()
    const card = page.locator('[data-testid="pr-card"]').first()
    await card.locator('.prc-sha').waitFor({ state: 'visible', timeout: 60_000 })
    const text = await card.innerText()
    writeFileSync(join(OUT, 'ruleset-card.json'), JSON.stringify({ repo: REPO, pr: PR, tokenFromFile: TOKEN_FILE !== '', text }, null, 2))
    await page.locator('.gitm-modal').screenshot({ path: join(OUT, 'ruleset-card.png') })
    expect(text).not.toMatch(/보호가 없/)
    expect(text).toMatch(/룰셋에 필수 검사가 없|필수 검사/)
  })
})
