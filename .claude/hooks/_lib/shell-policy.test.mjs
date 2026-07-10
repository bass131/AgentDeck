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

test('Claude hook은 내장 파일 쓰기를 봉인하고 읽기 전용 검사는 허용한다', () => {
  for (const command of [
    `node -e "require('fs').writeFileSync('.claude/settings.json','x')"`,
    `node --eval "require('node:fs').renameSync('.claude/settings.json','.claude/settings.bak')"`,
    `node -e "require('fs').copyFileSync('.codex/hooks.json','.codex/hooks.bak')"`,
    `node -e "require('fs').unlinkSync('.agents/skills/work-run/SKILL.md')"`,
    `node -e "require('fs').createWriteStream('.claude/settings.json').end('x')"`,
    `node -e "require('fs').truncateSync('.claude/settings.json',0)"`,
    `node -p "require('fs').writeFileSync('.claude/settings.json','x')"`,
    `node --print "require('fs').truncateSync('.codex/config.toml',0)"`,
    `node --eval="require('fs').writeFileSync('.claude/settings.json','x')"`,
    `node --print="require('fs').truncateSync('.codex/config.toml',0)"`,
    `powershell -Command "[IO.File]::WriteAllText('.claude/settings.json','x')"`,
    `powershell -Command "Set-Content .claude/settings.json x"`,
    `pwsh -Command "Remove-Item .codex/config.toml"`,
    `powershell -Command "ri .claude/settings.json"`,
    `pwsh -Command "sc .codex/config.toml x"`,
  ]) assert.ok(harnessShellWriteReason(command), command)

  assert.equal(
    harnessShellWriteReason(`node -e "console.log(require('fs').readFileSync('.claude/settings.json','utf8'))"`),
    null,
  )
  assert.equal(
    harnessShellWriteReason(`node -e "require('fs').writeFileSync('.claude/state/current-pin.txt','x')"`),
    null,
  )
  assert.equal(
    harnessShellWriteReason(`node -e "require('fs').writeFileSync('.claude/CHANGELOG.md','x')"`),
    null,
  )
  assert.equal(harnessShellWriteReason(`echo "writeFileSync('.claude/settings.json')"`), null)
  assert.equal(harnessShellWriteReason(`echo node "writeFileSync('.claude/settings.json')"`), null)
  assert.equal(harnessShellWriteReason(`pwsh -Command "Get-Content .codex/config.toml"`), null)
})
