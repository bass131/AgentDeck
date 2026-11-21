// 실행기 git의 원격 동작이 앱 토큰을 자격으로 내는지 — 로컬 http 서버가 401(Basic)로 자격을 청하고, 다시 온 요청의
// Authorization 머리를 기록한다. 전역 설정에 사용자 자격 도우미를 심어 두고, 앱 토큰이 있으면 그 도우미 대신 토큰이 나가고
// 없으면 지금처럼 사용자 도우미가 나가는지 본다. 도우미는 준 주소에만 걸린다.
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createGitPort, tokenCredentialArgs, tokenRemoteMatches } from '@main/05_Loop/realPorts/gitPort'
import { GITHUB_GIT_URL } from '@main/14_GitHub/appToken'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

const TOKEN = 'gho_gitPortAppToken55'
const basic = (user: string, pass: string): string => `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`

let server: http.Server
let port: number
let auths: string[]
let repos: TempRepos

beforeEach(async () => {
  auths = []
  server = http.createServer((req, res) => {
    if (req.headers.authorization) auths.push(req.headers.authorization)
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="test"', 'Content-Type': 'text/plain' })
    res.end('no')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
  repos = makeTempRepos('agentdeck-gitapptoken-')
  fs.writeFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[credential]\n\thelper = "!f() { echo username=user; echo password=user-secret; }; f"\n')
  repos.git(['remote', 'set-url', 'origin', `http://127.0.0.1:${port}/acme/widgets.git`])
})
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()))
  repos.cleanup()
})

const portWith = (token: string | null, url = `http://127.0.0.1:${port}`) =>
  createGitPort({ cwd: repos.work, env: repos.env, credential: { url, token: () => token } })

describe('실행기 git 원격 동작의 자격', () => {
  it('앱 토큰이 있으면 push가 사용자 도우미 대신 그 토큰을 내고, 오류 문구에 토큰이 없다', async () => {
    const err = await portWith(TOKEN).push('master').then(() => null, (e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).not.toContain(TOKEN)
    expect(auths.length).toBeGreaterThan(0)
    expect(auths.every((a) => a === basic('x-access-token', TOKEN))).toBe(true)
  })

  it('ls-remote(remoteSha)와 syncToRemote의 원격 읽기도 같은 토큰을 낸다', async () => {
    await portWith(TOKEN).remoteSha('master').catch(() => null)
    await portWith(TOKEN).syncToRemote('master').catch(() => null)
    expect(auths).toContain(basic('x-access-token', TOKEN))
    expect(auths).not.toContain(basic('user', 'user-secret'))
  })

  it('앱 토큰이 없으면 지금처럼 사용자 자격 도우미가 나간다', async () => {
    await portWith(null).push('master').catch(() => null)
    expect(auths.length).toBeGreaterThan(0)
    expect(auths.every((a) => a === basic('user', 'user-secret'))).toBe(true)
    auths = []
    await createGitPort({ cwd: repos.work, env: repos.env }).push('master').catch(() => null)
    expect(auths.every((a) => a === basic('user', 'user-secret'))).toBe(true)
  })

  it('도우미는 준 주소에만 걸린다 — 다른 호스트 원격에는 토큰이 나가지 않는다', async () => {
    repos.git(['remote', 'set-url', 'origin', `http://localhost:${port}/acme/widgets.git`])
    await portWith(TOKEN).push('master').catch(() => null)
    expect(auths.length).toBeGreaterThan(0)
    expect(auths.some((a) => a.includes(Buffer.from(`x-access-token:${TOKEN}`).toString('base64')))).toBe(false)
  })

  it('origin이 준 주소가 아니면 원격 호출 환경에 토큰을 싣지 않는다', async () => {
    fs.writeFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '[credential]\n\thelper = "!f() { echo username=env; echo password=$GH_TOKEN; }; f"\n')
    repos.git(['remote', 'set-url', 'origin', `http://localhost:${port}/acme/widgets.git`])
    const env = { ...repos.env, GH_TOKEN: 'user-env' }
    const p = createGitPort({ cwd: repos.work, env, credential: { url: `http://127.0.0.1:${port}`, token: () => TOKEN } })
    await p.push('master').catch(() => null)
    await p.remoteSha('master').catch(() => null)
    expect(auths.length).toBeGreaterThan(0)
    expect(auths.every((a) => a === basic('env', 'user-env'))).toBe(true)
  })

  it('토큰을 거는 원격은 준 주소와 스킴·호스트가 같은 것뿐이다', () => {
    const gh = 'https://github.com'
    expect(tokenRemoteMatches('https://github.com/acme/widgets.git', gh)).toBe(true)
    expect(tokenRemoteMatches('https://someone@github.com/acme/widgets\n', gh)).toBe(true)
    expect(tokenRemoteMatches('git@github.com:acme/widgets.git', gh)).toBe(false)
    expect(tokenRemoteMatches('ssh://git@github.com/acme/widgets.git', gh)).toBe(false)
    expect(tokenRemoteMatches('http://github.com/acme/widgets.git', gh)).toBe(false)
    expect(tokenRemoteMatches('https://github.com.evil.test/acme/widgets.git', gh)).toBe(false)
    expect(tokenRemoteMatches('https://acme.ghe.com/acme/widgets.git', gh)).toBe(false)
    expect(tokenRemoteMatches('C:/repos/widgets.git', gh)).toBe(false)
  })

  it('명령줄 설정에는 토큰 값이 없다 — 값은 환경(GH_TOKEN)으로만 간다', () => {
    const args = tokenCredentialArgs('https://github.com')
    expect(args).toEqual([
      '-c', 'credential.https://github.com.helper=',
      '-c', expect.stringMatching(/^credential\.https:\/\/github\.com\.helper=!.*\$GH_TOKEN/),
    ])
  })
})

describe('실제 기본 주소의 도우미 — git credential fill(네트워크 없음)', () => {
  const fill = (host: string): string => {
    const system = path.join(repos.root, 'system.gitconfig')
    fs.writeFileSync(system, '[credential]\n\thelper = "!f() { echo username=system; echo password=system-secret; }; f"\n')
    fs.writeFileSync(repos.env.GIT_CONFIG_GLOBAL as string, '')
    const env: NodeJS.ProcessEnv = { ...repos.env, GIT_CONFIG_SYSTEM: system, GH_TOKEN: TOKEN }
    delete env.GIT_CONFIG_NOSYSTEM
    return execFileSync('git', [...tokenCredentialArgs(GITHUB_GIT_URL), 'credential', 'fill'], {
      cwd: repos.work, env, input: `protocol=https\nhost=${host}\n\n`, encoding: 'utf8', windowsHide: true,
    })
  }

  it('github.com이면 시스템 도우미를 비우고 x-access-token과 토큰을 낸다', () => {
    const out = fill('github.com')
    expect(out).toContain('username=x-access-token')
    expect(out).toContain(`password=${TOKEN}`)
    expect(out).not.toContain('system-secret')
  })

  it('api.github.com·github.com.evil.test에는 토큰이 없고 시스템 도우미가 그대로 답한다', () => {
    for (const host of ['api.github.com', 'github.com.evil.test']) {
      const out = fill(host)
      expect(out).toContain('password=system-secret')
      expect(out).not.toContain(TOKEN)
    }
  })
})
