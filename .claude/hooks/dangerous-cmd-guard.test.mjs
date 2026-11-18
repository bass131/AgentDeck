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
// `silent`를 구분해야 하기 때문이다. 이 구획의 불변식은 하나다 — 가드는 어떤 명령에도
// 명시적 통과를 내지 않는다. 이 러너는 판정마다 `pass!`를 세어, 말미에서 그 수가 0건임을 한 번 더 단정한다.
//
// push 서버 보호 구획 (M05 H1 · 결정 대장 [USER] 2026-11-13) — `master`의 직접 push·강제 push·삭제는
// GitHub 서버의 브랜치 보호가 거부한다. 그래서 일반 push는 무출력(silent)이고, 가드는 이중 안전장치로
// 강제 push 꼴을 차단하고 원격 삭제·일괄 push·`master`가 글자로 보이는 push·`send-pack`을 묻는다.
// 셸 판독은 기준 커밋 9910a31의 원문 읽기 옆에 bash식 논리 줄 판독(줄 이음·주석·heredoc 본문)과 이음 지운 원문 읽기를 더했다(M06 G5, 합집합).
// 두 판독이 다 못 읽는 꼴(`2>&1` 뒤 옵션·`\X`·변수·별칭·명령 치환의 실행 내용)은
// 무출력이어도 된다 — `master`로 가면 서버가 거부하고, 작업 브랜치의 강제 갱신은 작업 브랜치 격리로 감수한다
// (사용자 판정 2026-11-13). 그런 꼴은 expectNoPass로 두고 근거를 단다. 기준 판독이 읽는 강제 push 꼴은 반드시 expectDeny다.
// `gh api`의 쓰기·보호 설정 호출과 `gh repo edit`·`delete`는 질의다 — 서버 보호를 푸는 경로이기 때문이다.
// 「기준 대비 회귀 방지」 구획은 push 밖 규칙과 정상 heredoc 커밋·PR 본문의 판정이 기준 가드와 같음을 고정한다.
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
const expectSilent = (cmd) => r.judge(label(cmd), decision(cmd), 'silent')
const expectDeny = (cmd) => r.judge(label(cmd), decision(cmd), 'deny')
// 가드가 읽지 못하는 꼴만 쓴다 — 무출력도 받기 때문이다. M05 H1부터 설정이 `Bash(git push*)`를 allow로 열어,
// 무출력 push에는 권한 창이 뜨지 않는다. `master`는 GitHub 서버 보호(PR 필수·강제 push·삭제 금지)가 받고,
// 작업 브랜치의 강제 갱신은 작업 브랜치 격리로 감수한다 (사용자 판정 2026-11-13).
// 그래서 이 헬퍼는 기준 판독이 못 읽는 꼴에만 쓰고 근거 주석을 단다 — 기준 판독이 읽는 강제 push 꼴은 반드시 expectDeny다.
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
    'gh pr merge 12', // M07 G12 — 병합은 묻지 않고 차단한다 (결정 대장 [USER] 「OK 가드도 Deny」)
  ]) judge(cmd, 'deny')

  console.log('축② 비가역 → ask (exit 0 + 승인 질의 JSON)')
  for (const cmd of [
    'git push origin master',
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
  judge('git push --force-with-lease origin main', 'deny')

  // ── push 서버 보호 (M05 H1 · [USER] 2026-11-13) — 일반 push는 무출력 ─────────────────
  console.log('push 서버 보호 — 일반 push는 무출력 (master는 GitHub 서버 보호가 지킨다)')
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
    // M04에서 질의였던 꼴 — master가 글자로 보이지 않고 삭제·일괄·강제가 아니다
    'git push origin main',
    'git push origin refs/heads/main',
    'git push origin HEAD:heads/main',
    'git push --follow-tags origin feature/x',
    'git push origin refs/tags/v1',
    'git push origin v1.0.0',
    'git push origin tag v1.0.0',
    'git push -u origin feature/x',
    'git push origin HEAD',
    'git push -u origin HEAD 2>&1 | tail -5',
    'git push --no-verify',
    'git push -q --no-verify origin chore/m04-goal-loop',
    `cd "${h.mirror}" && git push`,
    `cd ${h.mirror.replace(/\\/g, '/')} && git push -u origin HEAD 2>&1 | tail -3`,
    'git push origin feature/x:feature/x',
    'git push -o ci.skip origin feature/x',
    'git push --dry-run origin feature/x',
    'git push -n origin feature/x',
    'git push -uv origin feature/x',
    'git push --atomic --porcelain --progress origin feature/x',
    'git push --no-force-with-lease origin feature/x',
    'git push > /dev/null',
    'git push origin feature/x # publish',
    'git commit -m "x" && git push',
    'npm run lint && git push -u origin chore/m04-goal-loop',
    'git switch -c feature/new && git push -u origin feature/new',
    'git push; git status',
    'git -C other push',
    'cd ../other && git push',
    'cd . && git push',
    `cd ${h.mirror.replace(/\\/g, '/')}/.\\. && git push`,
    'git push . HEAD',
    'git push upstream',
    'git push https://github.com/someone/else.git HEAD',
    'GIT_DIR=../other/.git git push',
    'sh -c "git push -u origin chore/x"',
    'git.exe push -u origin chore/x',
  ]) expectSilent(cmd)
  r.judge('헬퍼 verdict · `git status` → allow', h.verdict('git status'), 'allow')
  r.judge('헬퍼 verdict · `git push -u origin chore/x` → allow(무출력, explicit-allow 아님)', h.verdict('git push -u origin chore/x'), 'allow')

  console.log('push 서버 보호 — 강제 push 꼴은 질의 없이 차단')
  for (const cmd of [
    'git push --force',
    'git push -f',
    'git push -uf origin feature/x',
    'git push --forc origin feature/x',
    'git push --force-with-lease',
    'git push --force-with-lease origin feature/x',
    'git push --force-with-lease=feature/x origin feature/x',
    'git push --force-with-lease=feature/x:abc123 origin feature/x',
    'git push --force-if-includes --force-with-lease origin feature/x',
    'git push --force-if-includes origin feature/x',
    'git push origin +feature/x',
    'git push origin +HEAD:feature/x',
    'git push origin feature/a +feature/b',
    'git push origin "+feature/x"',
    'sh -c "git push --force-with-lease origin feature/x"',
    'bash -c \'git push origin +feature/x\'',
    '(git push -f)',
    'FOO=1 git push --force',
    'sudo git push --force-with-lease',
    'git push origin +master',
  ]) expectDeny(cmd)

  console.log('push 서버 보호 — 원격 삭제 push는 질의')
  for (const cmd of [
    'git push origin --delete feature/x',
    'git push --delete origin feature/x',
    'git push origin --del feature/x',
    'git push origin -d feature/x',
    'git push -qd origin feature/x',
    'git push origin :feature/x',
    'git push origin :refs/heads/feature/x',
    'git push origin :',
    'sh -c "git push origin :feature/x"',
  ]) expectAsk(cmd)

  console.log('push 서버 보호 — 여러 ref를 한 번에 바꾸는 push는 질의')
  for (const cmd of [
    'git push --mirror',
    'git push --mir origin',
    'git push --all origin',
    'git push --branches origin',
    'git push --tags',
    'git push origin --tags 2>&1',
    'git push --prune origin',
    'git push --prune origin "refs/heads/*:refs/heads/*"',
  ]) expectAsk(cmd)

  console.log('push 서버 보호 — master가 글자로 보이는 push는 질의 (부분 문자열 · 대소문자 무시)')
  for (const cmd of [
    'git push origin master',
    'git push origin Master',
    'git push origin MASTER',
    'git push origin HEAD:master',
    'git push origin refs/heads/master',
    'git push origin HEAD:refs/heads/master',
    'git push origin chore/m04-goal-loop:refs/heads/master',
    'git push origin heads/master',
    'git push origin feature/x master',
    'git push -u origin master',
    'git push origin master 2>&1 | tail -3',
    'cd x && git push origin master',
    'git push origin feature/x && git push origin master',
    'FOO=1 git push origin master',
    'env GIT_TRACE=1 git push origin master',
    'sudo git push origin master',
    'git.exe push origin master',
    '/usr/bin/git push origin master',
    'git -c remote.origin.push=HEAD:master push',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.push GIT_CONFIG_VALUE_0=HEAD:master git push',
    '(git push origin master)',
    '{ git push origin master; }',
    'sh -c "git push origin master"',
    'bash -lc "cd x && git push origin HEAD:master"',
    'git push -o "" origin master',
    "git push --push-option '' origin master",
    'git push origin ">" master',
  ]) expectAsk(cmd)

  console.log('push 서버 보호 — send-pack은 전부 질의')
  for (const cmd of ['git send-pack origin master', 'git send-pack origin feature/x', 'git send-pack --all origin']) {
    expectAsk(cmd)
  }

  console.log('push 서버 보호 — 가드가 읽지 못해 서버 보호에 맡기는 꼴 (무출력이어도 된다, 명시적 통과는 아니다)')
  for (const cmd of [
    // 목적지가 다른 세그먼트·저장소 상태·설정으로 정해진다 — master는 서버가 PR 필수로 거부한다
    'git checkout master && git merge --no-ff chore/m04-goal-loop && git push',
    'git switch master && git push origin',
    'git checkout master; git pull; git push origin HEAD',
    'git rebase chore/m04-goal-loop master && git push',
    'git branch -M master && git push origin HEAD',
    'git config remote.origin.push HEAD:master && git push',
    'echo master | xargs git push origin',
    // 셸 확장 — 변수·명령 치환·중괄호 확장
    'git push origin "$BASE"',
    'git push origin "$(git branch --show-current)"',
    'git push origin mast{er,}',
  ]) expectNoPass(cmd)

  // ── 기준 판독 위의 push 규칙 (M05 H1 · 셸 판독은 기준 커밋 9910a31 그대로) ─────────────
  // 2차 수리의 셸 전처리(줄 이음·주석·리다이렉트 토큰·이스케이프 해제·제어 구문 머리·eval)는 되돌렸다 —
  // 기존 `reset --hard` 판정을 회귀시키고 정상 heredoc 커밋·PR 본문에 질의·차단을 만들었다 (H1 결정 대장 [AI] 2026-11-13).
  // M06 G5는 원문 읽기를 건드리지 않고 bash식 논리 줄 판독을 두 번째 판독으로 더했다 — 「줄 이음」 구획과 아래 회귀 방지 구획이 함께 고정한다.
  // 그래서 아래 첫 구획은 기준 판독이 읽는 꼴만 deny로 고정한다. 접두 판독이라 붙인 리다이렉트(`-f>/dev/null`)는 잡힌다.
  console.log('push 규칙 — 기준 판독이 읽는 강제 push 꼴은 차단')
  for (const cmd of [
    'git push -f>/dev/null origin x',
    'git push -f<<<x',
    'git push --force<<<x',
    'git push -f\\\n origin x',
    'git push --force\\\n origin x',
    'git push -f \\\n origin x',
    'git push --force-with-lease \\\n  origin chore/x',
    'git push origin +x\\\n',
    'git push --force>/dev/null',
    'git push --force>out.txt 2>&1',
    'git push --force-with-lease>/dev/null',
    'git push origin +x>/dev/null',
    'git push -f 2>/dev/null',
    'git push --force 2>&1 | tail -3',
    'git push --force-with-lease origin chore/x > /dev/null 2>&1',
    'git push origin x --force #comment',
    'time git push -f',
    // 설정을 거친 강제 push — `-c remote.<원격>.push=+…`와 같은 값의 `GIT_CONFIG_VALUE_N` 할당
    'git -c remote.origin.push=+refs/heads/x:refs/heads/x push',
    'git -c remote.origin.push=+HEAD:chore/x push origin',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=remote.origin.push GIT_CONFIG_VALUE_0=+HEAD:chore/x git push',
    // 긴 옵션 축약(`--for` 이상)·묶음
    'git push --for origin chore/x',
    'git push --forc origin chore/x',
    'git push origin x -f#notcomment',
    'git push --force-w origin chore/x',
    'git push --force-i origin chore/x',
    'git push -4f origin chore/x',
    'git push --repo=origin --force',
    'git push "--force"',
    'git push origin "+HEAD":chore/x',
    '( git push -f )',
    '{\n git push -f\n}',
    'git push origin chore/x --force-with-lease=chore/x:$(git rev-parse origin/chore/x)',
  ]) expectDeny(cmd)

  // ── 감수 (작업 브랜치 격리로 감수 — 사용자 판정 2026-11-13, master는 서버 보호) ─────────────
  // 기준 판독은 `2>&1`의 `&`에서 세그먼트를 끊고, 주석·`\X`·`$'…'`·제어 구문 머리·eval·timeout을
  // 셸처럼 풀지 않는다. 그래서 아래 꼴은 옵션·목적지가 가려져 무출력이다. `master`로 가면 서버 보호가 거부하고,
  // 작업 브랜치의 강제 갱신은 그 브랜치 안의 감수 위험이다. 명시적 통과만 아니면 된다.
  // 줄 이음 꼴은 M06 G5부터 읽는다 — 「줄 이음」 구획이 정확한 판정으로 고정한다.
  console.log('push 규칙 — 기준 판독이 못 읽는 꼴은 감수 (명시적 통과는 아니다)')
  for (const cmd of [
    // 리다이렉트의 `&` — `2>&1`·`>&2`·`&>`에서 세그먼트가 끊긴다
    'git push origin chore/x 2>&1 --force',
    'git push 2>&1 -f origin chore/x',
    'git push origin chore/x >&2 --force-with-lease',
    'git push &>/dev/null --force origin chore/x',
    'git push origin 2>&1 +chore/x',
    'git push origin 2>&1 --delete chore/x',
    'git push origin 2>&1 --tags',
    'git push origin 2>&1 master',
    'git push 2>&1 origin master',
    'git push origin 2>&1 HEAD:master',
    'git push origin >&2 master',
    // 주석 속 아포스트로피가 인용을 연다
    "# don't forget\ngit push --force origin chore/x",
    // 백슬래시 이스케이프·ANSI-C 인용 — 셸은 `\+`를 `+`로, `$'--force'`를 `--force`로 넘긴다
    'git push origin \\+chore/x',
    'git push \\--force origin chore/x',
    'git push -\\f origin chore/x',
    "git push origin $'+chore/x'",
    "git push $'--force' origin chore/x",
    'git push origin \\:chore/x',
    'git push origin m\\aster',
    // 제어 구문·래퍼 머리·eval — 명령 위치를 머리 토큰과 기준 래퍼 목록으로만 읽는다
    'if true; then git push -f origin x; fi',
    'for b in a b; do git push -f origin $b; done',
    'while true; do git push --force; done',
    '! git push -f',
    'timeout 60 git push --force',
    'nice -n 10 git push --force',
    'git --config-env a=B push --force',
    'git --attr-source HEAD push --force',
    'eval "git push --force origin x"',
    // `--f`·`--fo`는 `--follow-tags`와 겹치는 모호한 축약이라 git이 거부한다 — 강제 축약은 `--for`부터 센다
    'git push --f origin chore/x',
    'git push --fo origin chore/x',
    // 셸 확장으로 옵션이 만들어진다
    'git push ${FORCE:+--force} origin chore/x',
    'git push origin {+,}chore/x',
    // 인용이 닫히지 않는 명령 — bash가 구문 오류로 아무것도 실행하지 않는다 (`bash -n` 실측 exit 2)
    "echo it's\ngit push -f origin chore/x\necho 'ok'",
  ]) expectNoPass(cmd)
  // `-o`는 값을 먹는다 — `-ofoo`·`-odeploy`의 글자는 강제·삭제가 아니다
  for (const cmd of ['git push -ofoo origin x', 'git push -odeploy origin x', 'git push -o deploy origin x',
    'git push --fol origin chore/x', 'git push --follow-tags origin chore/x', 'git push --prune-tags origin',
    'git -c remote.origin.push=HEAD:chore/x push', 'git -c alias.st=status st']) expectSilent(cmd)
  // 한 번 쓰는 별칭으로 push를 감싸는 꼴 — 별칭 본문은 하위 명령 자리에 없어 판독이 닿지 않으니 묻는다.
  // 저장소·전역 설정에 영속된 별칭(`git config alias.p …` 뒤의 `git p`)은 명령 문자열에 없어 못 잡는다 (감수)
  for (const cmd of ["git -c alias.p='push -f' p origin x", 'git -c alias.p=push p origin x', "git -c 'alias.sp=!git push' sp"]) expectAsk(cmd)

  console.log('push 규칙 — 기준 판독이 읽는 원격 삭제·일괄·master push는 질의')
  for (const cmd of [
    'git push origin --delete>/dev/null chore/x',
    'git push origin :chore/x>/dev/null',
    "git push origin '':chore/x",
    'git push --mirror>/dev/null',
    'git push origin --tags>/dev/null',
    "git push origin mas''ter",
    'git push origin \\master',
    'git push origin HEAD:refs/heads/Master',
    // glob refspec — master를 포함해 여러 브랜치를 한 번에 바꿀 수 있다
    'git push origin "refs/heads/*:refs/heads/*"',
    'git push origin "refs/heads/chore/*"',
  ]) expectAsk(cmd)

  // 주석은 읽지 않는다(기준 판독) — 주석에 `master`가 있으면 작업 브랜치 push도 묻는다. 기준에서도 질의였고(push 전부 질의),
  // 루프의 push 명령은 주석을 달지 않으므로 무인 루프를 멈추지 않는다. 더 묻는 방향이라 감수한다.
  console.log('push 규칙 — 주석 속 master는 질의 (기준 판독, 더 묻는 방향)')
  for (const cmd of ['git push -u origin chore/x # master는 서버가 지킨다', 'git push -u origin chore/x  # not master']) expectAsk(cmd)

  console.log('push 규칙 — 정상 루프의 작업 브랜치 push는 무출력')
  for (const cmd of [
    'git push -u origin chore/x \\\n  2>&1 | tail -3',
    'git push -u origin chore/x 2>&1 | grep -v master',
    'git push -u origin chore/x 2>&1 && git log origin/master..HEAD --oneline',
    'git push -u origin chore/x && gh pr create --base master --fill',
    'git fetch origin master && git push -u origin chore/x',
    'git push -u origin chore/x &>/dev/null',
    'git push -u origin chore/x>/dev/null',
    'echo "a#b" && git push -u origin chore/x',
    'git push -u origin chore/x#notcomment',
  ]) expectSilent(cmd)

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
  // 병합 동사 판독은 그대로이고 판정만 차단이다 (M07 G12)
  for (const cmd of [
    'gh pr -R merge merge 12', 'gh pr --repo o/r merge 12', 'gh pr --repo=o/r merge 12', 'gh -R o/r pr merge 12',
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
  ]) expectDeny(cmd)
  for (const cmd of [
    'gh -R o/r release create v1',
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

  console.log('push 규칙 — 다른 세그먼트의 master push는 질의')
  for (const cmd of [
    'git push origin feature/x\ngit push origin master',
    'git push origin feature/x 2>&1 | tail -5; git push origin master',
    'git push origin feature/x && git push origin master',
  ]) expectAsk(cmd)
  for (const cmd of ['git push \\\n  -u origin feature/x']) expectSilent(cmd)

  console.log('push 규칙 — 가드가 읽지 못하는 꼴도 명시적 통과는 아니다 (작업 브랜치 격리로 감수 — 사용자 판정 2026-11-13, master는 서버 보호)')
  for (const cmd of [
    "# don't forget\ngit push origin master",
    "echo ok # it's fine\ngit push origin master\necho 'done'",
    'git push>/dev/null origin master',
    'git push</dev/null origin master',
    'git pu\\sh origin master',
    'g\\it push origin master',
    '! git push origin master',
    '>/dev/null git push origin master',
    'eval "git push origin master"',
    'timeout 60 git push origin master',
    'git push origin feature/x 2>&1 master',
    "cat > notes.txt <<EOF\ndon't\nEOF\ngit push origin master",
    "cat <<'A B'\nx\nA B\ngit push origin master",
    'f() { git push origin master; }; f',
    "bash -c 'bash -c \"bash -c \\\"bash -c git\\\\ push\\\"\"'",
    'git push origin feature/x | tail -5 master',
    'git push\torigin\tfeature/x',
    // 3차 검수 반례 — 유니코드 공백은 셸에서 낱말의 일부다
    ' git push',
    'git push ',
    'git push origin chore/m04-goal-loop　',
    '﻿git push',
    // 4차 검수 반례 — 끝의 CR은 bash에서 마지막 낱말에 붙는다
    'git push origin chore/m04-goal-loop\r',
    'git push\r\n',
  ]) expectNoPass(cmd)
  // 기준 판독이 읽는 꼴이라 정확히 질의로 고정한다 (H1 3차 검수 경미 2 — expectNoPass는 기준 판독이 못 읽는 꼴에만 쓴다)
  for (const cmd of [
    'git push -u origin feature/x master',
    'git push\n\ngit push origin master',
    'git push\r\ngit push origin master',
  ]) expectAsk(cmd)

  console.log('push 서버 보호 — 저장소 상태는 판정을 바꾸지 않는다 (작업 브랜치를 체크아웃한 진짜 저장소)')
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
    // 가드는 저장소를 읽지 않는다 — 작업 브랜치 push는 무출력, master가 보이는 push는 질의 그대로다
    for (const cmd of ['git push', 'git push origin', 'git push origin chore/m04-goal-loop', 'git push -u origin chore/m04-goal-loop']) {
      expectSilent(cmd)
    }
    expectAsk('git push origin master')
    expectDeny('git push --force-with-lease')
    // 공통 헬퍼의 판정 축은 명시적 통과를 `explicit-allow`로 따로 센다 — 어떤 명령에도 그 값이 나오면 안 된다
    r.judge('헬퍼 verdict · `git push` (explicit-allow가 아니다)', h.verdict('git push'), 'allow')
    r.judge('헬퍼 verdict · `git push -u origin chore/m04-goal-loop` (explicit-allow가 아니다)', h.verdict('git push -u origin chore/m04-goal-loop'), 'allow')
  }

  console.log('병합만 승인 — 작업을 폐기하는 브랜치 전환은 차단 (3차 검수: 설정의 `git switch -c*` 허용이 열던 꼴)')
  for (const cmd of ['git switch -c tmp --discard-changes', 'git switch -f master', 'git switch --force -c tmp', 'git switch --discard master']) {
    judge(cmd, 'deny')
  }
  // M05 H1 — 설정이 `git switch *`를 열어, `-C`·`--force-create`(기존 브랜치 포인터 강제 이동)도 막는다
  for (const cmd of [
    'git switch -C chore/x origin/master',
    'git switch -C chore/m05-h1-push-server-guard 9910a31',
    'git switch --force-create chore/x origin/master',
    'git switch -qf master',
    'git switch --dis master',
    'git switch -f>/dev/null master',
    'git switch --discard-changes>/dev/null master',
  ]) expectDeny(cmd)
  // 기준 판독이 못 읽는 꼴(`2>&1` 뒤 옵션) — 로컬 편집 폐기는 로컬 감수 위험이다 (사용자 판정 2026-11-13). 줄 이음 꼴은 「줄 이음」 구획
  for (const cmd of ['git switch master 2>&1 --discard-changes', 'git switch master 2>&1 -f']) {
    expectNoPass(cmd)
  }
  for (const cmd of ['git switch -c feature/new', 'git switch master', 'git switch -', 'git switch --detach HEAD~3', 'git switch --no-guess master']) {
    r.judge(label(cmd), decision(cmd), 'silent')
  }

  console.log('push 서버 보호 — 로컬 ref를 덮어쓰는 fetch는 질의 (설정이 `git fetch*`를 연다)')
  for (const cmd of [
    'git fetch origin +refs/heads/chore/x:refs/heads/chore/x',
    'git fetch origin master:master',
    'git fetch -f origin master:chore/x',
    'git fetch --force origin master:chore/x',
    "git fetch --prune origin 'refs/heads/*:refs/heads/*'",
    'git fetch --prune origin refs/heads/chore/x',
    'git fetch -p origin refs/heads/chore/x',
    'git fetch -u origin master:chore/x',
    'git fetch --update-head-ok origin +master:chore/m05-h1-push-server-guard',
  ]) expectAsk(cmd)
  for (const cmd of ['git fetch', 'git fetch origin', 'git fetch --prune', 'git fetch --prune origin', 'git fetch origin master',
    'git fetch --prune --prune-tags origin', 'git fetch git@github.com:o/r.git', 'git fetch https://github.com/o/r.git chore/x', 'git fetch --all',
    // 리다이렉트·주석·옵션 값은 refspec이 아니다 (H1 3차 검수 중요 1 — 루프가 습관적으로 붙이는 꼴)
    'git fetch --prune origin 2>&1 | tail -3', 'git fetch --prune origin > /dev/null', 'git fetch -p origin 2>/dev/null',
    'git fetch --prune origin # 정리', 'git fetch --depth 1 --prune origin', 'git fetch -j 4 --prune origin',
    'git fetch origin 2>C:/tmp/e.log', 'git fetch origin 2>&1']) {
    expectSilent(cmd)
  }
  // 리다이렉트를 붙여도 덮어쓰는 refspec은 그대로 질의다
  for (const cmd of ['git fetch origin +master:chore/x 2>&1 | tail -3', 'git fetch --prune origin refs/heads/chore/x > /dev/null',
    'git fetch --depth 1 origin master:chore/x']) expectAsk(cmd)

  // ── 병합 차단 (M07 G12 · 결정 대장 [USER] 「OK 가드도 Deny」) ──
  // 병합은 사람의 버튼(현황판·앱 PR 카드)과 사용자가 직접 치는 한 줄로만 한다(헌법 10조). 가드는 읽을 수 있는 병합 꼴을
  // 묻지 않고 차단한다. 사용자의 `!` 명령은 이 훅을 지나지 않는다(훅 로그에 PR 74·77의 `!` 병합 기록이 없다, 2026-11-18).
  console.log('병합 차단 — 병합 꼴은 묻지 않고 차단, 안내는 병합 길')
  for (const cmd of [
    'gh pr merge 12 --squash',
    'gh pr merge 12 --merge --match-head-commit 84fc92833352416eb698db217cf377bc0204a5d6',
    'gh pr merge 12 --auto --merge',
    'gh pr -R o/r merge 12',
    'gh pr --repo o/r merge 12',
    'gh.exe pr merge 12',
    '/usr/bin/gh pr merge 12',
    'GH_TOKEN=x gh pr merge 12',
    'GH_REPO=o/r gh pr merge 12',
    'sudo gh pr merge 12',
    'env GH_REPO=o/r gh pr merge 12',
    'nohup gh pr merge 12 &',
    'bash -c "gh pr merge 12 --merge"',
    "sh -lc 'gh pr merge 12'",
    'npm test && gh pr merge 12',
    '(cd x && gh pr merge 12)',
    // `timeout` 래퍼 — 시간 낱말과 옵션 뒤가 명령 위치다
    'timeout 30 gh pr merge 12',
    'timeout -s KILL 30s gh pr merge 12',
    'timeout --signal=TERM 5m gh pr merge 12',
    'timeout -k 5 30 gh pr merge 12',
    // 병합 API — 끝점 낱말이 pulls/<번호>/merge이고 쓰기 호출
    'gh api -X PUT repos/o/r/pulls/12/merge',
    'gh api --method PUT /repos/o/r/pulls/12/merge -f merge_method=merge',
    'gh api repos/o/r/pulls/12/merge -X PUT',
    'gh api -XPUT repos/{owner}/{repo}/pulls/12/merge',
    'gh api repos/o/r/pulls/12/merge -f sha=abc',
    'gh api -H "Accept: application/vnd.github+json" --method=PUT repos/o/r/pulls/12/merge',
    'gh -R o/r api -X PUT repos/o/r/pulls/12/merge',
    'timeout 30 gh api -X PUT repos/o/r/pulls/12/merge',
    'gh api -iX PUT repos/o/r/pulls/12/merge',
    'gh api --method PUT https://api.github.com/repos/o/r/pulls/12/merge',
    'gh api -X PUT repos/o/r/pulls/12/merge/',
    'gh api -Xput repos/o/r/pulls/12/merge', // 붙여 쓴 값의 끝 글자(t)를 값 먹는 옵션으로 읽지 않는다
    'gh api -iXput repos/o/r/pulls/12/merge',
    // GraphQL 병합 — 필드 값에 병합 변이 이름
    'gh api graphql -f query=\'mutation { mergePullRequest(input: {pullRequestId: "x"}) { clientMutationId } }\'',
    'gh api graphql -F query="mutation{enablePullRequestAutoMerge(input:{pullRequestId:\\"x\\"}){clientMutationId}}"',
    'gh api /graphql --raw-field query=mutation{mergePullRequest(input:{pullRequestId:"x"}){clientMutationId}}',
  ]) expectDeny(cmd)
  {
    const res = h.run('gh pr merge 12 --merge')
    r.check('병합 차단 안내는 병합 길(현황판 병합 카드·사용자가 직접 치는 한 줄)을 알린다', res.code === 2 && /현황판/.test(res.stderr) && /사용자/.test(res.stderr) && !/외부 셸에서 직접 실행/.test(res.stderr),
      `exit ${res.code} · stderr ${JSON.stringify(String(res.stderr).slice(0, 200))}`)
    const api = h.run('gh api -X PUT repos/o/r/pulls/12/merge')
    r.check('병합 API 차단도 같은 안내', api.code === 2 && /현황판/.test(api.stderr), `exit ${api.code}`)
  }
  // 오탐 — 차단은 루프를 멈추므로, 병합 글자를 적기만 하는 꼴은 무출력이어야 한다
  for (const cmd of [
    "git commit -F - <<'EOF'\ndocs: 병합 한 줄\n\ngh pr merge 81 --merge --match-head-commit abc\nEOF",
    "gh pr create --base master --head feat/x --title t --body \"$(cat <<'EOF'\n병합: gh pr merge 81 --merge --match-head-commit abc\nEOF\n)\"",
    'echo "gh pr merge 81 --merge"',
    'grep -n "gh pr merge" CLAUDE.md',
    'git log --grep "gh pr merge" --oneline',
    'gh pr create --title merge --body x',
    'gh pr view 12 --json mergeable,mergeStateStatus',
    'gh api repos/o/r/pulls/12/merge',
    'gh api -X GET repos/o/r/pulls/12/merge',
    'gh api -Xget repos/o/r/pulls/12/merge',
    'gh api -H "Accept: application/vnd.github+json" repos/o/r/pulls/12/merge',
    'gh api repos/o/r/pulls/12 --jq .merged',
    'timeout 30 npm test',
    'timeout 600 gh pr checks 12 --watch',
  ]) expectSilent(cmd)
  // 쓰기지만 병합이 아닌 gh api — 지금처럼 묻는다(본문 글에 병합 끝점 글자가 있어도). 필드가 붙은 GraphQL 읽기도 gh가 POST로 보내 묻는다
  for (const cmd of [
    'gh api graphql -f query=\'{ repository(owner:"o", name:"r") { pullRequest(number: 12) { mergeable } } }\'',
    'gh api -X POST repos/o/r/issues/12/comments -f body="see pulls/12/merge"',
    'gh api graphql -F query=@q.graphql',
  ]) expectAsk(cmd)

  console.log('브랜치 삭제·릴리스의 변형은 질의')
  for (const cmd of [
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

  console.log('push 서버 보호 — 서버 보호를 바꿀 수 있는 gh 호출은 질의')
  for (const cmd of [
    // 메서드가 GET이 아님 — `-X`·`--method`·`--method=`·붙여쓰기·`-X=`·묶음
    'gh api -X PUT repos/o/r/branches/feature/x',
    'gh api -X DELETE repos/o/r/git/refs/heads/feature/x',
    'gh api --method PATCH repos/o/r',
    'gh api --method=POST repos/o/r/issues',
    'gh api -XPOST repos/o/r/issues',
    'gh api -X=POST repos/o/r/issues',
    'gh api -iX PUT repos/o/r/x',
    'gh api repos/o/r -X patch',
    'gh api repos/o/r -X',
    // 필드 옵션이 있으면 gh는 기본 메서드를 POST로 바꾼다
    'gh api repos/o/r/issues -f title=x',
    'gh api repos/o/r/issues -F n=1',
    'gh api repos/o/r/issues -ftitle=x',
    'gh api repos/o/r/issues -if title=x',
    'gh api repos/o/r/issues --field title=x',
    'gh api repos/o/r/issues --raw-field title=x',
    'gh api repos/o/r/issues --raw-field=title=x',
    'gh api repos/o/r/issues --input body.json',
    'gh api repos/o/r/issues --input=body.json',
    'gh api graphql -f query=x',
    // 보호 설정 경로 — 읽기(GET)도 묻는다
    'gh api repos/o/r/branches/master/protection',
    'gh api -X GET repos/o/r/branches/master/protection',
    'gh api repos/o/r/branches/master/protection/enforce_admins',
    'gh api repos/o/r/rulesets',
    'gh api repos/o/r/Rulesets/1',
    'gh api orgs/o/RULESETS',
    // 명령 위치의 변형
    'GH_TOKEN=x gh api -X PUT repos/o/r',
    'gh.exe api -X DELETE repos/o/r',
    '/usr/bin/gh api repos/o/r/rulesets',
    'sh -c "gh api -X PUT repos/o/r/branches/master/protection"',
    'gh api repos/o/r/pulls && gh api -X DELETE repos/o/r',
    // 저장소 설정 변경·삭제
    'gh repo edit --default-branch x',
    'gh repo edit o/r --visibility public',
    'gh repo delete o/r --yes',
    'gh -R o/r repo delete',
    // 리다이렉트가 붙은 꼴 — 토큰 안에 남아도 경로·메서드 값이 읽힌다
    "gh api repos/o/r/branches/master/prot''ection -X DELETE",
    'gh api repos/o/r/branches/master/protection>/dev/null -X DELETE',
    'gh api -X DELETE>/dev/null repos/o/r/git/refs/heads/x',
    'gh api -XDELETE>/dev/null repos/o/r/git/refs/heads/x',
    'gh api repos/o/r/git/refs/heads/x --method=DELETE>/dev/null',
    'gh api --hostname github.com -X DELETE repos/o/r',
    'gh api -p corsair -X DELETE repos/o/r',
    'gh api --jq .x -XDELETE repos/o/r',
    'gh --repo o/r api -X DELETE repos/o/r',
    'gh api -Xdelete repos/o/r',
    'gh api -X $M repos/o/r',
    'gh repo edit>/dev/null --default-branch x',
    // 보호 경로가 토큰으로 남는 heredoc·파이프 입력 꼴
    "gh api -X PUT repos/o/r/branches/master/protection --input - <<'EOF'\n{\"enforce_admins\": false}\nEOF",
    'echo \'{"enforce_admins":false}\' | gh api -X PUT repos/o/r/branches/master/protection --input -',
    'gh repo edit o/r --delete-branch-on-merge',
  ]) expectAsk(cmd)
  // 기준 판독이 못 읽는 꼴 — `2>&1` 뒤 옵션·붙여 쓴 리다이렉트. 서버 보호 설정 변경은 헌법상 사용자 전용이고,
  // 루프는 보호 설정을 바꾸지 않는다. 가드가 못 읽는 꼴은 감수한다 (사용자 판정 2026-11-13).
  // 줄 이음 꼴(GitHub 문서의 표준 꼴)은 M06 G5부터 읽는다 — 「줄 이음」 구획이 질의로 고정한다.
  for (const cmd of [
    'gh api repos/o/r/git/refs/heads/x 2>&1 -X DELETE',
    'gh api repos/o/r/issues 2>&1 -f title=x',
    'gh pr merge>/dev/null 12',
  ]) expectNoPass(cmd)
  for (const cmd of [
    'gh api repos/x/y/pulls',
    'gh api -X GET repos/o/r/pulls',
    'gh api --method get repos/o/r/pulls',
    'gh api --method=GET repos/o/r/pulls',
    'gh api -XGET repos/o/r/pulls',
    'gh api repos/o/r/pulls --jq ".[0].title"',
    'gh api repos/o/r/pulls -q .[0].title',
    'gh api repos/o/r/pulls -H "Accept: application/vnd.github+json"',
    'gh api --paginate repos/o/r/issues',
    'gh api -i repos/o/r/branches',
    'gh api -HX-Foo:bar repos/o/r/pulls',
    'gh api -X "GET" repos/o/r/pulls',
    'gh api -- repos/o/r/pulls',
    "gh api -t '{{.x}}' repos/o/r/pulls",
    "gh api repos/o/r/pulls --jq '.[] | select(.draft==false)'",
    'gh api repos/o/r/pulls 2>&1 | head -5',
    'gh api \\\n  repos/o/r/pulls \\\n  --jq ".[0].title"',
    'gh repo view',
    'gh repo view o/r --json name',
    'gh repo clone o/r',
    'echo gh api -X PUT repos/o/r/branches/master/protection',
    'git commit -m "gh api -X PUT protection 정리"',
  ]) expectSilent(cmd)

  // ── 줄 이음 (M06 G5 · Backlog 8) ─────────────────────────────────────────────────────
  // 셸은 따옴표 밖과 큰따옴표 안의 `\`+개행을 지우고 앞뒤를 한 줄로 잇는다. 가드도 그렇게 읽어,
  // 이어 쓴 명령은 이어 쓰지 않은 같은 명령과 판정이 같아야 한다. 판정 자체도 고정한다(질의·차단).
  console.log('줄 이음 — `\\`+개행으로 이어 쓴 명령은 한 줄로 쓴 명령과 판정이 같다 (M06 G5)')
  const joinContinuations = (cmd) => cmd.replace(/\\\r?\n/g, '')
  const expectJoined = (cmd, want) => {
    const joined = decision(joinContinuations(cmd))
    const got = decision(cmd)
    r.judge(`${label(cmd)} (한 줄 꼴 ${joined})`, got, want)
    r.check(`${label(cmd)} → 한 줄 꼴과 같은 판정`, got === joined, `이어 쓴 꼴 ${got} · 한 줄 꼴 ${joined}`)
  }
  for (const cmd of [
    'git -c user.name=a \\\n  -c user.email=b push origin HEAD:master',   // Backlog 8 원형
    'git -c user.name=a \\\r\n  -c user.email=b push origin HEAD:master', // CRLF
    'git push \\\n origin master',
    'git push \\\r\n origin master',
    'git push origin \\\n  --delete chore/x',
    'git push \\\n --mirror',
    'git fetch origin \\\n  +master',
    'gh repo \\\n edit --visibility private',
    'gh api \\\n  --method PUT \\\n  -H "Accept: application/vnd.github+json" \\\n  /repos/o/r/branches/master/protection \\\n  --input -',
    'gh api \\\n  --method DELETE \\\n  /repos/o/r/branches/master/protection',
    'gh api \\\n  -X DELETE repos/o/r/branches/master/protection/enforce_admins',
    'gh api\\\n -X DELETE repos/o/r/branches/master/protection',
  ]) expectJoined(cmd, 'ask')
  // M07 G12 — 줄 이음으로 나눈 병합도 한 줄 꼴과 같이 차단
  for (const cmd of ['gh pr \\\n merge 12', 'gh pr merge\\\n 12 --squash', 'gh api \\\n  -X PUT \\\n  repos/o/r/pulls/12/merge']) expectJoined(cmd, 'deny')
  for (const cmd of [
    'git push \\\n  --force origin chore/x',
    'git push \\\r\n  --force origin chore/x',
    'git push \\\n  --force-with-lease origin chore/x',
    'git push origin chore/x \\\n  -f',
    'git push origin \\\n  +chore/x',
    'git push\\\n --force',
    'git switch \\\n  --discard-changes master',
    'rm \\\n  -rf dist',
    'git reset \\\n  --hard origin/master',
    'git commit -m "msg \\\n more" && git push \\\n --force',
  ]) expectJoined(cmd, 'deny')
  // 줄 이음이 아닌 꼴 — `\\`는 이스케이프된 백슬래시라 뒤의 개행은 진짜 구분자다(셸과 같다).
  expectDeny('echo foo\\\\\ngit push --force')
  // G5 1차 검수 FAIL — bash가 잇지 않는 자리의 `\`+개행. 이은 읽기만 쓰면 뒤 명령이 앞 줄에 붙어 사라졌다.
  // 이은 읽기는 원문 읽기에 더하는 합집합이라, 옛 가드가 잡던 꼴은 그대로 잡아야 한다 (bash 실측으로 뒤 명령이 실행된다).
  for (const cmd of [
    // 주석 끝 — 주석 안의 `\`는 줄을 잇지 않는다
    'echo ok # note \\\ngit push --force origin chore/x',
    '# note \\\ngit reset --hard HEAD~1',
    'echo ok # note \\\r\ngit push --force origin chore/x',
    'ls # list \\\nrm -rf dist',
    "bash -c 'echo a # c \\\ngit push --force origin chore/x'",
    "bash <<'EOF'\necho a # c \\\ngit push --force origin chore/x\nEOF",
    // 따옴표 친 heredoc 본문의 마지막 줄이 `\`로 끝남 — 본문은 글자 그대로이고 종결자 뒤 명령이 실행된다
    "cat > notes.md <<'EOF'\ncurl x \\\nEOF\ngit push --force origin chore/x",
    "cat > body.md <<'EOF'\nsee C:\\Dev\\\nEOF\ngit push --force-with-lease",
    "python - <<'EOF'\nprint(1) \\\nEOF\ngit push --force origin chore/x",
    // 면제 heredoc 여는 줄 끝의 `\` — 이어지는 것은 옵션 줄이고, 종결자 뒤 명령은 따로 실행된다
    "git commit -F - <<'EOF' \\\n  --no-verify\nfix: msg\nEOF\ngit push --force origin chore/x",
    "git commit -F - <<'EOF' \\\n  --no-verify\nfix: msg\nEOF\ngit reset --hard HEAD~1",
    // 이은 읽기가 새로 잡는 꼴 — 여는 줄에 이어 붙은 `&&` 뒤 명령, 줄 이음으로 쓴 종결자
    "git commit -F - <<'EOF' \\\n&& git push --force origin chore/x\nmsg\nEOF",
    'cat <<EOF\na\nE\\\nOF\ngit push --force origin chore/x\nEOF',
    // 제어 구문 머리 뒤 — 옛 가드가 개행 분할로 잡던 꼴은 그대로 잡는다
    'if true; then\\\n git push --force origin chore/x; fi',
  ]) expectDeny(cmd)
  for (const cmd of [
    'git status # check \\\ngit push origin master',
    'echo a # x \\\ngh api -X DELETE repos/o/r/branches/master/protection',
  ]) expectAsk(cmd)
  expectDeny('echo done # next \\\ngh pr merge 12 --squash') // M07 G12 — 병합은 차단

  // G5 2차 검수 FAIL·사용자 결정 B — 논리 줄 판독. heredoc 본문을 bash처럼 소비한 뒤의 명령 줄에서 줄 이음을 읽는다.
  // 면제 heredoc 커밋 본문의 짝 없는 `'`, 본문 끝 `\`, 여는 줄 이음이 뒤에 이어 쓴 명령을 가리지 않는다 (한 줄 꼴과 같은 판정).
  for (const cmd of [
    "git commit -q -F - <<'EOF'\nfix: don't break\nEOF\ngit push \\\n  --force origin chore/x",
    "cat <<'EOF' | git commit -F -\nit's\nEOF\ngit push \\\n -f",
    "git commit -q -F - <<'EOF'\ndocs: see C:\\Dev\\\nEOF\ngit reset \\\n  --hard HEAD~1",
    "git commit -F - <<'EOF' \\\n  --no-verify\nfix: don't break\nEOF\ngit push \\\n  --force origin chore/x",
    // 셸에 먹이는 본문은 명령이다 — bash가 본문을 스크립트로 읽으며 줄을 잇고 주석을 버린다
    "bash <<'EOF'\ngit push \\\n  --force origin chore/x\nEOF",
    "bash <<'EOF'\n# don't\ngit reset --hard\nEOF",
    // `$(( 1 << 2 ))`의 `<<`는 heredoc이 아니다
    'echo $((1<<2))\ngit push \\\n  --force origin chore/x',
    // `<<-`는 종결자 줄 앞의 탭을 벗긴다, 한 줄의 heredoc 둘은 본문을 차례로 먹는다
    'cat <<-EOF\n\tbody\n\tEOF\ngit push \\\n  --force origin chore/x',
    "cat <<A <<'B'\na\nA\nit's\nB\ngit push \\\n  --force origin chore/x",
    // 큰따옴표 안 `$( … )`의 heredoc 본문은 원문 그대로 소비한다 — 본문의 `"`가 바깥 인용을 닫지 않는다
    "git commit -m \"$(cat <<'EOF'\nsize 5\" wide\nEOF\n)\" && git push \\\n  --force origin chore/x",
    // 변이 판별 — 문맥 하나 안에서도 deny가 ask보다 먼저다, `\\` 짝 뒤 개행은 구분자, `bash -c` 스크립트 안도 잇는다
    'git push origin master \\\n  --force',
    'echo foo\\\\\ngit push origin master \\\n --force',
    "bash -c 'git push \\\n --force origin x'",
  ]) expectDeny(cmd)
  for (const cmd of [
    "git commit -q -F - <<'EOF'\nfix: don't break\nEOF\ngit -c user.name=a \\\n  -c user.email=b push origin HEAD:master",
    "git commit -q -F - <<'EOF'\r\nfix: don't break\r\nEOF\r\ngit push \\\r\n  origin master",
    "git commit -q -F - <<'EOF'\ndocs: see C:\\Dev\\\nEOF\ngit push \\\n  origin master",
    "git commit -q -F - <<'EOF'\nfix: don't break\nEOF\ngit push origin \\\n  --delete chore/x",
    "git commit -q -F - <<'EOF'\nfix: don't break\nEOF\ngit push \\\n  --mirror",
    "cat <<'EOF' | sh\ngit push \\\n  origin master\nEOF",
    // 제어 구문 낱말 뒤의 셸도 본문을 먹는다 — `then bash <<EOF`의 본문은 bash가 실행한다
    "if true; then \\\n  bash <<'EOF'\ngit push origin \\\n  --delete chore/x\nEOF\nfi",
    'git push origin "mas\\\nter"',
  ]) expectAsk(cmd)
  // G5 3차 검수 FAIL — 논리 줄 판독이 모르는 문맥에서 글을 버리던 꼴. 고친 뒤에는 한 줄 꼴과 같은 판정이다 (bash 실측).
  for (const cmd of [
    // 산술 `(( ))`·`$[ ]` 안의 `<<`는 heredoc이 아니다
    '((x = 1<<2))\ngit push \\\n --force origin chore/x',
    'if (( 1<<2 > 3 )); then echo y; fi\ngit push \\\n --force origin chore/x',
    'echo $[1<<2]\ngit push \\\n --force origin chore/x',
    // 주석이 아닌 `#` — 백틱 안, `${ }` 안, 낱말 가운데(`$( )`를 닫은 뒤·글자 뒤)
    'echo `echo a # c`; git push \\\n --force origin chore/x',
    'l=${l%% #*}; git push \\\n --force origin chore/x',
    'echo $(echo t)#tag; git push \\\n --force origin chore/x',
    'echo $((1+2))#tag; git push \\\n --force origin chore/x',
    'echo a#b; git push \\\n --force origin chore/x',
    'echo "a # b \' c"\ngit push \\\n --force origin chore/x',
    "echo $'it\\'s'\ngit push \\\n --force origin chore/x",
    "x=\"$( (echo a); echo \"it's\" )\"\ngit push \\\n --force origin chore/x",
    // 본문을 먹는 쪽이 면제 소비자(`cat`·`git commit -F -`)가 아니면 본문을 명령으로 다시 읽는다 — 셸 이름 목록에 기대지 않는다
    "timeout 60 bash <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",
    "exec bash <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",
    "builtin command bash <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",
    "<<'EOF' bash\ngit push \\\n --force origin chore/x\nEOF",
    "case a in a) bash <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n;; esac",
    "f() { bash <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n}; f",
    "cat <<'EOF' |& bash\ngit push \\\n --force origin chore/x\nEOF",
    "bash &>/dev/null <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",
    "$SHELL <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",
    "eval bash <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",
    "source /dev/stdin <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",
    "x=$(bash <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)",
    "cat > run.sh <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\nbash run.sh",
    "gh pr create --title t --body-file - <<'EOF'\nRepro:\ngit push \\\n  --force origin chore/x\nEOF",
    // 명령 자리의 `$( )`가 내는 글은 실행된다 — `bash -c "$(cat <<EOF …)"`
    "bash -c \"$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"",
    // 앞 줄이 원문 읽기의 따옴표 상태를 흔들어도 같다 — 셸 `-c` 자리의 `$( … )`는 논리 줄 판독이 실행으로 읽는다
    "cat > notes.md <<'EOF'\nit's\nEOF\nbash -c \"$(cat <<'XEOF'\ngit push \\\n --force origin chore/x\nXEOF\n)\"",
    "git commit -m \"$(cat <<'EOF'\nit's 5\" wide\nEOF\n)\"\nsudo bash -lc \"$(cat <<'XEOF'\ngit reset --hard \\\n  HEAD~1\nXEOF\n)\"",
    // 따옴표 없는 구분자의 본문은 `\\`를 `\`로 푼 뒤 셸이 읽는다, 구분자 낱말 안의 줄 이음, 깊은 중첩, `<<\E`는 따옴표 친 구분자
    'bash <<EOF\ngit push \\\\\n --force origin chore/x\nEOF',
    "cat <<E\\\nOF\nit's\nEOF\ngit push \\\n --force origin chore/x",
    "bash <<'A'\nbash <<'B'\nbash <<'C'\nbash <<'D'\ngit push \\\n --force origin chore/x\nD\nC\nB\nA",
    "cat <<\\E\nit's \\\nE\ngit push \\\n --force origin chore/x",
    'cat <<E\na \\\\\nE\ngit push \\\n --force origin chore/x',
  ]) expectDeny(cmd)
  for (const cmd of [
    '(( x = 1 << 2 ))\ngit push \\\n origin master',
    'echo ${x:-a #b}; git push \\\n origin master',
  ]) expectAsk(cmd)
  // 큰 입력은 한 번 훑기로 끝난다 — 줄 하나에 `$( … )`가 많거나 열린 `$(` 안에서 줄마다 heredoc이 있어도 제때 판정한다
  {
    const big = [
      'echo ' + '$(echo a) '.repeat(20000) + '\ngit push \\\n --force origin chore/x',
      'x=$(\n' + "cat <<'E'\nb\nE\n".repeat(17000) + ')\ngit push \\\n --force origin chore/x',
      'rm -rf dist\necho ' + '$(cat <<E) '.repeat(10000) + '\n',   // 4차 검수 — `$(`마다 파이프라인을 다시 훑던 제곱 시간
    ]
    for (const cmd of big) {
      const t0 = Date.now()
      const d = decision(cmd)
      r.check(`큰 입력 ${cmd.length}자 → deny, 2초 안`, d === 'deny' && Date.now() - t0 < 2000, `실측 ${d} · ${Date.now() - t0}ms`)
    }
  }
  // G5 4차 검수 FAIL — [이어 쓴 꼴, 한 줄 꼴] 쌍. bash는 둘 다 위험 명령을 실행한다(검수자 실측). 판정이 같고 무출력이 아니어야 한다.
  // 원인 여섯 갈래: 이스케이프된 글자를 낱말 경계로 읽음(`a\ #b`), 닫히지 않는 `((`, heredoc이 아닌 `<<`(`for((…<<=1))`·`a[1<<2]`),
  // 묶음 밖에서 셸로 가는 `cat` 본문, 백틱 안 heredoc, `${ }` 안 작은따옴표. 셋째 판독(이음 지운 원문 읽기)이 이 꼴들을 읽는다.
  for (const [cont, one] of [
    ["x=\"$(echo ${y:-'}'})\"\ngit push \\\n --force origin chore/x", "x=\"$(echo ${y:-'}'})\"\ngit push --force origin chore/x"],
    ["{ echo '#!/bin/bash'; cat <<'EOF'; } > run.sh\ngit push \\\n --force origin chore/x\nEOF\nbash run.sh", "{ echo '#!/bin/bash'; cat <<'EOF'; } > run.sh\ngit push --force origin chore/x\nEOF\nbash run.sh"],
    ["(cd .; cat <<'EOF' | bash\ngit push \\\n --force origin chore/x\nEOF\n)", "(cd .; cat <<'EOF' | bash\ngit push --force origin chore/x\nEOF\n)"],
    [". <(echo true; cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)", ". <(echo true; cat <<'EOF'\ngit push --force origin chore/x\nEOF\n)"],
    ["x=$(echo true; cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n); bash -c \"$x\"", "x=$(echo true; cat <<'EOF'\ngit push --force origin chore/x\nEOF\n); bash -c \"$x\""],
    ["bash -c \"$(echo true; cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"", "bash -c \"$(echo true; cat <<'EOF'\ngit push --force origin chore/x\nEOF\n)\""],
    ["bash -c \"true\n$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"", "bash -c \"true\n$(cat <<'EOF'\ngit push --force origin chore/x\nEOF\n)\""],
    ["echo a\\ #b; git push \\\n origin master", "echo a\\ #b; git push origin master"],
    ["git commit -m fix\\ #12; git push \\\n --force origin chore/x", "git commit -m fix\\ #12; git push --force origin chore/x"],
    ["echo a\\\t#b && git push \\\n --force origin chore/x", "echo a\\\t#b && git push --force origin chore/x"],
    ["ls Track\\ #3.mp3 2>/dev/null; rm \\\n -rf dist", "ls Track\\ #3.mp3 2>/dev/null; rm -rf dist"],
    ["if [[ abc =~ ((a|b)c) ]]; then :; fi\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit push \\\n --force origin chore/x", "if [[ abc =~ ((a|b)c) ]]; then :; fi\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit push --force origin chore/x"],
    ["((cd . && true) || echo fail)\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit push \\\n --force origin chore/x", "((cd . && true) || echo fail)\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit push --force origin chore/x"],
    ["((cd . && true) || echo fail)\ngit push \\\n --force origin chore/x", "((cd . && true) || echo fail)\ngit push --force origin chore/x"],
    ["x=$((echo a) | cat)\ncat <<'EOF'\nit's\nEOF\ngit push \\\n origin master", "x=$((echo a) | cat)\ncat <<'EOF'\nit's\nEOF\ngit push origin master"],
    ["{ echo set -e; cat <<'EOF'\r\ngit push \\\r\n --force origin chore/x\r\nEOF\r\n} | bash", "{ echo set -e; cat <<'EOF'\r\ngit push --force origin chore/x\r\nEOF\r\n} | bash"],
    ["{ echo set -e; cat <<'EOF'\ngit push \\\n origin master\nEOF\n} | bash", "{ echo set -e; cat <<'EOF'\ngit push origin master\nEOF\n} | bash"],
    ["{ echo set -e; cat <<'EOF'\ngit push origin \\\n --delete chore/x\nEOF\n} | bash", "{ echo set -e; cat <<'EOF'\ngit push origin --delete chore/x\nEOF\n} | bash"],
    ["(echo set -e; cat <<'EOF'\ngit push \\\n --mirror\nEOF\n) | sh", "(echo set -e; cat <<'EOF'\ngit push --mirror\nEOF\n) | sh"],
    ["echo a\\ #b; git push origin \\\n --delete chore/x", "echo a\\ #b; git push origin --delete chore/x"],
    ["echo a\\ #b; git push \\\n --mirror", "echo a\\ #b; git push --mirror"],
    ["echo a\\ #b; git push \\\r\n --force origin chore/x", "echo a\\ #b; git push --force origin chore/x"],
    ["{ echo set -e; cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n} | bash", "{ echo set -e; cat <<'EOF'\ngit push --force origin chore/x\nEOF\n} | bash"],
    ["(echo set -e; cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n) | sh", "(echo set -e; cat <<'EOF'\ngit push --force origin chore/x\nEOF\n) | sh"],
    ["{ true && cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n} | bash", "{ true && cat <<'EOF'\ngit push --force origin chore/x\nEOF\n} | bash"],
    ["bash <<< $(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)", "bash <<< $(cat <<'EOF'\ngit push --force origin chore/x\nEOF\n)"],
    ["bash -c \"`cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n`\"", "bash -c \"`cat <<'EOF'\ngit push --force origin chore/x\nEOF\n`\""],
    ["bash <(echo true; cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)", "bash <(echo true; cat <<'EOF'\ngit push --force origin chore/x\nEOF\n)"],
    ["script=$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\neval \"$script\"", "script=$(cat <<'EOF'\ngit push --force origin chore/x\nEOF\n)\neval \"$script\""],
    ["bash <<'A'\nbash <<'B'\nbash <<'C'\nbash <<'D'\nbash <<'E'\nbash <<'F'\nbash <<'G'\nbash <<'H'\nbash <<'I'\ngit push \\\n --force origin chore/x\nI\nH\nG\nF\nE\nD\nC\nB\nA", "bash <<'A'\nbash <<'B'\nbash <<'C'\nbash <<'D'\nbash <<'E'\nbash <<'F'\nbash <<'G'\nbash <<'H'\nbash <<'I'\ngit push --force origin chore/x\nI\nH\nG\nF\nE\nD\nC\nB\nA"],
    ["for((i=1;i<64;i<<=1)); do :; done\n# note \\\ngit push \\\n --force origin chore/x", "for((i=1;i<64;i<<=1)); do :; done\n# note \\\ngit push --force origin chore/x"],
    ["a[1<<2]=3\n# note \\\ngit push \\\n --force origin chore/x", "a[1<<2]=3\n# note \\\ngit push --force origin chore/x"],
    ["echo \\(#x\\); git push \\\n --force origin chore/x", "echo \\(#x\\); git push --force origin chore/x"],
    ["[[ abc =~ ((a|b)c) ]]\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit -c user.name=a \\\n  -c user.email=b push origin HEAD:master", "[[ abc =~ ((a|b)c) ]]\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit -c user.name=a -c user.email=b push origin HEAD:master"],
    ["echo a\\ #b; git -c user.name=a \\\n  -c user.email=b push origin HEAD:master", "echo a\\ #b; git -c user.name=a -c user.email=b push origin HEAD:master"],
  ]) {
    const got = decision(cont)
    const want = decision(one)
    r.check(`${label(cont)} → 한 줄 꼴(${want})과 같은 판정`, got === want && want !== 'silent', `이어 쓴 꼴 ${got} · 한 줄 꼴 ${want}`)
  }
  // G5 5차 검수 FAIL — 이어 쓴 줄이 여러 줄 따옴표 문자열의 닫는 줄에서 시작한다(`echo "a⏎b" && git push \⏎ …`).
  // 셋째 판독(이음 지운 원문 읽기)은 따옴표 상태를 글 머리부터 이어 세므로 구간 머리의 상태를 짐작하지 않는다.
  // 구간 머리의 따옴표 상태를 모르면 닫는 따옴표를 여는 것으로 읽는다. bash는 뒤 명령을 실행한다(검수자 실측, LF·CRLF).
  {
    const joinLast = (s) => { const k = s.lastIndexOf('\\\n'); return k < 0 ? s : s.slice(0, k) + s.slice(k + 2) }
    const crlf = (s) => s.split('\n').join('\r\n')
    for (const cont of [
      "{ echo set -e; cat <<'EOF'\necho \"a\nb\" && git push \\\n --force origin chore/x\nEOF\n} | bash",
      "{ echo set -e; cat <<'EOF'\necho \"a\nb\" && git push \\\n origin master\nEOF\n} | bash",
      "{ echo set -e; cat <<'EOF'\necho \"a\nb\" && git -c user.name=a \\\n  -c user.email=b push origin HEAD:master\nEOF\n} | bash",
      "{ echo set -e; cat <<'EOF'\necho \"a\nb\" && git push origin \\\n --delete chore/x\nEOF\n} | bash",
      "{ echo set -e; cat <<'EOF'\necho \"a\nb\" && git push \\\n --mirror\nEOF\n} | bash",
      "{ echo '#!/bin/bash'; cat <<'EOF'; } > run.sh\necho \"a\nb\" && git push \\\n --force origin chore/x\nEOF\nbash run.sh",
      "{ echo set -e; cat <<'EOF'\necho 'a\nb' && git push \\\n --force origin chore/x\nEOF\n} | bash",
      "{ echo set -e; cat <<'EOF'\ngit push origin feat\\\n#1 --force\nEOF\n} | bash",
      "x=\"$(echo ${y:-'}'})\"\ngit commit -q -m \"subject\n\nbody\" && git -c user.name=a \\\n  -c user.email=b push origin HEAD:master",
      "[[ abc =~ ((a|b)c) ]]\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit commit -q -m \"a\nb\" && git push \\\n origin master",
      "for((i=1;i<64;i<<=1)); do :; done\necho \"a\\\\\"; echo \"c\nd\" && git push \\\n --force origin chore/x",
      "x=`echo \"a\nb\" && git push \\\n --force origin chore/x`",
    ]) {
      for (const c of [cont, crlf(cont)]) {
        const got = decision(c)
        const want = decision(joinLast(c.split('\\\r\n').join('\\\n')).split('\n').join(c.includes('\r') ? '\r\n' : '\n').split('\r\r').join('\r'))
        r.check(`${label(c)} → 한 줄 꼴(${want})과 같은 판정`, got === want && want !== 'silent', `이어 쓴 꼴 ${got} · 한 줄 꼴 ${want}`)
      }
    }
    // 오탐 — 옛 가드도 한 줄 꼴도 무출력이고 bash는 push를 실행하지 않는다
    for (const cmd of [
      "gh pr create --title \"fix(M06-G5): guard reads line continuation\" --body \"$(cat <<'EOF'\n## Repro\ngit -c a=b \\\n  -c c=d push origin HEAD:master\nEOF\n)\"",
      "git commit -m \"fix(M06-G5): guard\" -m \"$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"",
      "git -C \"$PWD\" commit -m \"$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"",
      "[[ abc =~ ((a|b)c) ]]\ngit commit -q -F - <<'EOF'\nfix: guard\n\ngit push --force origin chore/x is blocked\nEOF",
      "v=$((echo a) | cat)\ngit commit -q -F - <<'EOF'\nfix: guard\n\ngit push origin master is asked\nEOF",
      "x=$(\ncat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)",   // 원문 읽기가 면제하는 본문 — 셋째 판독도 지운다
      "MSG=\"$(cat <<'EOF'\nRepro:\ngit push \\\n  --force origin chore/x\nEOF\n)\"",   // 따옴표 친 대입의 본문은 글이다(한 줄 꼴도 무출력)
    ]) expectSilent(cmd)
    // G5 6차 검수 FAIL — 여러 줄 문자열이 길어도(9줄·20줄·첫 줄 4,200자, 큰따옴표·작은따옴표) 같은 판정이어야 한다.
    // 셋째 판독은 구간을 잘라 거슬러 보지 않고, 글 전체를 원문 읽기의 따옴표 상태로 훑으며 이음만 지운다.
    {
      const lines = (n) => Array.from({ length: n }, (_, k) => `l${k}`).join('\n')
      const bodies = [`a\n${lines(9)}\nb`, `a\n${lines(20)}\nb`, `${'x'.repeat(4200)}\nb`]
      const shapes = []
      for (const body of bodies) {
        for (const q of ['"', "'"]) {
          const str = q + body + q
          shapes.push(`for((i=1;i<64;i<<=1)); do :; done\necho "a\\\\"; echo ${str} && git push \\\n origin master`)
          shapes.push(`x="$(echo \${y:-'}'})"\ngit commit -q -m ${str} && git push \\\n --force origin chore/x`)
          shapes.push(`{ echo set -e; cat <<'EOF'\necho ${str} && git push \\\n --force origin chore/x\nEOF\n} | bash`)
          shapes.push(`{ echo set -e; cat <<'EOF'\necho ${str} && git -c user.name=a \\\n  -c user.email=b push origin HEAD:master\nEOF\n} | bash`)
        }
      }
      // 긴 `bash -c "…"` 안의 커밋 본문 뒤 이어 쓴 push — 글 인자 판정의 꼬리 절단이 여는 따옴표를 잘랐다
      shapes.push(`bash -c "echo ${'x '.repeat(600)}; git commit -q -m $(cat <<'EOF'\ny\ngit push \\\n --force origin chore/x\nEOF\n)"`)
      shapes.push(`bash -c "echo ${'x '.repeat(600)}; git commit -q -m $(cat <<'EOF'\ny\ngit push \\\n origin master\nEOF\n)"`)
      for (const cont of shapes) {
        for (const c of [cont, crlf(cont)]) {
          const got = decision(c)
          const want = decision(joinLast(c.split('\\\r\n').join('\\\n')).split('\n').join(c.includes('\r') ? '\r\n' : '\n').split('\r\r').join('\r'))
          r.check(`${label(c).slice(0, 120)} → 한 줄 꼴(${want})과 같은 판정`, got === want && want !== 'silent', `이어 쓴 꼴 ${got} · 한 줄 꼴 ${want}`)
        }
      }
    }
    // 오탐 — 따옴표 친 인자 안의 이어 쓴 예시 명령은 글이다(작은따옴표 안은 잇지도 않는다). 옛 가드·한 줄 꼴 모두 무출력.
    for (const cmd of [
      "git commit -q -m 'fix: guard\n\ngit push \\\n  --force origin chore/x'",
      "git commit -q -m \"fix(M06-G5): guard\n\nRepro:\ngit push \\\n  --force origin chore/x\"",
      "gh pr create --title \"fix(M06-G5): guard\" --body \"## Repro\n\ngit -c a=b \\\n  -c c=d push origin HEAD:master\n\"",
      "git -C \"$PWD\" commit -q -m \"fix: a\" -m \"Repro:\ngit push \\\n  origin master\"",
      "gh pr comment 5 --body 'see:\ngit push \\\n  --mirror'",
    ]) { expectSilent(cmd); expectSilent(crlf(cmd)) }
    // G5 7차 검수 FAIL — `[[ =~ ]]` 정규식·extglob 괄호 안의 `#`는 주석이 아니다. bash는 뒤 이음을 잇고 push를 실행한다.
    for (const cont of [
      "[[ x =~ (#) ]] || git push \\\n --force origin b",
      "[[ x == @(#|y) ]] || git -c a=b \\\n -c c=d push origin HEAD:master",
      "[[ x =~ (#) ]] || git push origin \\\n --delete b",
      "[[ x =~ (#) ]] || git push \\\n --mirror origin",
      "[[ x =~ ( #) ]] && git push \\\n --force origin b",
      "[[ $1 =~ ^(#|x)$ ]]; git push \\\n --force origin b",
      "shopt -s extglob\nls @(#|x) 2>/dev/null; git push \\\n --force origin b",
      "[[ x =~ (#) ]] || git push --fo\\\nrce origin b",
      "[[ x =~ (#) ]] | git push origin HEAD:mas\\\nter",
    ]) {
      for (const c of [cont, crlf(cont)]) {
        const got = decision(c)
        const want = decision(joinLast(c.split('\\\r\n').join('\\\n')).split('\n').join(c.includes('\r') ? '\r\n' : '\n').split('\r\r').join('\r'))
        r.check(`${label(c)} → 한 줄 꼴(${want})과 같은 판정`, got === want && want !== 'silent', `이어 쓴 꼴 ${got} · 한 줄 꼴 ${want}`)
      }
    }
    // 진짜 주석 끝의 `\`는 잇지 않는다 — 주석 없이 이은 글을 더해도 다음 줄 명령은 여전히 읽힌다
    expectDeny("echo ok # see (a|b) \\\ngit push --force origin chore/x")
    expectDeny("[[ x =~ (#) ]] # note \\\ngit push --force origin chore/x")
    // 괄호 밖 낱말 머리의 `#`는 확실한 주석이다 — 주석 없이 이은 글을 더하지 않는다(뒤 줄을 주석 줄에 붙여 오탐을 만든다)
    expectSilent("git push -u origin feat/x # see (a|b) \\\ngit log master..HEAD")
    // 글 인자 자리 heredoc의 단계 머리 — 래퍼·제어 낱말·경로·따옴표를 벗겨 `git`·`gh`를 본다(7차 검수 오탐 36건).
    // 머리가 셸·`eval`이면 본문은 실행된다(`sudo bash -c "…$(cat <<EOF …)"`는 위 `bash -c` 행이 지킨다).
    expectDeny("eval \"git commit -m $(cat <<'EOF'\nmonitor 5\" screen\ngit push \\\n  --force origin x\nEOF\n)\"")
    for (const head of ['command gh pr create --title "fix(x): t" --body', '/usr/bin/gh pr create --body', '"C:/Program Files/GitHub CLI/gh.exe" pr create --body',
      'env GH_PAGER= gh pr create --body', 'if true; then git commit -q -m', 'sudo git commit -m']) {
      const cmd = `${head} "$(cat <<'EOF'\nmonitor 5" screen\ngit push \\\n  --force origin x\nEOF\n)"${head.startsWith('if') ? '; fi' : ''}`
      expectSilent(cmd); expectSilent(crlf(cmd))
    }
    // 글 인자 자리 heredoc 본문의 짝 없는 `"` — 이은 글에서도 본문은 글이다. 셸 `-c` 스크립트 안에서는 바깥 셸이 펼쳐 실행된다.
    expectSilent("git commit -q -m \"$(cat <<'EOF'\nfix: a 5\" screen\n\ngit push \\\n  --force origin chore/x\nEOF\n)\"")
    expectDeny("bash -c \"git commit -q -m $(cat <<'EOF'\ny\ngit push \\\n --force origin chore/x\nEOF\n)\"")
    expectDeny("bash -c \"cd . && git commit -q -m $(cat <<'EOF'\ny\ngit push \\\n --force origin chore/x\nEOF\n)\"")
    // 글 인자 자리가 아닌 `$( … )` — 머리가 `git`·`gh`가 아니면 셋째 판독도 본문을 글로 보지 않는다(한 줄 꼴도 deny)
    expectDeny("echo \"$(cat <<'EOF'\na 5\" b\ngit push \\\n  --force origin chore/x\nEOF\n)\"")
    // 같은 줄에서 `))`로 닫히는 `((`·`$((`는 산술이다 — 안의 괄호 묶음과 `<<`를 heredoc으로 읽지 않는다.
    // 닫히지 않으면 서브셸이다(위 오탐 행의 `[[ =~ ((a|b)c) ]]`·`$((echo a) | cat)`).
    for (const cmd of [
      "echo $(( (1+2) << 1 ))\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit push \\\n origin master",
      "(( x = (1+2) << 1 ))\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit push \\\n origin master",
      "echo $(( 1 +\n 2 ))\ngit push \\\n origin master",   // 여러 줄 산술 — 산술로 못 봐도 뒤 명령은 읽는다
      "((cd . && true) || echo fail)\ngit commit -q -F - <<'EOF'\nfix: don't\nEOF\ngit push \\\n origin master",
    ]) expectAsk(cmd)
    // 줄마다 `\`로 끝나는 따옴표 없는 heredoc 본문 — 본문 줄 잇기가 제곱 시간이면 안 된다
    const t0 = Date.now()
    const d = decision('rm -rf dist\nbash <<EOF\n' + 'a\\\n'.repeat(200000) + 'EOF')
    r.check('줄마다 `\\`인 따옴표 없는 heredoc 본문 20만 줄 → deny, 2초 안', d === 'deny' && Date.now() - t0 < 2000, `실측 ${d} · ${Date.now() - t0}ms`)
    // 개행 없는 `((` 반복 — 산술 판정이 `((`마다 줄을 다시 훑으면 제곱 시간이다(6차 검수 490KB 7.5초)
    for (const unit of ['((', '$((', 'x=$(((1)) ']) {
      const t1 = Date.now()
      const d1 = decision('rm -rf dist; ' + unit.repeat(Math.floor(400000 / unit.length)))
      r.check(`개행 없는 \`${unit}\` 반복 40만 자 → deny, 2초 안`, d1 === 'deny' && Date.now() - t1 < 2000, `실측 ${d1} · ${Date.now() - t1}ms`)
    }
  }
  // 연산자 `<<`가 줄 이음으로 갈라진 heredoc 커밋 — 원문 읽기는 한 줄 꼴도 놓치지만(본문의 `'`), bash는 뒤 push를 실행한다
  expectDeny("cat <\\\n<'EOF' | git commit -F -\nit's\nEOF\ngit push \\\n --force origin chore/x")
  // `$( … )`가 낸 글이 실행되는 자리 — 어느 판독도 이 본문을 글로 보고 지우지 않는다
  for (const cmd of [
    "eval \"$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"",
    "bash <<< \"$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"",   // here-string으로 셸에 먹이는 글
    "sh <<< \"$(cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n)\"",
    "sudo bash -c \"$(cat <<'EOF'\nrm \\\n -rf dist\nEOF\n)\"",
    // `$( … )` 안의 묶음이 셸로 간다 — 본문을 먹는 `cat`만 보고 면제하면 안 된다
    "x=$({ echo; cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF\n} | bash)",
    // 논리 줄 판독만 읽는 꼴 — 셋째 판독이 대신 읽지 못해 논리 줄 판독의 문맥 추적을 판별한다 (4차 검수의 살아남은 변이, bash 실측)
    "echo `echo a # c`; git push \\\r\n --force origin chore/x",
  ]) expectDeny(cmd)
  for (const cmd of [
    "((y = 3 # 2))\ngit commit -m \"$(cat <<'EOF'\nsize 5\" wide\nEOF\n)\" && git push \\\n origin master",
    "cat <<<EOF\ngit commit -m \"$(cat <<'EOF'\nsize 5\" wide\nEOF\n)\" && git push \\\n origin master",
    "eval \"$(cat <<'Z'\necho `echo a # c`; git push \\\n origin master\nZ\n)\"",
    "eval \"$(cat <<'Z'\nbash <<'EOF'\ngit push origin master\nEOF\nZ\n)\"",
    "sudo bash -lc \"$(cat <<'Z'\ncat <<< \"it's\"\necho `echo a # c`; git push \\\n origin master\nZ\n)\"",
    "echo $'it\\'s'\necho `echo a # c`; git push \\\n origin master",
  ]) expectAsk(cmd)
  // bash가 잇지 않거나 실행하지 않는 글 — 무출력이다 (작은따옴표 안, 면제 소비자의 본문, 주석 끝)
  for (const cmd of [
    "git push origin 'mas\\\nter'",
    "gh pr create --base master --title \"t\" --body \"$(cat <<'EOF'\na 5\" screen\nRepro:\ngit push \\\n  --force origin chore/x\nEOF\n)\"",
    'git push -u origin feat/x # note \\\ngit log master..HEAD',
    "git add -A && \\\n  git commit -q -F - <<'EOF' && \\\n  git push -u origin fix/x\nfix: don't stop\nEOF",
    "git commit -q -F - <<'EOF'\nfix: guard\n\ngit push --force origin chore/x 꼴을 막는다\nEOF\ngit push -u origin fix/x",
    // 글 인자 자리의 `$(cat <<'EOF' …)` 본문 — PR·커밋 본문의 재현 명령은 이어 써도 명령이 아니다 (셋째 판독은 원문 읽기처럼 열린 큰따옴표 안으로 읽는다)
    "gh pr create --title \"fix: guard\" --body \"$(cat <<'EOF'\nRepro:\ngit push \\\n  --force origin chore/x\nEOF\n)\"",
    "git commit -m \"$(cat <<'EOF'\nfix: guard\n\ngit push \\\n --force origin chore/x\nEOF\n)\"",
    "cat <<'EOF'\ngit push \\\n --force origin chore/x\nEOF",                                   // 원문 읽기가 면제하는 본문
    "git commit \\\n  -F - <<'EOF'\ngit push \\\n origin master\nEOF",                              // 여는 줄이 이어진 면제 본문 — 논리 줄 판독이 면제한다
    "git commit -q -F - <<'EOF'\nfix: x\n\ngit push \\\n  --force origin chore/x\nEOF\ngit push -u origin fix/x",
  ]) expectSilent(cmd)
  // 작은따옴표 안의 `\`+개행은 글자 그대로이고, 인용·heredoc 본문의 push 문장은 명령이 아니다.
  for (const cmd of [
    "git commit -m 'line one \\\ngit push --force origin master'",
    "git commit -F - <<'EOF'\nfix: 설명 \\\ngit push --force origin master\nEOF",
    'echo "git push \\\n --force"',
    'git status \\\n  --short',
    'git push \\\n origin chore/x',
  ]) expectSilent(cmd)

  // ── 기준 대비 회귀 방지 (M05 H1 2차 독립 검수 FAIL) ───────────────────────────────────
  // 2차 수리의 셸 전처리는 아래 첫 묶음을 기준 deny에서 무출력으로 회귀시켰고, 둘째 묶음(정상 heredoc 커밋·PR 본문)에
  // 새 질의·차단을 만들었다. 셸 판독을 기준 커밋 9910a31로 되돌린 뒤, 기준 가드의 실측 판정을 기대값으로 고정한다.
  console.log('회귀 방지 — push 밖 규칙은 기준 판정 그대로 (deny)')
  for (const cmd of [
    'echo a\\>&git reset --hard',
    'echo a\\ #b; git reset --hard',
    'echo $(date)#x; git reset --hard',
    'echo a\\\n#b; git reset --hard',
    'echo ${v/ #/x}; git reset --hard',
    'echo a # x\ngit reset --hard',
    'echo "#"; git reset --hard',
    'echo \\# ; git reset --hard',
    'echo a#b; git reset --hard',
    'echo hi >&2 & git reset --hard',
    'echo x 2>&1&git reset --hard',
    'echo a\\>&rm -rf x',
    'git reset --hard 2>&1 | tail -3',
    'git clean -fd 2>&1',
    'git clean -fd>/dev/null',
    'git checkout -- . 2>/dev/null',
    'git restore x # c',
    'git branch -D x 2>&1',
    'git stash drop 2>&1',
    'git config --global a b>/dev/null',
  ]) expectDeny(cmd)
  // 기준에서도 무출력이던 꼴 — 기존 한계이고 이번 goal 범위 밖이다. 판정이 기준과 같은지만 본다.
  // 줄 이음 꼴(`git reset \⏎ --hard`)은 M06 G5부터 읽어 「줄 이음」 구획이 deny로 고정한다.
  for (const cmd of ['git reset --hard>/dev/null', '>out git reset --hard',
    'if true; then git reset --hard; fi', 'timeout 5 git reset --hard', "bash <<'EOF'\n# don't\ngit reset --hard\nEOF"]) {
    expectNoPass(cmd)
  }
  for (const cmd of ['echo a\\ #b; echo SECOND', 'echo $(echo z)#x; echo SECOND', 'git checkout -b x 2>&1', 'git reset --soft HEAD~1 2>&1']) {
    expectSilent(cmd)
  }

  console.log('회귀 방지 — 정상 heredoc 커밋·PR 본문의 push 문장은 명령이 아니다 (무출력, 기준과 같다)')
  for (const cmd of [
    "git commit -m \"$(cat <<'EOF'\nfeat(M05-H1): push 서버 보호\n\n- git push origin master는 서버가 거부한다\n- 강제 push(--force, -f) 차단\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF\n)\"",
    "git commit -m \"$(cat <<'EOF'\ndocs: \"PR #12\" 문구 수정\n\ngit push origin master 꼴은 질의로 남긴다\nEOF\n)\"",
    "git commit -m \"$(cat <<'EOF'\ndocs: \"PR #12\" 문구 수정\n\ngit reset --hard 대신 revert를 쓴다\nEOF\n)\"",
    "gh pr create --title \"t\" --body \"$(cat <<'EOF'\n## Summary\n- \"closes #12\" 처리\n\n| 꼴 | 판정 |\n|---|---|\n| git push --force | 차단 |\nEOF\n)\"",
    "gh pr create --base master --title \"feat(M05-H1): push 서버 보호\" --body \"$(cat <<'EOF'\n## Summary\n- master 보호는 서버가 한다\n\n| 꼴 | 판정 |\n|---|---|\n| git push --force | 차단 |\n| git push origin master | 질의 |\nEOF\n)\"",
    "git commit -F - <<'EOF'\nfeat: x\n\ngit push origin master 꼴은 질의\n| git push --force | 차단 |\nEOF",
    "git commit -F - <<'EOF'\nfeat: x\n\n# heading don't\ngit push --force 설명\nEOF",
    'gh pr create --title "feat(M05-H1): push 서버 보호 (#38)" --body "master 보호 #1"',
    'git commit -m "fix: issue #12"',
    'git add -A && git commit -m "msg #12" && git push -u origin chore/x && gh pr create --base master --fill',
  ]) expectSilent(cmd)
  // 커밋 뒤에 이어지는 push는 기준 판독으로 읽힌다 — 강제는 차단, 원격 삭제는 질의 (2차 수리에서 무출력으로 샜던 꼴)
  for (const cmd of [
    "git commit -m \"$(cat <<'EOF'\nfix: \"PR #12\" wording\nEOF\n)\" && git push --force-with-lease",
    "git commit --amend -m \"$(cat <<'EOF'\nfix: \"PR #12\" wording\nEOF\n)\" && git push --force-with-lease",
    "git commit -m \"$(cat <<'EOF'\nfix: plain message\nEOF\n)\" && git push --force-with-lease",
    "git commit -m 'it'\\''s' && git push -f",
    "cat <<'EOF' | git commit -F -\nit's\nEOF\ngit push -f",
  ]) expectDeny(cmd)
  expectAsk("git commit -m \"$(cat <<'EOF'\nfix: \"PR #12\" wording\nEOF\n)\" && git push origin --delete chore/x")
  // 본문의 짝 없는 따옴표(`don't`·`5"`)가 기준 판독의 인용 상태를 어긋나게 해 뒤의 강제 push가 가려진다 —
  // 작업 브랜치 격리로 감수 (사용자 판정 2026-11-13, master는 서버 보호)
  for (const cmd of [
    "git commit -m \"$(cat <<'EOF'\nfix: handle \"don't\" case\nEOF\n)\" && git push --force-with-lease",
    "git commit --amend -m \"$(cat <<'EOF'\nfix: 5\" display\nEOF\n)\" && git push -f",
    "git commit -m $'fix: don\\'t' && git push --force",
  ]) expectNoPass(cmd)

  console.log('통과해야 하는 명령 → allow (exit 0 + 무출력)')
  for (const cmd of [
    'npm test',
    'npm run typecheck:node',
    'git status',
    'git commit -m "a && rm -rf /"',
    "git commit -m 'reset --hard 얘기'",
    'git commit -m "docs: git push 규칙 정리"',
    // push 서버 보호의 오탐 방어 — 인용문·push 아닌 명령 안의 낱말은 명령이 아니다
    'git commit -m "git push --force"',
    'git commit -m "git push origin master 금지"',
    'git commit -m "fix: +refspec과 :refspec 판독"',
    'gh pr create --title master',
    'gh pr create --base master --fill',
    'git checkout master',
    'git log origin/master..HEAD',
    'git diff master...HEAD',
    'git fetch origin master',
    'git pull origin master',
    'echo git push --force origin master',
    'gh api repos/x/y/pulls',
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
