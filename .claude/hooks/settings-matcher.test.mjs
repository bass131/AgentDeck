#!/usr/bin/env node
// settings.json을 파싱해 문자열만 대조하는 정적 단정이다 — 가드를 spawn하지 않아 배선이 어떤 상태든 판정이 성립한다.
// matcher는 정규식이라 비앵커 `"Bash"`는 이름에 Bash가 든 다른 도구에도 걸린다 — 전부 앵커 꼴이어야 한다.
// 가드 판정기는 POSIX 셸 문법 전용이라 PowerShell 도구는 deny로 닫는다 — 공식 permissions 문서 「PowerShell」 절:
// 「a bare `PowerShell` or `PowerShell(*)` matches every command.」 그 도구가 세션에 없어 발화 프로브 대신 이 단정을 쓴다.
// 20_plan-gate.cjs는 판정부를 공유하고 테스트가 직접 구동해 파일은 남지만 배선은 없어야 한다.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { REPO_ROOT } from './_lib/guard-spawn.mjs'
import { settingsVerdict } from './_lib/settings-rules.mjs'
import { CANONICAL_COMMANDS } from './_lib/canonical-commands.mjs'

const SETTINGS = join(REPO_ROOT, '.claude', 'settings.json')
const GUARD = 'dangerous-cmd-guard.mjs'
const EDIT_PLAN_GATE = '31_edit-plan-gate.cjs'
const EDIT_MATCHER = '^(Edit|MultiEdit|Write|NotebookEdit)$'
const PWSH_CLOSED = ['PowerShell', 'PowerShell(*)'] // 도구 전체를 닫는 두 형태 — 하나라도 있으면 닫혔다
const ANCHORED = /^\^.*\$$/ // `^Bash$`·`^(Task|Agent)$` 류 — 정확 일치 앵커

const r = createRunner('settings.json 훅 matcher 앵커 · PowerShell deny · 편집 게이트 배선')

let settings = null
try {
  settings = JSON.parse(readFileSync(SETTINGS, 'utf8'))
} catch (e) {
  r.check('settings.json이 파싱된다', false, String(e?.message ?? e))
}

if (settings) {
  const events = settings.hooks ?? {}
  const entries = Object.entries(events).flatMap(([event, list]) => (list ?? []).map((entry, i) => ({ event, i, entry })))
  const cmdOf = (entry) => (entry.hooks ?? []).map((h) => h.command ?? '').join(' ')

  const guardEntries = entries.filter(({ entry }) => cmdOf(entry).includes(GUARD))
  r.check('가드가 settings.json에 배선돼 있다', guardEntries.length === 1, `${guardEntries.length}건`)

  for (const { event, entry } of guardEntries) {
    r.judge(`가드 matcher (${event})`, entry.matcher, '^Bash$', { note: '정확 일치 앵커 — 비앵커는 발화 표면이 설계보다 넓다' })
  }

  // 규약 정합 — matcher를 갖는 항목은 전부 앵커 형태다
  const unanchored = entries
    .filter(({ entry }) => typeof entry.matcher === 'string' && entry.matcher !== '' && !ANCHORED.test(entry.matcher))
    .map(({ event, i, entry }) => `${event}[${i}] "${entry.matcher}"`)
  r.check('matcher를 가진 훅 항목이 전부 앵커 형태다', unanchored.length === 0, unanchored.join(', ') || '비앵커 0건')

  const deny = settings.permissions?.deny ?? []
  const pwshHits = deny.filter((rule) => PWSH_CLOSED.includes(rule))
  r.check('PowerShell 도구가 permissions.deny로 닫혀 있다', pwshHits.length >= 1,
    `기대 ${PWSH_CLOSED.map((s) => `"${s}"`).join(' 또는 ')} 중 하나 · 실측 deny ${JSON.stringify(deny)}`)
  // 도구를 닫았는데 같은 도구의 allow·ask가 남아 있으면 의도가 갈린다 — 양쪽에 걸친 규칙이 없는지 본다
  const pwshElsewhere = [...(settings.permissions?.allow ?? []), ...(settings.permissions?.ask ?? [])]
    .filter((rule) => /^PowerShell(\(|$)/.test(String(rule)))
  r.check('PowerShell 규칙이 allow·ask에는 없다', pwshElsewhere.length === 0, pwshElsewhere.join(', ') || '0건')

  const gateEntries = entries.filter(({ entry }) => cmdOf(entry).includes(EDIT_PLAN_GATE))
  r.check('편집 경로 계획 게이트가 settings.json에 배선돼 있다', gateEntries.length === 1, `${gateEntries.length}건`)
  for (const { event, entry } of gateEntries) {
    r.judge(`편집 게이트의 이벤트 (${event})`, event, 'PreToolUse', { note: '편집 전에 판정해야 차단이 성립한다' })
    r.judge('편집 게이트 matcher', entry.matcher, EDIT_MATCHER, { note: '편집 도구 네 종' })
  }

  // 내린 게이트는 배선이 없고, 유지하는 훅은 배선이 남아 있다
  const roleGate = entries.filter(({ entry }) => cmdOf(entry).includes('30_role-gate.cjs'))
  r.check('역할 게이트(30_role-gate.cjs) 배선이 없다', roleGate.length === 0, `${roleGate.length}건`)
  const spawnGate = entries.filter(({ entry }) => cmdOf(entry).includes('20_plan-gate.cjs'))
  r.check('스폰 게이트(20_plan-gate.cjs) 배선이 없다', spawnGate.length === 0, `${spawnGate.length}건`)
  const spawnSlot = entries.filter(({ entry }) => entry.matcher === '^(Task|Agent)$')
  r.check('스폰 자리(^(Task|Agent)$) 항목이 없다', spawnSlot.length === 0, `${spawnSlot.length}건`)
  const KEPT = ['dangerous-cmd-guard.mjs', '31_edit-plan-gate.cjs', '33_tdd-guard.cjs', '40_pass-watcher.cjs',
    '41_line-limit.cjs', '10_start-brief.cjs', '50_stop-gate.cjs', '51_surface-probe.cjs']
  const missingKept = KEPT.filter((name) => !entries.some(({ entry }) => cmdOf(entry).includes(name)))
  r.check('유지하는 훅 여덟 종의 배선이 남아 있다', missingKept.length === 0, missingKept.join(', ') || '누락 0건')

  // 「병합만 승인」 경계 (헌법 10조, ADR-004) — `master`는 GitHub 브랜치 보호가 서버에서 지킨다. 작업 브랜치 push는 설정 allow `Bash(git push*)` 하나로 열고,
  // 가드가 그 위에서 강제 push를 차단하고 원격 삭제·`master` 글자·일괄 push를 묻는다 (훅의 ask·deny가 allow보다 우선).
  // push를 여는 규칙은 정확히 그 한 줄이어야 한다 — 통째 `Bash`·`Bash(*)`·`Bash(git *)`는 push 밖의 git까지 연다.
  const allowList = (settings.permissions?.allow ?? []).map(String)
  const askList = (settings.permissions?.ask ?? []).map(String)
  const broadAllow = allowList.filter((rule) => /^Bash\(\s*git(\.exe)?\s*\*?\s*\)$/i.test(rule) || rule === 'Bash' || rule === 'Bash(*)')
  r.check('git·Bash 전체를 여는 allow 규칙이 없다', broadAllow.length === 0, broadAllow.join(', ') || '0건')
  const pushAllowed = allowList.filter((rule) => /^Bash\(\s*git(\.exe)?\s+push/i.test(rule))
  r.check('push를 여는 allow는 `Bash(git push*)` 한 줄이다', pushAllowed.length === 1 && pushAllowed[0] === 'Bash(git push*)', pushAllowed.join(', ') || '0건')
  r.check('ask에 push 규칙이 없다 (있으면 작업 브랜치 push에 창이 뜬다)', !askList.some((x) => x.includes('git push')), askList.filter((x) => x.includes('git push')).join(', ') || '0건')
  r.check('PR 생성이 allow에 있고 ask에 없다', allowList.includes('Bash(gh pr create*)') && !askList.includes('Bash(gh pr create*)'), '')
  const APPROVAL = ['Bash(gh release*)', 'Bash(npm publish*)', 'Bash(npm run package*)']
  const lostAsk = APPROVAL.filter((rule) => !askList.includes(rule))
  r.check('릴리스·배포 셋이 ask에 남아 있다', lostAsk.length === 0, lostAsk.join(', ') || '누락 0건')
  // 병합은 사람의 버튼으로만 한다(헌법 10조) — 에이전트의 병합 명령은 질문 없이 거부한다. 공식 문서(code.claude.com/docs/en/hooks): 「Deny and ask rules are still evaluated
  // regardless of what the hook returns.」 — 가드 훅의 ask가 있어도 이 deny가 이긴다.
  const denyList = (settings.permissions?.deny ?? []).map(String)
  // 규칙은 첫 `*` 앞 글자를 그대로 맞춘다(공식 문서) — 그래서 옵션을 앞에 둔 꼴과 `timeout` 앞붙임을 따로 적는다.
  // 맨 앞 `*`(`Bash(*gh pr merge*)`)는 쓰지 않는다 — 커밋 메시지·검색어에 든 글자까지 막는다.
  const MERGE_DENY = [
    'Bash(gh pr merge*)',
    'Bash(gh -R * pr merge*)',
    'Bash(gh --repo * pr merge*)',
    'Bash(gh pr -R * merge*)',
    'Bash(gh pr --repo * merge*)',
    'Bash(timeout * gh pr merge*)',
    // 끝점 뒤가 끝·공백·`/`·`-async`일 때만 — 본문 글자 끝에 `…/merge"`가 붙은 댓글 호출은 막지 않는다.
    //   설정이 놓치는 실제 병합 호출(인용한 끝점, `?`, 리다이렉트)은 가드가 막는다(dangerous-cmd-guard.test.mjs).
    'Bash(gh api *pulls/*/merge)',
    'Bash(gh api *pulls/*/merge *)',
    'Bash(gh api *pulls/*/merge/*)',
    'Bash(gh api *pulls/*/merge-async*)',
    'Bash(gh api *graphql*mergePullRequest*)',
    'Bash(gh api *graphql*enablePullRequestAutoMerge*)',
  ]
  const lostDeny = MERGE_DENY.filter((rule) => !denyList.includes(rule))
  r.check('병합 명령 거부 열둘이 deny에 있다', lostDeny.length === 0, lostDeny.join(', ') || '누락 0건')
  r.check('넓은 `Bash(gh api *pulls/*/merge*)`가 deny에 없다 (댓글 본문까지 막는다)', !denyList.includes('Bash(gh api *pulls/*/merge*)'), '')
  const perms0 = settings.permissions ?? {}
  r.judge('댓글 본문 끝의 `…/merge"`는 설정이 막지 않는다', settingsVerdict(perms0, 'gh api repos/o/r/issues/12/comments -f body="see pulls/12/merge"'), 'prompt')
  for (const cmd of ['gh api -X PUT repos/o/r/pulls/1/merge', 'gh api repos/o/r/pulls/1/merge -X PUT', 'gh api -X PUT repos/o/r/pulls/1/merge-async']) {
    r.judge(`병합 끝점 호출은 설정이 막는다 \`${cmd}\``, settingsVerdict(perms0, cmd), 'deny')
  }
  // ask에 병합 축 규칙(전략 옵션)을 둘 때 정형 goal 병합과 `gh pr merge`에는 걸리지 않아야 한다
  const askHit = [...CANONICAL_COMMANDS.filter((c) => c.startsWith('git merge')), 'gh pr merge 1']
    .filter((cmd) => settingsVerdict({ ask: askList }, cmd) === 'ask')
  r.check('ask 규칙이 정형 goal 병합과 `gh pr merge`에 걸리지 않는다', askHit.length === 0, askHit.join(', ') || '0건')
  const leaked = [...APPROVAL, ...MERGE_DENY].filter((rule) => allowList.includes(rule))
  r.check('승인·거부 항목이 allow로 새지 않았다', leaked.length === 0, leaked.join(', ') || '0건')
  r.check('`git checkout -b*`가 allow에 없다 (-f가 미커밋 편집을 버린다)', !allowList.some((rule) => /git checkout/.test(rule)), '')
  // 실행 단계 명령은 정확히 이 꼴만 연다 —
  //   `Bash(date*)`·`Bash(date +*)`는 `date -s`·`--set`(시스템 시각 변경)까지 열어 `date`와 루프가 쓰는 형식 한 줄로 좁혔다.
  //   `Bash(npx eslint*)`는 `npx eslint-다른패키지`(임의 패키지 내려받아 실행)까지 열어 낱말 경계 꼴로 좁혔다.
  //   `git switch *`·`git fetch*`가 여는 파괴 꼴은 가드가 막거나 묻는다 (switch -C·-f·--discard 차단, ref 덮어쓰는 fetch 질의).
  const FAMILIES = [
    { re: /^Bash\(\s*date\b/, exact: ['Bash(date)', 'Bash(date +%Y-%m-%dT%H:%M:%S%z)'] },
    { re: /^Bash\(\s*npx\s+eslint/, exact: ['Bash(npx eslint *)'] },
    { re: /^Bash\(\s*git\s+fetch/, exact: ['Bash(git fetch*)'] },
    { re: /^Bash\(\s*git\s+switch/, exact: ['Bash(git switch -c*)', 'Bash(git switch *)'] },
    // goal 병합의 길(헌법 10조): goal 브랜치를 마일스톤 브랜치에 합치는 `git merge --no-ff`와, 로컬 마일스톤 브랜치를
    //   원격에 맞추는 `--ff-only origin/milestone/*`만 묻지 않는다. 넓은 `Bash(git merge*)`는 `--abort` 같은 꼴까지 연다.
    //   `--no-ff` 뒤의 `-s`·`-X`는 ask 규칙이 묻는다(아래 전략 옵션 구획).
    { re: /^Bash\(\s*git\s+merge/, exact: ['Bash(git merge --no-ff *)', 'Bash(git merge --ff-only origin/milestone/*)'] },
  ]
  for (const { re, exact } of FAMILIES) {
    const got = allowList.filter((rule) => re.test(rule))
    const same = got.length === exact.length && exact.every((x) => got.includes(x))
    r.check(`allow의 ${exact[0]} 계열이 정확히 ${exact.join(' · ')}다`, same, got.join(', ') || '0건')
  }
  r.check('`Bash(date*)`·`Bash(date +*)`가 allow에 없다 (date -s·--set을 연다)',
    !allowList.includes('Bash(date*)') && !allowList.includes('Bash(date +*)'), '')
  r.check('`Bash(npx eslint*)`가 allow에 없다 (npx eslint-다른패키지를 연다)', !allowList.includes('Bash(npx eslint*)'), '')

  const guardOnBash = entries.filter(({ event, entry }) => event === 'PreToolUse' && entry.matcher === '^Bash$'
    && cmdOf(entry).includes('dangerous-cmd-guard.mjs'))
  r.check('가드가 PreToolUse ^Bash$에 배선돼 있다', guardOnBash.length === 1, `${guardOnBash.length}건`)

  // 가드 항목에 timeout이 없으면 기본 600초다. command 훅의 실패(시간 초과, 0·2 밖의 종료 코드, 기동 실패)는
  // 기본 `onFailure: 'continue'`라 도구 호출이 그대로 간다. `'block'`은 실패를 종료 코드 2로 세어 막는다(공개 타입 sdk.d.ts의
  // Settings.hooks command 항목). 실측: 멈추는 훅·죽는 훅 모두 기본값에서는 명령이 실행됐고 'block'에서는 막혔다.
  // 실측 판정 시간은 17만 자 heredoc에서도 205ms였다 — 30초는 편집 계획 게이트와 같은 값이다.
  const guardHooks = guardEntries.flatMap(({ entry }) => (entry.hooks ?? []).filter((h) => String(h.command ?? '').includes(GUARD)))
  const guardTimeouts = guardHooks.map((h) => h.timeout)
  r.check('가드 항목의 timeout이 30초다', guardTimeouts.length === 1 && guardTimeouts[0] === 30, JSON.stringify(guardTimeouts))
  const guardOnFailure = guardHooks.map((h) => h.onFailure)
  r.check('가드 항목이 실패하면 막는다 (onFailure: block)', guardOnFailure.length === 1 && guardOnFailure[0] === 'block', JSON.stringify(guardOnFailure))
  // 앱 데이터 폴더(Electron userData — package.json name `agentdeck`)에는 엔진 코드와 앱 설정이 있다.
  // main 프로세스가 그 엔진 코드를 import하므로(engineVersions.ts) 파일 도구로 고치지 못하게 닫는다.
  // 공식 permissions 문서: Write·NotebookEdit는 Edit 경로 규칙으로 검사한다(`Write(path)` 규칙은 맞지 않는다), `~/`는 홈 기준.
  // 폴더 이름은 Electron 기본값(productName ?? name)에서 만든다. 하드코딩 상수와만 비교하면 이름이 바뀌어도 초록이다.
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const appName = pkg.productName ?? pkg.name
  const APPDATA_DENY = `Edit(~/AppData/Roaming/${appName}/**)`
  r.check('앱 데이터 폴더의 Edit 거부 규칙이 deny에 있다', deny.includes(APPDATA_DENY), `기대 ${APPDATA_DENY}`)
  // 앱이 이름이나 userData 경로를 코드로 바꾸면 위 규칙이 빈 경로를 가리킨다 — 해석 지점이 userData.ts 하나인지 본다.
  const mainSrc = join(REPO_ROOT, '02_Project', '00_Source', 'main')
  const renames = readdirSync(mainSrc, { recursive: true }).filter((f) => /\.ts$/.test(String(f)))
    .filter((f) => /app\.setName\(|setPath\(\s*['"]userData['"]/.test(readFileSync(join(mainSrc, String(f)), 'utf8')))
  r.check('main 소스가 앱 이름·userData 경로를 바꾸지 않는다', renames.length === 0, renames.join(', ') || '0건')

  // 정형 절차 명령 — 메인의 goal 병합·push·PR 사슬이 설정에서 질문 없이 지나간다. 판정기는 공식 문서의 규칙을 옮긴 _lib/settings-rules.mjs다. 먼저 문서 표의 행으로 판정기 자체를 맞춰 본다.
  for (const [rule, cmd, want] of [
    ['Bash(ls *)', 'ls', true], ['Bash(ls *)', 'lsof', false], ['Bash(ls*)', 'lsof', true],
    ['Bash(git log * main)', 'git log --oneline main', true], ['Bash(git log * main)', 'git log main', false],
    ['Bash(* --help *)', 'npm --help', false], ['Bash(npm run build)', 'npm run build --watch', false],
  ]) {
    r.judge(`판정기 — ${rule} 이 \`${cmd}\`에 맞는가`, settingsVerdict({ allow: [rule] }, cmd) === 'allow', want)
  }
  r.judge('판정기 — 복합 명령은 하위 명령 전부가 allow여야 한다', settingsVerdict({ allow: ['Bash(git status)'] }, 'git status && rm x'), 'prompt')
  r.judge('판정기 — ask가 allow를 이긴다', settingsVerdict({ allow: ['Bash(git push*)'], ask: ['Bash(git push *)'] }, 'git push origin x'), 'ask')
  r.judge('판정기 — deny는 머리 할당을 건너뛴다', settingsVerdict({ deny: ['Bash(rm *)'] }, 'FOO=bar rm -rf tmp/'), 'deny')
  const perms = settings.permissions ?? {}
  for (const cmd of CANONICAL_COMMANDS) {
    r.judge(`정형 절차 명령 — 설정 allow \`${cmd}\``, settingsVerdict(perms, cmd), 'allow')
  }

  // 병합 전략 옵션 — 공식 permissions 문서: 「Rules are evaluated in order: deny, then ask, then allow.」 「a matching ask rule prompts even when
  // a more specific allow rule also matches the same call.」 — ask 규칙이 `Bash(git merge --no-ff *)` allow를 이긴다.
  for (const cmd of ['git merge --no-ff -s ours chore/x', 'git merge -s ours chore/x', 'git merge --no-ff -X theirs chore/x',
    'git merge --no-ff --strategy=ours chore/x', 'git merge --no-ff --strategy ours chore/x', 'git merge --no-ff --strategy-option=theirs chore/x',
    'git merge --no-ff --allow-unrelated-histories chore/x', 'git merge -Xtheirs chore/x', 'git merge --no-ff -m "x" -s ours chore/x']) {
    r.judge(`전략 옵션 병합은 설정이 묻는다 \`${cmd}\``, settingsVerdict(perms, cmd), 'ask')
  }
  r.judge('`--ff-only origin/milestone/*` 한 꼴은 설정 allow', settingsVerdict(perms, 'git merge --ff-only origin/milestone/m11-backlog-sweep'), 'allow')
  for (const cmd of ['git merge --ff-only origin/master', 'git merge --ff-only chore/x', 'git merge --abort']) {
    r.judge(`그 밖의 병합 꼴은 열지 않는다 \`${cmd}\``, settingsVerdict(perms, cmd), 'prompt')
  }

  // 가드 밖 훅의 실패 처리 — 공식 hooks 문서: 「On most events, when a hook fails or times out, Claude Code still carries out the action.」 Stop 훅에는
  // 「The field has no effect」. 편집 게이트·TDD 가드에 block을 걸면 훅이 깨졌을 때 그 훅을 고칠 Edit·Write까지 막힌다(헌법 8조,
  // 훅 내부의 fail-open과 같은 결정). 그래서 가드 밖 훅은 continue를 글로 적고, Stop 훅에는 두지 않는다.
  const otherHooks = entries.filter(({ event }) => event !== 'Stop').flatMap(({ event, entry }) => (entry.hooks ?? [])
    .filter((x) => x.type === 'command' && !String(x.command ?? '').includes(GUARD)).map((x) => ({ event, x })))
  const notContinue = otherHooks.filter(({ x }) => x.onFailure !== 'continue').map(({ event, x }) => `${event} ${x.command}`)
  r.check('가드 밖 훅은 실패해도 지나간다 (onFailure: continue)', otherHooks.length >= 6 && notContinue.length === 0,
    notContinue.join(', ') || `${otherHooks.length}건`)
  const stopWithField = entries.filter(({ event }) => event === 'Stop').flatMap(({ entry }) => entry.hooks ?? []).filter((x) => 'onFailure' in x)
  r.check('Stop 훅에는 onFailure를 두지 않는다 (효과 없음)', stopWithField.length === 0, `${stopWithField.length}건`)

  // CI 액션 고정
  const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'hard-gates.yml'), 'utf8')
  const uses = [...workflow.matchAll(/^\s*-?\s*uses:\s*(\S+)(.*)$/gm)].map((m) => ({ ref: m[1], rest: m[2] }))
  const unpinned = uses.filter(({ ref, rest }) => !/@[0-9a-f]{40}$/.test(ref) || !/#\s*v\d+\.\d+\.\d+/.test(rest)).map(({ ref }) => ref)
  r.check('hard-gates.yml의 액션이 전부 커밋 SHA와 태그 주석으로 고정돼 있다', uses.length >= 2 && unpinned.length === 0, unpinned.join(', ') || `${uses.length}건`)
  const dependabot = readFileSync(join(REPO_ROOT, '.github', 'dependabot.yml'), 'utf8')
  r.check('dependabot에 github-actions 생태계가 있다', /package-ecosystem:\s*github-actions/.test(dependabot), '')
}

process.exit(r.summary())
