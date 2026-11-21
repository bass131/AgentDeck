// ports.ts의 GitPort 계약을 그대로 구현한다.
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

interface GitPortOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  remote?: string
  timeoutMs?: number
  // 작업 저장소의 훅 대신 쓸 빈 폴더. 주지 않으면 저장소 설정의 훅이 돈다.
  hooksPath?: string
  // 모든 git 호출 직전의 설정 대조. 던지면 그 호출을 돌리지 않는다.
  guard?: { assert(): Promise<void> }
}

const AGENTDECK_EXCLUDE = '.agentdeck/'

type Git = (args: string[], extraEnv?: NodeJS.ProcessEnv) => Promise<ProcessResult>

// 교체 객체(refs/replace/*)를 따르지 않는다 — 작업 노드가 `git replace <PR 머리> <악성 커밋>`을 심으면, 따르는 git의 병합은 부모를
// 원래 SHA로 적고 트리는 악성 것으로 만든다. 환경 변수와 명령줄 설정 둘 다 건다(자식 git·gh가 부르는 git도 환경을 받는다).
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

// 저장소 뿌리 기준의 평범한 상대 경로만 — 옵션·pathspec 마법·뿌리 밖은 받지 않는다
function pathArgs(paths: string[]): string[] {
  if (paths.length === 0) throw new Error('경로가 없다')
  for (const p of paths) {
    const parts = p.split('/')
    if (p === '' || p.startsWith('-') || p.startsWith(':') || p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.includes('\\') || parts.some((s) => s === '' || s === '.' || s === '..')) {
      throw new Error(`경로 ${JSON.stringify(p)}는 저장소 안의 상대 경로가 아니다`)
    }
  }
  return paths
}

function safeName(name: string): string {
  if (!name || name.startsWith('-')) throw new Error(`브랜치 이름 ${JSON.stringify(name)}을 쓸 수 없다`)
  return name
}

const SHA_HEX = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
// 브랜치 이름은 `refs/heads/<이름>`으로 읽는다. 짧은 이름은 같은 이름의 태그(refs/tags)가 먼저 잡혀 가릴 수 있다.
// 전체 SHA·`refs/` 경로·HEAD는 그대로 둔다.
export function qualifyRef(ref: string): string {
  const r = safeName(ref)
  if (SHA_HEX.test(r) || r.startsWith('refs/') || r === 'HEAD') return r
  return `refs/heads/${r}`
}

function parseNumstatZ(out: string): FileChange[] {
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
    const r = await git(['rev-parse', '--verify', '--quiet', `${qualifyRef(ref)}^{commit}`])
    return r.code === 0 ? r.stdout.trim() || null : null
  }
  const isAncestor = async (sha: string, ref: string): Promise<boolean> => {
    const a = await resolve(sha)
    const b = await resolve(ref)
    if (!a || !b) return false
    const r = await git(['merge-base', '--is-ancestor', a, b])
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
      await must(git, ['branch', '--no-track', safeName(name), qualifyRef(from)])
    },
    async checkout(name) {
      await must(git, ['checkout', '--quiet', safeName(name), '--'])
    },
    async currentBranch() {
      const ref = await currentBranch()
      return ref?.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : null
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
    async changedPaths() {
      const out = await must(git, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
      const parts = out.split('\0')
      const paths: string[] = []
      for (let i = 0; i < parts.length; i++) {
        const e = parts[i]
        if (e.length < 4) continue
        paths.push(e.slice(3))
        // 이름 바꿈·복사는 다음 칸이 옛 경로다
        if (e[0] === 'R' || e[0] === 'C') i++
      }
      return paths
    },
    async commitPaths(paths, message) {
      const ps = pathArgs(paths)
      await must(git, ['add', '--', ...ps])
      await must(git, ['commit', '--quiet', '--no-verify', '-m', message, '--', ...ps])
      return (await must(git, ['rev-parse', 'HEAD'])).trim()
    },
    async discardPaths(paths) {
      const ps = pathArgs(paths)
      await must(git, ['reset', '--quiet', '--', ...ps])
      const tracked = (await must(git, ['ls-tree', '-z', '--name-only', 'HEAD', '--', ...ps])).split('\0').filter((p) => p !== '')
      if (tracked.length > 0) await must(git, ['checkout', '--quiet', 'HEAD', '--', ...tracked])
      await must(git, ['clean', '--quiet', '--force', '-x', '--', ...ps])
    },
    async ignoredPaths(paths) {
      const hit: string[] = []
      for (const p of pathArgs(paths)) {
        const r = await git(['check-ignore', '--quiet', '--', p])
        if (r.code === 0) hit.push(p)
        else if (r.code !== 1) throw failure(['check-ignore'], r)
      }
      return hit
    },
    // 무시된 폴더는 한 줄(끝 /)로 받는다 — node_modules를 파일마다 나열하지 않게. 그 아래 추적 파일은 디스크에 있는지로 본다
    async ignoredTrackedIn(ref) {
      const listed = (await must(git, ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'])).split('\0').filter((p) => p !== '')
      const files = new Set(listed.filter((p) => !p.endsWith('/')))
      const dirs = listed.filter((p) => p.endsWith('/'))
      const tracked = (await must(git, ['ls-tree', '-r', '-z', '--name-only', qualifyRef(ref), '--'])).split('\0').filter((p) => p !== '')
      const hit: string[] = []
      for (const f of tracked) {
        if (files.has(f)) hit.push(f)
        else if (dirs.some((d) => f.startsWith(d)) && (await fsp.lstat(path.join(opts.cwd, f)).then(() => true, () => false))) hit.push(f)
      }
      return hit.sort()
    },
    // sha를 주면 그 커밋만 push한다(트리를 대조한 바로 그 커밋. 사이에 로컬 브랜치가 옮겨져도 따라가지 않는다).
    async push(branch, sha) {
      const b = safeName(branch)
      if (sha !== undefined && !SHA_HEX.test(sha)) throw new Error(`push할 커밋 ${JSON.stringify(sha)}이 SHA 꼴이 아니다`)
      await must(git, ['push', '--quiet', '--no-verify', remote, `${sha ?? `refs/heads/${b}`}:refs/heads/${b}`])
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
    // base는 해석한 커밋 SHA로 diff에 넘긴다(이름을 다시 읽지 않는다)
    async diffStat(base) {
      try {
        const b = await resolve(base)
        if (!b) return null
        return await withTempIndex((extra) => must(git, ['diff', '--cached', '--numstat', '-z', '--no-renames', b, '--'], extra).then(parseNumstatZ))
      } catch {
        return null
      }
    },
    // 검수에 묶는 트리. 같은 임시 인덱스 방식이라 untracked가 들어가고 `.agentdeck/`(exclude)는 빠진다.
    async worktreeTree() {
      return withTempIndex(async (extra) => (await must(git, ['write-tree'], extra)).trim())
    },
    // 상한을 넘으면 잘린 diff를 주지 않는다(tooLarge, 전체 길이). 실행기가 검수를 열지 않고 멈춘다.
    async reviewSnapshot(base) {
      try {
        const b = await resolve(base)
        if (!b) return null
        return await withTempIndex(async (extra) => {
          const tree = (await must(git, ['write-tree'], extra)).trim()
          const full = await must(git, ['diff', '--cached', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', b, '--'], extra)
          if (full.length > REVIEW_DIFF_LIMIT) return { tree, diff: '', tooLarge: true, chars: full.length }
          return { tree, diff: full, chars: full.length }
        })
      } catch {
        return null
      }
    },
    async treeOf(ref) {
      const r = await git(['rev-parse', '--verify', '--quiet', `${qualifyRef(ref)}^{tree}`])
      return r.code === 0 ? r.stdout.trim() || null : null
    },
  }

  // 진짜 인덱스를 복사한 임시 인덱스(저장소 밖)에 add -A 한 뒤 fn을 돈다. 진짜 인덱스는 건드리지 않는다.
  async function withTempIndex<T>(fn: (extra: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'agentdeck-index-'))
    try {
      const index = path.join(dir, 'index')
      const real = path.resolve(opts.cwd, (await must(git, ['rev-parse', '--git-path', 'index'])).trim())
      await fsp.copyFile(real, index).catch(() => undefined)
      const extra = { GIT_INDEX_FILE: index }
      await must(git, ['add', '-A'], extra)
      return await fn(extra)
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

// 검수 세션에 주는 diff의 상한(문자). 넘으면 자르고 잘렸다고 적는다.
export const REVIEW_DIFF_LIMIT = 400_000

// origin의 기본 브랜치(refs/remotes/origin/HEAD가 가리키는 이름). 없거나 읽지 못하면 null이다(부르는 쪽이 gh로 다시 본다).
export async function readOriginDefaultBranch(cwd: string, env: NodeJS.ProcessEnv = process.env, remote = 'origin'): Promise<string | null> {
  const git = makeGit(cwd, env, 30_000)
  const r = await git(['symbolic-ref', '--quiet', `refs/remotes/${remote}/HEAD`])
  if (r.code !== 0) return null
  const prefix = `refs/remotes/${remote}/`
  const ref = r.stdout.trim()
  const name = ref.startsWith(prefix) ? ref.slice(prefix.length) : ''
  return name && !name.startsWith('-') ? name : null
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
