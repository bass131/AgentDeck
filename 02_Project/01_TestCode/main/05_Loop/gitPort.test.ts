// 임시 폴더의 작업 저장소와 bare 원격으로 ports.ts 계약을 본다.
// untracked 포함 변경·통계, rename 옛/새 경로, 바이너리 null, 병합 실패 시 merge --abort, syncToRemote의 ff·그대로·갈라짐 throw,
// `.agentdeck/` 추적 제외(.git/info/exclude), 실행기 git은 작업 저장소의 훅을 돌리지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REVIEW_DIFF_LIMIT, createGitPort, ensureAgentdeckExcluded, qualifyRef, readOriginDefaultBranch } from '@main/05_Loop/realPorts/gitPort'
import type { GitPort } from '@main/05_Loop/ports'
import { makeTempRepos, type TempRepos } from '../00_Helpers/tempGit'

// 브랜치 이름은 전체 이름으로 읽는다. 전체 SHA·refs/ 경로·HEAD는 그대로다
describe('참조 이름 한정', () => {
  it('짧은 브랜치 이름은 refs/heads/로, SHA·refs/·HEAD는 그대로, -로 시작하면 거부한다', () => {
    expect(qualifyRef('milestone/M1')).toBe('refs/heads/milestone/M1')
    expect(qualifyRef('a'.repeat(40))).toBe('a'.repeat(40))
    expect(qualifyRef('b'.repeat(64))).toBe('b'.repeat(64))
    expect(qualifyRef('abc1234')).toBe('refs/heads/abc1234')
    expect(qualifyRef('refs/remotes/origin/x')).toBe('refs/remotes/origin/x')
    expect(qualifyRef('HEAD')).toBe('HEAD')
    expect(() => qualifyRef('--upload-pack=x')).toThrow()
  })
})

let repos: TempRepos
let git: GitPort
let hooks: string
const write = (rel: string, text: string | Buffer): void => {
  const full = path.join(repos.work, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, text)
}
const remoteHead = (branch: string): string | null => {
  try { return repos.bare(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) || null } catch { return null }
}
// 원격에 남이 push한 것을 흉내 낸다 — 다른 클론에서 커밋해 push한다.
function pushFromOtherClone(branch: string, file: string): string {
  const other = path.join(repos.root, `other-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  repos.git(['clone', '--quiet', '--branch', branch, repos.remote, other], repos.root)
  repos.git(['config', 'user.name', 'Other'], other)
  repos.git(['config', 'user.email', 'other@example.invalid'], other)
  fs.writeFileSync(path.join(other, file), 'other\n')
  repos.git(['add', '-A'], other)
  repos.git(['commit', '--quiet', '-m', 'other'], other)
  repos.git(['push', '--quiet', 'origin', branch], other)
  return repos.git(['rev-parse', 'HEAD'], other)
}

beforeEach(() => {
  repos = makeTempRepos('agentdeck-g2-git-')
  hooks = path.join(repos.root, 'no-hooks')
  fs.mkdirSync(hooks)
  git = createGitPort({ cwd: repos.work, env: repos.env, hooksPath: hooks })
})
afterEach(() => { repos.cleanup() })

describe('브랜치·머리·커밋·push', () => {
  it('체크아웃된 브랜치 이름을 읽고, 분리된 HEAD는 null이다', async () => {
    expect(await git.currentBranch?.()).toBe('master')
    await git.createBranch('agentdeck/charter-x', 'master')
    await git.checkout('agentdeck/charter-x')
    expect(await git.currentBranch?.()).toBe('agentdeck/charter-x')
    repos.git(['checkout', '--quiet', '--detach'])
    expect(await git.currentBranch?.()).toBeNull()
  })

  it('바뀐 경로를 untracked까지 읽고, 준 경로만 커밋하며, 준 경로만 머리 상태로 되돌린다', async () => {
    expect(await git.changedPaths?.()).toEqual([])
    write('docs/agentdeck/헌장.md', '# 프로젝트 헌장\n')
    write('.env', 'SECRET=1\n')
    write('README.md', '# 바뀜\n')
    expect([...(await git.changedPaths?.() ?? [])].sort()).toEqual(['.env', 'README.md', 'docs/agentdeck/헌장.md'])
    const sha = await git.commitPaths?.(['docs/agentdeck/헌장.md'], 'docs: 헌장')
    expect(repos.git(['show', '-z', '--name-only', '--format=', sha as string]).split('\0').filter((x) => x.trim() !== '')).toEqual(['docs/agentdeck/헌장.md'])
    expect([...(await git.changedPaths?.() ?? [])].sort()).toEqual(['.env', 'README.md'])
    write('docs/agentdeck/헌장.md', '# 고침\n')
    write('docs/agentdeck/Taste.md', '# 프로젝트 Taste\n')
    repos.git(['add', '--', 'docs/agentdeck/Taste.md'])
    await git.discardPaths?.(['docs/agentdeck/헌장.md', 'docs/agentdeck/Taste.md'])
    expect(fs.readFileSync(path.join(repos.work, 'docs', 'agentdeck', '헌장.md'), 'utf8')).toBe('# 프로젝트 헌장\n')
    expect(fs.existsSync(path.join(repos.work, 'docs', 'agentdeck', 'Taste.md'))).toBe(false)
    expect([...(await git.changedPaths?.() ?? [])].sort()).toEqual(['.env', 'README.md'])
    for (const bad of [[], ['../x.md'], ['/abs.md'], ['-n'], [':(glob)*'], ['']]) {
      await expect(git.commitPaths?.(bad, 'x')).rejects.toThrow(/경로/)
    }
  })

  it('무시되는 경로를 읽고, 되돌리기는 무시된 채 쓴 문서도 지운다', async () => {
    write('.gitignore', 'docs/\n')
    repos.git(['add', '.gitignore'])
    repos.git(['commit', '--quiet', '-m', 'ignore docs'])
    expect(await git.ignoredPaths?.(['docs/agentdeck/헌장.md', 'README.md'])).toEqual(['docs/agentdeck/헌장.md'])
    expect(await git.ignoredPaths?.(['README.md'])).toEqual([])
    expect(await git.ignoredPaths?.(['docs/agentdeck/Taste.md', 'README.md', 'docs/agentdeck/헌장.md'])).toEqual(['docs/agentdeck/Taste.md', 'docs/agentdeck/헌장.md'])
    write('docs/agentdeck/헌장.md', '# 프로젝트 헌장\n')
    write('docs/keep.md', '남는다\n')
    expect(await git.changedPaths?.()).toEqual([])
    await git.discardPaths?.(['docs/agentdeck/헌장.md'])
    expect(fs.existsSync(path.join(repos.work, 'docs', 'agentdeck', '헌장.md'))).toBe(false)
    expect(fs.readFileSync(path.join(repos.work, 'docs', 'keep.md'), 'utf8')).toBe('남는다\n')
  })

  it('지금 브랜치에서 무시된 채 있는 파일 가운데 다른 브랜치가 추적하는 것을 찾는다', async () => {
    repos.git(['checkout', '--quiet', '-b', 'feat/side'])
    write('.env', 'BASE=1\n')
    write('cache/keep/a.txt', 'a\n')
    repos.git(['add', '.env', 'cache/keep/a.txt'])
    repos.git(['commit', '--quiet', '-m', 'track'])
    repos.git(['checkout', '--quiet', 'master'])
    write('.gitignore', '.env\ncache/\nnode_modules/\n')
    repos.git(['add', '.gitignore'])
    repos.git(['commit', '--quiet', '-m', 'ignore'])
    expect(await git.ignoredTrackedIn?.('feat/side')).toEqual([])
    write('.env', 'MINE=1\n')
    write('node_modules/x/index.js', 'x\n')
    expect(await git.ignoredTrackedIn?.('feat/side')).toEqual(['.env'])
    write('cache/keep/a.txt', '내 것\n')
    expect(await git.ignoredTrackedIn?.('feat/side')).toEqual(['.env', 'cache/keep/a.txt'])
  })

  it('브랜치를 만들고 옮겨 가며, 머리와 계보를 읽는다', async () => {
    const m0 = await git.headSha('master')
    expect(m0).toMatch(/^[0-9a-f]{40}$/)
    expect(await git.branchExists('milestone/M1')).toBe(false)
    await git.createBranch('milestone/M1', 'master')
    expect(await git.branchExists('milestone/M1')).toBe(true)
    await git.checkout('milestone/M1')
    expect(repos.git(['symbolic-ref', '--short', 'HEAD'])).toBe('milestone/M1')
    expect(await git.headSha('no-such-branch')).toBeNull()
    expect(await git.isAncestor(m0 as string, 'milestone/M1')).toBe(true)
    expect(await git.isAncestor('0'.repeat(40), 'milestone/M1')).toBe(false)
  })

  it('변경 확인과 커밋은 untracked를 포함하고, push는 원격에 같은 머리를 남긴다', async () => {
    expect(await git.hasChanges()).toBe(false)
    write('src/new.ts', 'export const a = 1\n')
    expect(await git.hasChanges()).toBe(true)
    const sha = await git.commitAll('G1: 첫 goal')
    expect(await git.hasChanges()).toBe(false)
    expect(repos.git(['log', '-1', '--format=%s'])).toBe('G1: 첫 goal')
    expect(repos.git(['show', '--name-only', '--format=', 'HEAD'])).toBe('src/new.ts')
    await git.push('master')
    expect(remoteHead('master')).toBe(sha)
  })

  // 브랜치 이름은 refs/heads/ 전체 이름으로 읽는다. 같은 이름의 태그(작업 노드가 만들 수 있다)가 가리지 못한다
  it('같은 이름의 태그가 있어도 머리·트리·계보·가르기는 브랜치를 읽는다', async () => {
    await git.createBranch('milestone/M1', 'master')
    const branchSha = repos.git(['rev-parse', 'refs/heads/milestone/M1'])
    write('evil.txt', 'evil\n')
    repos.git(['add', '-A'])
    repos.git(['commit', '--quiet', '-m', 'evil'])
    const evil = repos.git(['rev-parse', 'HEAD'])
    repos.git(['tag', 'milestone/M1', evil])
    repos.git(['tag', 'master', evil])
    expect(await git.headSha('milestone/M1')).toBe(branchSha)
    expect(await git.treeOf('milestone/M1')).toBe(repos.git(['rev-parse', 'refs/heads/milestone/M1^{tree}']))
    expect(await git.isAncestor(evil, 'milestone/M1')).toBe(false)
    // SHA를 주면 그 커밋을 읽는다
    expect(await git.treeOf(evil)).toBe(repos.git(['rev-parse', `${evil}^{tree}`]))
    repos.git(['reset', '--quiet', '--hard', 'refs/heads/milestone/M1'])
    await git.createBranch('goal/M1-G1', 'milestone/M1')
    expect(repos.git(['rev-parse', 'refs/heads/goal/M1-G1'])).toBe(branchSha)
  })

  // push는 대조한 SHA 하나를 `<sha>:refs/heads/<b>`로 올린다. 그 뒤 로컬 브랜치가 앞서도 원격은 그 SHA다
  it('SHA를 주면 그 커밋만 push한다 — 로컬 브랜치가 그 뒤로 움직였어도', async () => {
    write('a.ts', 'a\n')
    const checked = await git.commitAll('checked')
    write('b.ts', 'b\n')
    await git.commitAll('after')
    await git.push('master', checked)
    expect(remoteHead('master')).toBe(checked)
    await expect(git.push('master', 'not-a-sha')).rejects.toThrow()
  })

  it('실행기 git은 작업 저장소의 훅을 돌리지 않는다(hooksPath를 빈 폴더로)', async () => {
    write('.git/hooks/pre-commit', '#!/bin/sh\necho hook-ran >&2\nexit 1\n')
    fs.chmodSync(path.join(repos.work, '.git/hooks/pre-commit'), 0o755)
    write('x.txt', 'x\n')
    // 비교군 — hooksPath가 없으면 이 저장소의 훅이 돌아 커밋이 막힌다(--no-verify가 못 막는 훅도 있어 hooksPath로 끈다)
    const plain = createGitPort({ cwd: repos.work, env: repos.env })
    write('.git/hooks/post-checkout', '#!/bin/sh\necho checkout-hook >&2\nexit 1\n')
    fs.chmodSync(path.join(repos.work, '.git/hooks/post-checkout'), 0o755)
    await plain.createBranch('probe', 'master')
    await expect(plain.checkout('probe')).rejects.toThrow(/checkout-hook/)
    await git.checkout('master')
    await expect(git.checkout('probe')).resolves.toBeUndefined()
    await expect(git.commitAll('훅 무시')).resolves.toMatch(/^[0-9a-f]{40}$/)
  })
})

// 실행기가 원격과 로컬을 대조하는 데 쓰는 읽기
describe('remoteSha·parents', () => {
  it('원격 머리를 ls-remote로 읽고, 원격에 없는 브랜치는 null이다', async () => {
    expect(await git.remoteSha('master')).toBe(remoteHead('master'))
    expect(await git.remoteSha('no-such-branch')).toBeNull()
    write('a.txt', 'a\n')
    await git.commitAll('로컬만')
    expect(await git.remoteSha('master')).not.toBe(await git.headSha('master'))
  })

  it('병합 커밋의 부모는 첫 부모, 병합한 머리 순이다', async () => {
    const base = await git.headSha('master') as string
    await git.createBranch('side', 'master')
    await git.checkout('side')
    write('s.txt', 's\n')
    const side = await git.commitAll('옆')
    await git.checkout('master')
    const merged = await git.mergeNoFf(side, '병합')
    expect(await git.parents(merged)).toEqual([base, side])
    expect(await git.parents(side)).toEqual([base])
  })

  it('작업 저장소의 훅 폴더가 아니라 주어진 hooksPath가 없으면(존재하지 않는 경로) 훅 없이 돈다', async () => {
    const none = createGitPort({ cwd: repos.work, env: repos.env, hooksPath: path.join(repos.root, 'never', 'hooks') })
    write('.git/hooks/pre-commit', '#!/bin/sh\nexit 1\n')
    fs.chmodSync(path.join(repos.work, '.git/hooks/pre-commit'), 0o755)
    write('y.txt', 'y\n')
    await expect(none.commitAll('훅 없음')).resolves.toMatch(/^[0-9a-f]{40}$/)
  })
})

describe('.agentdeck/ 추적 제외', () => {
  it('exclude 줄이 없으면 한 번 더하고, 있으면 그대로 둔다 — 상태 파일은 변경으로 잡히지 않는다', async () => {
    expect(await ensureAgentdeckExcluded(repos.work, repos.env)).toBe('added')
    expect(await ensureAgentdeckExcluded(repos.work, repos.env)).toBe('present')
    const exclude = fs.readFileSync(path.join(repos.work, '.git/info/exclude'), 'utf8')
    expect(exclude.split(/\r?\n/).filter((l) => l.trim() === '.agentdeck/')).toHaveLength(1)
    write('.agentdeck/run-state.json', '{}\n')
    expect(await git.hasChanges()).toBe(false)
    expect(repos.git(['status', '--porcelain'])).toBe('')
  })

  it('끝 줄바꿈이 없는 exclude 파일에도 줄을 따로 더한다', async () => {
    fs.writeFileSync(path.join(repos.work, '.git/info/exclude'), '# 기존\n*.log')
    await ensureAgentdeckExcluded(repos.work, repos.env)
    expect(fs.readFileSync(path.join(repos.work, '.git/info/exclude'), 'utf8')).toBe('# 기존\n*.log\n.agentdeck/\n')
  })
})

describe('diffStat — 작업 트리와 base의 차이', () => {
  it('untracked 포함, rename은 옛·새 경로 둘 다, 바이너리는 null, .agentdeck/는 뺀다', async () => {
    await ensureAgentdeckExcluded(repos.work, repos.env)
    write('src/keep.ts', 'a\nb\nc\n')
    write('src/old-name.ts', Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n') + '\n')
    await git.commitAll('base')
    await git.createBranch('milestone/M1', 'master')
    write('src/keep.ts', 'a\nB\nc\nd\n')
    fs.renameSync(path.join(repos.work, 'src/old-name.ts'), path.join(repos.work, 'src/new-name.ts'))
    write('src/untracked.ts', 'u1\nu2\n')
    write('assets/logo.bin', Buffer.from([0, 1, 2, 3, 0, 255, 0, 10]))
    write('.agentdeck/run-state.json', '{"big": true}\n')
    const stat = await git.diffStat('milestone/M1')
    expect(stat).not.toBeNull()
    const byPath = new Map((stat ?? []).map((f) => [f.path, f]))
    expect(byPath.get('src/keep.ts')).toEqual({ path: 'src/keep.ts', added: 2, removed: 1 })
    expect(byPath.get('src/old-name.ts')).toEqual({ path: 'src/old-name.ts', added: 0, removed: 20 })
    expect(byPath.get('src/new-name.ts')).toEqual({ path: 'src/new-name.ts', added: 20, removed: 0 })
    expect(byPath.get('src/untracked.ts')).toEqual({ path: 'src/untracked.ts', added: 2, removed: 0 })
    expect(byPath.get('assets/logo.bin')).toEqual({ path: 'assets/logo.bin', added: null, removed: null })
    expect([...byPath.keys()].some((p) => p.startsWith('.agentdeck'))).toBe(false)
    // 통계는 진짜 인덱스를 건드리지 않는다
    expect(repos.git(['diff', '--cached', '--name-only'])).toBe('')
  })

  it('base를 읽지 못하면 null이다(등급은 강이 된다)', async () => {
    expect(await git.diffStat('no-such-base')).toBeNull()
  })
})

describe('검수 스냅숏과 트리 해시 (M09 G4)', () => {
  it('작업 트리(untracked 포함, .agentdeck/ 제외)의 트리 해시와 base 대비 diff를 진짜 인덱스를 건드리지 않고 만든다', async () => {
    await ensureAgentdeckExcluded(repos.work, repos.env)
    await git.createBranch('milestone/M1', 'master')
    write('src/a.ts', 'export const a = 1\n')
    write('.agentdeck/run-state.json', '{}\n')
    const snap = await git.reviewSnapshot('milestone/M1')
    expect(snap?.tree).toMatch(/^[0-9a-f]{40}$/)
    expect(snap?.diff).toContain('+export const a = 1')
    expect(snap?.diff).toContain('src/a.ts')
    expect(snap?.diff).not.toContain('.agentdeck')
    expect(await git.worktreeTree()).toBe(snap?.tree)
    expect(repos.git(['diff', '--cached', '--name-only'])).toBe('')
    // 커밋하면 그 커밋의 트리가 검수한 트리와 같다
    await git.commitAll('a')
    expect(await git.treeOf('master')).toBe(snap?.tree)
    write('src/a.ts', 'export const a = 2\n')
    expect(await git.worktreeTree()).not.toBe(snap?.tree)
  })

  it('base를 읽지 못하면 스냅숏은 null이고, 없는 ref의 트리도 null이다', async () => {
    expect(await git.reviewSnapshot('no-such-base')).toBeNull()
    expect(await git.treeOf('no-such-branch')).toBeNull()
  })

  // 잘린 diff로 검수하지 않는다. 상한을 넘으면 diff를 싣지 않고 넘었다는 표시와 전체 길이를 준다(실행기가 멈춘다)
  it('diff가 상한을 넘으면 잘린 diff를 주지 않고 tooLarge와 전체 길이를 준다 — 상한 안이면 전문과 길이', async () => {
    const base = await git.headSha('master') as string
    write('big.txt', `${'x'.repeat(100)}\n`.repeat(6000))
    const snap = await git.reviewSnapshot(base)
    expect(snap?.tooLarge).toBe(true)
    expect(snap?.chars).toBeGreaterThan(REVIEW_DIFF_LIMIT)
    expect(snap?.diff).toBe('')
    fs.rmSync(path.join(repos.work, 'big.txt'))
    write('small.txt', 'small\n')
    const ok = await git.reviewSnapshot(base)
    expect(ok?.tooLarge ?? false).toBe(false)
    expect(ok?.diff).toContain('small.txt')
    expect(ok?.chars).toBe(ok?.diff.length)
  })
})

describe('origin의 기본 브랜치 읽기 (M09 G4)', () => {
  it('refs/remotes/origin/HEAD가 가리키는 브랜치 이름을 읽고, 없으면 null이다', async () => {
    repos.git(['remote', 'set-head', 'origin', 'master'])
    expect(await readOriginDefaultBranch(repos.work, repos.env)).toBe('master')
    repos.git(['remote', 'set-head', 'origin', '--delete'])
    expect(await readOriginDefaultBranch(repos.work, repos.env)).toBeNull()
  })
})

describe('mergeNoFf', () => {
  it('--no-ff 병합 커밋(부모 둘)을 만들고 SHA를 돌려준다', async () => {
    await git.createBranch('goal/M1-G1', 'master')
    await git.checkout('goal/M1-G1')
    write('src/g1.ts', 'g1\n')
    const head = await git.commitAll('G1')
    await git.checkout('master')
    const merged = await git.mergeNoFf(head, 'Merge PR #1: G1')
    expect(repos.git(['rev-parse', 'HEAD'])).toBe(merged)
    expect(repos.git(['log', '-1', '--format=%P']).split(' ')).toHaveLength(2)
    expect(repos.git(['log', '-1', '--format=%s'])).toBe('Merge PR #1: G1')
  })

  it('충돌하면 merge --abort로 되돌린 뒤 throw한다', async () => {
    await git.createBranch('goal/M1-G1', 'master')
    await git.checkout('goal/M1-G1')
    write('README.md', 'goal 쪽\n')
    const head = await git.commitAll('G1')
    await git.checkout('master')
    write('README.md', 'master 쪽\n')
    const before = await git.commitAll('master 변경')
    await expect(git.mergeNoFf(head, 'Merge')).rejects.toThrow()
    expect(repos.git(['rev-parse', 'HEAD'])).toBe(before)
    expect(fs.existsSync(path.join(repos.work, '.git/MERGE_HEAD'))).toBe(false)
    expect(repos.git(['status', '--porcelain'])).toBe('')
  })
})

// 작업 노드가 `git replace <PR 머리> <악성 커밋>`을 심으면, 교체 객체를 따르는 git의 `merge --no-ff`는
// 부모를 원래 SHA로 적고 트리는 악성 것으로 만든다(CI를 거치지 않은 트리가 원격에 간다). 실행기 git은 교체 객체를 따르지 않는다
// (GIT_NO_REPLACE_OBJECTS=1, -c core.useReplaceRefs=false). 판정은 교체 참조가 없는 bare 원격에서 읽는다.
describe('교체 객체(git replace)를 따르지 않는다 (G2 재검수 차단 A)', () => {
  const names = (tree: string): string[] => tree.split(/\r?\n/).filter(Boolean)
  // base 위에 파일 하나를 더한 트리를 만들고(작업 트리·브랜치는 그대로 둔다), 그 트리로 base의 부모를 가진 커밋을 만든다
  function forge(base: string, file: string): { tree: string; commit: string } {
    repos.git(['checkout', '--quiet', '-b', `forge-${file}`, base])
    write(file, 'evil\n')
    repos.git(['add', file])
    repos.git(['commit', '--quiet', '-m', 'forge'])
    const tree = repos.git(['rev-parse', 'HEAD^{tree}'])
    repos.git(['checkout', '--quiet', 'master'])
    const parent = repos.git(['rev-list', '--parents', '-n', '1', base]).split(' ').slice(1)
    const commit = repos.git(['commit-tree', tree, ...parent.flatMap((p) => ['-p', p]), '-m', 'G1'])
    return { tree, commit }
  }
  async function goalHead(): Promise<{ ci: string; ciTree: string; before: string }> {
    const before = await git.headSha('master') as string
    await git.createBranch('goal/M1-G1', 'master')
    await git.checkout('goal/M1-G1')
    write('src/g1.ts', 'g1\n')
    const ci = await git.commitAll('G1')
    await git.checkout('master')
    return { ci, ciTree: repos.git(['rev-parse', `${ci}^{tree}`]), before }
  }

  it('PR 머리와 마일스톤 머리를 바꿔치기해도 원격의 병합 트리에 악성 파일이 없고, 둘째 부모의 트리는 CI 머리의 트리다', async () => {
    const { ci, ciTree, before } = await goalHead()
    const evilGoal = forge(ci, 'evil-goal.txt')
    const evilBase = forge(before, 'evil-base.txt')
    repos.git(['replace', ci, evilGoal.commit])
    repos.git(['replace', before, evilBase.commit])
    // 비교군 — 교체 객체를 따르는 평범한 git의 병합은 악성 트리를 싣는다(이 git 판에서 공격이 실제로 된다).
    // 따로 된 작업 트리(worktree)에서 돌려 작업 저장소의 인덱스를 건드리지 않는다.
    const control = path.join(repos.root, 'control')
    repos.git(['worktree', 'add', '--quiet', '-b', 'control', control, 'master'])
    repos.git(['merge', '--quiet', '--no-ff', '-m', 'control', ci], control)
    // (마일스톤 쪽 교체는 병합 기준점도 같이 바꿔 이 꼴에서는 상쇄된다 — PR 머리 쪽 악성 파일이 실린다)
    expect(names(repos.git(['ls-tree', '-r', '--name-only', 'HEAD'], control))).toContain('evil-goal.txt')
    expect(repos.git(['rev-parse', 'HEAD^2'], control)).toBe(ci)

    const merged = await git.mergeNoFf(ci, 'Merge PR #1: G1')
    await git.push('master')
    expect(remoteHead('master')).toBe(merged)
    const remoteFiles = names(repos.bare(['ls-tree', '-r', '--name-only', 'master']))
    expect(remoteFiles).toContain('src/g1.ts')
    expect(remoteFiles).not.toContain('evil-goal.txt')
    expect(remoteFiles).not.toContain('evil-base.txt')
    expect(repos.bare(['rev-parse', 'master^1'])).toBe(before)
    expect(repos.bare(['rev-parse', 'master^2'])).toBe(ci)
    expect(repos.bare(['rev-parse', 'master^2^{tree}'])).toBe(ciTree)
    // 실행기의 다른 읽기도 교체 객체를 따르지 않는다 — 부모는 진짜 커밋의 부모다
    expect(await git.parents(ci)).toEqual([before])
    expect(await git.verifyMerge(merged, before, ci)).toBeNull()
  })

  it('verifyMerge — 부모가 (앞 머리, PR 머리)여도 트리가 두 부모의 깨끗한 병합이 아닌 위조 커밋은 사유를 돌려준다', async () => {
    const { ci, before } = await goalHead()
    const evil = forge(ci, 'evil.txt')
    // 작업 노드가 commit-tree로 만들 수 있는 「재개 꼴」 병합 커밋 — 부모는 맞고 트리는 CI를 거치지 않았다
    const forged = repos.git(['commit-tree', evil.tree, '-p', before, '-p', ci, '-m', 'Merge PR #1: G1'])
    expect(await git.verifyMerge(forged, before, ci)).toMatch(/트리/)
    const merged = await git.mergeNoFf(ci, 'Merge PR #1: G1')
    expect(await git.verifyMerge(merged, before, ci)).toBeNull()
    expect(await git.verifyMerge(merged, ci, before)).toMatch(/부모/)
    expect(await git.verifyMerge(ci, before, ci)).toMatch(/부모/)
  })
})

describe('syncToRemote', () => {
  it('원격에 브랜치가 없으면 그대로 두고 로컬 머리를 돌려준다', async () => {
    await git.createBranch('milestone/M1', 'master')
    const local = await git.headSha('milestone/M1')
    expect(await git.syncToRemote('milestone/M1')).toBe(local)
  })

  it('원격이 앞서면 fast-forward한다 — 체크아웃된 브랜치와 아닌 브랜치 모두', async () => {
    const ahead = pushFromOtherClone('master', 'remote-1.txt')
    expect(await git.syncToRemote('master')).toBe(ahead)
    expect(fs.existsSync(path.join(repos.work, 'remote-1.txt'))).toBe(true)
    await git.createBranch('side', 'master')
    await git.push('side')
    const sideAhead = pushFromOtherClone('side', 'remote-2.txt')
    expect(repos.git(['symbolic-ref', '--short', 'HEAD'])).toBe('master')
    expect(await git.syncToRemote('side')).toBe(sideAhead)
    expect(await git.headSha('side')).toBe(sideAhead)
  })

  it('같거나 로컬이 앞서면 그대로 둔다', async () => {
    const m0 = await git.headSha('master')
    expect(await git.syncToRemote('master')).toBe(m0)
    write('local.txt', 'l\n')
    const local = await git.commitAll('local ahead')
    expect(await git.syncToRemote('master')).toBe(local)
  })

  it('갈라졌으면 throw하고 로컬을 바꾸지 않는다', async () => {
    pushFromOtherClone('master', 'remote-3.txt')
    write('local.txt', 'l\n')
    const local = await git.commitAll('local')
    await expect(git.syncToRemote('master')).rejects.toThrow(/갈라/)
    expect(await git.headSha('master')).toBe(local)
  })
})
