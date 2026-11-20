#!/usr/bin/env node
// settings.json 배선 단정 — 훅 matcher 앵커 (M02 Phase 2 Step 11, Backlog 10).
//
// 가드의 matcher만 비앵커 `"Bash"`라 다른 훅과 규약이 갈렸다. Claude Code의 matcher는 정규식이므로
// 비앵커 `"Bash"`는 이름 안에 Bash를 포함하는 다른 도구에도 걸린다 — 발화 표면이 설계보다 넓다.
// 이 테스트는 가드를 spawn하지 않고 settings.json을 파싱해 문자열만 대조하므로,
// 배선이 어떤 상태든 판정이 성립한다 (훅이 실제로 붙었는지와 무관한 정적 단정이다).
//
// M03 Phase 2가 둘을 더했다 —
//   ① PowerShell 도구의 deny (Step 6 · 안건 10 채택). 가드의 matcher는 `^Bash$`이고 판정기는 POSIX 셸
//      문법 전용이라, PowerShell 도구가 켜진 세션에서는 위험 명령 가드가 아예 걸리지 않는다. 그 도구가
//      이 세션들의 도구 목록에 없어 발화 프로브가 불가능하므로, 검증 표면은 이 정적 단정이다.
//      규칙 문법의 근거는 공식 문서다 (code.claude.com/docs/en/permissions 「PowerShell」 절):
//      「PowerShell permission rules use the same shape as Bash rules, and a bare `PowerShell` or
//      `PowerShell(*)` matches every command.」 — 도구 전체를 닫는 형태가 그 둘이다.
//   ② 편집 경로 계획 게이트의 배선 (Step 5·8) — 편집 도구 PreToolUse 항목에 붙었는가.
//
// M03 Phase 4 Step 6이 하나를 더했다 —
//   ③ 내림 단정. 역할 게이트(30_role-gate.cjs)와 스폰 자리(`^(Task|Agent)$`)의 계획 게이트(20_plan-gate.cjs)
//      배선이 없고, 유지하기로 한 훅(편집 경로 게이트·위험 명령 가드·TDD 가드·자동 장전·250줄·기동·Stop 두 종)의
//      배선은 남아 있는가. 20_plan-gate.cjs 파일은 판정부를 공유하고 테스트가 직접 구동하므로 남는다 — 배선만 없다.
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

  // 규약 정합 — matcher를 갖는 항목은 전부 앵커 형태다 (가드만 예외였다)
  const unanchored = entries
    .filter(({ entry }) => typeof entry.matcher === 'string' && entry.matcher !== '' && !ANCHORED.test(entry.matcher))
    .map(({ event, i, entry }) => `${event}[${i}] "${entry.matcher}"`)
  r.check('matcher를 가진 훅 항목이 전부 앵커 형태다', unanchored.length === 0, unanchored.join(', ') || '비앵커 0건')

  // ---- ① PowerShell 도구 deny (M03 Phase 2 Step 6 · 안건 10) ----------------
  const deny = settings.permissions?.deny ?? []
  const pwshHits = deny.filter((rule) => PWSH_CLOSED.includes(rule))
  r.check('PowerShell 도구가 permissions.deny로 닫혀 있다', pwshHits.length >= 1,
    `기대 ${PWSH_CLOSED.map((s) => `"${s}"`).join(' 또는 ')} 중 하나 · 실측 deny ${JSON.stringify(deny)}`)
  // 도구를 닫았는데 같은 도구의 allow·ask가 남아 있으면 의도가 갈린다 — 양쪽에 걸친 규칙이 없는지 본다
  const pwshElsewhere = [...(settings.permissions?.allow ?? []), ...(settings.permissions?.ask ?? [])]
    .filter((rule) => /^PowerShell(\(|$)/.test(String(rule)))
  r.check('PowerShell 규칙이 allow·ask에는 없다', pwshElsewhere.length === 0, pwshElsewhere.join(', ') || '0건')

  // ---- ② 편집 경로 계획 게이트의 배선 (M03 Phase 2 Step 5·8) ----------------
  const gateEntries = entries.filter(({ entry }) => cmdOf(entry).includes(EDIT_PLAN_GATE))
  r.check('편집 경로 계획 게이트가 settings.json에 배선돼 있다', gateEntries.length === 1, `${gateEntries.length}건`)
  for (const { event, entry } of gateEntries) {
    r.judge(`편집 게이트의 이벤트 (${event})`, event, 'PreToolUse', { note: '편집 전에 판정해야 차단이 성립한다' })
    r.judge('편집 게이트 matcher', entry.matcher, EDIT_MATCHER, { note: '편집 도구 네 종' })
  }

  // ---- ③ 내림 단정 (M03 Phase 4 Step 6 · 안건 4·5) -------------------------
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

  // ---- ④ 「병합만 승인」 경계 (M04 Goal Loop · M05 H1 · 헌법 10조 · ADR-004 · [USER] 2026-11-13) ----
  // `master`는 GitHub 브랜치 보호가 서버에서 지킨다. 작업 브랜치 push는 설정 allow `Bash(git push*)` 하나로 열고,
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
  // M07 G8(병합 버튼 · 헌법 10조 개정): 병합은 사람이 앱의 병합 버튼으로만 한다. 에이전트의 병합 명령은
  // 질문 없이 거부한다. 공식 문서(code.claude.com/docs/en/hooks): 「Deny and ask rules are still evaluated
  // regardless of what the hook returns.」 — 가드 훅의 ask가 있어도 이 deny가 이긴다.
  const denyList = (settings.permissions?.deny ?? []).map(String)
  // 규칙은 첫 `*` 앞 글자를 그대로 맞춘다(공식 문서) — 그래서 옵션을 앞에 둔 꼴과 `timeout` 앞붙임을 따로 적는다(G8 검수 중요 1).
  // 맨 앞 `*`(`Bash(*gh pr merge*)`)는 쓰지 않는다 — 커밋 메시지·검색어에 든 글자까지 막는다.
  const MERGE_DENY = [
    'Bash(gh pr merge*)',
    'Bash(gh -R * pr merge*)',
    'Bash(gh --repo * pr merge*)',
    'Bash(gh pr -R * merge*)',
    'Bash(gh pr --repo * merge*)',
    'Bash(timeout * gh pr merge*)',
    'Bash(gh api *pulls/*/merge*)',
    'Bash(gh api *graphql*mergePullRequest*)',
    'Bash(gh api *graphql*enablePullRequestAutoMerge*)',
  ]
  const lostDeny = MERGE_DENY.filter((rule) => !denyList.includes(rule))
  r.check('병합 명령 거부 아홉이 deny에 있다', lostDeny.length === 0, lostDeny.join(', ') || '누락 0건')
  r.check('병합 명령이 ask에 남지 않았다 (deny와 겹치면 의도가 흐려진다)', !askList.some((x) => x.includes('merge')), askList.filter((x) => x.includes('merge')).join(', ') || '0건')
  const leaked = [...APPROVAL, ...MERGE_DENY].filter((rule) => allowList.includes(rule))
  r.check('승인·거부 항목이 allow로 새지 않았다', leaked.length === 0, leaked.join(', ') || '0건')
  r.check('`git checkout -b*`가 allow에 없다 (-f가 미커밋 편집을 버린다)', !allowList.some((rule) => /git checkout/.test(rule)), '')
  // M05 H1 진척 단계 5가 연 실행 단계 명령은 정확히 이 꼴만 둔다 (독립 검수 결함 6 · 재수리) —
  //   `Bash(date*)`는 `date -s`·`--set`(시스템 시각 변경)까지 열어 `date`와 루프가 쓰는 형식 한 줄로 좁혔다.
  //   `Bash(date +*)`도 `date +%s -s …`를 열어 정확 일치로 좁혔다 (2차 검수 지적).
  //   `Bash(npx eslint*)`는 `npx eslint-다른패키지`(임의 패키지 내려받아 실행)까지 열어 낱말 경계 꼴로 좁혔다.
  //   `git switch *`·`git fetch*`가 여는 파괴 꼴은 가드가 막거나 묻는다 (switch -C·-f·--discard 차단, ref 덮어쓰는 fetch 질의).
  const FAMILIES = [
    { re: /^Bash\(\s*date\b/, exact: ['Bash(date)', 'Bash(date +%Y-%m-%dT%H:%M:%S%z)'] },
    { re: /^Bash\(\s*npx\s+eslint/, exact: ['Bash(npx eslint *)'] },
    { re: /^Bash\(\s*git\s+fetch/, exact: ['Bash(git fetch*)'] },
    { re: /^Bash\(\s*git\s+switch/, exact: ['Bash(git switch -c*)', 'Bash(git switch *)'] },
    // M08 G1(헌법 10조 goal 병합의 길): goal 작업 브랜치를 마일스톤 브랜치에 합치는 `git merge --no-ff`만 묻지 않는다.
    //   넓은 `Bash(git merge*)`는 `--abort` 같은 꼴까지 연다. 이 꼴도 `--no-ff` 뒤의 `-s`·`-X`는 연다(M08 Backlog 3).
    //   글자에 `master`가 보이는 push는 가드가 묻고 서버가 막는다. 현재 브랜치가 `master`인 맨 push는 묻지 않는다(M08 Backlog 2).
    { re: /^Bash\(\s*git\s+merge/, exact: ['Bash(git merge --no-ff *)'] },
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

  // ---- ⑤ 판정 장치 정비 (M07 G1 · G8 설계 `30_노드-구조.md` 보호 6, M06 Backlog 30) ----
  // 가드 항목에 timeout이 없으면 기본 600초다. command 훅의 실패(시간 초과, 0·2 밖의 종료 코드, 기동 실패)는
  // 기본 `onFailure: 'continue'`라 도구 호출이 그대로 간다. `'block'`은 실패를 종료 코드 2로 세어 막는다(공개 타입 sdk.d.ts의
  // Settings.hooks command 항목). G1 실측: 멈추는 훅·죽는 훅 모두 기본값에서는 명령이 실행됐고 'block'에서는 막혔다.
  // 실측 판정 시간은 17만 자 heredoc에서도 205ms였다 — 30초는 편집 계획 게이트와 같은 값이다.
  const guardHooks = guardEntries.flatMap(({ entry }) => (entry.hooks ?? []).filter((h) => String(h.command ?? '').includes(GUARD)))
  const guardTimeouts = guardHooks.map((h) => h.timeout)
  r.check('가드 항목의 timeout이 30초다', guardTimeouts.length === 1 && guardTimeouts[0] === 30, JSON.stringify(guardTimeouts))
  const guardOnFailure = guardHooks.map((h) => h.onFailure)
  r.check('가드 항목이 실패하면 막는다 (onFailure: block)', guardOnFailure.length === 1 && guardOnFailure[0] === 'block', JSON.stringify(guardOnFailure))
  // 앱 데이터 폴더(Electron userData — package.json name `agentdeck`)에는 엔진 코드와 앱 설정이 있다.
  // main 프로세스가 그 엔진 코드를 import하므로(engineVersions.ts) 파일 도구로 고치지 못하게 닫는다.
  // 공식 permissions 문서: Write·NotebookEdit는 Edit 경로 규칙으로 검사한다(`Write(path)` 규칙은 맞지 않는다), `~/`는 홈 기준.
  // 폴더 이름은 Electron 기본값(productName ?? name)에서 만든다. 하드코딩 상수와만 비교하면 이름이 바뀌어도 초록이다(G1 검수 3).
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const appName = pkg.productName ?? pkg.name
  const APPDATA_DENY = `Edit(~/AppData/Roaming/${appName}/**)`
  r.check('앱 데이터 폴더의 Edit 거부 규칙이 deny에 있다', deny.includes(APPDATA_DENY), `기대 ${APPDATA_DENY}`)
  // 앱이 이름이나 userData 경로를 코드로 바꾸면 위 규칙이 빈 경로를 가리킨다 — 해석 지점이 userData.ts 하나인지 본다.
  const mainSrc = join(REPO_ROOT, '02_Project', '00_Source', 'main')
  const renames = readdirSync(mainSrc, { recursive: true }).filter((f) => /\.ts$/.test(String(f)))
    .filter((f) => /app\.setName\(|setPath\(\s*['"]userData['"]/.test(readFileSync(join(mainSrc, String(f)), 'utf8')))
  r.check('main 소스가 앱 이름·userData 경로를 바꾸지 않는다', renames.length === 0, renames.join(', ') || '0건')

  // ---- ⑥ 정형 절차 명령 (M11 goal 8) — 메인의 goal 병합·push·PR 사슬이 설정에서 질문 없이 지나간다 ----
  // 판정기는 공식 문서의 규칙을 옮긴 _lib/settings-rules.mjs다. 먼저 문서 표의 행으로 판정기 자체를 맞춰 본다.
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
}

process.exit(r.summary())
