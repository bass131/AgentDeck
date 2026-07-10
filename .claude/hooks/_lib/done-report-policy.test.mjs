import assert from 'node:assert/strict'
import test from 'node:test'

import { doneReportGateResult, doneReportIssues } from './done-report-policy.mjs'

const STRICT_DONE = `---
summary: Claude Hook gate를 엄격하게 검증한다.
phase: 13-hook-gate
status: done
grade: 대규모
owner: youngho
gate_version: 1
report_html: 00.Documents/reports/M13-hook-gate.html
---

# Phase 13 완료

## TL;DR
Hook gate를 검증했다.

## 5단계 보고
- 🎯 **무엇을 만들었나** — 엄격한 완료 게이트를 만들었다.
- 🤔 **왜 필요한가** — 불완전한 완료 보고를 막는다.
- 🛠️ **어떻게 만들었나** — 두 엔진을 독립 구현했다.
- 🧪 **테스트 결과** — 모든 테스트가 통과했다.
- ➡️ **다음 스텝** — Hook을 다시 신뢰한다.

## AC 검증 결과
\`\`\`text
$ node --test .claude/hooks/_lib/done-report-policy.test.mjs
tests 2, pass 2, fail 0
\`\`\`

## 학습 일지 후보 키워드
- Claude hooks
`

const STRICT_HTML = `<!doctype html>
<h2>무엇을 만들었나</h2>
<h2>왜 필요한가</h2>
<h2>어떻게 만들었나</h2>
<h2>테스트 결과</h2>
<h2>다음 스텝</h2>`

test('Claude strict DONE 정책의 필수 항목을 통과시킨다', () => {
  assert.deepEqual(doneReportIssues(STRICT_DONE, { htmlContent: STRICT_HTML }), [])
})

test('Claude strict DONE 정책이 누락을 모두 보고한다', () => {
  const incomplete = STRICT_DONE
    .replace('gate_version: 1\n', '')
    .replace('## AC 검증 결과', '## 검증 결과')
  const issues = doneReportIssues(incomplete, { htmlContent: '<html></html>' })
  assert.ok(issues.some((issue) => /gate_version/.test(issue)))
  assert.ok(issues.some((issue) => /AC 검증 결과/.test(issue)))
  assert.ok(issues.some((issue) => /HTML.*5단계/.test(issue)))
})

test('Claude strict DONE 정책도 placeholder와 status를 거부한다', () => {
  const templated = STRICT_DONE
    .replace('summary: Claude Hook gate를 엄격하게 검증한다.', 'summary: <완료 요약>')
    .replace('status: done', 'status: pending')
  const issues = doneReportIssues(templated, { htmlContent: STRICT_HTML })
  assert.ok(issues.some((issue) => /summary.*placeholder/.test(issue)))
  assert.ok(issues.some((issue) => /status.*done/.test(issue)))
})

test('Claude AC도 임의의 $ 명령과 별도 결과 줄을 요구한다', () => {
  const commandOnly = STRICT_DONE.replace(
    '$ node --test .claude/hooks/_lib/done-report-policy.test.mjs\ntests 2, pass 2, fail 0',
    '$ node --test .claude/hooks/_lib/done-report-policy.test.mjs',
  )
  assert.ok(doneReportIssues(commandOnly, { htmlContent: STRICT_HTML })
    .some((issue) => /AC 검증 결과/.test(issue)))

  const ghEvidence = STRICT_DONE.replace(
    '$ node --test .claude/hooks/_lib/done-report-policy.test.mjs\ntests 2, pass 2, fail 0',
    '$ gh pr list --state open\nPASS: open PR 0',
  )
  assert.equal(doneReportIssues(ghEvidence, { htmlContent: STRICT_HTML })
    .some((issue) => /AC 검증 결과/.test(issue)), false)
})

test('Claude도 추적된 legacy 문서만 유예한다', () => {
  assert.equal(doneReportGateResult('# legacy', { tracked: true }).legacy, true)
  const fresh = doneReportGateResult('# new', { tracked: false })
  assert.equal(fresh.blocking, true)
  assert.ok(fresh.issues.some((issue) => /gate_version/.test(issue)))
})
