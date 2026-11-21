// 루프 잠금의 읽기 전용 꼴 — 검수 세션(reviewSession.ts)에 붙는다. 작업 노드 잠금의 거부는 그대로 두고, 그 위에
// 저장소 안 쓰기 전부(편집 도구·쓰기 명령·리다이렉트), 읽기 목록 밖 git 하위 명령, 로컬에 내려받는 gh(pr checkout·repo clone·
// run download), 패키지 설치를 거부한다. 읽기 명령은 지나간다. 인터프리터·npm 스크립트의 안은 판독하지 않는다(실행기의 트리 대조가 본다).
import { describe, expect, it } from 'vitest'
import { buildLoopLockHook, loopLockReason, type LoopLockScope } from '@main/04_Claude/permission/loopLock'

const TEMP = 'C:\\Users\\u\\AppData\\Local\\Temp'
const BASE: LoopLockScope = {
  repoRoot: 'C:\\work\\repo',
  appLoopDir: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop',
  tempDirs: [TEMP],
  vars: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming', HOME: 'C:\\Users\\u', USERPROFILE: 'C:\\Users\\u', TEMP, TMP: TEMP },
  isDir: () => true,
}
const RO: LoopLockScope = { ...BASE, readOnly: true }
const bash = (command: string, scope = RO): string | null => loopLockReason('Bash', { command }, scope)

describe('읽기 전용 루프 잠금 (M09 G4)', () => {
  it('편집 도구는 경로와 관계없이 거부한다 — 작업 노드 잠금에서는 같은 경로가 지나간다', () => {
    for (const tool of ['Write', 'Edit', 'MultiEdit', 'NotebookEdit']) {
      const input = tool === 'NotebookEdit' ? { notebook_path: 'C:\\work\\repo\\a.ipynb' } : { file_path: 'C:\\work\\repo\\src\\a.ts' }
      expect(loopLockReason(tool, input, RO)).toContain('읽기 전용')
      expect(loopLockReason(tool, input, BASE)).toBeNull()
    }
    expect(loopLockReason('Write', { file_path: `${TEMP}\\notes.md` }, RO)).toContain('읽기 전용')
  })

  it('저장소 안에 쓰는 명령과 리다이렉트는 거부하고, 임시 폴더에 쓰는 것은 지나간다', () => {
    for (const cmd of [
      'echo x > src/a.ts', 'rm -rf src', 'mv a.ts b.ts', 'touch new.ts', 'cp README.md docs/', "sed -i 's/a/b/' src/a.ts",
      'cd src && echo x > a.ts', 'rm src/*.ts', 'rm *.md', 'tee out.txt < README.md',
    ]) expect(bash(cmd), cmd).toContain('읽기 전용')
    expect(bash(`echo x > ${TEMP.replace(/\\/g, '/')}/review.txt`)).toBeNull()
    expect(bash('echo x > /dev/null')).toBeNull()
    // 보호 폴더 쓰기는 읽기 전용 사유가 아니라 원래 사유로 거부된다(먼저 맞는 쪽)
    expect(bash('echo x > .git/config')).not.toBeNull()
  })

  it('읽기 명령은 지나간다 — cd로 저장소 안 폴더를 옮겨 다니는 것도', () => {
    for (const cmd of [
      'git status', 'git log --oneline -5', 'git diff HEAD~1 -- src', 'git show HEAD:README.md', 'git ls-files', 'git blame src/a.ts',
      'git grep -n foo', 'git rev-parse HEAD', 'git branch', 'git branch -a', 'git branch --list "goal/*"', 'git config --get user.name',
      'git cat-file -p HEAD', 'git merge-base HEAD master', 'cat README.md', 'ls -la', 'grep -rn foo src', 'cd src && ls', 'rg foo',
      'gh pr view 1', 'gh pr diff 1', 'gh api repos/o/r/pulls', 'git remote -v', 'git --no-pager log -1',
    ]) expect(bash(cmd), cmd).toBeNull()
  })

  it('읽기 목록 밖 git 하위 명령과 쓰는 꼴의 branch는 거부한다', () => {
    for (const cmd of [
      'git add .', 'git commit -m x', 'git checkout -b x', 'git switch main', 'git reset --hard', 'git stash', 'git restore src/a.ts',
      'git merge x', 'git rebase main', 'git cherry-pick abc', 'git tag v1', 'git fetch', 'git pull', 'git apply p.diff', 'git am p.mbox',
      'git worktree add ../w', 'git clone x y', 'git gc', 'git branch new-branch', 'git branch -D x', 'git branch -m a b', 'git notes add -m x',
      'git config user.name x', 'git reflog expire --all', 'git branch -u origin/x', 'git branch --set-upstream-to=origin/x',
      'git diff --output=out.patch', 'git log --output out.txt', 'git remote update', 'git remote prune origin',
    ]) expect(bash(cmd), cmd).not.toBeNull()
  })

  it('로컬에 내려받는 gh와 패키지 설치는 거부한다', () => {
    for (const cmd of [
      'gh pr checkout 1', 'gh repo clone o/r', 'gh run download 1', 'npm install', 'npm i lodash', 'npm ci', 'pnpm add x', 'pnpm install',
      'yarn add x', 'yarn', 'bun install', 'npx some-tool', 'pip install x', 'npm.cmd install', 'pnpm dlx x',
    ]) expect(bash(cmd), cmd).not.toBeNull()
    // 작업 노드 잠금에서는 로컬 설치가 지나간다(비교군)
    expect(bash('npm install', BASE)).toBeNull()
    expect(bash('gh pr checkout 1', BASE)).toBeNull()
  })

  // 붙여 쓴 -u값, 파일을 여는 git grep, 명령을 돌리는 환경 대입, 설치 꼴의 다른 이름들
  it('붙여 쓴 branch -u, git grep -O, 명령을 돌리는 GIT_* 대입, pip3.x·python -m pip·uvx·corepack 설치를 거부한다', () => {
    for (const cmd of [
      'git branch -uorigin/x', 'git branch -u=origin/x', 'git branch --set-upstream-to origin/x', 'git branch --unset-upstream',
      'git grep -Ovim foo', 'git grep -O foo', 'git grep --open-files-in-pager=vim foo', 'git grep --open-files-in-pager foo',
      'GIT_EXTERNAL_DIFF=./x.sh git diff', 'GIT_PAGER="sh -c x" git log', 'env GIT_EXTERNAL_DIFF=./x.sh git diff',
      'env -i GIT_PAGER=./p git log', 'PAGER=./p git log', 'GIT_EDITOR=./e git log', 'export GIT_PAGER=./p; git log',
      'git -c core.pager=./p log', 'git branch -vu origin/x',
      'pip3.12 install x', 'pip3 install x', 'python -m pip install x', 'python3 -m pip install x', 'py -m pip install x',
      'uvx some-tool', 'uv pip install x', 'corepack pnpm install', 'corepack yarn add x', 'corepack npm install',
    ]) expect(bash(cmd), cmd).not.toBeNull()
    // 읽기 꼴은 그대로 지나간다
    for (const cmd of ['git grep -n foo', 'git grep -o foo', 'git branch -a', 'GIT_DIR=.git git log -1', 'python -m pip list', 'pip3.12 list', 'git branch -vv']) {
      expect(bash(cmd), cmd).toBeNull()
    }
    // 작업 노드 잠금에서는 같은 설치가 지나간다(비교군)
    expect(bash('python -m pip install x', BASE)).toBeNull()
  })

  // 편집 도구 거부는 입력의 command 칸 판독보다 먼저다
  it('편집 도구는 입력에 command 칸이 있어도 읽기 전용 사유로 거부한다', () => {
    expect(loopLockReason('Write', { file_path: `${TEMP}\\a.md`, command: 'ls' }, RO)).toContain('읽기 전용')
    expect(loopLockReason('Edit', { command: 'ls' }, RO)).toContain('읽기 전용')
    expect(loopLockReason('NotebookEdit', { notebook_path: 'C:\\work\\repo\\a.ipynb', command: 'cat a' }, RO)).toContain('읽기 전용')
    // Bash의 command는 그대로 명령으로 판독한다. 작업 노드 잠금의 편집 도구는 command 칸이 있어도 경로로 본다
    expect(loopLockReason('Bash', { command: 'ls' }, RO)).toBeNull()
    expect(loopLockReason('Write', { file_path: 'C:\\work\\repo\\.git\\config', command: 'ls' }, BASE)).not.toBeNull()
  })

  it('읽기 전용 꼴이어도 cd로 보호 폴더·저장소 밖으로 옮기는 꼴은 원래대로 거부한다', () => {
    expect(bash('cd .git && ls')).not.toBeNull()
    expect(bash('cd C:/Users/u && ls')).not.toBeNull()
  })

  it('작업 노드 잠금의 거부(원격 쓰기·자격·MCP)는 그대로다', () => {
    expect(bash('git push')).not.toBeNull()
    expect(bash('gh auth token')).not.toBeNull()
    expect(loopLockReason('mcp__github__create_issue', {}, RO)).not.toBeNull()
  })

  it('훅으로 붙여도 같다 — 읽기 전용 훅은 저장소 안 쓰기를 거부한다', async () => {
    const hook = buildLoopLockHook(RO)
    const out = await hook.hooks[0](
      { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo x > a.ts' } }, 't', { signal: new AbortController().signal })
    expect(out.hookSpecificOutput?.permissionDecision).toBe('deny')
  })
})
