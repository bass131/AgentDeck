// M07 G8 병합 거부 노드 — 앱 세션의 PreToolUse 잠금 노드 `merge-deny`가 병합 꼴을 거부하고 오탐 꼴은 지나가는지 고정한다.
// 오탐 꼴은 저장소 가드 테스트(.claude/hooks/dangerous-cmd-guard.test.mjs 392~432행 계열)에서 빌렸다.
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { mergeDenyReason, buildMergeDenyHook, MERGE_DENY_NODE } from '@main/04_Claude/permission/mergeDeny'
import { listControlNodes } from '@main/04_Claude/permission/controlNodes'

// G3 검수 중요 4 — 하네스 같음 시험(.claude/hooks/cmd-guard-equivalence.test.mjs)이 mergeDeny.ts를 Node의 타입 지우기로 직접 import한다.
// 값 import나 지울 수 없는 TS 문법이 들어오면 그 시험(판정 장치)만 깨지므로, 앱 시험에서 먼저 드러나게 한다.
describe('merge-deny 소스 — Node가 타입만 지워 바로 읽을 수 있다 (M09 G3)', () => {
  const source = readFileSync(fileURLToPath(new URL('../../../00_Source/main/04_Claude/permission/mergeDeny.ts', import.meta.url)), 'utf8')
  it('import는 모두 import type이다 — 값 import·require·값 다시 내보내기가 없다', () => {
    const imports = source.split('\n').filter((l) => /^\s*import\b/.test(l))
    expect(imports.length).toBeGreaterThan(0)
    for (const l of imports) expect(l).toMatch(/^import type /)
    expect(source).not.toMatch(/\brequire\s*\(|\bimport\s*\(/)
    expect(source).not.toMatch(/^export\s+(?!type\b)[^\n]*\bfrom\s+['"]/m)
  })
  it('enum·namespace·parameter property가 없다 — Node의 타입 지우기가 받아들인다', () => {
    expect(source).not.toMatch(/^\s*(?:export\s+)?(?:const\s+|declare\s+)?enum\s+\w/m)
    expect(source).not.toMatch(/^\s*(?:export\s+)?(?:declare\s+)?(?:namespace|module)\s+\w/m)
    expect(source).not.toMatch(/constructor\s*\([^)]*\b(?:public|private|protected|readonly)\s/)
    expect(() => stripTypeScriptTypes(source)).not.toThrow()
  })
})

describe('merge-deny — 병합 꼴은 거부한다 (M07 G8)', () => {
  const denied = [
    'gh pr merge 12',
    'gh pr merge 12 --squash',
    'gh pr merge --auto 12',
    'gh pr merge',
    'gh pr -R o/r merge 12',
    'gh pr --repo o/r merge 12',
    'gh pr --repo=o/r merge 12',
    'gh -R o/r pr merge 12',
    'gh pr -b x merge 12',
    'gh pr --match-head-commit abc merge 12',
    'gh -b x pr merge 12',
    'gh.exe pr merge 12',
    'GH.EXE pr merge 12',
    '/usr/bin/gh pr merge 12',
    'C:\\Tools\\gh\\gh.exe pr merge 12',
    'GH_TOKEN=x gh pr merge 12',
    'env GH_TOKEN=x gh pr merge 12',
    'sudo gh pr merge 12',
    'npm test && gh pr merge 12',
    'npm test; gh pr merge 12',
    'echo 12 | xargs gh pr merge',
    'npm test\ngh pr merge 12',
    'gh pr \\\n  merge 12',
    'gh pr merge \\\n  --squash 12',
    '(gh pr merge 12)',
    '{ gh pr merge 12; }',
    'if true; then gh pr merge 12; fi',
    'bash -c "gh pr merge 12"',
    "sh -c 'npm test && gh pr merge 12'",
    'gh api -X PUT repos/o/r/pulls/12/merge',
    'gh api repos/o/r/pulls/12/merge -X PUT -f sha=abc',
    'gh api -i -X PUT repos/o/r/pulls/12/merge',
    'gh api --method PUT repos/{owner}/{repo}/pulls/12/merge',
    'gh api repos/o/r/pulls/12/merge',
    'gh api -X PUT repos/o/r/pulls/12/merge-async -f sha=abc',
    'gh api repos/o/r/pulls/12/merge-async/uuid-1',
    'gh api "repos/o/r/pulls/$N/merge" -X PUT',
    'gh api https://api.github.com/repos/o/r/pulls/12/merge -X PUT',
    'gh api repos/o/r/pulls/12/merge?x=1 -X PUT',
    'gh api graphql -f query=\'mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }\'',
    'gh api graphql -f query="mutation { enablePullRequestAutoMerge(input: {pullRequestId: \\"x\\"}) { clientMutationId } }"',
    "gh api graphql --input - <<'EOF'\n{\"query\": \"mutation { mergePullRequest(input: {}) { clientMutationId } }\"}\nEOF",
    // 독립 검수 중요 3 — 흔한 래퍼와 Windows 셸
    'timeout 30 gh pr merge 12',
    'timeout -s KILL 30s gh pr merge 12',
    'timeout --kill-after=5 30 gh pr merge 12',
    'stdbuf -o0 gh pr merge 12',
    'stdbuf -o L gh pr merge 12',
    'watch gh pr merge 12',
    'watch -n 5 gh pr merge 12',
    'sudo -u x gh pr merge 12',
    'sudo -g staff -u x gh pr merge 12',
    'time -p gh pr merge 12',
    'nice -n 10 gh pr merge 12',
    'cmd /c gh pr merge 12',
    'cmd.exe /C "gh pr merge 12"',
    'cmd /c "npm test && gh pr merge 12"',
    'powershell -Command "gh pr merge 12"',
    'pwsh -c "gh pr merge 12"',
    'powershell.exe -NoProfile -Command gh pr merge 12',
    "pwsh.exe -NoProfile -NonInteractive -Command 'gh pr merge 12'",
    'powershell -ExecutionPolicy Bypass "gh pr merge 12"',
    'powershell "gh pr merge 12"',
    // 독립 검수 사소 7 — 따옴표 없는 heredoc 본문의 명령 치환은 bash가 실행한다
    'cat <<EOF\n$(gh pr merge 12)\nEOF',
    'cat <<-EOF\n\tx `gh pr merge 12` y\n\tEOF',
    "cat <<EOF > out.txt\ndon't $(gh api -X PUT repos/o/r/pulls/12/merge)\nEOF",
    // 검수 반영 — here-string·짝 없는 heredoc이 뒤 명령을 숨기지 않는다
    'wc -c <<< abc\ngh pr merge 12',
    'cat <<EOF\nno terminator\ngh pr merge 12',
    'echo $((1 << 2))\ngh pr merge 12',
    // 검수 반영 — 붙여 쓴 옵션 값이 경로를 숨기지 않는다
    'gh api -XPUT repos/o/r/pulls/12/merge',
    `gh api -fsha=${'a'.repeat(39)}f repos/o/r/pulls/12/merge -X PUT`,
    // 검수 반영 — graphql 끝점의 다른 꼴
    'gh api /graphql -f query="mutation { mergePullRequest(input: {}) { clientMutationId } }"',
    'gh api https://api.github.com/graphql -f query="mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }"',
  ]
  for (const cmd of denied) {
    it(`거부: ${JSON.stringify(cmd)}`, () => {
      expect(mergeDenyReason(cmd)).toMatch(/「병합」 버튼/)
    })
  }
})

describe('merge-deny — 오탐 꼴은 지나간다 (M07 G8)', () => {
  const passed = [
    'gh pr create --fill',
    'gh pr create --base master --title "t" --body "b"',
    'gh pr create --title merge --body x',
    'gh pr create --base merge --fill',
    'gh pr create --title "merge button" --body "에이전트는 gh pr merge 를 못 부른다; | && 도 본문이다"',
    "gh pr create --title \"G8\" --body \"$(cat <<'EOF'\n## 요약\n병합은 \"앱 버튼\"으로 한다.\ngh pr merge 12 는 거부된다\ngh api -X PUT repos/o/r/pulls/12/merge 도 거부된다\nEOF\n)\"",
    'gh pr view merge',
    'gh pr view 12 --json mergeable,mergeStateStatus',
    'gh pr view --json merge',
    'gh pr list',
    'gh pr list --search merge',
    'gh pr list -s merge',
    'gh pr checkout merge',
    'gh pr diff merge',
    'gh pr view 12 -R o/r',
    'gh pr --help',
    'gh pr checks 12',
    'git merge feature',
    'git log --merges',
    'git merge-base HEAD master',
    'rg "gh pr merge"',
    'rg -n "pulls/12/merge" .',
    'grep merge file.txt',
    'grep -rn "mergePullRequest" src',
    'echo merge',
    'echo "gh pr merge 12"',
    "echo 'gh api -X PUT repos/o/r/pulls/12/merge'",
    'gh api repos/o/r/pulls/12',
    'gh api repos/o/r/pulls/12/commits',
    'gh api repos/o/r/pulls/12/files',
    'gh api repos/o/r/pulls',
    'gh api repos/o/r/merges',
    'gh api repos/o/r/branches/master/protection/required_status_checks',
    'gh api repos/o/r/issues/12/comments -f body="see pulls/12/merge"',
    'gh api graphql -f query="query { repository(owner: \\"o\\", name: \\"r\\") { pullRequest(number: 1) { mergeable } } }"',
    'npm run build',
    'git log --oneline | grep -i merge',
    'gh api /graphql -f query="query { viewer { login } }"',
    'cat <<EOF\ngh pr merge 12 는 본문이다\nEOF',
    // 따옴표 친 heredoc 끝말의 본문은 치환도 하지 않는다
    "cat <<'EOF'\n$(gh pr merge 12)\nEOF",
    'cat <<"EOF"\n`gh pr merge 12`\nEOF',
    'cat <<EOF\n\\$(gh pr merge 12)\nEOF',
    // 래퍼 뒤의 다른 명령과 셸 안의 문자열
    'timeout 30 gh pr view 12',
    'timeout 30 npm test',
    'nice -n 10 npm test',
    'xargs -n 1 echo gh pr merge',
    'watch -n 5 gh pr checks 12',
    'sudo -u x git merge feature',
    'cmd /c echo gh pr merge 12',
    'cmd /c gh pr list',
    'powershell -Command "Write-Output \'gh pr merge 12\'"',
    'pwsh -c "gh pr view 12 --json mergeable"',
    'gh api repos/o/r/pulls/12 --jq ".merged"',
  ]
  for (const cmd of passed) {
    it(`통과: ${JSON.stringify(cmd)}`, () => {
      expect(mergeDenyReason(cmd)).toBeNull()
    })
  }
})

// M09 G3 — `env -S`(`--split-string`)는 문자열을 낱말로 나눠 그 자리에 끼우고 옵션 읽기를 잇는다(GNU env).
// 그 문자열과 뒤 낱말을 명령으로 다시 읽어 다른 병합 호출과 같은 사유로 거부한다. 같은 사례를 가드 시험과 같음 시험에도 둔다.
describe('merge-deny — env -S 문자열을 명령으로 다시 읽는다 (M09 G3)', () => {
  const denied = [
    'env -S "gh pr merge 1"',
    'env -S"gh pr merge 1"',
    'env -vS "gh pr merge 1"',
    'env --split-string="gh pr merge 1"',
    'env -S "gh api -X PUT repos/o/r/pulls/1/merge"',
    'env --split-string "gh pr merge 1"',
    'env --split "gh pr merge 1"',
    'env --sp="gh pr merge 1"',
    'env --s "gh pr merge 1"',
    'env -iS "gh pr merge 1"',
    'env -0vS"gh pr merge 1"',
    'env -S gh pr merge 1',
    'env -S "gh pr" merge 1',
    'env -S "-i gh pr merge 1"',
    'env -S "FOO=1 gh pr merge 1"',
    'env -u X -S "gh pr merge 1"',
    'env -C /tmp -S "gh pr merge 1"',
    'env -C/tmp -S "gh pr merge 1"',
    'env --unset X --debug -S "gh pr merge 1"',
    "env -S \"env -S 'gh pr merge 1'\"",
    "env -S \"bash -c 'gh pr merge 1'\"",
    'env -S "bash -c" "gh pr merge 1"',
    'sudo env -S "gh pr merge 1"',
    '/usr/bin/env -S "gh pr merge 1"',
    'ENV.EXE -S "gh pr merge 1"',
    'npm test && env -S "gh pr merge 1"',
    "bash -c 'env -S \"gh pr merge 1\"'",
    'env -S "gh api graphql -f query=\'mutation { mergePullRequest(input: {}) { clientMutationId } }\'"',
    // G3 검수 중요 1 — env는 값 안의 낱말 머리 `#`부터 값 끝까지만 버리고 뒤 낱말은 그대로 돈다
    'env -S "#" gh pr merge 1',
    'env -S "#c" gh pr merge 1',
    'env -S "gh pr #" merge 1',
    'env -S "gh #" pr merge 1',
    'env -S "gh pr #x y" merge 1',
    'env -S "gh api #" -X PUT repos/o/r/pulls/1/merge',
    // 따옴표 안의 `#`는 주석이 아니다
    'env -S \'FOO="a #b" gh pr merge 1\'',
    // G3 검수 사소 2 — `-a`(`--argv0`)는 값을 받는다
    'env -a x -S "gh pr merge 1"',
    'env --argv0 x -S "gh pr merge 1"',
  ]
  for (const cmd of denied) {
    it(`거부: ${JSON.stringify(cmd)}`, () => {
      expect(mergeDenyReason(cmd)).toMatch(/「병합」 버튼/)
    })
  }
  const passed = [
    'env -S "npm test"',
    'env FOO=1 npm test',
    'env -u X ls',
    'env -S "gh pr view 1"',
    'env -S "echo gh pr merge 1"',
    // 값의 주석을 버리면 `x`가 명령이다(gh는 x의 인자)
    'env -S "x #" gh pr merge 1',
    // 따옴표 안의 `#`는 글자다 — echo의 인자
    'env -S "echo \'#\'" gh pr merge 1',
    // 뒤 낱말은 낱말 하나다 — 그 안의 `;`는 구분자가 아니다
    'env -S "npm test" "a; gh pr merge 1"',
    'env -u S npm test',
    // 묶음에서 값 옵션이 먼저 오면 그 뒤 글자는 값이다(`-uS`의 S는 -u의 값)
    'env -uS "npm test"',
    'env --unset=S npm test',
    'env -S',
    'env -S ""',
    'env -- -S "gh pr merge 1"',
    // 글로만 적힌 꼴
    'echo \'env -S "gh pr merge 1"\'',
    'git commit -m \'env -S "gh pr merge 1" 차단\'',
    "git commit -F - <<'EOF'\nfix: x\n\nenv -S \"gh pr merge 1\" 차단\nEOF",
    "gh pr create --title t --body \"$(cat <<'EOF'\nenv -S \"gh pr merge 1\" 도 거부된다\nEOF\n)\"",
  ]
  for (const cmd of passed) {
    it(`통과: ${JSON.stringify(cmd)}`, () => {
      expect(mergeDenyReason(cmd)).toBeNull()
    })
  }
})

describe('merge-deny — 가드와 같은 판독 (M11 G3)', () => {
  const probes = [
    'timeout -vs KILL 5 gh pr merge 1',
    'timeout --sig KILL 5 gh pr merge 1',
    'bash -ce "gh pr merge 1"',
    'bash -c -x "gh pr merge 1"',
    'eval gh pr merge 1',
    'find . -maxdepth 0 -exec gh pr merge 1 \\;',
  ]
  for (const cmd of probes) {
    it(`[M11-G3 M11-17] 거부: ${JSON.stringify(cmd)}`, () => {
      expect(mergeDenyReason(cmd)).not.toBeNull()
    })
  }
  const passed = [
    'timeout -vs KILL 5 npm test',
    'bash -ce "git status"',
    'bash -c -x "npm test"',
    'eval echo merge',
    'find . -name "*.ts" -exec grep -l merge {} \\;',
    'echo "find . -exec gh pr merge 1 \\;"',
  ]
  for (const cmd of passed) {
    it(`통과: ${JSON.stringify(cmd)}`, () => {
      expect(mergeDenyReason(cmd)).toBeNull()
    })
  }
})

describe('merge-deny 훅과 노드 정보 (M07 G8)', () => {
  it('훅은 command 입력의 병합 꼴을 거부 결정으로, 나머지는 빈 출력으로 돌려준다', async () => {
    const matcher = buildMergeDenyHook()
    expect(matcher.onFailure).toBe('block')
    expect(matcher.timeout).toBe(10)
    expect(matcher.matcher).toBeUndefined()
    const [hook] = matcher.hooks
    const signal = new AbortController().signal
    const deny = await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'gh pr merge 1' } }, 't1', { signal })
    expect(deny).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } })
    expect(deny.hookSpecificOutput?.permissionDecisionReason).toMatch(/앱.*「병합」 버튼/)
    // M08 G2(헌법 10조 효력 날 뒤): 이 노드는 작업 폴더와 관계없이 모든 앱 세션에 붙는다(sdkOptions). 안내는 작업 폴더 중립이다 —
    //   호출 거부는 대상 브랜치와 관계없고, 로컬 병합은 저장소 규칙이 정해 둔 경우에만 그 조건을 따라 하며, 아니면 PR 생성까지만.
    //   AgentDeck 저장소 전용 지시(「마일스톤 브랜치에 합치세요」)를 명령형으로 내리면 그 규칙이 없는 저장소에서 틀린다(G2 검수 중요 1).
    const why = deny.hookSpecificOutput?.permissionDecisionReason ?? ''
    expect(why).toMatch(/대상 브랜치와 관계없/)
    expect(why).toMatch(/저장소 규칙이[^.]*로컬 병합[^.]*정해 두었으면[^.]*병합 조건을 따르/)
    expect(why).toMatch(/아니면 PR 생성까지만/)
    expect(why).not.toMatch(/마일스톤 브랜치에 합치고/)
    expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'gh pr view 1' } }, 't2', { signal })).toEqual({})
    expect(
      await hook({ hook_event_name: 'PreToolUse', tool_name: 'PowerShell', tool_input: { command: 'gh pr merge 1' } }, 't3', { signal })
    ).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
    expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'x' } }, 't4', { signal })).toEqual({})
  })

  it('노드 정보: PreToolUse·L3·잠김·실패 시 막음, 목록 맨 뒤에 보인다', () => {
    expect(MERGE_DENY_NODE).toMatchObject({
      id: 'merge-deny',
      point: 'preToolUse',
      judge: 'rule',
      results: ['deny'],
      protection: 'L3',
      locked: true,
      onFailure: 'block',
      timeoutMs: 10000,
    })
    expect(MERGE_DENY_NODE.name).toMatch(/병합/)
    expect(Object.isFrozen(MERGE_DENY_NODE) && Object.isFrozen(MERGE_DENY_NODE.results)).toBe(true)
    const list = listControlNodes()
    expect(list[list.length - 1]).toMatchObject({ id: 'merge-deny', locked: true })
  })
})
