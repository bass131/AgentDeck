// 시험의 git은 시스템·전역 설정을 끊고(GIT_CONFIG_NOSYSTEM, 빈 GIT_CONFIG_GLOBAL) 저장소마다 신원·기본 브랜치·줄바꿈을 정해
// CI(GitHub Actions)와 이 기계가 같게 돈다. GIT_CEILING_DIRECTORIES로 임시 폴더 위의 저장소(혹시 있다면)를 찾지 않는다.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const TEST_IDENTITY = { name: 'Loop Test', email: 'loop-test@example.invalid' }

export interface TempRepos {
  root: string
  remote: string
  work: string
  env: NodeJS.ProcessEnv
  git: (args: string[], cwd?: string, input?: string) => string
  bare: (args: string[]) => string
  cleanup: () => void
}

const DROP = /^(GIT_|GH_|GITHUB_TOKEN$|GCM_)/i

// 시험용 git 환경 — 부모 환경의 GIT_* 변수와 전역·시스템 설정에 흔들리지 않는다.
export function isolatedGitEnv(root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) if (!DROP.test(k)) env[k] = v
  const globalConfig = path.join(root, 'empty-global.gitconfig')
  if (!fs.existsSync(globalConfig)) fs.writeFileSync(globalConfig, '')
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_CONFIG_GLOBAL = globalConfig
  env.GIT_CEILING_DIRECTORIES = path.dirname(root)
  env.GIT_TERMINAL_PROMPT = '0'
  return env
}

export function makeTempRepos(prefix = 'agentdeck-g2-'): TempRepos {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)))
  const env = isolatedGitEnv(root)
  const remote = path.join(root, 'remote.git')
  const work = path.join(root, 'work')
  const run = (args: string[], cwd: string, input?: string): string =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8', input, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  run(['init', '--quiet', '--bare', '--initial-branch=master', remote], root)
  run(['init', '--quiet', '--initial-branch=master', work], root)
  for (const [k, v] of [
    ['user.name', TEST_IDENTITY.name], ['user.email', TEST_IDENTITY.email],
    ['init.defaultBranch', 'master'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false'],
  ]) run(['config', k, v], work)
  run(['config', 'core.autocrlf', 'false'], remote)
  fs.writeFileSync(path.join(work, 'README.md'), '# 연습 저장소\n')
  run(['add', '-A'], work)
  run(['commit', '--quiet', '-m', 'init'], work)
  run(['remote', 'add', 'origin', remote], work)
  run(['push', '--quiet', 'origin', 'master'], work)
  // 실행기는 열 때 refs/remotes/origin/HEAD를 기준 브랜치로 읽는다. 클론이 남기는 것과 같다.
  run(['remote', 'set-head', 'origin', 'master'], work)
  return {
    root,
    remote,
    work,
    env,
    git: (args, cwd = work, input) => run(args, cwd, input).trim(),
    bare: (args) => run(['--git-dir', remote, ...args], root).trim(),
    cleanup: () => { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) },
  }
}

export function onPath(cmd: string): boolean {
  try {
    execFileSync(cmd, ['--version'], { stdio: 'ignore', windowsHide: true })
    return true
  } catch {
    return false
  }
}
