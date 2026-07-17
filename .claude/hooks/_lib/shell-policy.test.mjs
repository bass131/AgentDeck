import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyHarnessPath,
  dangerousCommandReason,
  harnessShellWriteReason,
  isClaudeHarnessPath,
} from './shell-policy.mjs'

// 앵커 고정 — 테스트 결정성(실행 머신의 cwd·홈에 좌우되지 않게).
const OPTS = { projectDir: 'C:/Dev/AgentDeck', homeDir: 'C:/Users/tester' }

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

test('상대 경로는 프로젝트 루트 기준으로 봉인/예외 판정한다', () => {
  assert.equal(isClaudeHarnessPath('.claude/state/current-pin.txt', OPTS), false)
  assert.equal(isClaudeHarnessPath('.claude/state/../settings.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('.codex/state/current-pin.txt', OPTS), true)
  assert.equal(isClaudeHarnessPath('.claude/CHANGELOG.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('.gitattributes', OPTS), true)
  assert.equal(isClaudeHarnessPath('CLAUDE.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('.agents/skills/work-run/SKILL.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('02.Source/renderer/src/a.ts', OPTS), false)
})

test('절대 경로는 앵커 세그먼트 일치로만 봉인한다 (부분일치 폐기)', () => {
  assert.equal(isClaudeHarnessPath('C:/Dev/AgentDeck/.claude/hooks/tdd-guard.sh', OPTS), true)
  assert.equal(isClaudeHarnessPath('C:\\Dev\\AgentDeck\\.claude\\settings.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('c:/dev/AGENTDECK/.CLAUDE/HOOKS/x.sh', OPTS), true)
  assert.equal(isClaudeHarnessPath('/c/Dev/AgentDeck/.claude/settings.json', OPTS), true)
  // 다른 저장소·접두사 트랩은 이 훅의 보호 범위 밖 (각 프로젝트는 자기 훅으로).
  assert.equal(isClaudeHarnessPath('C:/repo/.claude/hooks/tdd-guard.sh', OPTS), false)
  assert.equal(isClaudeHarnessPath('C:/Dev/AgentDeck-evil/.claude/settings.json', OPTS), false)
})

test('`..` 탈출 후 재진입 표기를 해소해 봉인한다 (2026-07-13 우회 실증 봉합)', () => {
  assert.equal(isClaudeHarnessPath(
    'C:\\Dev\\AgentDeck\\.claude\\hooks\\..\\..\\..\\AgentDeck\\.claude\\settings.json', OPTS,
  ), true)
  assert.equal(isClaudeHarnessPath(
    'C:/Dev/AgentDeck/02.Source/../.claude/hooks/pin-injector.sh', OPTS,
  ), true)
})

test('홈 .claude는 등록 데이터 디렉토리만 허용하고 config는 fail-closed 봉인한다', () => {
  assert.equal(classifyHarnessPath('C:/Users/tester/.claude/plans/2026-07-13-fix.md', OPTS), 'allowed')
  assert.equal(classifyHarnessPath('~/.claude/plans/draft.md', OPTS), 'allowed')
  assert.equal(classifyHarnessPath(
    'C:/Users/tester/.claude/projects/C--Dev-AgentDeck/memory/note.md', OPTS,
  ), 'allowed')
  assert.equal(isClaudeHarnessPath('C:/Users/tester/.claude/settings.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('~/.claude/hooks/global.sh', OPTS), true)
  assert.equal(isClaudeHarnessPath('C:/Users/tester/.claude/todos/x.json', OPTS), true)
  assert.equal(isClaudeHarnessPath(
    'C:/Users/tester/.claude/projects/C--Dev-AgentDeck/memory/../../../settings.json', OPTS,
  ), true)
  // 홈 .claude 밖은 무관.
  assert.equal(classifyHarnessPath('C:/Users/tester/AppData/Local/Temp/x.md', OPTS), 'unrelated')
})

test('Claude hook은 Claude runtime만 허용하고 Codex runtime을 봉인한다 (shell 우회 쓰기)', () => {
  assert.equal(harnessShellWriteReason("Set-Content .claude/state/current-pin.txt 'x'", OPTS), null)
  assert.ok(harnessShellWriteReason("Set-Content .claude/state/../settings.json 'x'", OPTS))
  assert.ok(harnessShellWriteReason("Set-Content .codex/state/current-pin.txt 'x'", OPTS))
  assert.ok(harnessShellWriteReason("Set-Content .agents/skills/work-run/SKILL.md 'x'", OPTS))
  assert.ok(harnessShellWriteReason('echo x>.claude/settings.json', OPTS))
  assert.equal(harnessShellWriteReason('Get-Content .codex/hooks.json', OPTS), null)
  // 앵커 도입 후 신규: 다른 저장소는 쓰기여도 무관, 홈 plans 쓰기는 허용, 홈 config 쓰기는 봉인.
  assert.equal(harnessShellWriteReason("Set-Content C:/repo/.claude/settings.json 'x'", OPTS), null)
  assert.equal(harnessShellWriteReason('tee ~/.claude/plans/draft.md', OPTS), null)
  assert.ok(harnessShellWriteReason("Set-Content ~/.claude/settings.json 'x'", OPTS))
})

test('링크 생성 명령(ln·mklink)을 하네스 쓰기로 인지한다 (C-core 부분 완화)', () => {
  assert.ok(harnessShellWriteReason('ln -s C:/tmp/payload .claude/hooks/link.sh', OPTS))
  assert.ok(harnessShellWriteReason('cmd /c mklink .claude\\evil.lnk C:\\tmp\\payload', OPTS))
  assert.equal(harnessShellWriteReason('ln -s a.txt b.txt', OPTS), null)
})

test('Claude hook은 내장 파일 쓰기를 봉인하고 읽기 전용 검사는 허용한다', () => {
  for (const command of [
    `node -e "require('fs').writeFileSync('.claude/settings.json','x')"`,
    `node --eval "require('node:fs').renameSync('.claude/settings.json','.claude/settings.bak')"`,
    `node -e "require('fs').copyFileSync('.codex/hooks.json','.codex/hooks.bak')"`,
    `node -e "require('fs').unlinkSync('.agents/skills/work-run/SKILL.md')"`,
    `node -e "require('fs').createWriteStream('.claude/settings.json').end('x')"`,
    `node -e "require('fs').truncateSync('.claude/settings.json',0)"`,
    `node -e "require('fs').symlinkSync('C:/tmp/payload','.claude/hooks/link.sh')"`,
    `node -p "require('fs').writeFileSync('.claude/settings.json','x')"`,
    `node --print "require('fs').truncateSync('.codex/config.toml',0)"`,
    `node --eval="require('fs').writeFileSync('.claude/settings.json','x')"`,
    `node --print="require('fs').truncateSync('.codex/config.toml',0)"`,
    `powershell -Command "[IO.File]::WriteAllText('.claude/settings.json','x')"`,
    `powershell -Command "Set-Content .claude/settings.json x"`,
    `pwsh -Command "Remove-Item .codex/config.toml"`,
    `powershell -Command "ri .claude/settings.json"`,
    `pwsh -Command "sc .codex/config.toml x"`,
  ]) assert.ok(harnessShellWriteReason(command, OPTS), command)

  assert.equal(
    harnessShellWriteReason(`node -e "console.log(require('fs').readFileSync('.claude/settings.json','utf8'))"`, OPTS),
    null,
  )
  assert.equal(
    harnessShellWriteReason(`node -e "require('fs').writeFileSync('.claude/state/current-pin.txt','x')"`, OPTS),
    null,
  )
  assert.equal(
    harnessShellWriteReason(`node -e "require('fs').writeFileSync('.claude/CHANGELOG.md','x')"`, OPTS),
    null,
  )
  assert.equal(harnessShellWriteReason(`echo "writeFileSync('.claude/settings.json')"`, OPTS), null)
  assert.equal(harnessShellWriteReason(`echo node "writeFileSync('.claude/settings.json')"`, OPTS), null)
  assert.equal(harnessShellWriteReason(`pwsh -Command "Get-Content .codex/config.toml"`, OPTS), null)
})

test('bash -c/sh -c 중첩 문자열의 봉인 쓰기를 차단한다 (유지보수 창 2026-07-17 🟡-14 봉합)', () => {
  for (const command of [
    `bash -c 'echo x > .claude/settings.json'`,
    `sh -c "echo x >> .codex/config.toml"`,
    `bash -lc "echo x > .claude/settings.json"`,
    `bash -c "sed -i 's/a/b/' .claude/hooks/tdd-guard.sh"`,
    `bash -c "tee .claude/settings.json"`,
    `bash -c "node -e \\"require('fs').writeFileSync('.claude/settings.json','x')\\""`,
  ]) assert.ok(harnessShellWriteReason(command, OPTS), command)

  // 읽기·허용 구역·비하네스 경로는 통과
  assert.equal(harnessShellWriteReason(`bash -c 'cat .claude/settings.json'`, OPTS), null)
  assert.equal(harnessShellWriteReason(`bash -c 'echo x > C:/tmp/out.txt'`, OPTS), null)
  assert.equal(harnessShellWriteReason(`bash -c 'echo x > .claude/state/current-pin.txt'`, OPTS), null)
})

test('perl 임베디드 쓰기를 봉인한다 (Git Bash 동봉 런타임 등재 — 🟡-14)', () => {
  for (const command of [
    `perl -e "open(F,'>','.claude/settings.json')"`,
    `perl -E "unlink('.codex/config.toml')"`,
    `perl -e "rename('.claude/settings.json','.claude/settings.bak')"`,
    `perl -i -pe 's/a/b/' .claude/hooks/tdd-guard.sh`,
  ]) assert.ok(harnessShellWriteReason(command, OPTS), command)

  assert.equal(harnessShellWriteReason(`perl -e "print 'hello'"`, OPTS), null)
  assert.equal(harnessShellWriteReason(`perl -e "open(F,'<','.claude/settings.json')"`, OPTS), null)
})

test('의미 정본 층(harness/CORE·manifest·adr)을 봉인한다 (ADR-037 확장)', () => {
  assert.equal(isClaudeHarnessPath('00.Documents/harness/CORE.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('00.Documents/harness/core-manifest.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('00.Documents/adr/ADR-037-harness-seal-extension.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('00.Documents/ADR.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('C:/Dev/AgentDeck/00.Documents/harness/MAPPING.md', OPTS), true)
  // 인접 문서·타 저장소는 봉인 밖
  assert.equal(isClaudeHarnessPath('00.Documents/PRD.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('00.Documents/reports/next/x.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('C:/repo/00.Documents/harness/CORE.md', OPTS), false)
  // shell 우회 쓰기 층에서도 후보 추출·차단
  assert.ok(harnessShellWriteReason('tee 00.Documents/adr/ADR-001.md', OPTS))
  assert.ok(harnessShellWriteReason('echo x > 00.Documents/harness/core-manifest.json', OPTS))
  assert.equal(harnessShellWriteReason('cat 00.Documents/harness/CORE.md', OPTS), null)
})
