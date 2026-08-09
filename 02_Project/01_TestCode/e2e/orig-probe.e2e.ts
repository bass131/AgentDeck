import { test, _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const ORIG_MAIN = 'C:/Dev/AgentCodeGUI/out/main/index.js'
const ORIG_ELECTRON = 'C:/Dev/AgentCodeGUI/node_modules/electron/dist/electron.exe'
const SHOT_DIR = join(process.cwd(), 'artifacts', 'screenshots')

test('원본 AgentCodeGUI 런타임 launch + 첫 화면/DOM 구조 캡처', async () => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const ws = mkdtempSync(join(tmpdir(), 'orig-ws-'))
  writeFileSync(join(ws, 'README.md'), '# 원본 비교\n\n샘플 워크스페이스.\n')
  const udata = mkdtempSync(join(tmpdir(), 'orig-udata-'))

  const app = await electron.launch({
    executablePath: ORIG_ELECTRON,
    args: [ORIG_MAIN, `--user-data-dir=${udata}`],
    env: { ...process.env },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: join(SHOT_DIR, 'orig-00-launch.png'), fullPage: false })

  const containers = await page.evaluate(() => {
    const probe = [
      '.titlebar', '.win', '.login-body', '.sidebar', '.welcome', '.composer',
      '.explorer', '.fe-tree', '.agent-panel', '.ctx-strip', '.multi', '.set-layout',
    ]
    return probe.filter((c) => document.querySelector(c) !== null)
  })
  const bodyText = await page.evaluate(() =>
    (document.body.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
  )
  console.log('[orig] 존재 컨테이너:', containers.join(', ') || '(없음)')
  console.log('[orig] 화면 텍스트:', bodyText)

  const nick = page.locator('.login-body input#nickname')
  if (await nick.count()) {
    const cur = await nick.inputValue().catch(() => '')
    if (!cur) await nick.fill('비교QA')
    await page.locator('.login-body button[type="submit"]').click().catch(() => {})
  }
  await page
    .waitForSelector('.composer, .welcome, .sidebar', { timeout: 12_000 })
    .catch(() => {})
  await page.waitForTimeout(1200)
  for (const sel of ['.wn-overlay', '.un-overlay']) {
    if (await page.locator(sel).count()) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(400)
    }
  }
  await page.screenshot({ path: join(SHOT_DIR, 'orig-shell.png'), fullPage: false })

  try {
    await page.locator('.sb-foot').click({ timeout: 4000 })
    await page.waitForSelector('.set-layout', { timeout: 4000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(SHOT_DIR, 'orig-settings.png'), fullPage: false })
    await page.keyboard.press('Escape')
  } catch (e) {
    console.log('[orig] 설정 캡처 스킵:', String(e).slice(0, 80))
  }

  try {
    const ta = page.locator('.composer textarea')
    await ta.click({ timeout: 4000 })
    await ta.fill('/')
    await page.waitForSelector('.slash-menu', { timeout: 4000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(SHOT_DIR, 'orig-slash.png'), fullPage: false })
    await ta.fill('')
  } catch (e) {
    console.log('[orig] 슬래시 캡처 스킵:', String(e).slice(0, 80))
  }

  try {
    await page.getByRole('tab', { name: '멀티 에이전트' }).click({ timeout: 4000 })
    await page.waitForSelector('.ma-grid, .multi', { timeout: 4000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: join(SHOT_DIR, 'orig-multi.png'), fullPage: false })
  } catch (e) {
    console.log('[orig] 멀티 캡처 스킵:', String(e).slice(0, 80))
  }

  const mainContainers = await page.evaluate(() => {
    const probe = ['.titlebar', '.sidebar', '.composer', '.welcome', '.ctx-strip', '.agent-panel', '.sb-foot', '.multi']
    return probe.filter((c) => document.querySelector(c) !== null)
  })
  console.log('[orig] 메인 컨테이너:', mainContainers.join(', ') || '(없음)')

  await app.close()
})
