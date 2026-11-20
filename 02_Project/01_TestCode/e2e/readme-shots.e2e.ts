import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'
import { moveToSecondDisplay } from './helpers/isolatedBoot'

const LIVE = process.env.LIVE_SDK === '1'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')
const REPO_ROOT = process.cwd()

test.describe('README 실사용 스크린샷 촬영 (opt-in: LIVE_SDK=1)', () => {
  test.skip(!LIVE, '실 SDK 촬영 — LIVE_SDK=1로 명시 실행')

  let app: ElectronApplication
  let page: Page
  let tmpRoot: string
  let workspace: string
  let userDataDir: string

  async function pinWindow(): Promise<void> {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      if (w) {
        w.setBounds({ x: 0, y: 0, width: 2560, height: 1392 })
        w.webContents.setZoomFactor(1.0)
      }
    })
    await page.waitForTimeout(800)
  }

  async function waitForSubagentApproving(timeoutMs = 240_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const perm = page.locator(PERM_CARD)
      if (await perm.isVisible().catch(() => false)) {
        await perm.locator(permChoiceSelector('allow_always')).click().catch(() => {})
        await page.waitForTimeout(500)
        continue
      }
      if (await page.locator('.subagent').first().isVisible().catch(() => false)) return true
      await page.waitForTimeout(1000)
    }
    return false
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    tmpRoot = mkdtempSync(join(tmpdir(), 'agentdeck-shots-'))
    workspace = join(tmpRoot, 'AgentDeck')
    const EXCLUDE = new Set(['node_modules', 'out', 'dist', 'release', 'test-results', 'artifacts'])
    cpSync(REPO_ROOT, workspace, {
      recursive: true,
      filter: (src) => !src.split(/[\\/]/).some((seg) => EXCLUDE.has(seg))
    })
    userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-shots-udata-'))
    mkdirSync(SHOT_DIR, { recursive: true })

    app = await electron.launch({
      args: [`--user-data-dir=${userDataDir}`, join(REPO_ROOT, 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        AGENTDECK_E2E_WORKSPACE: workspace,
        AGENTDECK_E2E_PICK_FOLDER: workspace,
        AGENTDECK_E2E_NO_ENGINE_UPDATE: '1'
      }
    })
    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await moveToSecondDisplay(app)

    await passBootGates(page, { nickname: '영호' })
    await openWorkspace(page)
    await pinWindow()
  })

  test.afterAll(async () => {
    await app?.close()
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true })
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
  })

  test('컷① ②: 히어로 — 서브에이전트 2 병렬 + 할일 + 변경파일', async () => {
    test.setTimeout(480_000)

    const input = page.getByLabel('메시지 입력')
    await input.click()
    await input.fill(
      'AgentDeck 코드베이스 구조를 파악해줘. TaskCreate로 할 일 목록을 만들어 관리하면서 진행하고, ' +
      'Task 도구로 general-purpose 서브에이전트 2개를 병렬로 띄워줘 — 하나는 Electron 메인 프로세스' +
      '(02_Project/00_Source/main), 다른 하나는 React 렌더러(02_Project/00_Source/renderer)를 조사해서 각자 핵심 모듈 ' +
      '5개와 역할을 보고하게 해줘. 보고가 모이면 종합해서 프로젝트 루트에 arch-map.md 파일로 저장해줘. 한국어로.'
    )
    await input.press('Enter')

    const spawned = await waitForSubagentApproving(240_000)
    console.log('[readme-shots] 서브에이전트 관측:', spawned)
    await page.waitForTimeout(4000)
    await page.screenshot({ path: join(SHOT_DIR, 'readme-hero-live.png') })

    await settleTurn(page, { timeoutMs: 360_000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: join(SHOT_DIR, 'readme-hero-done.png') })

    const subCount = await page.locator('.subagent').count()
    console.log('[readme-shots] 최종 서브에이전트 카드 수:', subCount)
  })

  test('컷③: Git 모달 — 실제 커밋 히스토리', async () => {
    test.setTimeout(60_000)
    await pinWindow()
    await page.getByLabel('Git').first().click()
    await expect(page.locator('.gitm-overlay')).toBeVisible()
    await page.locator('.gitm-nav .gitm-item', { hasText: '모든 커밋' }).click()
    await page.waitForSelector('.gitm-commit', { timeout: 15_000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: join(SHOT_DIR, 'readme-git.png') })
    await page.locator('.gitm-modal').screenshot({ path: join(SHOT_DIR, 'readme-git-modal.png') })
    await page.keyboard.press('Escape')
    await expect(page.locator('.gitm-overlay')).toHaveCount(0)
  })

  // M10 G1 — 멀티 에이전트 모드를 지워 컷④(3패널 동시 실작동)를 뺐다.
})
