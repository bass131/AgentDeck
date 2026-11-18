// M09 G2 — 실물 git 포트(git CLI). ports.ts의 GitPort 계약을 그대로 구현한다.
// 실행기 자신의 git이라 일반 환경(자격 있음)으로 돈다. 다만 작업 저장소의 훅은 돌리지 않는다 — hooksPath를 빈 폴더로 준다.
// 훅은 작업 세션이 쓸 수 있는 코드라, 자격 있는 실행기 환경에서 돌면 안 된다. hooksPath는 만들지 않는 앱 영역 경로다.
// 설정도 같다 — guard(configGuard.ts)를 주면 모든 git 호출 직전에 설정 스냅숏을 대조하고, 다르면 그 호출을 돌리지 않고 던진다.
//   hasChanges  status --porcelain(untracked 포함). `.agentdeck/`는 info/exclude로 추적 밖이라 잡히지 않는다.
//   diffStat    진짜 인덱스를 복사한 임시 인덱스(GIT_INDEX_FILE, 저장소 밖)에 add -A 한 뒤 diff --cached --numstat --no-renames.
//               그래서 untracked가 들어가고, rename은 지운 옛 경로와 더한 새 경로로 따로 나오며, 바이너리는 「-」라 null이다.
//   mergeNoFf   실패하면 merge --abort로 되돌린 뒤 throw.
//   syncToRemote 원격에 브랜치가 없으면 그대로, 원격이 앞서면 ff(체크아웃된 브랜치는 merge --ff-only, 아니면 update-ref 비교 갱신),
//               같거나 로컬이 앞서면 그대로, 갈라졌으면 throw.
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { maskCredentials } from '../../08_Git/git'
import type { FileChange } from '../grade'
import type { GitPort } from '../ports'
import { runProcess, type ProcessResult } from './exec'

export interface GitPortOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  remote?: string
  timeoutMs?: number
  // 작업 저장소의 훅 대신 쓸 빈 폴더. 주지 않으면 저장소 설정의 훅이 돈다.
  hooksPath?: string
  // 모든 git 호출 직전의 설정 대조. 던지면 그 호출을 돌리지 않는다.
  guard?: { assert(): Promise<void> }
}

export const AGENTDECK_EXCLUDE = '.agentdeck/'

type Git = (args: string[], extraEnv?: NodeJS.ProcessEnv) => Promise<ProcessResult>

// 교체 객체(refs/replace/*)를 따르지 않는다 — 작업 노드가 `git replace <PR 머리> <악성 커밋>`을 심으면, 따르는 git의 병합은 부모를
// 원래 SHA로 적고 트리는 악성 것으로 만든다(G2 재검수 차단 A). 환경 변수와 명령줄 설정 둘 다 건다(자식 git·gh가 부르는 git도 환경을 받는다).
export const NO_REPLACE_ENV = { GIT_NO_REPLACE_OBJECTS: '1' } as const

function makeGit(cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number, hooksPath?: string, guard?: GitPortOptions['guard']): Git {
  const pre = [
    '-c', 'core.quotepath=false', '-c', 'core.useReplaceRefs=false',
    ...(hooksPath ? ['-c', `core.hooksPath=${hooksPath.replace(/\\/g, '/')}`] : []),
  ]
  const base = { ...env, ...NO_REPLACE_ENV }
  return async (args, extraEnv) => {
    await guard?.assert()
    return runProcess('git', [...pre, ...args], { cwd, env: extraEnv ? { ...base, ...extraEnv, ...NO_REPLACE_ENV } : base, timeoutMs })
  }
}

function failure(args: string[], r: ProcessResult): Error {
  const msg = (r.stderr.trim() || r.stdout.trim() || `exit ${r.code}`).split(/\r?\n/).slice(-3).join(' ')
  return new Error(maskCredentials(`git ${args[0]} 실패 — ${msg}`))
}

async function must(git: Git, args: string[], extraEnv?: NodeJS.ProcessEnv): Promise<string> {
  const r = await git(args, extraEnv)
  if (r.code !== 0) throw failure(args, r)
  return r.stdout
}

function safeName(name: string): string {
  if (!name || name.startsWith('-')) throw new Error(`브랜치 이름 ${JSON.stringify(name)}을 쓸 수 없다`)
  return name
}

export function parseNumstatZ(out: string): FileChange[] {
  const changes: FileChange[] = []
  for (const rec of out.split('\0')) {
    if (rec === '') continue
    const m = /^(-|\d+)\t(-|\d+)\t([\s\S]+)$/.exec(rec.replace(/^\n+/, ''))
    if (!m) continue
    changes.push({ path: m[3], added: m[1] === '-' ? null : Number(m[1]), removed: m[2] === '-' ? null : Number(m[2]) })
  }
  return changes
}

export function createGitPort(opts: GitPortOptions): GitPort {
  const remote = opts.remote ?? 'origin'
  const env = opts.env ?? process.env
  const git = makeGit(opts.cwd, env, opts.timeoutMs ?? 120_000, opts.hooksPath, opts.guard)

  const resolve = async (ref: string): Promise<string | null> => {
    const r = await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
    return r.code === 0 ? r.stdout.trim() || null : null
  }
  const isAncestor = async (sha: string, ref: string): Promise<boolean> => {
    if (!(await resolve(sha)) || !(await resolve(ref))) return false
    const r = await git(['merge-base', '--is-ancestor', sha, ref])
    if (r.code === 0) return true
    if (r.code === 1) return false
    throw failure(['merge-base'], r)
  }
  const currentBranch = async (): Promise<string | null> => {
    const r = await git(['symbolic-ref', '--quiet', 'HEAD'])
    return r.code === 0 ? r.stdout.trim() : null
  }

  return {
    async branchExists(name) {
      const r = await git(['show-ref', '--verify', '--quiet', `refs/heads/${safeName(name)}`])
      if (r.code === 0) return true
      if (r.code === 1) return false
      throw failure(['show-ref'], r)
    },
    async createBranch(name, from) {
      await must(git, ['branch', '--no-track', safeName(name), safeName(from)])
    },
    async checkout(name) {
      await must(git, ['checkout', '--quiet', safeName(name), '--'])
    },
    headSha: (ref) => resolve(ref),
    async hasChanges() {
      const out = await must(git, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
      return out.length > 0
    },
    async commitAll(message) {
      await must(git, ['add', '-A'])
      await must(git, ['commit', '--quiet', '--no-verify', '-m', message])
      return (await must(git, ['rev-parse', 'HEAD'])).trim()
    },
    async push(branch) {
      const b = safeName(branch)
      await must(git, ['push', '--quiet', '--no-verify', remote, `refs/heads/${b}:refs/heads/${b}`])
    },
    async remoteSha(branch) {
      const b = safeName(branch)
      const ls = await git(['ls-remote', '--exit-code', '--heads', remote, `refs/heads/${b}`])
      if (ls.code === 2) return null
      if (ls.code !== 0) throw failure(['ls-remote'], ls)
      return ls.stdout.trim().split(/\s+/)[0] || null
    },
    async parents(sha) {
      const out = await must(git, ['rev-list', '--parents', '-n', '1', safeName(sha), '--'])
      return out.trim().split(/\s+/).slice(1)
    },
    async syncToRemote(branch) {
      const b = safeName(branch)
      const local = await resolve(`refs/heads/${b}`)
      if (!local) throw new Error(`로컬에 ${b} 브랜치가 없다`)
      const ls = await git(['ls-remote', '--exit-code', '--heads', remote, `refs/heads/${b}`])
      if (ls.code === 2) return local
      if (ls.code !== 0) throw failure(['ls-remote'], ls)
      const tracking = `refs/remotes/${remote}/${b}`
      await must(git, ['fetch', '--quiet', '--no-tags', remote, `+refs/heads/${b}:${tracking}`])
      const remoteSha = await resolve(tracking)
      if (!remoteSha || remoteSha === local) return local
      if (await isAncestor(local, remoteSha)) {
        if ((await currentBranch()) === `refs/heads/${b}`) await must(git, ['merge', '--quiet', '--ff-only', '--no-verify', remoteSha])
        else await must(git, ['update-ref', `refs/heads/${b}`, remoteSha, local])
        return remoteSha
      }
      if (await isAncestor(remoteSha, local)) return local
      throw new Error(`${b}의 로컬(${local.slice(0, 8)})과 원격(${remoteSha.slice(0, 8)})이 갈라졌다`)
    },
    isAncestor,
    async mergeNoFf(sha, message) {
      const r = await git(['merge', '--quiet', '--no-ff', '--no-verify', '--no-edit', '-m', message, sha])
      if (r.code !== 0) {
        await git(['merge', '--abort'])
        throw failure(['merge'], r)
      }
      return (await must(git, ['rev-parse', 'HEAD'])).trim()
    },
    async verifyMerge(commit, first, second) {
      const c = safeName(commit)
      const parents = (await must(git, ['rev-list', '--parents', '-n', '1', c, '--'])).trim().split(/\s+/).slice(1)
      if (parents.length !== 2 || parents[0] !== first || parents[1] !== second) {
        return `병합 커밋 ${c.slice(0, 8)}의 부모(${parents.map((p) => p.slice(0, 8)).join(', ') || '없음'})가 (${first.slice(0, 8)}, ${second.slice(0, 8)})가 아니다`
      }
      const tree = (await must(git, ['rev-parse', '--verify', `${c}^{tree}`])).trim()
      const r = await git(['merge-tree', '--write-tree', '--no-messages', safeName(first), safeName(second)])
      if (r.code === 1) return `병합 커밋 ${c.slice(0, 8)}의 두 부모는 깨끗하게 병합되지 않는다(충돌)`
      if (r.code !== 0) throw failure(['merge-tree'], r)
      const expected = r.stdout.split(/\r?\n/)[0].trim()
      return tree === expected ? null : `병합 커밋 ${c.slice(0, 8)}의 트리 ${tree.slice(0, 8)}가 두 부모를 병합한 트리 ${expected.slice(0, 8)}가 아니다`
    },
    async diffStat(base) {
      let dir: string | null = null
      try {
        if (!(await resolve(base))) return null
        dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agentdeck-index-'))
        const index = path.join(dir, 'index')
        const real = path.resolve(opts.cwd, (await must(git, ['rev-parse', '--git-path', 'index'])).trim())
        await fsp.copyFile(real, index).catch(() => undefined)
        const extra = { GIT_INDEX_FILE: index }
        await must(git, ['add', '-A'], extra)
        return parseNumstatZ(await must(git, ['diff', '--cached', '--numstat', '-z', '--no-renames', base, '--'], extra))
      } catch {
        return null
      } finally {
        if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
      }
    },
  }
}

// 실행기가 시작할 때 부른다. 작업 저장소의 info/exclude에 `.agentdeck/` 줄이 없으면 더한다(있으면 그대로). 저장소 파일은 안 바꾼다.
export async function ensureAgentdeckExcluded(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<'added' | 'present'> {
  const git = makeGit(cwd, env, 30_000)
  const file = path.resolve(cwd, (await must(git, ['rev-parse', '--git-path', 'info/exclude'])).trim())
  let text = ''
  try { text = await fsp.readFile(file, 'utf8') } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  const present = text.split(/\r?\n/).some((l) => ['.agentdeck/', '/.agentdeck/', '.agentdeck', '/.agentdeck'].includes(l.trim()))
  if (present) return 'present'
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const sep = text === '' || text.endsWith('\n') ? '' : '\n'
  await fsp.writeFile(file, `${text}${sep}${AGENTDECK_EXCLUDE}\n`)
  return 'added'
}
