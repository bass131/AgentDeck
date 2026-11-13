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
// 셸 판독은 기준 커밋 9910a31 그대로다. 그 판독이 못 읽는 꼴(줄 이음·`2>&1` 뒤 옵션·주석·`\X`·`$'…'`·변수·별칭)은
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
  ]) judge(cmd, 'deny')

  console.log('축② 비가역 → ask (exit 0 + 승인 질의 JSON)')
  for (const cmd of [
    'git push origin master',
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
  // 기준 판독은 줄 이음의 개행·`2>&1`의 `&`에서 세그먼트를 끊고, 주석·`\X`·`$'…'`·제어 구문 머리·eval·timeout을
  // 셸처럼 풀지 않는다. 그래서 아래 꼴은 옵션·목적지가 가려져 무출력이다. `master`로 가면 서버 보호가 거부하고,
  // 작업 브랜치의 강제 갱신은 그 브랜치 안의 감수 위험이다. 명시적 통과만 아니면 된다.
  console.log('push 규칙 — 기준 판독이 못 읽는 꼴은 감수 (명시적 통과는 아니다)')
  for (const cmd of [
    // 줄 이음 — 개행에서 세그먼트가 끊긴다
    'git push \\\n  --force origin chore/x',
    'git push \\\n  --force-with-lease origin chore/x',
    'git push origin chore/x \\\n  -f',
    'git push origin \\\n  +chore/x',
    'git push\\\n --force',
    'git push origin \\\n  --delete chore/x',
    'git push \\\n --mirror',
    'git push \\\n origin master',
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
  // 기준 판독이 못 읽는 꼴(줄 이음·`2>&1` 뒤 옵션) — 로컬 편집 폐기는 로컬 감수 위험이다 (사용자 판정 2026-11-13)
  for (const cmd of ['git switch \\\n  --discard-changes master', 'git switch master 2>&1 --discard-changes', 'git switch master 2>&1 -f']) {
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
  expectNoPass('git fetch origin \\\n  +master')   // 줄 이음 — 기준 판독이 못 읽는다 (감수)
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
  // 기준 판독이 못 읽는 꼴 — 줄 이음(GitHub 문서의 표준 꼴)·`2>&1` 뒤 옵션. 서버 보호 설정 변경은 헌법상 사용자 전용이고,
  // 루프는 보호 설정을 바꾸지 않는다. 가드가 못 읽는 꼴은 감수한다 (사용자 판정 2026-11-13).
  for (const cmd of [
    'gh api \\\n  --method PUT \\\n  -H "Accept: application/vnd.github+json" \\\n  /repos/o/r/branches/master/protection \\\n  --input -',
    'gh api \\\n  --method DELETE \\\n  /repos/o/r/branches/master/protection',
    'gh api \\\n  -X DELETE repos/o/r/branches/master/protection/enforce_admins',
    'gh api\\\n -X DELETE repos/o/r/branches/master/protection',
    'gh api repos/o/r/git/refs/heads/x 2>&1 -X DELETE',
    'gh api repos/o/r/issues 2>&1 -f title=x',
    'gh repo \\\n edit --visibility private',
    'gh pr \\\n merge 12',
    'gh pr merge\\\n 12 --squash',
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
  for (const cmd of ['git reset --hard>/dev/null', 'git reset \\\n  --hard', '>out git reset --hard',
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
