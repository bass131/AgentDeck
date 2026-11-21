// 앱 토큰의 쓰임 — 연결이 있으면 PR 카드 gh와 실행기 gh의 환경에 GH_TOKEN으로 들어가고, 없으면 지금과 같다.
// 자격 없는 자식 환경(childEnv)은 바탕에 앱 토큰이 섞여 와도 그 값을 싣지 않는다. 실행기 git은 gitPort.app-token 시험이 본다.
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ calls: [] as { cmd: string; args: string[]; env: NodeJS.ProcessEnv }[] }))
vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>()
  return {
    ...real,
    execFile: (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }, cb: (e: Error | null, out: string, err: string) => void) => {
      h.calls.push({ cmd, args, env: opts.env })
      cb(null, cmd === 'git' ? 'https://github.com/acme/widgets.git\n' : '{}', '')
    },
  }
})

import { appGithubToken, setAppTokenSource, withGhToken } from '@main/14_GitHub/appToken'
import { prService } from '@main/08_Git/prMerge'
import { createGhExec, createGhPort } from '@main/05_Loop/realPorts/ghPort'
import { buildCredentialFreeEnv, NO_CREDENTIAL_TOKEN } from '@main/05_Loop/childEnv'

const TOKEN = 'gho_appTokenPaths31'

afterEach(() => {
  setAppTokenSource(() => null)
  h.calls.length = 0
})

describe('앱 토큰 읽기', () => {
  it('출처가 없거나 비면 null, 던지면 null, 있으면 그 값이다', () => {
    expect(appGithubToken()).toBeNull()
    setAppTokenSource(() => '')
    expect(appGithubToken()).toBeNull()
    setAppTokenSource(() => { throw new Error('decrypt') })
    expect(appGithubToken()).toBeNull()
    setAppTokenSource(() => TOKEN)
    expect(appGithubToken()).toBe(TOKEN)
  })

  it('withGhToken은 토큰이 있을 때만 GH_TOKEN을 덮고, 없으면 같은 환경을 돌려준다', () => {
    const base = { PATH: 'x', GH_TOKEN: 'user-env-token' }
    expect(withGhToken(base, TOKEN)).toEqual({ PATH: 'x', GH_TOKEN: TOKEN })
    expect(withGhToken(base, null)).toBe(base)
    expect(base.GH_TOKEN).toBe('user-env-token')
  })
})

describe('PR 카드의 gh', () => {
  it('연결이 있으면 gh 환경에 GH_TOKEN으로 들어가고, 없으면 이 프로세스의 환경 그대로다', async () => {
    setAppTokenSource(() => TOKEN)
    await prService().readPr('C:/work', { number: 1 })
    const withToken = h.calls.find((c) => c.cmd === 'gh')
    expect(withToken?.env.GH_TOKEN).toBe(TOKEN)
    expect(withToken?.args.join(' ')).not.toContain(TOKEN)
    expect(h.calls.find((c) => c.cmd === 'git')?.env.GH_TOKEN).toBe(process.env.GH_TOKEN)

    h.calls.length = 0
    setAppTokenSource(() => null)
    await prService().readPr('C:/work', { number: 1 })
    const without = h.calls.find((c) => c.cmd === 'gh')
    expect(without?.env).toEqual({ ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' })
    expect(process.env.GH_TOKEN).not.toBe(TOKEN)
  })
})

describe('실행기의 gh', () => {
  it('호출마다 토큰을 읽어 연결이 있으면 GH_TOKEN으로, 없으면 준 환경 그대로 부른다', async () => {
    let current: string | null = TOKEN
    const seen: NodeJS.ProcessEnv[] = []
    const exec = createGhExec({
      cwd: '.', repo: 'github.com/acme/widgets', env: { PATH: 'x', GH_TOKEN: 'user-env-token' }, token: () => current,
      run: async (file, args, o) => {
        expect(file).toBe('gh')
        expect(args.join(' ')).not.toContain(TOKEN)
        seen.push(o.env ?? {})
        return { code: 0, stdout: '[]', stderr: '', timedOut: false }
      },
    })
    const port = createGhPort(exec)
    await port.findPr('goal/x', 'master')
    current = null
    await port.findPr('goal/x', 'master')
    expect(seen[0].GH_TOKEN).toBe(TOKEN)
    expect(seen[1].GH_TOKEN).toBe('user-env-token')
  })

  it('토큰은 고정 저장소의 호스트가 github.com일 때만 싣는다 — ghe.com 테넌트·GHES 호스트에는 준 환경 그대로다', async () => {
    const envOf = async (repo: string): Promise<NodeJS.ProcessEnv> => {
      let seen: NodeJS.ProcessEnv = {}
      const exec = createGhExec({
        cwd: '.', repo, env: { PATH: 'x', GH_TOKEN: 'user-env-token' }, token: () => TOKEN,
        run: async (_file, _args, o) => { seen = o.env ?? {}; return { code: 0, stdout: '[]', stderr: '', timedOut: false } },
      })
      await createGhPort(exec).findPr('goal/x', 'master')
      return seen
    }
    expect((await envOf('github.com/acme/widgets')).GH_TOKEN).toBe(TOKEN)
    expect((await envOf('acme.ghe.com/acme/widgets')).GH_TOKEN).toBe('user-env-token')
    expect((await envOf('git.example.com/acme/widgets')).GH_TOKEN).toBe('user-env-token')
    expect((await envOf('api.github.com/acme/widgets')).GH_TOKEN).toBe('user-env-token')
  })
})

describe('자격 없는 환경', () => {
  it('바탕에 앱 토큰이 들어 있어도 자식 환경에는 그 값이 없다', () => {
    const paths = { root: 'T:/n', ghConfigDir: 'T:/n/gh', gitGlobalConfig: 'T:/n/g', emptyDir: 'T:/n/e' }
    const env = buildCredentialFreeEnv(withGhToken({ PATH: 'x' }, TOKEN), paths, null)
    expect(Object.values(env)).not.toContain(TOKEN)
    expect(env.GH_TOKEN).toBe(NO_CREDENTIAL_TOKEN)
  })
})
