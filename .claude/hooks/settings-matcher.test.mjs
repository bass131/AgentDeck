#!/usr/bin/env node
// settings.json 배선 단정 — 훅 matcher 앵커 (M02 Phase 2 Step 11, Backlog 10).
//
// 가드의 matcher만 비앵커 `"Bash"`라 다른 훅과 규약이 갈렸다. Claude Code의 matcher는 정규식이므로
// 비앵커 `"Bash"`는 이름 안에 Bash를 포함하는 다른 도구에도 걸린다 — 발화 표면이 설계보다 넓다.
// 이 테스트는 가드를 spawn하지 않고 settings.json을 파싱해 문자열만 대조하므로,
// 배선이 어떤 상태든 판정이 성립한다 (훅이 실제로 붙었는지와 무관한 정적 단정이다).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { REPO_ROOT } from './_lib/guard-spawn.mjs'

const SETTINGS = join(REPO_ROOT, '.claude', 'settings.json')
const GUARD = 'dangerous-cmd-guard.mjs'
const ANCHORED = /^\^.*\$$/ // `^Bash$`·`^(Task|Agent)$` 류 — 정확 일치 앵커

const r = createRunner('settings.json 훅 matcher 앵커')

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
}

process.exit(r.summary())
