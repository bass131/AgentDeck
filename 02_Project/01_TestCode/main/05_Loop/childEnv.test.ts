// 변수 모양과, 그 환경에서 gh·git이 자격을 얻지 못하는 것을 동작으로 본다.
// 진짜 push·원격 쓰기는 하지 않는다. gh·git이 PATH에 없으면 그 동작 시험만 건너뛴다.
// 실측(2026-11-18, 이 기계): 빈 GH_CONFIG_DIR만 주면 `gh auth status`는 exit 1인데 `gh auth token`은 keyring에서 40자 토큰을 낸다.
// 그래서 GH_TOKEN 자리에 가짜 값을 둔다(환경 토큰이 keyring보다 먼저 읽힌다). GCM도 저장소를 빈 평문 폴더로 돌린다.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  NO_CREDENTIAL_TOKEN, buildCredentialFreeEnv, createCredentialFreeEnv, type CredentialFreeEnv,
} from '@main/05_Loop/childEnv'
import { makeTempRepos, onPath, type TempRepos } from '../00_Helpers/tempGit'

const HAS_GH = onPath('gh')
const HAS_GIT = onPath('git')
const GH_AUTHED = HAS_GH && spawnSync('gh', ['auth', 'status'], { env: process.env, windowsHide: true, timeout: 60_000 }).status === 0
const GH_SKIP = HAS_GH ? '일반 환경에서 gh auth status가 0이 아니다(인증 없는 기계)' : 'gh가 PATH에 없다'
const IDENTITY = { name: 'Loop Bot', email: 'loop-bot@example.invalid' }
const PATHS = { root: 'T:/nocred', ghConfigDir: 'T:/nocred/gh', gitGlobalConfig: 'T:/nocred/global.gitconfig', emptyDir: 'T:/nocred/empty' }

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd: string, input?: string): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd, env, input, encoding: 'utf8', windowsHide: true, timeout: 60_000 })
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('자격 없는 환경의 모양', () => {
  const base: NodeJS.ProcessEnv = {
    Path: 'C:/bin', HOME: 'C:/Users/x',
    GH_TOKEN: 'ghp_real', gh_token: 'ghp_lower', GITHUB_TOKEN: 'ghs_ci', GH_ENTERPRISE_TOKEN: 'e', GITHUB_ENTERPRISE_TOKEN: 'e2',
    GH_CONFIG_DIR: 'C:/Users/x/.config/gh', SSH_AUTH_SOCK: '/tmp/agent.sock', SSH_AGENT_PID: '12', SSH_ASKPASS: 'askpass.exe',
    GIT_ASKPASS: 'C:/code/askpass.sh', GIT_SSH_COMMAND: 'ssh -i key', GIT_CONFIG_PARAMETERS: "'credential.helper'='store'",
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: 'store', GCM_CREDENTIAL_STORE: 'wincredman',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc', GIT_AUTHOR_NAME: 'someone else',
  }
  const env = buildCredentialFreeEnv(base, PATHS, IDENTITY)
  const keys = Object.keys(env).map((k) => k.toUpperCase())

  it('토큰·SSH 에이전트·askpass·명령줄 설정 주입 변수를 대소문자와 관계없이 뺀다', () => {
    for (const k of ['GITHUB_TOKEN', 'GITHUB_ENTERPRISE_TOKEN', 'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'GIT_ASKPASS', 'GIT_CONFIG_PARAMETERS', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) {
      expect(keys, k).not.toContain(k)
    }
    expect(Object.values(env)).not.toContain('ghp_real')
    expect(Object.values(env)).not.toContain('ghp_lower')
    expect(Object.values(env)).not.toContain('store')
    expect(keys.filter((k) => k === 'GH_TOKEN')).toHaveLength(1)
    expect(env.Path).toBe('C:/bin')
  })

  it('gh는 가짜 토큰과 빈 설정 폴더, git은 시스템·전역 설정과 자격 도우미를 끊고 질의하지 않는다', () => {
    expect(env.GH_TOKEN).toBe(NO_CREDENTIAL_TOKEN)
    expect(env.GH_ENTERPRISE_TOKEN).toBe(NO_CREDENTIAL_TOKEN)
    expect(env.GH_CONFIG_DIR).toBe(PATHS.ghConfigDir)
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1')
    expect(env.GIT_CONFIG_GLOBAL).toBe(PATHS.gitGlobalConfig)
    expect(env.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env.GCM_INTERACTIVE).toBe('never')
    expect(env.GCM_CREDENTIAL_STORE).toBe('plaintext')
    const n = Number(env.GIT_CONFIG_COUNT)
    const pairs = Array.from({ length: n }, (_, i) => [env[`GIT_CONFIG_KEY_${i}`], env[`GIT_CONFIG_VALUE_${i}`]])
    expect(pairs).toContainEqual(['credential.helper', ''])
    expect(pairs).toContainEqual(['core.askPass', ''])
    expect(env.GIT_SSH_COMMAND).toContain('IdentityAgent=none')
    expect(env.GIT_SSH_COMMAND).toContain('BatchMode=yes')
  })

  it('전역 설정을 끊어 사라진 커밋 신원을 넘겨받은 값으로 채운다', () => {
    expect([env.GIT_AUTHOR_NAME, env.GIT_AUTHOR_EMAIL, env.GIT_COMMITTER_NAME, env.GIT_COMMITTER_EMAIL])
      .toEqual([IDENTITY.name, IDENTITY.email, IDENTITY.name, IDENTITY.email])
    const anonymous = buildCredentialFreeEnv(base, PATHS, null)
    expect(Object.keys(anonymous).map((k) => k.toUpperCase())).not.toContain('GIT_AUTHOR_NAME')
  })
})

describe('자격 없는 환경에서 gh·git은 자격을 얻지 못한다(동작)', () => {
  let child: CredentialFreeEnv
  let repos: TempRepos
  beforeAll(() => {
    child = createCredentialFreeEnv(process.env, IDENTITY)
    repos = makeTempRepos('agentdeck-g2-env-')
  })
  afterAll(() => {
    child.dispose()
    repos.cleanup()
  })

  it('임시 폴더를 만들고 dispose가 지운다 — 빈 gh 설정 폴더와 빈 전역 설정 파일', () => {
    expect(fs.readdirSync(child.paths.ghConfigDir)).toEqual([])
    expect(fs.readFileSync(child.paths.gitGlobalConfig, 'utf8')).toBe('')
    const other = createCredentialFreeEnv(process.env, null)
    other.dispose()
    expect(fs.existsSync(other.paths.root)).toBe(false)
  })

  // 양성 대조 —일반 환경에서 gh가 인증돼 있을 때만 의미가 있다. 인증 없는 기계에서는 자식 환경도 당연히 실패해
  // 거짓 통과가 되므로, 그때는 건너뛰고 사유를 시험 이름에 남긴다.
  it.skipIf(!GH_AUTHED)(`gh auth status — 일반 환경은 0(양성 대조), 자식 환경은 0이 아니다${GH_AUTHED ? '' : ` [건너뜀: ${GH_SKIP}]`}`, () => {
    expect(run('gh', ['auth', 'status'], process.env, repos.work).code).toBe(0)
    const r = run('gh', ['auth', 'status'], child.env, repos.work)
    expect(r.code, r.out).not.toBe(0)
  })

  it.skipIf(!GH_AUTHED)(`gh auth token — 일반 환경은 진짜 토큰(양성 대조), 자식 환경은 가짜 값뿐이다${GH_AUTHED ? '' : ` [건너뜀: ${GH_SKIP}]`}`, () => {
    const real = (spawnSync('gh', ['auth', 'token'], { cwd: repos.work, env: process.env, encoding: 'utf8', windowsHide: true }).stdout ?? '').trim()
    expect(real.length).toBeGreaterThan(0)
    const r = spawnSync('gh', ['auth', 'token'], { cwd: repos.work, env: child.env, encoding: 'utf8', windowsHide: true })
    const out = (r.stdout ?? '').trim()
    // 실패 메시지에 토큰이 찍히지 않게 참·거짓으로만 비교한다
    expect(out === real).toBe(false)
    expect(out === '' || out === NO_CREDENTIAL_TOKEN).toBe(true)
  })

  it.skipIf(!HAS_GIT)('git credential fill이 자격을 돌려주지 못한다 — 작업 저장소 설정에 심은 도우미도 끊긴다', () => {
    // 작업 저장소의 로컬 설정에 자격을 내는 도우미를 심는다. 일반 환경이면 이 도우미가 password를 낸다.
    repos.git(['config', 'credential.helper', '!f() { echo username=planted; echo password=planted-secret; }; f'])
    const input = 'protocol=https\nhost=github.com\n\n'
    const plain = run('git', ['credential', 'fill'], repos.env, repos.work, input)
    expect(plain.out).toContain('password=planted-secret')
    const r = run('git', ['credential', 'fill'], child.env, repos.work, input)
    expect(r.code).not.toBe(0)
    expect(r.out).not.toMatch(/^password=/m)
    repos.git(['config', '--unset', 'credential.helper'])
  })

  it.skipIf(!HAS_GIT)('GCM을 직접 불러도 빈 평문 저장소라 자격이 없다(GCM이 없으면 실패로 같다)', () => {
    const r = run('git', ['credential-manager', 'get'], child.env, repos.work, 'protocol=https\nhost=github.com\n\n')
    expect(r.out).not.toMatch(/^password=/m)
  })

  it.skipIf(!HAS_GIT)('전역 설정 없이도 넘겨받은 신원으로 커밋한다', () => {
    const dir = path.join(repos.root, 'anon')
    fs.mkdirSync(dir)
    expect(run('git', ['init', '--quiet', dir], child.env, repos.root).code).toBe(0)
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n')
    expect(run('git', ['add', '-A'], child.env, dir).code).toBe(0)
    const c = run('git', ['commit', '--quiet', '-m', 'x'], child.env, dir)
    expect(c.code, c.out).toBe(0)
    expect(run('git', ['log', '-1', '--format=%an <%ae>|%cn'], child.env, dir).out.trim()).toBe(`${IDENTITY.name} <${IDENTITY.email}>|${IDENTITY.name}`)
  })
})
