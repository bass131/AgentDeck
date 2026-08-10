#!/usr/bin/env node
// 기대-실패 플래그 헬퍼의 자기 검증 (M02 Phase 1 Step 8 · DoD 「자기 검증 케이스 2건」).
//
// 헬퍼의 판정 동작 자체를 실측한다 — 시나리오는 fixtures/flag-selfcheck.mjs가 소유하고,
// 이 러너는 그것을 자식 프로세스로 돌려 종료 코드와 요약 문구를 본다.
//   ① 의도 통과 — 플래그 항목의 실측이 기대와 다르면(Red 관측) 러너는 exit 0
//   ② 의도 실패 — 플래그 항목의 실측이 기대와 같으면(예상 밖 통과) 러너는 exit 1
// 자기 검증이 헬퍼 자신(createRunner)으로 판정되는 것은 의도한 dogfooding이다 —
// ①·②가 양방향이라 헬퍼가 고장 나면 두 케이스가 동시에 통과할 수 없다.
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRunner } from './_lib/runner.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCENARIO = join(HERE, 'fixtures', 'flag-selfcheck.mjs')

function run(mode) {
  const p = spawnSync(process.execPath, [SCENARIO, mode], { encoding: 'utf8' })
  return { code: p.status, out: (p.stdout ?? '') + (p.stderr ?? '') }
}

const r = createRunner('runner-flag — 기대-실패 플래그 자기 검증')

const red = run('red')
r.check('① 의도 통과 — 플래그 항목의 실측이 기대와 다르면 러너 exit 0', red.code === 0, `exit ${red.code} · ${red.out.trim().split('\n').pop()}`)
r.check('① 요약에 플래그 잔여 건수가 실린다', /기대-실패 플래그 잔여 1건/.test(red.out), red.out.trim().split('\n').pop())

const unexpected = run('unexpected-pass')
r.check('② 의도 실패 — 플래그 항목이 예상 밖 통과면 러너 exit 1', unexpected.code === 1, `exit ${unexpected.code} · ${unexpected.out.trim().split('\n').pop()}`)
r.check('② 실패 사유가 플래그 제거를 지시한다', /플래그를 제거하라/.test(unexpected.out), unexpected.out.trim().split('\n')[0])

process.exit(r.summary())
