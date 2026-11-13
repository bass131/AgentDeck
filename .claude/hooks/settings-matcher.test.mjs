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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { REPO_ROOT } from './_lib/guard-spawn.mjs'

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
  const APPROVAL = ['Bash(gh pr merge*)', 'Bash(gh release*)', 'Bash(npm publish*)', 'Bash(npm run package*)']
  const lostAsk = APPROVAL.filter((rule) => !askList.includes(rule))
  r.check('병합·릴리스·배포 넷이 ask에 남아 있다', lostAsk.length === 0, lostAsk.join(', ') || '누락 0건')
  const leaked = APPROVAL.filter((rule) => allowList.includes(rule))
  r.check('승인 항목이 allow로 새지 않았다', leaked.length === 0, leaked.join(', ') || '0건')
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
}

process.exit(r.summary())
