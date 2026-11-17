// M07 G8 실제 경로 프로브 (opt-in: G8MERGECARD=1, 출력 폴더 G8_OUT).
// 실제 엔진과 실제 GitHub를 쓴다. 병합 버튼은 누르지 않는다 — 카드 읽기와 에이전트 거부만 본다.
//   A) Git 창에서 PR 번호(G8_PR)를 불러오면 카드의 머리 SHA·필수 검사가 GitHub 값과 같다.
//   B) 앱 세션의 에이전트가 `gh pr merge`를 부르면 잠금 노드 merge-deny가 거부한다.
//      작업 폴더는 origin만 이 저장소로 둔 임시 git 폴더라 저장소 설정(.claude/settings.json)의 deny는 걸리지 않는다.
//      없는 PR 번호(999999)를 써서, 거부가 새더라도 아무것도 병합되지 않는다.
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { passBootGates, openWorkspace } from './helpers/bootGates'

const RUN = process.env.G8MERGECARD === '1'
const PR = process.env.G8_PR ?? '74'
const OUT = process.env.G8_OUT ?? join(tmpdir(), 'agentdeck-g8-out')
const REPO = 'bass131/AgentDeck'

let app: ElectronApplication
let page: Page
let workspace: string
let userDataDir: string

test.describe('M07 G8 병합 카드 실제 경로 (opt-in: G8MERGECARD=1)', () => {
  test.skip(!RUN, 'G8 실제 경로 — G8MERGECARD=1로 명시 실행')

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    workspace = mkdtempSync(join(tmpdir(), 'agentdeck-g8-ws-'))
    writeFileSync(join(workspace, 'README.md'), 'g8 probe\n')
    execFileSync('git', ['init', '-q'], { cwd: workspace })
    execFileSync('git', ['remote', 'add', 'origin', `https://github.com/${REPO}.git`], { cwd: workspace })
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-g8-udd-'))
    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
      env: { ...process.env, AGENTDECK_E2E_WORKSPACE: workspace }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    // 창은 2번 모니터로 옮긴다(사용자 작업 화면을 가리지 않게). 디스플레이가 하나면 그대로 둔다.
    await app.evaluate(({ BrowserWindow, screen }) => {
      const primary = screen.getPrimaryDisplay()
      const other = screen.getAllDisplays().find((d) => d.id !== primary.id)
      const win = BrowserWindow.getAllWindows()[0]
      if (other && win) win.setBounds({ x: other.workArea.x + 40, y: other.workArea.y + 40, width: 1400, height: 900 })
    })
    await passBootGates(page, { nickname: 'g8-probe' })
    await openWorkspace(page, { waitForTree: true })
  })

  test.afterAll(async () => {
    await app?.close()
    if (workspace) rmSync(workspace, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('A) Git 창에서 PR을 불러오면 머리 SHA와 필수 검사가 GitHub 값과 같다', async () => {
    test.setTimeout(90_000)
    const gh = JSON.parse(execFileSync('gh', ['api', `repos/${REPO}/pulls/${PR}`], { encoding: 'utf8' })) as { head: { sha: string } }
    await page.getByLabel('Git').first().click()
    await expect(page.locator('.gitm-overlay')).toBeVisible()
    await page.getByLabel('PR 번호').fill(PR)
    await page.getByRole('button', { name: '불러오기' }).click()
    const card = page.locator('[data-testid="pr-card"]').first()
    await card.locator('.prc-sha').waitFor({ state: 'visible', timeout: 60_000 })
    const shownSha = await card.locator('.prc-sha').getAttribute('title')
    const checks = await card.locator('.prc-check').allInnerTexts()
    const mergeBtn = card.getByRole('button', { name: '병합', exact: true })
    const enabled = await mergeBtn.isEnabled().catch(() => false)
    writeFileSync(join(OUT, 'a-card.json'), JSON.stringify({ pr: PR, githubHeadSha: gh.head.sha, shownSha, checks, mergeEnabled: enabled, text: await card.innerText() }, null, 2))
    await page.locator('.gitm-modal').screenshot({ path: join(OUT, 'a-card.png') })
    expect(shownSha).toBe(gh.head.sha)
    expect(checks.join('\n')).toContain('hard-gates')
    await page.keyboard.press('Escape')
  })

  test('B) 앱 세션의 gh pr merge는 잠금 노드가 거부한다', async () => {
    test.setTimeout(300_000)
    if (await page.locator('.gitm-overlay').isVisible().catch(() => false)) await page.locator('.gitm-overlay [aria-label="닫기"]').first().click()
    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      `Call the Bash tool exactly once with this exact command: gh pr merge 999999 --repo ${REPO} ` +
        '— then reply with the tool result text verbatim and end your turn. Do not retry or use any other command.'
    )
    await input.press('Enter')
    const deadline = Date.now() + 240_000
    let text = ''
    while (Date.now() < deadline) {
      text = await page.locator('.pane.chat').innerText()
      const running = await page.getByLabel('실행 중단').isVisible().catch(() => false)
      if (!running && text.includes('999999') && Date.now() > deadline - 230_000) break
      await page.waitForTimeout(2000)
    }
    writeFileSync(join(OUT, 'b-thread.txt'), text)
    await page.screenshot({ path: join(OUT, 'b-thread.png') })
    expect(text).toMatch(/「병합」 버튼/)
  })
})
