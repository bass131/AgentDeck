// 설치본 확인 (opt-in: M13G1LIVE=1, 설치된 실행 파일 M13G1_EXE, 출력 폴더 M13G1_OUT).
//   A) 앱 데이터 인자 없이 띄워 실행 경로·앱 이름·앱 데이터 폴더·버전 표시를 읽는다.
//   B) 격리한 앱 데이터로 띄워 실제 엔진 턴 하나(Haiku 5.5, 한 단어 답)가 끝나는지 본다 — asar 밖 SDK 실행 파일.
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { moveToSecondDisplay } from './helpers/isolatedBoot'
import { passBootGates, openWorkspace, settleTurn } from './helpers/bootGates'

const RUN = process.env.M13G1LIVE === '1'
const EXE = process.env.M13G1_EXE ?? ''
const OUT = process.env.M13G1_OUT ?? join(tmpdir(), 'agentdeck-m13-g1-out')
const REPO = resolve(process.cwd())
const PKG_VERSION = (JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as { version: string }).version

function launchEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ...extra }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  return env
}

async function skipIntro(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: '건너뛰기' })
  if (await skip.isVisible({ timeout: 5000 }).catch(() => false)) await skip.click()
}

test.describe('M13 G1 설치본 확인 (opt-in: M13G1LIVE=1)', () => {
  test.skip(!RUN, 'M13 G1 설치본 — M13G1LIVE=1로 명시 실행')

  test('A) 설치본이 개발 서버 없이 작업 트리 밖에서 뜨고 앱 버전과 agentdeck 앱 데이터 폴더를 쓴다', async () => {
    test.setTimeout(120_000)
    expect(EXE).not.toBe('')
    mkdirSync(OUT, { recursive: true })
    const app = await electron.launch({ executablePath: EXE, args: [], env: launchEnv() })
    try {
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await moveToSecondDisplay(app)
      const facts = await app.evaluate(({ app: a }) => ({
        isPackaged: a.isPackaged,
        name: a.getName(),
        execPath: process.execPath,
        userData: a.getPath('userData'),
        appData: a.getPath('appData'),
      }))
      await skipIntro(page)
      const sidebarVersion = page.getByText(/^AgentDeck \d+\.\d+\.\d+$/).first()
      await sidebarVersion.waitFor({ state: 'visible', timeout: 15_000 })
      const versionShown = (await sidebarVersion.innerText()).replace('AgentDeck ', '').trim()
      const url = page.url()
      await page.screenshot({ path: join(OUT, 'installed-window.png') })
      writeFileSync(join(OUT, 'facts.json'), JSON.stringify({ ...facts, versionShown, url }, null, 2))
      expect(facts.isPackaged).toBe(true)
      expect(url.startsWith('file:')).toBe(true)
      expect(facts.name).toBe('agentdeck')
      expect(facts.userData).toBe(join(facts.appData, 'agentdeck'))
      expect(versionShown).toBe(PKG_VERSION)
      expect(resolve(facts.execPath).toLowerCase().startsWith(REPO.toLowerCase() + sep)).toBe(false)
    } finally {
      await app.close()
    }
  })

  test('B) 설치본에서 실제 엔진 턴 하나가 끝난다', async () => {
    test.setTimeout(240_000)
    expect(EXE).not.toBe('')
    mkdirSync(OUT, { recursive: true })
    const workspace = mkdtempSync(join(tmpdir(), 'agentdeck-m13g1-ws-'))
    const userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m13g1-udd-'))
    writeFileSync(join(workspace, 'README.md'), 'm13 g1 probe\n')
    let app: ElectronApplication | undefined
    try {
      app = await electron.launch({
        executablePath: EXE,
        args: [`--user-data-dir=${userDataDir}`],
        env: launchEnv({ AGENTDECK_E2E_WORKSPACE: workspace, AGENTDECK_E2E_NO_ENGINE_UPDATE: '1' }),
      })
      const page = await app.firstWindow()
      await page.waitForLoadState('domcontentloaded')
      await moveToSecondDisplay(app)
      await skipIntro(page)
      await passBootGates(page, { nickname: 'm13-g1' })
      await openWorkspace(page, { waitForTree: true })
      const chat = page.locator('.pane.chat')
      await chat.locator('.pick-btn', { has: page.locator('.pick-lbl', { hasText: '모델' }) }).first().click()
      await chat.locator('.po-main', { hasText: 'Haiku 5.5' }).first().click()
      const input = chat.getByLabel('메시지 입력')
      await input.click()
      await input.fill('Reply with only the word ok.')
      await input.press('Enter')
      await page.waitForTimeout(1500)
      await settleTurn(page, { timeoutMs: 180_000 })
      const text = await chat.innerText()
      await page.screenshot({ path: join(OUT, 'installed-turn.png') })
      writeFileSync(join(OUT, 'turn.txt'), text)
      expect(text).not.toMatch(/ENOENT|spawn .*claude|app\.asar[\\/]node_modules/i)
      expect(text.toLowerCase()).toMatch(/\bok\b/)
    } finally {
      await app?.close()
      rmSync(workspace, { recursive: true, force: true })
      rmSync(userDataDir, { recursive: true, force: true })
    }
  })
})
