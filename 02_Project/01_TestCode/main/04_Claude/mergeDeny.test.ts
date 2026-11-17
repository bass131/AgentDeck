// M07 G8 병합 거부 노드 — 앱 세션의 PreToolUse 잠금 노드 `merge-deny`가 병합 꼴을 거부하고 오탐 꼴은 지나가는지 고정한다.
// 오탐 꼴은 저장소 가드 테스트(.claude/hooks/dangerous-cmd-guard.test.mjs 392~432행 계열)에서 빌렸다.
import { describe, it, expect } from 'vitest'
import { mergeDenyReason, buildMergeDenyHook, MERGE_DENY_NODE } from '@main/04_Claude/permission/mergeDeny'
import { listControlNodes } from '@main/04_Claude/permission/controlNodes'

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
    'gh api repos/o/r/pulls/12 --jq ".merged"',
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
