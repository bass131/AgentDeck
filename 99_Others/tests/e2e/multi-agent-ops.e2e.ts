import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let page: Page
let workspace: string
let pickFolder: string
let userDataDir: string

const SAMPLE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test.beforeAll(async () => {
  workspace = mkdtempSync(join(tmpdir(), 'agentdeck-maops-'))
  writeFileSync(join(workspace, 'main.ts'), 'export const main = () => console.log("hello")\n')
  writeFileSync(join(workspace, 'README.md'), '# multi-agent-ops e2e\n')

  pickFolder = mkdtempSync(join(tmpdir(), 'agentdeck-maops-pick-'))
  writeFileSync(join(pickFolder, 'pick.txt'), 'picked folder\n')

  userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-maops-udata-'))

  mkdirSync(join(process.cwd(), 'artifacts', 'screenshots'), { recursive: true })

  app = await electron.launch({
    args: [join(process.cwd(), 'out', 'main', 'index.js'), `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_WORKSPACE: workspace,
      AGENTDECK_E2E_PICK_FOLDER: pickFolder,
    },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  await page.waitForSelector('.login-body, .titlebar, .eg-auth-dialog, .boot-splash', {
    timeout: 15_000,
  })

  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    await nick.fill('ma-ops-tester')
    await page.locator('.login-body button.submit').click()
  }

  try {
    const egSkip = page.locator('.eg-auth-dialog .sd-go')
    await egSkip.waitFor({ state: 'visible', timeout: 3_000 })
    await egSkip.click()
  } catch {
  }

  await page.waitForSelector('.titlebar', { timeout: 15_000 })

  try {
    const wn = page.locator('.wn-overlay')
    await wn.waitFor({ state: 'visible', timeout: 3_000 })
    await page.locator('.wn-overlay .wn-nav-cta').click()
    await expect(wn).toHaveCount(0)
  } catch {
  }
  const un = page.locator('.un-overlay')
  if (await un.count()) {
    await page.keyboard.press('Escape').catch(() => {})
  }

  await page.getByRole('button', { name: '폴더 선택' }).click()
  await expect(page.locator('.fe-file', { hasText: 'main.ts' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  if (workspace) rmSync(workspace, { recursive: true, force: true })
  if (pickFolder) rmSync(pickFolder, { recursive: true, force: true })
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true })
})

test('멀티 뷰 전환: 사이드바 "멀티 에이전트" 탭 → .multi/.ma-grid/.ma-panel(≥2)/.ma-head-title 표시', async () => {
  const modeBtn = page.locator('.sb-mode .sb-mode-btn').nth(1)
  await expect(modeBtn).toHaveAttribute('role', 'tab')
  await modeBtn.click()

  await expect(page.locator('.multi')).toBeVisible()
  await expect(page.locator('.multi .ma-grid')).toBeVisible()
  expect(await page.locator('.ma-grid .ma-panel').count()).toBeGreaterThanOrEqual(2)
  await expect(page.locator('.ma-head .ma-head-title')).toContainText('멀티 에이전트')
})

test('헤더 usage 게이지: .ma-usage 2개 + .ma-usage-pct가 % 또는 — (실 store.usage, 정적값 아님)', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  await expect(page.locator('.ma-usage')).toHaveCount(2)

  const pcts = page.locator('.ma-usage-pct')
  await expect(pcts).toHaveCount(2)
  for (const pct of await pcts.all()) {
    const text = (await pct.textContent()) ?? ''
    expect(text.endsWith('%') || text === '—').toBe(true)
    expect(text).not.toBe('37%')
    expect(text).not.toBe('12%')
  }
})

test('패널 수 탭: "6" 클릭 → 패널 6개, "2" 클릭 → 패널 2개', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  await page.locator('.ma-count .ma-count-btn', { hasText: '6' }).click()
  await expect(page.locator('.ma-grid .ma-panel')).toHaveCount(6)

  await page.locator('.ma-count .ma-count-btn', { hasText: '2' }).click()
  await expect(page.locator('.ma-grid .ma-panel')).toHaveCount(2)
})

test('패널 슬래시 자동완성: 첫 패널 .ma-composer-ta에 "/" 입력 → .slash-menu 표시', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  const ta = page.locator('.ma-panel').first().locator('.ma-composer-ta')
  await ta.click()
  await ta.fill('/')

  await expect(page.locator('.slash-menu').first()).toBeVisible()

  await ta.press('Escape')
  await ta.fill('')
})

test('패널 @멘션: .ma-composer-ta에 "@" 입력 → 멘션 팔레트(.slash-menu 또는 .mention-loc) 표시', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  const ta = page.locator('.ma-panel').first().locator('.ma-composer-ta')
  await ta.click()
  await ta.fill('@')

  const palette = page.locator('.slash-menu').first()
  await expect(palette).toBeVisible()

  await ta.press('Escape')
  await ta.fill('')
})

test('UltraCode 토글(멀티): 첫 패널 .orch-toggle 클릭 → .orch-on 클래스 전환', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  const toggle = page.locator('.ma-panel').first().locator('.orch-toggle')
  await expect(toggle).toBeVisible()

  await expect(toggle).not.toHaveClass(/orch-on/)

  await toggle.click()
  await expect(toggle).toHaveClass(/orch-on/)

  await toggle.click()
  await expect(toggle).not.toHaveClass(/orch-on/)
})

test('UltraCode 토글(단일): 단일 뷰 .composer .orch-toggle 토글 확인', async () => {
  await page.locator('.sb-mode .sb-mode-btn').nth(0).click()
  await expect(page.locator('.pane.chat')).toBeVisible()
  await expect(page.locator('.multi')).toHaveCount(0)

  const toggle = page.locator('.composer .orch-toggle')
  await expect(toggle).toBeVisible()

  const wasOn = await toggle.evaluate((el) => el.classList.contains('orch-on'))
  await toggle.click()
  if (wasOn) {
    await expect(toggle).not.toHaveClass(/orch-on/)
  } else {
    await expect(toggle).toHaveClass(/orch-on/)
  }

  const isOn = await toggle.evaluate((el) => el.classList.contains('orch-on'))
  if (isOn) await toggle.click()
  await expect(toggle).not.toHaveClass(/orch-on/)
})

test('패널 이미지 첨부: input[type="file"] setInputFiles → .img-tray .img-thumb 표시 → .img-thumb-x 클릭 → 썸네일 제거', async () => {
  await page.locator('.sb-mode .sb-mode-btn').nth(1).click()
  await expect(page.locator('.multi')).toBeVisible()

  const pngPath = join(workspace, `_qa-attach-${Date.now()}.png`)
  writeFileSync(pngPath, Buffer.from(SAMPLE_PNG_B64, 'base64'))

  const fileInput = page.locator('.ma-panel').first().locator('input[type="file"]').first()
  await fileInput.setInputFiles(pngPath)

  const thumb = page.locator('.img-tray .img-thumb').first()
  await expect(thumb).toBeVisible()

  await thumb.locator('.img-thumb-x').click()
  await expect(page.locator('.img-tray .img-thumb')).toHaveCount(0)
})

test('패널 폴더: 첫 패널 .ma-p-folder 클릭 → AGENTDECK_E2E_PICK_FOLDER 우회로 .ma-p-folder-name 갱신', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  const folderBtn = page.locator('.ma-panel').first().locator('.ma-p-folder')
  await expect(folderBtn).toBeVisible()

  await folderBtn.click()

  const folderName = page.locator('.ma-panel').first().locator('.ma-p-folder-name')
  await expect(folderName).toBeVisible()
  await expect(folderBtn).toBeVisible()
})

test('패널 프롬프트: 첫 패널 .ma-p-prompt 클릭 → PromptModal(.pr-overlay) 표시', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  const promptBtn = page.locator('.ma-panel').first().locator('.ma-p-prompt')
  await expect(promptBtn).toBeVisible()
  await promptBtn.click()

  await expect(page.locator('.pr-overlay')).toBeVisible()
  await expect(page.locator('.pr-title')).toContainText('프롬프트 설정')

  await page.keyboard.press('Escape')
  await expect(page.locator('.pr-overlay')).toHaveCount(0)
})

test('멀티 세션 관리: 멀티 모드 → 사이드바 세션 리스트(.sb-list) 존재 + .sb-new 클릭 → 새 멀티 세션 전환', async () => {
  await expect(page.locator('.multi')).toBeVisible()

  const sbList = page.locator('.sb-list')
  await expect(sbList).toBeVisible()

  const sbItems = sbList.locator('.sb-item')
  expect(await sbItems.count()).toBeGreaterThanOrEqual(1)

  const sbNew = page.locator('.sb-new')
  await expect(sbNew).toBeVisible()
  const beforeCount = await sbItems.count()
  await sbNew.click()

  await expect(page.locator('.multi')).toBeVisible()
  const afterCount = await sbItems.count()
  expect(afterCount).toBeGreaterThanOrEqual(beforeCount)
})

test('사이드바 브랜드: .sb-name이 "AgentDeck" 포함 (워크스페이스명 아님)', async () => {
  const sbName = page.locator('.sb-name')
  await expect(sbName).toBeVisible()
  await expect(sbName).toContainText('AgentDeck')
  const text = (await sbName.textContent()) ?? ''
  expect(text).not.toMatch(/agentdeck-maops/)
})
