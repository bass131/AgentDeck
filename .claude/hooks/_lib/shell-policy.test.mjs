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

test('OpenGate(98.Management/Harness_OpenGate)를 봉인한다 — 자기 개방 방지 (ADR-038)', () => {
  assert.equal(isClaudeHarnessPath('98.Management/Harness_OpenGate/gate-open.flag', OPTS), true)
  assert.equal(isClaudeHarnessPath('98.Management/Harness_OpenGate/OPEN-GATE.bat', OPTS), true)
  assert.equal(isClaudeHarnessPath('98.Management/Harness_OpenGate/settings.SEALED.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('C:/Dev/AgentDeck/98.Management/Harness_OpenGate/README.md', OPTS), true)
  // 98.Management의 다른(미래) 하위와 타 저장소는 봉인 밖
  assert.equal(isClaudeHarnessPath('98.Management/notes.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('C:/repo/98.Management/Harness_OpenGate/gate-open.flag', OPTS), false)
  // shell 우회 쓰기 층 — flag 직접 생성·리다이렉트 차단, 읽기는 통과
  assert.ok(harnessShellWriteReason('echo 1753300000 > 98.Management/Harness_OpenGate/gate-open.flag', OPTS))
  assert.ok(harnessShellWriteReason('touch 98.Management/Harness_OpenGate/gate-open.flag', OPTS))
  assert.equal(harnessShellWriteReason('cat 98.Management/Harness_OpenGate/README.md', OPTS), null)
})

// ── HR2 P05: 봉인 우회 봉합 (유지보수 창 2026-07-25) ──────────────────────────

test('따옴표 불균형이 봉인을 열지 않는다 — 셸 주석 선처리 + fail-closed (P05 우선순위 1)', () => {
  // bash는 # 이후를 주석 처리하므로 아래는 실제로 `tee .claude/settings.json`으로 실행된다.
  // 옛 구현은 짝 없는 아포스트로피가 토큰 0을 만들어 sealed 후보가 통째로 사라졌다(fail-open).
  assert.ok(harnessShellWriteReason("tee .claude/settings.json # it's fine", OPTS))
  assert.ok(dangerousCommandReason("rm -rf build # don't panic"))

  // 주석을 걷어낸 뒤에도 불균형이면 따옴표를 일반 문자로 보고 best-effort 판정한다(fail-closed).
  assert.ok(dangerousCommandReason('rm -rf "build'))
  assert.ok(harnessShellWriteReason('tee ".claude/settings.json', OPTS))

  // 따옴표 안의 #은 주석이 아니다 — 기존 판정이 그대로 유지돼야 한다(과차단·과통과 양방향).
  assert.ok(dangerousCommandReason('rm -rf "my # dir"'))
  assert.equal(dangerousCommandReason("echo 'rm -rf /'"), null)
  assert.equal(harnessShellWriteReason("echo 'tee .claude/settings.json'", OPTS), null)

  // 단어 중간의 #은 주석 시작이 아니다(POSIX) — 잘라내면 경로가 깨진다.
  assert.equal(dangerousCommandReason('echo a#b'), null)
})

test('sed는 인플레이스·w 명령일 때만 하네스 쓰기다 — 읽기 전용은 통과 (P05 sed 오탐)', () => {
  // 오탐 해소 대상: 읽기 전용 sed. 기록된 오탐 표본은 sed와 sealed 경로가 같은 세그먼트라
  // "세그먼트 좁히기"로는 애초에 해소되지 않는다 — 정확한 처방은 -i/w 조건부다.
  assert.equal(harnessShellWriteReason("sed -n '1,50p' .claude/agents/coordinator.md", OPTS), null)
  assert.equal(harnessShellWriteReason("sed -n '1,50p' .claude/agents/qa.md | node -e \"process.stdout.write('x')\"", OPTS), null)
  assert.equal(harnessShellWriteReason("sed 's/a/b/' .claude/settings.json", OPTS), null)

  // 인플레이스 변형 전수 — 차단 유지
  assert.ok(harnessShellWriteReason("sed -i 's/a/b/' .claude/settings.json", OPTS))
  assert.ok(harnessShellWriteReason("sed -i.bak 's/a/b/' .claude/settings.json", OPTS))
  assert.ok(harnessShellWriteReason("sed --in-place 's/a/b/' .claude/settings.json", OPTS))
  assert.ok(harnessShellWriteReason("sed --in-place=.bak 's/a/b/' .claude/settings.json", OPTS))
  assert.ok(harnessShellWriteReason("sed -ni 's/a/b/' .claude/settings.json", OPTS))

  // 스크립트 본문의 w/W — -i 없이도 쓴다. -i만 조건으로 삼으면 여기가 새로 뚫린다.
  assert.ok(harnessShellWriteReason("sed '1w .claude/settings.json' infile", OPTS))
  assert.ok(harnessShellWriteReason("sed -n 's/a/b/w .claude/settings.json' infile", OPTS))

  // 변수 우회 회귀 — 현행 방어(명령줄 전체 OR 판정)가 유지되는지 고정한다.
  assert.ok(harnessShellWriteReason('F=.claude/settings.json; sed -i s/a/b/ $F', OPTS))
})

test('git 서브커맨드의 pathspec도 하네스 쓰기로 판정한다 (P05 우선순위 4)', () => {
  // P08이 git mv를 대량 승인시키므로 승인 피로가 곧 우회 키 입력이 된다.
  assert.ok(harnessShellWriteReason('git mv .claude/agents/qa.md .claude/agents/qa2.md', OPTS))
  assert.ok(harnessShellWriteReason('git rm .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('git restore .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('git checkout HEAD -- .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('git -C . mv .claude/settings.json other', OPTS))

  // 읽기·인덱스 조작은 파일 내용을 바꾸지 않는다 — 통과 유지
  assert.equal(harnessShellWriteReason('git diff .claude/settings.json', OPTS), null)
  assert.equal(harnessShellWriteReason('git log -1 .claude/agents/qa.md', OPTS), null)
  assert.equal(harnessShellWriteReason('git show HEAD:.claude/settings.json', OPTS), null)
})
