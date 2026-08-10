#!/usr/bin/env node
// 기대-실패 플래그 자기 검증 시나리오 (M02 Phase 1 Step 8) — runner-flag.test.mjs가 자식으로 돌린다.
// 인자 하나로 두 방향을 고른다.
//   red             : 플래그 항목의 실측(allow)이 기대(deny)와 다르다 → Red 관측 성공 → exit 0
//   unexpected-pass : 플래그 항목의 실측(deny)이 기대(deny)와 같다 → 예상 밖 통과 → exit 1
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
