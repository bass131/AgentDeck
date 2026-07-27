import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  classifyHarnessPath,
  dangerousCommandReason,
  harnessShellWriteReason,
  irreversibleCommandReason,
  isClaudeHarnessPath,
  openGateExecReason,
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

// ── HR2 P07: 폴더 개명 선행 — 신·구 이름 병행 수용 (ADR-028 개정 1) ───────────
//
// ⚠️ 이 파일에서 가장 중요한 테스트다. 개명(`00.Documents` → `00_Documents` 등)은 P08이
// 수행하는데, 판정 정규식이 옛 이름만 알면 **개명 순간 봉인이 조용히 풀린다**(매칭 실패 =
// 'unrelated' = fail-open). 정적 grep으로는 이 방향의 실패가 안 보이므로 — 정규식과 테스트가
// **둘 다** 옛 이름이면 테스트는 계속 통과한다(false green) — 새 이름 케이스를 명시 등재한다.
//
// 병행 수용을 택한 이유: 개명 전에는 옛 이름이, 개명 후에는 새 이름이 실재한다. 어느 한쪽으로
// 일원화하면 전환 구간에 반드시 구멍이 생기고, 부분 롤백에도 취약해진다. 구분자 하나만
// `[._]`로 넓히는 것이므로 봉인 범위는 넓어지지 않는다(존재하지 않는 폴더는 매칭돼도 무해).

test('의미 정본 층 — 새 이름(00_Documents)도 봉인한다 (HR2 P07 개명 선행)', () => {
  assert.equal(isClaudeHarnessPath('00_Documents/harness/CORE.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('00_Documents/harness/core-manifest.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('00_Documents/adr/ADR-028-folder-naming.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('00_Documents/ADR.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('C:/Dev/AgentDeck/00_Documents/harness/MAPPING.md', OPTS), true)
  // 옛 이름도 여전히 봉인 (개명 전이므로 회귀 0)
  assert.equal(isClaudeHarnessPath('00.Documents/harness/CORE.md', OPTS), true)
  // 봉인 밖 경계는 새 이름에서도 동일하게 유지
  assert.equal(isClaudeHarnessPath('00_Documents/PRD.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('00_Documents/reports/next/x.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('C:/repo/00_Documents/harness/CORE.md', OPTS), false)
  // 후보 추출기(HARNESS_MARKERS)까지 새 이름을 알아야 shell 우회 쓰기 층이 작동한다
  assert.ok(harnessShellWriteReason('tee 00_Documents/adr/ADR-001.md', OPTS))
  assert.ok(harnessShellWriteReason('echo x > 00_Documents/harness/core-manifest.json', OPTS))
  assert.ok(harnessShellWriteReason('sed -i s/a/b/ 00_Documents/ADR.md', OPTS))
  assert.equal(harnessShellWriteReason('cat 00_Documents/harness/CORE.md', OPTS), null)
})

// ── NC P03: 개명 선행 — 번호 접두 폴더명 병행 수용 (ADR-039) ──────────────────
//
// ⚠️ 위 HR2 P07 경고의 **3회차**다. 이번 개명은 성격이 다르다 — HR2는 구분자만
// 바뀌어(`00.Documents` → `00_Documents`) `[._]` 확장으로 덮였지만, NC는
// `harness` → `00_Harness`, `adr` → `01_Adr` 로 **이름 자체**가 바뀐다.
// 구분자 확장으로는 안 덮이므로 번호 접두를 선택적으로 받는다.
//
// ⭐ 왜 `(?:\d{2}_)?` 인가 — 특정 번호(`00_`·`01_`)를 나열하지 않는 이유는, 번호가
// 「읽는 순서」라서 문서가 하나 끼어들면 재정렬되기 때문이다(ADR-027의 촘촘 번호가
// 감수한 비용). 번호를 하드코딩하면 재정렬 때마다 봉인이 조용히 풀린다.
// 봉인 방향은 **집합을 넓히는 쪽**이라 존재하지 않는 번호가 매치돼도 무해하다.
//
// ⭐ 이 테스트가 이미 한 건을 잡았다: P02 매니페스트는 `HARNESS_MARKERS`를
// *"NC 개명 대상과 무접점 → 변경 0건 확인"* 으로 판정했는데, 실제로는 `:451`이
// `00[._]documents/(?:harness|adr)` 를 품고 있어 **수정 대상**이었다.
// 표는 사람이 읽고 픽스처는 기계가 읽는다 — 그래서 픽스처가 지도다.

test('의미 정본 층 — NC 신 폴더명(00_Harness/01_Adr)도 봉인한다 (NC P03 개명 선행)', () => {
  // 신 이름 — 개명 후 실재할 경로
  assert.equal(isClaudeHarnessPath('00_Documents/00_Harness/CORE.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('00_Documents/00_Harness/core-manifest.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('00_Documents/00_Harness/conformance-check.mjs', OPTS), true)
  assert.equal(isClaudeHarnessPath('00_Documents/01_Adr/ADR-039-naming-convention.md', OPTS), true)
  // 구 이름 회귀 0 — 개명 전에는 이쪽이 실재한다(병행 수용의 정의)
  assert.equal(isClaudeHarnessPath('00_Documents/harness/CORE.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('00_Documents/adr/ADR-039-naming-convention.md', OPTS), true)
  assert.equal(isClaudeHarnessPath('00.Documents/harness/CORE.md', OPTS), true)
  // 번호 재정렬에도 살아남는다 — 특정 번호를 하드코딩하지 않은 값어치
  assert.equal(isClaudeHarnessPath('00_Documents/02_Harness/CORE.md', OPTS), true)
  // ❄️ 봉인 경계는 넓어지지 않는다 — 함께 개명되는 다른 폴더는 봉인 대상이 아니다
  assert.equal(isClaudeHarnessPath('00_Documents/02_Reports/00_Milestones/NC.html', OPTS), false)
  assert.equal(isClaudeHarnessPath('00_Documents/03_Reviews/Codex/x.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('00_Documents/04_Artifacts/x.png', OPTS), false)
  assert.equal(isClaudeHarnessPath('00_Documents/05_Assets/x.svg', OPTS), false)
  assert.equal(isClaudeHarnessPath('00_Documents/ROOT_LAYOUT.md', OPTS), false)
  // 후보 추출기(HARNESS_MARKERS)까지 신 이름을 알아야 셸 우회 쓰기 층이 작동한다
  assert.ok(harnessShellWriteReason('tee 00_Documents/01_Adr/ADR-001.md', OPTS))
  assert.ok(harnessShellWriteReason('echo x > 00_Documents/00_Harness/core-manifest.json', OPTS))
  assert.ok(harnessShellWriteReason('sed -i s/a/b/ 00_Documents/00_Harness/CORE.md', OPTS))
  assert.equal(harnessShellWriteReason('cat 00_Documents/00_Harness/CORE.md', OPTS), null)
})

test('OpenGate — 새 이름(98_Management)도 봉인한다 (HR2 P07 개명 선행)', () => {
  assert.equal(isClaudeHarnessPath('98_Management/Harness_OpenGate/gate-open.flag', OPTS), true)
  assert.equal(isClaudeHarnessPath('98_Management/Harness_OpenGate/OPEN-GATE.bat', OPTS), true)
  assert.equal(isClaudeHarnessPath('98_Management/Harness_OpenGate/settings.SEALED.json', OPTS), true)
  assert.equal(isClaudeHarnessPath('C:/Dev/AgentDeck/98_Management/Harness_OpenGate/README.md', OPTS), true)
  // 옛 이름 유지 + 봉인 밖 경계 동일
  assert.equal(isClaudeHarnessPath('98.Management/Harness_OpenGate/gate-open.flag', OPTS), true)
  assert.equal(isClaudeHarnessPath('98_Management/notes.md', OPTS), false)
  assert.equal(isClaudeHarnessPath('C:/repo/98_Management/Harness_OpenGate/gate-open.flag', OPTS), false)
  // ⭐ 자기 개방 벡터 — 개명 후 이 줄이 죽으면 에이전트가 flag를 직접 만들어 창을 연다
  assert.ok(harnessShellWriteReason('echo 1753300000 > 98_Management/Harness_OpenGate/gate-open.flag', OPTS))
  assert.ok(harnessShellWriteReason('touch 98_Management/Harness_OpenGate/gate-open.flag', OPTS))
  assert.equal(harnessShellWriteReason('cat 98_Management/Harness_OpenGate/README.md', OPTS), null)
})

test('OpenGate 실행 차단도 새 이름을 인식한다 (HR2 P07 — 실행 벡터)', () => {
  assert.ok(openGateExecReason('98_Management/Harness_OpenGate/OPEN-GATE.bat'))
  assert.ok(openGateExecReason('cmd /c 98_Management\\Harness_OpenGate\\OPEN-GATE.bat'))
  assert.ok(openGateExecReason('98.Management/Harness_OpenGate/OPEN-GATE.bat'), '옛 이름 회귀 없음')
  // 언급·읽기는 여전히 통과 (ADR-038 개정 1)
  assert.equal(openGateExecReason('ls 98_Management/Harness_OpenGate'), null)
  assert.equal(openGateExecReason('cat 98_Management/Harness_OpenGate/README.md'), null)
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

// ── reviewer Tier 2-A 지적 봉합 (HR2 P05, 2026-07-25) ────────────────────────
// 네 건 모두 "판정기가 쓰기 명령·sealed 경로를 못 찾아 통과시킨다"는 같은 계열이다.
// 🔴-2만 P05가 새로 연 회귀(sed 무조건 차단 → 조건부)이고 나머지 셋은 선존 결함이다.

test('🔴-1 개행은 세그먼트 구분자다 — 두 줄짜리 명령이 봉인·파괴 가드를 통과하면 안 된다', () => {
  // `echo` 한 줄만 앞에 붙이면 CORE-01/11(봉인)과 CORE-07(파괴 금지)이 동시에 무력화됐다.
  // Bash 도구는 여러 줄 명령을 일상적으로 받으므로 우연히 밟을 수도 있는 경로였다.
  assert.ok(harnessShellWriteReason('echo hi\nsed -i s/a/b/ .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('echo hi\ntee .claude/settings.json', OPTS))
  assert.ok(dangerousCommandReason('echo hi\nrm -rf /c/Dev/AgentDeck/02.Source'))

  // heredoc 본문은 데이터지 명령이 아니다 — 개행 승격의 **짝**. 이 제거가 없으면
  // 커밋 메시지·문서 작성 같은 정상 작업이 통째로 오탐된다.
  assert.equal(dangerousCommandReason('cat > note.md <<EOF\nrm -rf /\nEOF'), null)
  assert.equal(harnessShellWriteReason('cat > note.md <<EOF\ntee .claude/settings.json\nEOF', OPTS), null)
  // 종료 델리미터가 없으면 제거하지 않는다 — 잘못 삼키면 실제 명령이 사라져 fail-open.
  assert.ok(harnessShellWriteReason('cat <<EOF\ntee .claude/settings.json', OPTS))
  // heredoc으로 봉인 파일에 쓰는 것은 리다이렉트가 남아 여전히 차단된다.
  assert.ok(harnessShellWriteReason('cat > .claude/settings.json <<EOF\nx\nEOF', OPTS))
})

test('🔴-2 sed 부정 주소·대체 구분자·e 명령도 쓰기다 (P05 조건부 전환이 연 회귀)', () => {
  assert.ok(harnessShellWriteReason("sed '1!w .claude/settings.json' f", OPTS))
  assert.ok(harnessShellWriteReason("sed '$!w .claude/settings.json' f", OPTS))
  assert.ok(harnessShellWriteReason("sed '/x/!w .claude/settings.json' f", OPTS))
  assert.ok(harnessShellWriteReason("sed '\\%x%w .claude/settings.json' f", OPTS))
  // GNU sed의 e 명령은 패턴스페이스를 셸 명령으로 실행한다 = 임의 쓰기 통로.
  assert.ok(harnessShellWriteReason("sed '1e tee .claude/settings.json' f", OPTS))

  // 읽기 오탐이 되살아나지 않는지 대조 — P05가 없앤 오탐을 다시 만들면 안 된다.
  assert.equal(harnessShellWriteReason("sed -n '/x/p' .claude/settings.json", OPTS), null)
  assert.equal(harnessShellWriteReason("sed 'y/ab/cd/' .claude/settings.json", OPTS), null)
  assert.equal(harnessShellWriteReason("sed -n '$=' .claude/settings.json", OPTS), null)
  assert.equal(harnessShellWriteReason("sed '/x/!d' .claude/settings.json", OPTS), null)
})

test('🔴-3 cd로 sealed 디렉토리에 들어간 뒤의 상대경로 리다이렉트도 차단한다', () => {
  // 리다이렉트 대상이 언제나 프로젝트 루트 기준이라, cd 한 번이면 훅 파일을 덮어쓸 수 있었다.
  assert.ok(harnessShellWriteReason('cd .claude/hooks && echo x > supervisor-guard.sh', OPTS))
  assert.ok(harnessShellWriteReason('cd .claude/hooks; echo x >> supervisor-guard.sh', OPTS))
  assert.ok(harnessShellWriteReason('pushd .claude/hooks && echo x > supervisor-guard.sh', OPTS))
  // 무관 디렉토리로 이동한 뒤의 리다이렉트는 통과 유지
  assert.equal(harnessShellWriteReason('cd 02.Source && echo x > note.txt', OPTS), null)
})

test('🔴-4 따옴표 밖 백슬래시·경로 경계 — 이스케이프와 greedy 추출로 sealed가 증발하면 안 된다', () => {
  // 줄바꿈 백슬래시 연속은 모델이 긴 명령을 정렬할 때 자연스럽게 나온다(적대적 의도 불요).
  assert.ok(harnessShellWriteReason('tee \\\n.claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('tee \\.claude/settings.json', OPTS))
  // sed의 w 명령은 파일명 앞 공백이 없어도 된다 — greedy 추출이 `w`까지 삼키면 unrelated가 됐다.
  assert.ok(harnessShellWriteReason("sed 'w.claude/settings.json' f", OPTS))
  // Windows 백슬래시 경로가 이스케이프 제거로 깨져 후보가 사라지면 안 된다(fail-open 방지).
  assert.ok(harnessShellWriteReason('tee C:\\Dev\\AgentDeck\\.claude\\settings.json', OPTS))
})

test('실행 접두사(exec·nohup·command·time·xargs)를 건너뛰고 실제 실행 위치를 본다', () => {
  // reviewer 미검증 #7에서 파생. 접두사가 붙으면 세그먼트 첫 토큰이 접두사가 되어
  // 쓰기 명령 이름이 판정기 눈에 안 보였다 — sudo·env만 건너뛰고 있었다.
  assert.ok(harnessShellWriteReason('exec tee .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('nohup tee .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('command tee .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('time sed -i s/a/b/ .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('xargs sed -i s/a/b/ .claude/settings.json', OPTS))
  assert.ok(dangerousCommandReason('exec rm -rf /c/Dev/AgentDeck/02.Source'))
  // 접두사만으로 오탐이 생기면 안 된다 — 뒤따르는 명령이 읽기면 통과
  assert.equal(harnessShellWriteReason("exec sed -n '1p' .claude/settings.json", OPTS), null)
})

test('sed 정규식은 병리적 입력에 지수 폭발하지 않는다 (ReDoS — reviewer 미검증 #3 실측)', () => {
  // 수정 전 실측: 백슬래시 n=30 → 29ms, n=40 → **3,652ms**(≈125배). n=50이면 분 단위다.
  // 판정기가 멈추면 훅이 타임아웃되고, 훅 타임아웃은 차단이 아니라 **조용한 통과**다 —
  // 즉 느린 정규식은 그 자체로 봉인 우회 벡터였다. 수정 후 같은 입력이 0.1ms.
  const evil = [
    (n) => `sed 's/a${'\\'.repeat(n)}b/c' .claude/settings.json`,
    (n) => `sed '\\%${'\\'.repeat(n)}' .claude/settings.json`,
    (n) => `sed '/${'a\\'.repeat(n)}' .claude/settings.json`,
  ]
  const started = process.hrtime.bigint()
  for (const build of evil) for (const n of [20, 30, 40, 50]) harnessShellWriteReason(build(n), OPTS)
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6
  // 임계는 머신 편차를 감안해 넉넉히 잡는다 — 폭발은 배수가 워낙 커서 여유로 잡아도 잡힌다.
  assert.ok(elapsed < 500, `병리적 입력 판정에 ${elapsed.toFixed(0)}ms — 선형이어야 한다`)
})

test('🟡-2·🟡-5 git 쓰기 서브커맨드 확장 + stash 하위 동사 분기', () => {
  // 경로 인자를 받아 파일을 만들거나 덮어쓰는 서브커맨드들 — sealed 경로가 명령줄에
  // 보일 때만 걸리므로(AND 조건) 평범한 git 사용에는 영향이 없다.
  assert.ok(harnessShellWriteReason('git config --file .claude/settings.json a.b c', OPTS))
  assert.ok(harnessShellWriteReason('git config -f .claude/settings.json a.b c', OPTS))
  assert.ok(harnessShellWriteReason('git archive -o .claude/out.tar HEAD', OPTS))
  assert.ok(harnessShellWriteReason('git bundle create .claude/x.bundle HEAD', OPTS))
  assert.ok(harnessShellWriteReason('git format-patch -o .claude/hooks HEAD~1', OPTS))
  assert.ok(harnessShellWriteReason('git worktree add .claude/wt', OPTS))
  assert.ok(harnessShellWriteReason('git init .claude/tmp', OPTS))
  assert.ok(harnessShellWriteReason('git stash push .claude/settings.json', OPTS))

  // stash는 하위 동사로 갈린다 — list/show는 읽기다(P05가 만든 오탐).
  assert.equal(harnessShellWriteReason('git stash show -p -- .claude/hooks', OPTS), null)
  assert.equal(harnessShellWriteReason('git stash list .claude/hooks', OPTS), null)
})

test('🟡-6 sed -f는 스크립트 *파일* — 내용이 시야 밖이라 쓰기로 간주한다', () => {
  // 옛 구현은 -f의 인자를 인라인 스크립트로 취급해 파일명을 정규식에 넣었다(의도와 코드 불일치).
  // 파일 내용은 판정기가 볼 수 없으므로 판정 불가 = fail-closed가 옳다.
  assert.ok(harnessShellWriteReason('sed -f my.sed .claude/settings.json', OPTS))
  assert.ok(harnessShellWriteReason('sed --file=my.sed .claude/settings.json', OPTS))
  // -e는 인라인이라 내용으로 판정한다 — 읽기 전용이면 통과 유지
  assert.equal(harnessShellWriteReason("sed -n -e '1,5p' .claude/settings.json", OPTS), null)
})

// ── CORE-06 비가역 사람 게이트 (A 스프린트 백로그 6, 2026-07-26) ──────────────
// 왜 훅 층인가: permission `ask`는 세션 권한 모드가 우회하면 통째로 죽는다(2026-07-26
// 같은 날 push 2회 연속 무프롬프트 — 실측). 같은 모드에서 훅 exit 2는 살아 있다는 것도
// 같은 날 실측했다(`npx tsc --version`이 supervisor-guard에 차단됨). CORE-11(봉인)은
// 권한 deny + 훅 2층인데 CORE-06만 권한 1층이던 **비대칭**이 결함의 정체다.
//
// 왜 "차단"만으로 짓는가: 훅은 사람에게 물을 수 없다(통과/차단 둘뿐). 그리고 payload만
// 보므로 **"이 명령을 사람이 승인했는가"를 원리적으로 알 수 없다** — 승인 flag를 두면
// 에이전트가 그 flag를 쓸 수 있어 무의미하다. OpenGate가 굳이 배치파일인 이유와 같다.
// 그래서 에이전트에게는 항상 닫고, 사람은 `!` 프리픽스(도구 호출이 아니라 로컬 셸 실행이라
// PreToolUse를 타지 않는다 — 2026-07-26 실측)로 실행한다.

test('CORE-06 비가역 명령 6종을 차단한다', () => {
  for (const command of [
    'git push',
    'git push origin chore/harness-renewal-opus5',
    'gh pr create --title x --body y',
    'gh pr merge 12 --squash',
    'gh release create v0.1.0',
    'npm publish',
    'npm run package',
  ]) assert.ok(irreversibleCommandReason(command), command)
})

test('비가역 판정은 우회 변형을 따라간다 (전역 옵션·실행 접두·세그먼트·중첩 셸)', () => {
  for (const command of [
    'git -C . push',                        // git 전역 옵션(1인자)
    'git -c user.name=x push',              // git 전역 옵션(2인자 형태)
    'env git push',                         // EXEC_PREFIXES
    'sudo git push origin master',
    'npm run typecheck && git push',        // 세그먼트 뒤쪽
    'cmd /c git push',                      // 중첩 셸
    'powershell -Command "git push"',
    'bash -c "gh pr merge 12"',
    'gh --repo o/r pr create',              // gh 전역 옵션
  ]) assert.ok(irreversibleCommandReason(command), command)
})

test('비가역 판정이 읽기 전용 이웃 명령을 오탐하지 않는다', () => {
  for (const command of [
    'git status --short',
    'git log origin/master..HEAD --oneline',
    'git remote -v',
    'git add 00_Documents/PRD.md',
    'git commit -m "docs: x"',
    'gh pr list --state all',
    'gh pr view 12',
    'gh pr diff 12',
    'gh pr checks 12',
    'npm install',
    'npm run test',
    'npm run build',
    "echo 'git push'",                      // 따옴표 안 = 언급
  ]) assert.equal(irreversibleCommandReason(command), null, command)
})

test('비가역 판정에 --dry-run/--help 예외를 두지 않는다', () => {
  // 판단: 예외를 두면 판정 표면이 넓어지고(플래그 조합마다 구멍 후보가 생긴다) 얻는 것은
  // 편의뿐이다. push 전 확인은 `git log origin/BR..HEAD`로 대체되고, 정말 필요하면
  // 영호가 `!`로 직접 실행하면 된다 — 사람 경로가 항상 열려 있으므로 손실이 없다.
  assert.ok(irreversibleCommandReason('git push --dry-run'))
  assert.ok(irreversibleCommandReason('git push --help'))
})

// ── 선재 우회 봉합 (reviewer 2026-07-26 🔴-1·🔴-2 실측) ───────────────────────
// 축②(비가역)를 얹으면서 드러난 **토대의 구멍**이다. 축② 이전부터 있었고, 같은 토큰화를
// 공유하는 CORE-07(파괴)·CORE-11(봉인)·ADR-038(OpenGate 자기 개방)이 함께 뚫려 있었다.
// 실측 대비: `cd .claude/hooks && echo x > supervisor-guard.sh`는 차단되는데
// 같은 명령을 괄호로 감싼 `(…)`는 통과했다 — 봉인이 **괄호 하나로** 열렸다.

test('🔴-1 셸 그룹핑·복합 키워드가 판정기 시야를 가리지 않는다', () => {
  // 축② 비가역
  for (const command of [
    '(git push)',
    '( git push )',
    '(cd 02_Source && git push)',
    '{ git push; }',
    'if true; then git push; fi',
    'for r in origin; do git push $r; done',
    'echo $(git push)',
    'echo `git push`',
  ]) assert.ok(irreversibleCommandReason(command), command)

  // 축① 파괴 (CORE-07)
  assert.ok(dangerousCommandReason('(rm -rf build)'), '(rm -rf build)')
  assert.ok(dangerousCommandReason('{ git reset --hard HEAD; }'), '{ git reset --hard HEAD; }')
  assert.ok(dangerousCommandReason('if true; then rm -rf build; fi'), 'if/then rm -rf')

  // CORE-11 봉인 — 괄호 하나로 열리던 구멍
  assert.ok(harnessShellWriteReason('(cd .claude/hooks && echo x > supervisor-guard.sh)', OPTS))
  assert.ok(harnessShellWriteReason('{ tee .claude/settings.json; }', OPTS))
  assert.ok(harnessShellWriteReason('if true; then tee .claude/settings.json; fi', OPTS))

  // ADR-038 OpenGate 자기 개방
  assert.ok(openGateExecReason('(98_Management/Harness_OpenGate/OPEN-GATE.bat)'))

  // 오탐 금지 — 괄호·키워드가 있어도 실행부가 무해하면 통과
  assert.equal(irreversibleCommandReason('(git status)'), null)
  assert.equal(dangerousCommandReason('(ls -la)'), null)
  assert.equal(harnessShellWriteReason('(cat .claude/settings.json)', OPTS), null)
})

test('🔴-1b 큰따옴표 안 명령 치환은 실행된다 — 작은따옴표는 리터럴이다', () => {
  // 셸 의미론 그대로: "$(…)"·"`…`"는 실행되고 '$(…)'는 문자열이다. 판정도 그래야 한다.
  assert.ok(irreversibleCommandReason('echo "$(git push)"'), 'double-quoted substitution')
  assert.ok(harnessShellWriteReason('echo "$(tee .claude/settings.json)"', OPTS))
  assert.equal(irreversibleCommandReason("echo '$(git push)'"), null, 'single-quoted literal')
  assert.equal(irreversibleCommandReason("echo 'git push'"), null)
})

test('🔴-2 인터프리터 heredoc 본문은 데이터가 아니라 명령이다', () => {
  assert.ok(irreversibleCommandReason("bash -s <<'SH'\ngit push\nSH"), 'bash -s heredoc')
  assert.ok(dangerousCommandReason("bash -s <<'SH'\nrm -rf 02_Source\nSH"))
  assert.ok(harnessShellWriteReason("bash -s <<'SH'\ntee .claude/settings.json\nSH", OPTS))
  assert.ok(irreversibleCommandReason('sh <<EOF\ngh pr merge 12\nEOF'))

  // 데이터 heredoc은 종전대로 오탐하지 않는다 — 이 오탐 방지가 stripHeredocs의 존재 이유였다.
  assert.equal(dangerousCommandReason('cat > note.md <<EOF\nrm -rf build\nEOF'), null)
  assert.equal(harnessShellWriteReason('cat > note.md <<EOF\ntee .claude/settings.json\nEOF', OPTS), null)
  assert.equal(irreversibleCommandReason('cat > note.md <<EOF\ngit push\nEOF'), null)
})

test('🟡-5 미지 플래그가 판정을 빠져나가지 않는다 (fail-open 방향 교정)', () => {
  assert.ok(irreversibleCommandReason('npm --workspaces publish'), '--workspaces는 boolean인데 값 플래그로 오등록됐었다')
  assert.ok(irreversibleCommandReason('npm --registry https://r publish'), '미등록 값 플래그')
  assert.ok(irreversibleCommandReason('git --attr-source HEAD push'))
  assert.ok(irreversibleCommandReason('gh --hostname h.example pr create'))

  // 오탐 금지 — git의 서브커맨드는 첫 위치라는 성질이 강하다. 뒤쪽 인자의 이름이
  // 우연히 push여도 그것은 브랜치·경로지 서브커맨드가 아니다.
  assert.equal(irreversibleCommandReason('git checkout push'), null)
  assert.equal(irreversibleCommandReason('git branch -D push'), null)
  assert.equal(irreversibleCommandReason('npm install publish-helper'), null)
})

test('🟡-6 실행 접두사 확장 — timeout·nice·npx와 그 인자를 건너뛴다', () => {
  assert.ok(irreversibleCommandReason('timeout 60 git push'))
  assert.ok(irreversibleCommandReason('nice -n 10 git push'))
  assert.ok(irreversibleCommandReason('npx --yes gh pr create'))
  assert.ok(dangerousCommandReason('timeout 60 rm -rf build'))
  assert.ok(harnessShellWriteReason('timeout 5 tee .claude/settings.json', OPTS))

  assert.equal(irreversibleCommandReason('timeout 60 git status'), null)
  assert.equal(irreversibleCommandReason('npx vitest run'), null)
})

const POLICY_CLI = fileURLToPath(new URL('./shell-policy.mjs', import.meta.url))
const runCli = (input, ...modes) =>
  execFileSync(process.execPath, [POLICY_CLI, ...modes], { input, encoding: 'utf8' })

test('🟡-10 CLI 복수 모드 — 한 번의 스폰으로 두 축을 묻고 어느 축인지 알린다', () => {
  assert.equal(runCli('git push', 'dangerous', 'irreversible').split(':')[0], 'irreversible')
  assert.equal(runCli('rm -rf build', 'dangerous', 'irreversible').split(':')[0], 'dangerous')
  // 인자 순서 = 우선순위. force push는 두 축에 다 걸리지만 ①(더 강한 쪽)이 안내를 소유한다.
  assert.equal(runCli('git push --force', 'dangerous', 'irreversible').split(':')[0], 'dangerous')
  // 단일 모드는 옛 출력 형식(이유 단독)을 유지한다 — supervisor-guard 등 기존 호출부 무변경 보장.
  assert.ok(runCli('git push', 'irreversible').startsWith('git push'))
  assert.equal(runCli('.claude/settings.json', 'path'), 'sealed')
  assert.equal(runCli('git status', 'dangerous', 'irreversible'), '')
})
