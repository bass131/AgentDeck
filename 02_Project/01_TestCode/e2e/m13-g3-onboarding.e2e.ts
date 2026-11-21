// M13 G3 — 격리 앱 데이터의 빌드본에서 「시작하기」 안내가 첫 실행에 뜨고, GitHub(시험 서버)·프로젝트 단계가 끝남으로 바뀌며,
// 헌장·Taste와 현황판 버튼이 작업 모드의 해당 탭을 연다. 「나중에」 뒤 다시 켜면 저절로 뜨지 않고 사이드바에서 다시 열린다.
// Claude 로그인과 gh 단계는 이 PC의 실제 상태를 읽으므로 상태값을 기록만 한다.
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { moveToSecondDisplay } from './helpers/isolatedBoot'
import { passBootGates } from './helpers/bootGates'

const OUT = process.env.M13G3_OUT ?? join(process.cwd(), 'artifacts', 'm13-g3')
const STEPS = ['claude', 'github', 'gh', 'project', 'taste', 'milestone']

let server: Server
let base = ''
let approved = false
let userDataDir = ''
let repo = ''
let app: ElectronApplication | undefined

function handle(req: IncomingMessage, res: ServerResponse): void {
  req.resume()
  req.on('end', () => {
    const url = new URL(req.url ?? '/', base)
    const json = (status: number, payload: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    if (req.method === 'POST' && url.pathname === '/login/device/code') {
      return json(200, { device_code: 'dev-g3', user_code: 'G3G3-0001', verification_uri: `${base}/login/device`, expires_in: 900, interval: 1 })
    }
    if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
      return json(200, approved ? { access_token: 'gho_g3LocalToken', token_type: 'bearer', scope: 'repo,workflow' } : { error: 'authorization_pending' })
    }
    if (req.method === 'GET' && url.pathname === '/user') return json(200, { login: 'g3-octocat' })
    json(404, { message: 'Not Found' })
  })
}

async function launch(): Promise<Page> {
  app = await electron.launch({
    args: [`--user-data-dir=${userDataDir}`, join(process.cwd(), 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      AGENTDECK_E2E: '1',
      AGENTDECK_E2E_NO_ENGINE_UPDATE: '1',
      AGENTDECK_E2E_GITHUB_BASE: base,
      AGENTDECK_E2E_PICK_FOLDER: repo,
    } as Record<string, string>,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await moveToSecondDisplay(app)
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.show()
    win?.focus()
  })
  await passBootGates(page, { nickname: 'g3테스트', keepOnboarding: true })
  return page
}

const guide = (page: Page) => page.getByRole('dialog', { name: '시작하기' })
const step = (page: Page, id: string) => guide(page).locator(`li.ob-step[data-step="${id}"]`)
const states = (page: Page): Promise<Record<string, string | null>> =>
  Promise.all(STEPS.map(async (id) => [id, await step(page, id).getAttribute('data-state')] as const)).then(Object.fromEntries)

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true })
  server = createServer(handle)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  userDataDir = mkdtempSync(join(tmpdir(), 'agentdeck-m13g3-udd-'))
  repo = mkdtempSync(join(tmpdir(), 'agentdeck-m13g3-repo-'))
  execFileSync('git', ['init', '--quiet'], { cwd: repo })
})

test.afterAll(async () => {
  await app?.close().catch(() => {})
  await new Promise<void>((r) => server.close(() => r()))
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(repo, { recursive: true, force: true })
})

test('시작하기: 첫 실행에 뜸 → GitHub·프로젝트 끝남 → 헌장·Taste·현황판으로 이음 → 나중에 → 다시 켜도 안 뜸 → 사이드바로 다시 엶', async () => {
  test.setTimeout(240_000)
  let page = await launch()

  await expect(guide(page)).toBeVisible({ timeout: 15_000 })
  await expect(guide(page).getByRole('list', { name: '시작하기 단계' }).locator('li.ob-step')).toHaveCount(6)
  await expect(step(page, 'github')).toHaveAttribute('data-state', 'todo', { timeout: 10_000 })
  await expect(step(page, 'project')).toHaveAttribute('data-state', 'todo')
  await expect(step(page, 'taste')).toHaveAttribute('data-state', 'blocked')
  await expect(step(page, 'milestone')).toHaveAttribute('data-state', 'blocked')
  await expect(step(page, 'claude')).not.toHaveAttribute('data-state', 'checking', { timeout: 15_000 })
  await expect(step(page, 'gh')).not.toHaveAttribute('data-state', 'checking', { timeout: 15_000 })
  const first = await states(page)
  await page.screenshot({ path: join(OUT, 'onboarding-first.png') })

  await page.evaluate(() => window.api.settings.setUiPref({ key: 'githubClientId', value: 'g3-client-id' }))
  await step(page, 'github').getByRole('button', { name: 'GitHub 계정 열기' }).click()
  const settings = page.getByRole('dialog', { name: '설정' })
  await expect(settings).toBeVisible()
  await settings.getByRole('button', { name: 'GitHub 연결', exact: true }).click()
  await expect(page.getByLabel('사용자 코드', { exact: true })).toHaveText('G3G3-0001')
  approved = true
  await expect(page.getByLabel('연결된 계정')).toHaveText('g3-octocat', { timeout: 15_000 })
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect(guide(page)).toBeVisible()
  await expect(step(page, 'github')).toHaveAttribute('data-state', 'done', { timeout: 10_000 })

  await step(page, 'project').getByRole('button', { name: '폴더 열기' }).click()
  await expect(step(page, 'project')).toHaveAttribute('data-state', 'done', { timeout: 15_000 })
  await expect(step(page, 'taste')).toHaveAttribute('data-state', 'todo', { timeout: 10_000 })
  await expect(step(page, 'milestone')).toHaveAttribute('data-state', 'todo', { timeout: 10_000 })
  await page.screenshot({ path: join(OUT, 'onboarding-progress.png') })

  await step(page, 'taste').getByRole('button', { name: '헌장·Taste 열기' }).click()
  await expect(guide(page)).toBeHidden()
  await expect(page.getByRole('tab', { name: '헌장·Taste' })).toHaveAttribute('aria-selected', 'true')
  await page.screenshot({ path: join(OUT, 'onboarding-taste.png') })

  await page.getByLabel('시작하기 열기').click()
  await expect(guide(page)).toBeVisible()
  await step(page, 'milestone').getByRole('button', { name: '현황판 열기' }).click()
  await expect(guide(page)).toBeHidden()
  await expect(page.getByRole('tab', { name: '현황판' })).toHaveAttribute('aria-selected', 'true')

  await page.getByLabel('시작하기 열기').click()
  await expect(guide(page)).toBeVisible()
  await guide(page).getByRole('button', { name: '나중에', exact: true }).click()
  await expect(guide(page)).toBeHidden()
  await app?.close()

  page = await launch()
  await page.waitForTimeout(6_000)
  await expect(guide(page)).toBeHidden()
  await page.getByLabel('시작하기 열기').click()
  await expect(guide(page)).toBeVisible()
  await expect(step(page, 'github')).toHaveAttribute('data-state', 'done', { timeout: 10_000 })
  await expect(step(page, 'project')).toHaveAttribute('data-state', 'done', { timeout: 10_000 })
  const reopened = await states(page)
  await page.screenshot({ path: join(OUT, 'onboarding-reopened.png') })
  writeFileSync(join(OUT, 'states.json'), JSON.stringify({ first, reopened }, null, 2))
})
