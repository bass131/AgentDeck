// openLoop가 연 실물 gh·git 포트에 앱 토큰이 닿는지 — git은 로컬 http 서버가 401(Basic)로 자격을 청해 다시 온 Authorization 머리를,
// gh는 주입한 실행 함수가 받은 환경을 본다. 토큰은 호출마다 읽으므로 같은 실행기에서 토큰을 지우면 다음 호출부터 나가지 않는다.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openLoop, type OpenedLoop, type OpenLoopOptions } from '@main/05_Loop/openLoop'
import type { ReviewPort, SessionPort } from '@main/05_Loop/ports'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const TOKEN = 'gho_openLoopWiring55'
const basic = (user: string, pass: string): string => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
const session: SessionPort = { runWork: async () => ({ ok: true, summary: '' }) }
const review: ReviewPort = { review: async () => ({ verdict: 'pass', evidence: '' }) }

let server: http.Server
let port: number
let auths: string[]
let ghEnvs: NodeJS.ProcessEnv[]
let repos: TempRepos
let appData: string
let loop: OpenedLoop | null

const ghRun: NonNullable<OpenLoopOptions['ghRun']> = async (_file, _args, o) => {
  ghEnvs.push({ ...o.env })
  return { code: 0, stdout: '[]', stderr: '', timedOut: false }
}

beforeEach(async () => {
  auths = []
  ghEnvs = []
  loop = null
  server = http.createServer((req, res) => {
    if (req.headers.authorization) auths.push(req.headers.authorization)
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"', 'Content-Type': 'text/plain' })
    res.end('no')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
  repos = makeTempRepos('agentdeck-openloop-token-')
  fs.writeFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[credential]\n\thelper = "!f() { echo username=user; echo password=user-secret; }; f"\n')
  repos.git(['remote', 'set-url', 'origin', `http://127.0.0.1:${port}/acme/widgets.git`])
  appData = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-openloop-token-app-'))
})
afterEach(async () => {
  await loop?.close()
  await new Promise<void>((r) => server.close(() => r()))
  repos.cleanup()
  fs.rmSync(appData, { recursive: true, force: true })
})

async function open(githubToken: () => string | null, gitUrl: string | null = `http://127.0.0.1:${port}`): Promise<OpenedLoop> {
  const r = await openLoop({
    cwd: repos.work, appDataDir: appData, session, review, base: 'master', executorEnv: repos.env,
    requiredChecks: ['hard-gates'], githubToken, ghRun, ...(gitUrl ? { githubGitUrl: gitUrl } : {}),
  })
  if (!r.ok) throw new Error(`openLoop 실패: ${r.reason}`)
  loop = r.loop
  return r.loop
}

describe('openLoop — 앱 토큰이 실물 gh·git 포트에 닿는다 (M13 G2)', () => {
  it('실행기 git의 push가 토큰을 내고, 토큰을 지우면 다음 push는 사용자 도우미를 낸다', async () => {
    let token: string | null = TOKEN
    const opened = await open(() => token)
    const err = await opened.git.push('master').then(() => null, (e: Error) => e)
    expect(err?.message ?? '').not.toContain(TOKEN)
    expect(auths.length).toBeGreaterThan(0)
    expect(auths.every((a) => a === basic('x-access-token', TOKEN))).toBe(true)
    auths = []
    token = null
    await opened.git.push('master').catch(() => null)
    expect(auths.length).toBeGreaterThan(0)
    expect(auths.every((a) => a === basic('user', 'user-secret'))).toBe(true)
  })

  it('주소를 주지 않으면 토큰은 https://github.com에만 걸린다 — 다른 원격에는 사용자 도우미가 나간다', async () => {
    const opened = await open(() => TOKEN, null)
    await opened.git.push('master').catch(() => null)
    expect(auths.length).toBeGreaterThan(0)
    expect(auths.every((a) => a === basic('user', 'user-secret'))).toBe(true)
  })

  it('실행기 gh 호출의 환경에 토큰이 GH_TOKEN으로 실리고, 토큰을 지우면 실리지 않는다', async () => {
    let token: string | null = TOKEN
    const opened = await open(() => token)
    await opened.gh.openPrHeads?.('master')
    expect(ghEnvs.at(-1)?.GH_TOKEN).toBe(TOKEN)
    token = null
    await opened.gh.openPrHeads?.('master')
    expect(ghEnvs.at(-1)?.GH_TOKEN).not.toBe(TOKEN)
    expect(JSON.stringify(opened.childEnv.env)).not.toContain(TOKEN)
  })
})
