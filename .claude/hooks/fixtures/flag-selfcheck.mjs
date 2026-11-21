#!/usr/bin/env node
// runner-flag.test.mjs가 자식으로 돌린다. 인자 `red`는 Red 관측 성공(exit 0), `unexpected-pass`는 예상 밖 통과(exit 1) 시나리오다.
import { createRunner } from '../_lib/runner.mjs'

const mode = process.argv[2] || 'red'
const r = createRunner(`flag-selfcheck:${mode}`)

if (mode === 'red') {
  r.judge('플래그 항목 · 실측≠기대', 'allow', 'deny', { expectFail: true, note: '자기 검증 ①' })
} else if (mode === 'unexpected-pass') {
  r.judge('플래그 항목 · 실측=기대', 'deny', 'deny', { expectFail: true, note: '자기 검증 ②' })
} else {
  console.error(`알 수 없는 모드: ${mode}`)
  process.exit(3)
}

process.exit(r.summary())
