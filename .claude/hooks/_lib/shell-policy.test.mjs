import assert from 'node:assert/strict'
import test from 'node:test'

import {
  dangerousCommandReason,
  harnessShellWriteReason,
  isClaudeHarnessPath,
} from './shell-policy.mjs'

test('Claude dangerous guard가 대표 파괴 명령 변형을 차단한다', () => {
  for (const command of [
    'rm -r -f build',
    'git -C . reset --hard HEAD',
    'git clean -df',
    'git push origin +main',
    'cmd /c rd /s /q build',
  ]) assert.ok(dangerousCommandReason(command), command)

  assert.equal(dangerousCommandReason('git status --short'), null)
  assert.equal(dangerousCommandReason("echo 'git reset --hard HEAD'"), null)
})

test('Claude hook은 Claude runtime만 허용하고 Codex runtime을 봉인한다', () => {
  assert.equal(isClaudeHarnessPath('.claude/state/current-pin.txt'), false)
  assert.equal(isClaudeHarnessPath('.claude/state/../settings.json'), true)
  assert.equal(isClaudeHarnessPath('.codex/state/current-pin.txt'), true)
  assert.equal(isClaudeHarnessPath('.claude/CHANGELOG.md'), false)
  assert.equal(isClaudeHarnessPath('.gitattributes'), true)
  assert.equal(isClaudeHarnessPath('C:/repo/.claude/hooks/tdd-guard.sh'), true)
  assert.equal(isClaudeHarnessPath('C:/repo/.claude/state/current-pin.txt'), false)
  assert.equal(isClaudeHarnessPath('C:/repo/.codex/state/current-pin.txt'), true)
  assert.equal(harnessShellWriteReason("Set-Content .claude/state/current-pin.txt 'x'"), null)
  assert.ok(harnessShellWriteReason("Set-Content .claude/state/../settings.json 'x'"))
  assert.ok(harnessShellWriteReason("Set-Content .codex/state/current-pin.txt 'x'"))
  assert.ok(harnessShellWriteReason("Set-Content .agents/skills/work-run/SKILL.md 'x'"))
  assert.ok(harnessShellWriteReason('echo x>.claude/settings.json'))
  assert.equal(harnessShellWriteReason('Get-Content .codex/hooks.json'), null)
})
