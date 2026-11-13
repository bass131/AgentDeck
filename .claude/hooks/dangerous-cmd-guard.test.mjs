#!/usr/bin/env node
// 위험 명령 가드 — 축별 회귀 테스트 (M01 신설 · M02 Phase 2 Step 7·9에서 격리 이관·본문 수리).
//
// 격리 (Step 7) — 종전에는 가드를 임시 뿌리 없이 수십 번 spawn하고 payload에 session·agent도 넣지
// 않아, 러너를 돌릴 때마다 실저장소의 hook-log에 판정 줄이 섞였다. 지금은 공통 격리 헬퍼
// (_lib/guard-spawn.mjs)만 쓴다 — mkdtemp 미러 + 별도 GateState + CLAUDE_PROJECT_DIR 주입 +
// 합성 session_id·agent_id이고, 미러는 종료 시 지운다.
// 이 파일 말미의 「헬퍼 미경유 spawn 금지」 검사가 그 규율 자체를 러너 차원에서 지킨다.
//
// heredoc 본문 (Step 9) — 면제 대상 heredoc의 본문 머리 줄에는 위험 명령 **원문**을 둔다.
// 종전 본문(`fix: git push 재시도 로직 보강`)은 머리 토큰이 `fix:`라 오탐 표면을 겨누지 못했다.
//
// 「병합만 승인」 구획 (M04 Goal Loop) — 판정을 넷으로 가른다. 가드가 명시적으로 통과시키는
// `pass!`(permissionDecision "allow")와, 아무것도 내지 않아 Claude Code의 권한 흐름으로 넘기는
// `silent`를 구분해야 하기 때문이다. 이 구획의 불변식은 하나다 — 가드는 어떤 push 꼴에도
// 명시적 통과를 내지 않는다. 작업 브랜치 push의 무질의 통과는 네 가지 설계로 시도했으나 독립 검수를
// 통과하지 못해 사용자 판정(2026-11-13)으로 뺐다. 그래서 작업 브랜치 push도 전부 `ask`다.
// 이 러너는 판정마다 `pass!`를 세어, 말미에서 그 수가 0건임을 한 번 더 단정한다.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGuardHarness, REPO_ROOT } from './_lib/guard-spawn.mjs'

const r = createRunner('dangerous-cmd-guard 축별 회귀')
const h = createGuardHarness('dangerous-cmd-guard.mjs')
const label = (cmd) => `\`${cmd.replace(/\n/g, '\\n')}\``
const judge = (cmd, expect) => r.judge(label(cmd), h.verdict(cmd), expect)

// 판정 넷 — deny · ask · pass!(명시적 통과) · silent(무출력)
function decisionOf(res) {
  if (res.code === 2) return 'deny'
  const out = (res.stdout || '').trim()
  if (!out) return res.code === 0 ? 'silent' : `exit${res.code}`
  try {
    const d = JSON.parse(out)?.hookSpecificOutput?.permissionDecision
    return d === 'allow' ? 'pass!' : (d || 'unknown-json')
  } catch { return 'unparsable-stdout' }
}
// 명시적 통과가 한 번이라도 나오면 여기에 쌓인다 — 말미의 불변식 단정이 읽는다.
const explicitPasses = []
const decision = (cmd) => {
  const d = decisionOf(h.run(cmd))
  if (d === 'pass!') explicitPasses.push(cmd)
  return d
}
const expectAsk = (cmd) => r.judge(label(cmd), decision(cmd), 'ask')
// 가드가 읽지 못하는 꼴은 silent여도 된다 (권한 창이 받는다). 금지되는 것은 명시적 통과뿐이다.
const expectNoPass = (cmd) => {
  const d = decision(cmd)
  r.check(`${label(cmd)} → 명시적 통과가 아니다`, d !== 'pass!' && d !== 'unknown-json' && d !== 'unparsable-stdout', `실측 ${d}`)
}

const WORK = 'chore/m04-goal-loop'

try {
  console.log('축① 파괴 → deny (exit 2)')
  for (const cmd of [
    'rm -rf dist',
    'rm -fr node_modules',
    'git reset --hard origin/main',
    'git clean -fd',
    'git push --force origin main',
    'git push -f origin main',
    'git branch -D feature',
    'git checkout -- 02_Project/00_Source/main/index.ts',
    'Remove-Item -Recurse -Force dist',
    'npm test && rm -rf dist',
  ]) judge(cmd, 'deny')

  console.log('축② 비가역 → ask (exit 0 + 승인 질의 JSON)')
  for (const cmd of [
    'git push origin main',
    'gh pr merge 12',
    'gh release create v1',
    'npm publish',
    'npm run package',
  ]) judge(cmd, 'ask')

  console.log('축① 우선 — force push는 물어보지 않고 차단한다')
  {
    const res = h.run('git push --force')
    r.check('`git push --force` → exit 2 · stdout 무출력 (ask 아님)', res.code === 2 && res.stdout === '',
      `exit ${res.code} · stdout ${JSON.stringify(res.stdout.slice(0, 60))}`)
  }
  judge('git push --force-with-lease origin main', 'ask')

  // ── 「병합만 승인」 경계 (M04 Goal Loop · 헌법 10조 개정 · [USER] 2026-11-13) ──────────
  console.log('병합만 승인 — push는 전부 질의다 (작업 브랜치의 단독 한 줄 push도)')
  for (const cmd of [
    'git push',
    'git push origin',
    'git push -u origin HEAD',
    'git push origin feature/x',
    'git push -u origin chore/m04-goal-loop',
    'git push --set-upstream origin chore/m04-goal-loop',
    'git push -q -v origin chore/m04-goal-loop',
    'git push 2>&1',
    'git push -u origin chore/m04-goal-loop 2>&1 | tail -5',
    'git push origin chore/m04-goal-loop | tail -n 3',
    '  git push origin chore/m04-goal-loop\n',
    'git push origin chore/m04-goal-loop\n',
    'git push \n\n',
  ]) expectAsk(cmd)
  r.judge('헬퍼 verdict · `git status` → allow', h.verdict('git status'), 'allow')

  console.log('병합만 승인 — PR 생성은 가드가 관여하지 않는다 (설정의 allow가 연다)')
  for (const cmd of [
    'gh pr create --fill',
    'gh pr create --base master --title "t" --body "b"',
    // 마감 검수 반례 — 동사가 아닌 자리의 `merge`·`close`는 병합·삭제가 아니다
    'gh pr create --title merge --body x',
    'gh pr create --base merge --fill',
    'gh pr create --title close --body x -d',
    'gh pr view merge',
    'gh pr list --search merge',
    'gh pr list --head merge',
    'gh pr checkout merge',
    'gh pr diff merge',
    'gh pr view 12 -R o/r',
  ]) {
    r.judge(label(cmd), decision(cmd), 'silent')
  }
  for (const cmd of [
    'gh pr -R merge merge 12', 'gh pr --repo o/r merge 12', 'gh pr --repo=o/r merge 12', 'gh -R o/r pr merge 12', 'gh -R o/r release create v1',
    // 마감 재검수 반례 — gh는 `=` 없는 긴 옵션과 두 글자 옵션 뒤의 낱말을 값으로 읽고 건너뛴다
    'gh pr -b x merge 12',
    'gh pr --body x merge 12',
    'gh pr -t x merge 12',
    'gh pr --match-head-commit abc merge 12',
    'gh pr -b x merge 12 --squash --delete-branch',
    'gh pr --body=x merge 12',
    'gh pr -sd merge 12',
    'gh -b x pr merge 12',
    'gh --body x pr merge 12',
    'gh pr -c x close 12 -d',
    'gh pr --comment x close 12 --delete-branch',
    'gh -c x pr close 12 -d',
    'gh -n x release create v1',
    'gh --notes x release create v1',
    'gh --target x release create v1',
  ]) {
    expectAsk(cmd)
  }
  // 값으로 먹힌 낱말은 동사가 아니다 — gh도 이 꼴은 병합으로 실행하지 않는다
  for (const cmd of ['gh pr view --json merge', 'gh pr list -s merge', 'gh pr --help', 'gh pr -h']) {
    r.judge(label(cmd), decision(cmd), 'silent')
  }

  console.log('병합만 승인 — 가드가 push로 읽는 꼴은 전부 질의')
  for (const cmd of [
    // master 진입
    'git push origin master',
    'git push origin main',
    'git push origin Master',
    'git push origin HEAD:master',
    'git push origin chore/m04-goal-loop:refs/heads/master',
    'git push origin refs/heads/main',
    'git push origin heads/master',
    'git push origin HEAD:heads/main',
    'git push origin feature/x master',
    // 삭제·덮어쓰기·일괄
    'git push origin --delete feature/x',
    'git push origin -d feature/x',
    'git push origin :feature/x',
    'git push origin +feature/x',
    'git push --all origin',
    'git push --mirror',
    'git push --mir origin',
    'git push --tags',
    'git push --follow-tags origin feature/x',
    'git push origin refs/tags/v1',
    'git push origin v1.0.0',
    'git push origin tag v1.0.0',
    'git push origin "refs/heads/*:refs/heads/*"',
    // 옵션·연쇄·리다이렉트가 붙은 꼴
    'git push -u origin feature/x',
    'git push origin HEAD',
    'git push -u origin HEAD 2>&1 | tail -5',
    'git push --no-verify',
    'git push -q --no-verify origin chore/m04-goal-loop',
    `cd "${h.mirror}" && git push`,
    `cd ${h.mirror.replace(/\\/g, '/')} && git push -u origin HEAD 2>&1 | tail -3`,
    `cd ${h.mirror.replace(/\\/g, '/')}/.\\. && git push`,
    'git push origin feature/x:feature/x',
    'git push -o ci.skip origin feature/x',
    'git push --dry-run origin feature/x',
    'git push -uv origin feature/x',
    'git push > /dev/null',
    'git push origin feature/x # publish',
    'git commit -m "x" && git push',
    'npm run lint && git push -u origin chore/m04-goal-loop',
    'git switch -c feature/new && git push -u origin feature/new',
    'git push; git status',
    // 다른 저장소·원격
    'git -C other push',
    'cd ../other && git push',
    'cd . && git push',
    'git push upstream',
    'git push https://github.com/someone/else.git HEAD',
    'git push . HEAD',
    'GIT_DIR=../other/.git git push',
    'FOO=1 git push origin master',
    // 1차 검수 반례
    'git checkout master && git merge --no-ff chore/m04-goal-loop && git push',
    'git switch master && git push origin',
    'git checkout master; git pull; git push origin HEAD',
    'git push origin "$BASE"',
    'git push origin "$(git branch --show-current)"',
    'git push origin mast{er,}',
    '(git push origin master)',
    '{ git push origin master; }',
    // 2차 검수 반례
    'git push origin 2>&1 master',
    'git push 2>&1 origin master',
    'git push origin 2>&1 HEAD:master',
    'git push origin 2>&1 --tags',
    'git push origin >&2 master',
    'git push -o "" origin master',
    "git push --push-option '' origin master",
    'git rebase chore/m04-goal-loop master && git push',
    'git branch -M master && git push origin HEAD',
    'git config remote.origin.push HEAD:master && git push',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.push GIT_CONFIG_VALUE_0=HEAD:master git push',
    'echo master | xargs git push origin',
    'git push origin ">" master',
    'git send-pack origin master',
  ]) expectAsk(cmd)

  console.log('병합만 승인 — 가드가 읽지 못하는 꼴도 명시적 통과는 아니다 (권한 창이 받는다)')
  for (const cmd of [
    "# don't forget\ngit push origin master",
    "echo ok # it's fine\ngit push origin master\necho 'done'",
    "cat > notes.txt <<EOF\ndon't\nEOF\ngit push origin master",
    "cat <<'A B'\nx\nA B\ngit push origin master",
    'git push>/dev/null origin master',
    'git push</dev/null origin master',
    'git pu\\sh origin master',
    'g\\it push origin master',
    '! git push origin master',
    '>/dev/null git push origin master',
    'f() { git push origin master; }; f',
    'eval "git push origin master"',
    'timeout 60 git push origin master',
    "bash -c 'bash -c \"bash -c \\\"bash -c git\\\\ push\\\"\"'",
    'git push \\\n  -u origin feature/x',
    'git push origin feature/x\ngit push origin master',
    'git push origin feature/x 2>&1 master',
    'git push origin feature/x | tail -5 master',
    'git push origin feature/x 2>&1 | tail -5; git push origin master',
    'git push origin feature/x && git push origin master',
    'git push -u origin feature/x\u00a0master',
    'git push\torigin\tfeature/x',
    // 3차 검수 반례 — 유니코드 공백은 셸에서 낱말의 일부다
    ' git push',
    'git push ',
    'git push origin chore/m04-goal-loop　',
    '﻿git push',
    'git push\n\ngit push origin master',
    'git push\r\ngit push origin master',
    // 4차 검수 반례 — 끝의 CR은 bash에서 마지막 낱말에 붙는다
    'git push origin chore/m04-goal-loop\r',
    'git push\r\n',
  ]) expectNoPass(cmd)

  console.log('병합만 승인 — 저장소 상태는 통과를 열지 않는다 (작업 브랜치를 체크아웃한 진짜 저장소)')
  {
    h.initRepo(h.mirror, { head: WORK, branches: ['feature/x', 'master'] })
    r.judge('미러 저장소의 현재 브랜치', h.git(h.mirror, 'rev-parse', '--abbrev-ref', 'HEAD'), WORK)
    {
      let refused = false
      // 실저장소 경로를 넣지 않는다 — 검사가 깨진 날 이 테스트가 실저장소의 `.git`을 지우게 된다.
      // 미러와 접두만 같은 이웃 경로(없는 폴더)로 같은 것을 본다.
      try { h.initRepo(`${h.mirror}-neighbor`, { head: WORK }) } catch { refused = true }
      r.check('initRepo는 미러 밖 경로(접두만 같은 이웃)를 거부한다', refused, refused ? '거부' : '실행됨')
    }
    for (const cmd of ['git push', 'git push origin', 'git push origin chore/m04-goal-loop', 'git push -u origin chore/m04-goal-loop']) {
      expectAsk(cmd)
    }
    // 공통 헬퍼의 판정 축은 명시적 통과를 `explicit-allow`로 따로 센다 — 어떤 명령에도 그 값이 나오면 안 된다
    r.judge('헬퍼 verdict · `git push` (explicit-allow가 아니다)', h.verdict('git push'), 'ask')
    r.judge('헬퍼 verdict · `git push -u origin chore/m04-goal-loop`', h.verdict('git push -u origin chore/m04-goal-loop'), 'ask')
  }

  console.log('병합만 승인 — 작업을 폐기하는 브랜치 전환은 차단 (3차 검수: 설정의 `git switch -c*` 허용이 열던 꼴)')
  for (const cmd of ['git switch -c tmp --discard-changes', 'git switch -f master', 'git switch --force -c tmp', 'git switch --discard master']) {
    judge(cmd, 'deny')
  }
  for (const cmd of ['git switch -c feature/new', 'git switch master', 'git switch -']) {
    r.judge(label(cmd), decision(cmd), 'silent')
  }

  console.log('병합만 승인 — 병합·브랜치 삭제의 변형은 질의')
  for (const cmd of [
    'gh pr merge 12 --squash',
    'gh pr -R o/r merge 12',
    'gh pr --repo o/r merge 12',
    'gh.exe pr merge 12',
    '/usr/bin/gh pr merge 12',
    'GH_TOKEN=x gh pr merge 12',
    'gh pr close 12 --delete-branch',
    'gh pr close 12 -d',
    'gh pr close 12 -dc "bye"',
    'gh.exe release create v1',
    '/usr/bin/gh release create v1',
    'git branch -d merged',
    'git branch --delete merged',
    'git branch --del merged',
    'git update-ref -d refs/heads/feature/x',
  ]) expectAsk(cmd)
  for (const cmd of ['gh pr close 12', 'gh pr view 12', 'gh pr list', 'git branch --list', 'git branch -vv']) {
    r.judge(label(cmd), decision(cmd), 'silent')
  }

  console.log('통과해야 하는 명령 → allow (exit 0 + 무출력)')
  for (const cmd of [
    'npm test',
    'npm run typecheck:node',
    'git status',
    'git commit -m "a && rm -rf /"',
    "git commit -m 'reset --hard 얘기'",
    'git commit -m "docs: git push 규칙 정리"',
    'git stash push -m wip',
    'DIRS=(src rm -rf)',
    'X=1 Y=2 npm run lint',
  ]) r.judge(label(cmd), decision(cmd), 'silent')

  console.log('Moodie 대조 결손 다섯 건 → deny')
  // 근거: Moodie 32_cmd-guard.cjs matchSegment() — git-restore(L50)·del-s(L53)·rmdir-s(L54)
  //       ·remove-item-recurse(L55, -Force 없이 -Recurse 단독)·git-config-global(L63)
  for (const cmd of [
    'git restore 02_Project/00_Source/main/index.ts',
    'git restore --staged .',
    'del /s /q dist',
    'rmdir /s /q dist',
    'Remove-Item -Recurse dist',
    'git config --global user.name "someone"',
  ]) judge(cmd, 'deny')

  console.log('머리 토큰 판정 — 명령 위치가 아닌 곳의 git 단어는 오탐하지 않는다')
  // 면제 heredoc의 본문 머리 줄이 위험 명령 원문이다 — 이 줄이 세그먼트로 오인되면 deny가 난다
  for (const cmd of [
    "git commit -F - <<'EOF'\ngit push --force origin main\nrm -rf dist\nEOF",
    'echo git push',
    'echo git reset --hard',
    'grep -r git push 02_Project',
  ]) judge(cmd, 'allow')

  console.log('머리 토큰 판정 — git 전역 옵션이 앞에 붙어도 하위 명령을 놓치지 않는다')
  judge('git -C repo reset --hard', 'deny')
  judge('git --git-dir=.git restore .', 'deny')

  console.log('머리 토큰 판정 — 머리의 환경변수 할당 뒤가 명령 위치다 (M04)')
  judge('FOO=1 rm -rf dist', 'deny')
  judge('FOO=1 BAR=2 git reset --hard', 'deny')

  console.log('fail-closed — 판정 불가는 통과가 아니라 차단')
  r.judge('빈 stdin', h.verdictRaw(''), 'deny')
  r.judge('깨진 JSON', h.verdictRaw('{not json'), 'deny')

  console.log('판정 대상 없음 → 조용히 통과')
  r.judge('command 없는 payload', h.verdictPayload({ tool_name: 'Read', tool_input: { file_path: 'a.ts' } }), 'allow')

  console.log('병합만 승인 — 불변식: 이 러너의 어떤 판정에서도 명시적 통과가 나오지 않았다')
  r.check('명시적 통과(permissionDecision "allow") 0건', explicitPasses.length === 0,
    explicitPasses.map(label).join(', ') || '0건')

  // ── 헬퍼 미경유 spawn 금지 (Step 7 규율의 러너 차원 검사) ────────────────────
  // 가드를 spawn하는 어떤 테스트도 공통 격리 헬퍼를 거치지 않고 직접 spawn하지 않는다.
  // 판정: 가드 파일명을 언급하는 테스트 파일은 _lib/guard-spawn.mjs를 import해야 하고,
  //       자기 손으로 자식 프로세스를 띄우는 호출(spawnSync·execFile 류)을 갖지 않아야 한다.
  console.log('격리 규율 — 가드 spawn은 공통 헬퍼만 거친다')
  {
    const HOOKS = join(REPO_ROOT, '.claude', 'hooks')
    const files = readdirSync(HOOKS).filter((f) => f.endsWith('.test.mjs'))
    const offenders = []
    let guarded = 0
    for (const f of files) {
      const src = readFileSync(join(HOOKS, f), 'utf8')
      if (!src.includes('dangerous-cmd-guard.mjs')) continue
      guarded++
      const viaHelper = /_lib\/guard-spawn\.mjs/.test(src)
      const directSpawn = /\b(spawnSync|execFileSync|execFile|spawn)\s*\(/.test(src)
      if (!viaHelper || directSpawn) offenders.push(`${f}(헬퍼 ${viaHelper} · 직접spawn ${directSpawn})`)
    }
    r.check('가드를 언급하는 테스트 파일이 하나 이상이다', guarded > 0, `${guarded}개 / 전체 ${files.length}개`)
    r.check('가드 spawn 테스트 전건이 공통 헬퍼를 경유한다', offenders.length === 0, offenders.join(', ') || '위반 0건')
  }
} finally {
  h.cleanup()
}

process.exit(r.summary())
