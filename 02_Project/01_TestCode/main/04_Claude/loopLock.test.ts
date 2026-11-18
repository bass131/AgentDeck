// M09 G2 루프 잠금 노드 — 작업 노드 세션의 원격 쓰기·자격 꺼내기·설정 심기·실행기 몫 파일 쓰기를 질문 없이 거부하고,
// 로컬 작업(상태 보기·커밋·노드 문서 쓰기·읽기 명령)은 지나가는지 표로 고정한다. 판정은 명령 글자의 겹이다(loopLock.ts 머리 주석).
import { describe, it, expect } from 'vitest'
import {
  buildLoopLockHook,
  loopCommandReason,
  loopLockReason,
  loopPathReason,
  LOOP_LOCK_NODE,
  type LoopLockScope,
} from '@main/04_Claude/permission/loopLock'
import { listControlNodes } from '@main/04_Claude/permission/controlNodes'

const SCOPE: LoopLockScope = {
  repoRoot: 'C:\\work\\repo',
  appLoopDir: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop',
}

const DENY_REMOTE = [
  'git push',
  'git push origin HEAD:main',
  'git push --force origin feat/x',
  'git -C ../other push',
  'git -c core.quotepath=false push origin x',
  'git --git-dir=.git push',
  'git --git-dir .git --work-tree . push',
  '"C:/Program Files/Git/cmd/git.exe" push',
  '/usr/bin/git push',
  'GIT PUSH',
  'Git Push origin main',
  'git status && git push',
  'git add . ; git push',
  'echo hi | git push',
  'git commit -m x\ngit push',
  'echo $(git push)',
  'git commit -m "x $(git push)"',
  'echo "`git push`"',
  'bash -c "git push"',
  "sh -c 'git push origin main'",
  'cmd /c git push',
  'powershell -Command "git push"',
  'sudo git push',
  'env FOO=1 git push',
  'timeout 10 git push',
  'git-push origin main',
  'git send-pack origin main',
  'git -c alias.p=push p',
  'git remote add evil https://example.com/x.git',
  'git remote set-url origin https://example.com/x.git',
  'git remote remove origin',
  'git remote rename origin up',
  'gh pr create --fill',
  'gh pr merge 1',
  'gh pr close 1',
  'gh pr edit 1 --title x',
  'gh pr comment 1 -b x',
  'gh pr review 1 --approve',
  'gh pr ready 1',
  'gh -R o/r pr create',
  'GH PR CREATE',
  'gh.exe pr create',
  'gh repo create x --private',
  'gh repo edit --visibility public',
  'gh repo delete o/r --yes',
  'gh repo rename y',
  'gh repo archive',
  'gh release create v1',
  'gh workflow run ci.yml',
  'gh secret set X',
  'gh variable set X',
  'gh api -X POST repos/o/r/pulls',
  'gh api --method PATCH repos/o/r',
  'gh api --method=DELETE repos/o/r',
  'gh api -XPUT repos/o/r/topics',
  'gh api -X post repos/o/r/issues',
  'gh api repos/o/r/issues -f title=x',
  'gh api repos/o/r/issues -F n=1',
  'gh api repos/o/r/issues --input body.json',
  "gh api graphql -f query='mutation { x }'",
  'git status; gh pr create --fill',
  'git lfs push origin main',
  "git submodule foreach 'git push'",
  'gh pr create --title x --body -h',
  'gh pr create --help',
]

const DENY_CREDENTIAL = [
  'gh auth token',
  'gh auth status',
  'gh auth login --with-token',
  'gh auth setup-git',
  'git credential fill',
  'git credential-manager get',
  'git-credential-manager get',
  'git-credential-manager.exe get',
  'credential-manager get',
  'git -c credential.helper=manager fetch',
  'GH_TOKEN= gh api user',
  'GH_TOKEN=abc',
  'gh_token=x gh api user',
  'export GITHUB_TOKEN=x',
  'GH_CONFIG_DIR=/home/u/.config/gh gh pr list',
  'GIT_CONFIG_GLOBAL=~/.gitconfig git fetch',
  'GIT_CONFIG_COUNT=0 git fetch',
  'GIT_CONFIG_NOSYSTEM=0 git fetch',
  'GCM_CREDENTIAL_STORE=wincred git fetch',
  'env -u GH_TOKEN gh api user',
  'env --unset=GH_CONFIG_DIR gh api user',
  'env -i bash',
  'unset GH_TOKEN',
  'unset GH_CONFIG_DIR GCM_INTERACTIVE',
  'git status && unset GH_TOKEN && gh api user',
  '$env:GH_TOKEN = ""',
  'Remove-Item Env:\\GH_TOKEN',
  '[Environment]::SetEnvironmentVariable("GH_TOKEN", $null)',
  'git --config-env=credential.helper=X fetch',
  'setx GH_TOKEN x',
  'env -uGH_TOKEN gh api user',
]

const DENY_CONFIG = [
  'git config credential.helper manager',
  'git config --global core.sshCommand ssh',
  'git config --add x.y z',
  'git config --unset credential.helper',
  'git config set core.hooksPath x',
  'git config -e',
  'git -C . config user.name x',
  'echo "#!/bin/sh" > .git/hooks/pre-commit',
  'echo x>.git/hooks/pre-commit',
  'cat a >> .git/config',
  'cp evil .git/hooks/post-commit',
  'tee .git/info/exclude',
  'sed -i s/x/y/ .git/config',
  'rm .git/info/exclude',
  'chmod +x .git/hooks/pre-push',
  'Set-Content .git\\config x',
  'echo x > .GIT/CONFIG',
  'dd if=x of=.git/config',
]

const DENY_EXECUTOR_FILES = [
  'echo {} > .agentdeck/run-state.json',
  'echo x > ./.agentdeck/run-state.json',
  'echo x > .agentdeck\\run-state.json',
  'rm .agentdeck/run-state.json',
  'mv x .agentdeck/verification.md',
  "sed -i 's/FAIL/PASS/' .agentdeck/verification.md",
  'cp /tmp/s .agentdeck/run-state.json',
  'rm -rf .agentdeck',
  'tee -a .agentdeck/verification.md',
  'rm .agentdeck/*',
  'git clean -fdx',
  'git clean -X -f',
  'echo x > C:/Users/u/AppData/Roaming/agentdeck/loop/digests/k',
  'rm -rf /c/Users/u/AppData/Roaming/agentdeck/loop',
  'echo x > "C:\\work\\repo\\.agentdeck\\run-state.json"',
  "perl -pi -e 's/FAIL/PASS/' .agentdeck/verification.md",
]

const ALLOW = [
  'git status',
  'git diff --stat',
  'git log --oneline -5',
  'git add -A',
  'git commit -m "feat: x"',
  'git branch',
  'git branch -a',
  'git checkout -b feat/x',
  'git switch main',
  'git fetch origin',
  'git clean -fd',
  'git remote -v',
  'git remote get-url origin',
  'git -c core.quotepath=false diff',
  'git config --get user.name',
  'git config --list',
  'git config user.email',
  'git config get user.name',
  'git commit -m "docs: git push는 실행기가 한다"',
  "git commit -m 'gh pr create 안 함'",
  'grep -r "gh pr create" .',
  'gh pr view 1',
  'gh pr list',
  'gh pr checks 1',
  'gh api repos/o/r/pulls',
  'gh api -X GET repos/o/r',
  'cat .agentdeck/verification.md',
  'cat .agentdeck/run-state.json | jq .',
  'cat .git/config',
  'ls .git/hooks',
  'echo x > .agentdeck/goals/g1.md',
  'echo x >> .agentdeck/decisions.md',
  'echo x > .agentdeck/milestone-spec.md',
  'npm test 2>&1',
  'git status 2>&1 | head',
  'echo GH_TOKEN=x',
  'rm -rf node_modules',
  'rm *.md',
  'echo push > notes.txt',
]

function table(name: string, cases: string[], expectDeny: boolean): void {
  describe(name, () => {
    for (const cmd of cases) {
      it(JSON.stringify(cmd), () => {
        const reason = loopCommandReason(cmd, SCOPE)
        if (expectDeny) expect(reason).not.toBeNull()
        else expect(reason).toBeNull()
      })
    }
  })
}

table('loop-lock — 원격 쓰기는 거부한다 (M09 G2)', DENY_REMOTE, true)
table('loop-lock — 자격 꺼내기·환경 되돌리기는 거부한다 (M09 G2)', DENY_CREDENTIAL, true)
table('loop-lock — git 설정·훅 심기는 거부한다 (M09 G2)', DENY_CONFIG, true)
table('loop-lock — 실행기 몫 파일·앱 영역 쓰기는 거부한다 (M09 G2)', DENY_EXECUTOR_FILES, true)
table('loop-lock — 로컬 작업과 읽기는 지나간다 (M09 G2)', ALLOW, false)

describe('loop-lock 판독 한도 (M09 G2)', () => {
  it('명령 치환 중첩이 판독 한도(4)를 넘으면 막는다 — 한도 안은 판독한다', () => {
    expect(loopCommandReason('echo $(echo $(echo $(echo $(echo $(echo hi)))))', SCOPE)).toContain('중첩')
    expect(loopCommandReason('echo $(echo $(echo $(echo $(echo hi))))', SCOPE)).toBeNull()
    expect(loopCommandReason('echo $(echo $(echo $(echo $(git push))))', SCOPE)).not.toBeNull()
  })
})

describe('loop-lock 거부 사유 (M09 G2)', () => {
  it('모든 사유가 「원격은 실행기 코드만」과 「노드는 로컬 커밋까지만」을 말한다', () => {
    for (const cmd of [DENY_REMOTE[0], DENY_CREDENTIAL[0], DENY_CONFIG[0], DENY_EXECUTOR_FILES[0]]) {
      const reason = loopCommandReason(cmd, SCOPE) ?? ''
      expect(reason).toContain('원격은 실행기 코드만')
      expect(reason).toContain('로컬 커밋까지만')
    }
  })
})

describe('loop-lock 편집 도구 경로 (M09 G2)', () => {
  const deny: [string, Record<string, unknown>][] = [
    ['Write', { file_path: '.agentdeck/run-state.json', content: '{}' }],
    ['Write', { file_path: 'C:\\work\\repo\\.agentdeck\\verification.md', content: '' }],
    ['Write', { file_path: 'C:/work/repo/.agentdeck/RUN-STATE.JSON', content: '' }],
    ['Write', { file_path: 'C:/work/repo/.agentdeck/run-state.json.', content: '' }],
    ['Edit', { file_path: '.git/config', old_string: 'a', new_string: 'b' }],
    ['MultiEdit', { file_path: 'C:/work/repo/.git/hooks/pre-push', edits: [] }],
    ['NotebookEdit', { notebook_path: '.git/info/x.ipynb', new_source: '' }],
    ['Write', { file_path: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop\\digests\\k', content: '' }],
    ['Write', { file_path: 'src/../.git/config', content: '' }],
  ]
  for (const [tool, input] of deny) {
    it(`거부: ${tool} ${JSON.stringify(input['file_path'] ?? input['notebook_path'])}`, () => {
      expect(loopLockReason(tool, input, SCOPE)).not.toBeNull()
    })
  }
  const allow: [string, Record<string, unknown>][] = [
    ['Write', { file_path: '.agentdeck/goals/g1.md', content: '# g1' }],
    ['Edit', { file_path: 'C:/work/repo/.agentdeck/milestone-spec.md', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: '.agentdeck/decisions.md', content: '' }],
    ['Edit', { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' }],
    ['Read', { file_path: '.agentdeck/run-state.json' }],
    ['Read', { file_path: '.git/config' }],
  ]
  for (const [tool, input] of allow) {
    it(`허용: ${tool} ${JSON.stringify(input['file_path'])}`, () => {
      expect(loopLockReason(tool, input, SCOPE)).toBeNull()
    })
  }
  it('경로 판정 함수는 상대·절대·역슬래시·대소문자 꼴을 같게 본다', () => {
    expect(loopPathReason('.agentdeck/run-state.json', SCOPE)).not.toBeNull()
    expect(loopPathReason('c:\\WORK\\repo\\.AgentDeck\\Run-State.json', SCOPE)).not.toBeNull()
    expect(loopPathReason('.agentdeck/goals/g2.md', SCOPE)).toBeNull()
  })
})

describe('loop-lock 훅과 노드 정보 (M09 G2)', () => {
  type Out = { hookSpecificOutput?: { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } }
  const signal = new AbortController().signal

  it('PreToolUse 훅: 명령 도구와 편집 도구의 거부 꼴은 deny, 나머지는 판정 없음', async () => {
    const matcher = buildLoopLockHook(SCOPE)
    expect(matcher).toMatchObject({ timeout: 10, onFailure: 'block' })
    const [hook] = matcher.hooks
    const call = (tool_name: string, tool_input: unknown): Promise<Out> =>
      hook({ hook_event_name: 'PreToolUse', tool_name, tool_input }, 't', { signal })
    expect(await call('Bash', { command: 'git push' })).toMatchObject({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' },
    })
    expect(await call('PowerShell', { command: 'gh pr create --fill' })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
    expect(await call('Write', { file_path: '.agentdeck/run-state.json', content: '{}' })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
    expect(await call('Bash', { command: 'git commit -m x' })).toEqual({})
    expect(await call('Write', { file_path: '.agentdeck/goals/g1.md', content: '' })).toEqual({})
    expect(await call('Read', { file_path: '.agentdeck/run-state.json' })).toEqual({})
    expect(await call('Bash', {})).toEqual({})
  })

  it('노드 정보: PreToolUse·L3·잠김·실패 시 막음. 앱 세션 등록부(listControlNodes)에는 없다 — 루프 작업 노드 세션에만 붙는다', () => {
    expect(LOOP_LOCK_NODE).toMatchObject({
      id: 'loop-lock',
      point: 'preToolUse',
      judge: 'rule',
      results: ['deny'],
      protection: 'L3',
      locked: true,
      onFailure: 'block',
      timeoutMs: 10000,
    })
    expect(Object.isFrozen(LOOP_LOCK_NODE)).toBe(true)
    expect(listControlNodes().map((n) => n.id)).not.toContain('loop-lock')
  })
})
