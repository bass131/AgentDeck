import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PERM_CARD, permChoiceSelector } from './helpers/permSelectors'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

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
      '(02_Source/main), 다른 하나는 React 렌더러(02_Source/renderer)를 조사해서 각자 핵심 모듈 ' +
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

  test('컷④: 멀티 에이전트 — 3패널 동시 실작동', async () => {
    test.setTimeout(480_000)

    await pinWindow()
    await page.locator('.sb-mode .sb-mode-btn').nth(1).click()
    await expect(page.locator('.multi .ma-grid')).toBeVisible()
    await page.locator('.ma-count .ma-count-btn', { hasText: '3' }).click()
    await expect(page.locator('.ma-grid .ma-panel')).toHaveCount(3)

    const PROMPTS = [
      '02_Source/renderer에서 Zustand 스토어 파일들을 찾아 각자 무슨 상태를 관리하는지 한 줄씩 정리해줘.',
      'package.json의 scripts를 읽고 빌드·테스트 파이프라인이 어떻게 구성돼 있는지 4문장으로 요약해줘.',
      '02_Source/main에서 IPC 채널 등록부를 찾아 대표 채널 10개를 목록으로 뽑아줘.'
    ]
    for (let i = 0; i < 3; i++) {
      const panel = page.locator('.ma-grid .ma-panel').nth(i)
      await panel.locator('.ma-p-folder').click()
      await expect(panel.locator('.ma-p-folder-name')).toContainText('AgentDeck', { timeout: 8000 })
      const ta = panel.locator('.ma-composer-ta')
      await ta.click()
      await ta.fill(PROMPTS[i])
      await ta.press('Enter')
    }

    await page.waitForTimeout(20_000)
    await pinWindow()
    await page.screenshot({ path: join(SHOT_DIR, 'readme-multiagent.png') })
    await page.waitForTimeout(30_000)
    await pinWindow()
    await page.screenshot({ path: join(SHOT_DIR, 'readme-multiagent-b.png') })
    await page.locator('.multi').screenshot({ path: join(SHOT_DIR, 'readme-multiagent-panels.png') })

    const deadline = Date.now() + 300_000
    while (Date.now() < deadline) {
      const running = await page.getByLabel('실행 중단').count()
      if (running === 0) break
      await page.waitForTimeout(2000)
    }
    console.log('[readme-shots] 멀티 3패널 정착 완료')
  })
})
