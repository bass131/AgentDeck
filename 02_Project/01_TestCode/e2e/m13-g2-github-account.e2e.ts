// M13 G2 — 설정 「GitHub 계정」 칸이 로컬 시험 서버(기기 코드·토큰·/user 흉내)를 향한 빌드본에서 연결·표시·해제까지 돈다.
// 실제 safeStorage(DPAPI)로 저장된 파일에 평문 토큰이 없고, 해제하면 파일이 지워지는지도 본다. 「GitHub에서 열기」는 진짜 브라우저를 띄우므로 누르지 않는다.
import { test, expect } from '@playwright/test'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isolatedBoot, type IsolatedBootResult } from './helpers/isolatedBoot'

const TOKEN = 'gho_e2eLocalServerToken1234'
const OUT = process.env.M13G2_OUT ?? join(process.cwd(), 'artifacts', 'm13-g2')

let server: Server
let base = ''
let approved = false
const seen: { method: string; path: string; body: string; auth: string }[] = []

function handle(req: IncomingMessage, res: ServerResponse): void {
  let body = ''
  req.on('data', (c: Buffer) => { body += c.toString('utf8') })
  req.on('end', () => {
    const url = new URL(req.url ?? '/', base)
    seen.push({ method: req.method ?? '', path: url.pathname, body, auth: String(req.headers.authorization ?? '') })
    const json = (status: number, payload: unknown): void => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    }
    if (req.method === 'POST' && url.pathname === '/login/device/code') {
      return json(200, { device_code: 'dev-e2e', user_code: 'E2EA-1234', verification_uri: `${base}/login/device`, expires_in: 900, interval: 1 })
    }
    if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
      return json(200, approved ? { access_token: TOKEN, token_type: 'bearer', scope: 'repo,workflow' } : { error: 'authorization_pending' })
    }
    if (req.method === 'GET' && url.pathname === '/user') return json(200, { login: 'e2e-octocat' })
    json(404, { message: 'Not Found' })
  })
}

let boot: IsolatedBootResult

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true })
  server = createServer(handle)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  boot = await isolatedBoot({ slug: 'agentdeck-m13g2', nickname: 'g2테스트', echo: true, env: { AGENTDECK_E2E_GITHUB_BASE: base } })
})

test.afterAll(async () => {
  await boot?.teardown()
  await new Promise<void>((r) => server.close(() => r()))
})

test('설정 「GitHub 계정」: 준비 안 됨 → 연결(코드 표시·승인 기다림) → 연결됨(계정 이름) → 해제', async () => {
  test.setTimeout(120_000)
  const { page, userDataDir } = boot
  const authFile = join(userDataDir, 'github-auth.bin')

  await page.getByLabel('설정 열기').click()
  const dialog = page.getByRole('dialog', { name: '설정' })
  await dialog.waitFor({ state: 'visible', timeout: 5_000 })
  await dialog.getByRole('button', { name: 'GitHub 계정', exact: true }).click()

  const status = page.getByRole('status', { name: 'GitHub 연결 상태' })
  await expect(status).toHaveText('GitHub에 연결되지 않았어요.')

  await page.getByRole('button', { name: 'GitHub 연결', exact: true }).click()
  await expect(page.getByRole('alert', { name: 'GitHub 연결 오류' })).toContainText('GitHub 연결 준비가 안 됐어요')
  expect(seen).toHaveLength(0)

  await page.evaluate(() => window.api.settings.setUiPref({ key: 'githubClientId', value: 'e2e-client-id' }))
  await page.getByRole('button', { name: 'GitHub 연결', exact: true }).click()
  await expect(page.getByLabel('사용자 코드', { exact: true })).toHaveText('E2EA-1234')
  await expect(status).toContainText('승인을 기다리고 있어요')
  await expect(page.getByRole('button', { name: 'GitHub에서 열기' })).toBeVisible()
  await expect.poll(() => seen.filter((s) => s.path === '/login/oauth/access_token').length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1)
  await page.screenshot({ path: join(OUT, 'github-pending.png') })

  const codeReq = seen.find((s) => s.path === '/login/device/code')
  expect(codeReq?.body).toContain('client_id=e2e-client-id')
  expect(decodeURIComponent((codeReq?.body ?? '').replace(/\+/g, ' '))).toContain('scope=repo workflow')
  expect(existsSync(authFile)).toBe(false)

  approved = true
  await expect(status).toHaveText('GitHub 계정에 연결돼 있어요.', { timeout: 15_000 })
  await expect(page.getByLabel('연결된 계정')).toHaveText('e2e-octocat')
  await page.screenshot({ path: join(OUT, 'github-connected.png') })

  await expect(page.getByText('연결됐어요', { exact: true })).toBeVisible()
  expect(seen.find((s) => s.path === '/user')?.auth).toBe(`Bearer ${TOKEN}`)
  expect(existsSync(authFile)).toBe(true)
  const cipher = Buffer.from(readFileSync(authFile, 'utf8').trim(), 'base64')
  expect(cipher.length).toBeGreaterThan(16)
  for (const plain of [TOKEN, 'e2e-octocat']) {
    expect(cipher.includes(Buffer.from(plain))).toBe(false)
    expect(cipher.includes(Buffer.from(plain, 'utf16le'))).toBe(false)
  }
  const decryptedLogin = await boot.app.evaluate(({ safeStorage }, b64) =>
    (JSON.parse(safeStorage.decryptString(Buffer.from(b64, 'base64'))) as { login?: string }).login, cipher.toString('base64'))
  expect(decryptedLogin).toBe('e2e-octocat')
  expect(await page.content()).not.toContain(TOKEN)

  await page.getByRole('button', { name: '연결 해제' }).click()
  await expect(status).toHaveText('GitHub에 연결되지 않았어요.')
  expect(existsSync(authFile)).toBe(false)
  await page.screenshot({ path: join(OUT, 'github-disconnected.png') })
})
