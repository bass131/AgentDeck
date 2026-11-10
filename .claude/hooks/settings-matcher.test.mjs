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
    r.judge('편집 게이트 matcher', entry.matcher, EDIT_MATCHER, { note: '편집 도구 네 종 — role-gate와 같은 표면' })
  }
}

process.exit(r.summary())
