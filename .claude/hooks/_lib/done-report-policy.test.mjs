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
report_html: 00_Documents/02_Reports/00_Milestones/M13-hook-gate.html
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

// ── HR2 P07: 폴더 개명 선행 — report_html 경로 병행 수용 (ADR-028 개정 1) ──────
// ⚠️ 이 파일의 픽스처(STRICT_DONE `report_html:`)가 옛 이름이라, mjs만 고치면 test:hooks가
// red가 된다. 그래서 픽스처는 옛 이름으로 두고 **새 이름 케이스를 별도로** 등재한다 —
// 두 이름이 동시에 통과하는 것이 병행 수용의 정의다.

// ── 2026-07-26 (영호 결정): HTML 보고서는 상시 의무 → **요청 시에만** ─────────
// 근거: 마일스톤 종결마다 HTML 조판이 붙으면 종결 비용이 보고 내용보다 커진다(HR2 종결에서
// 실제로 그 지점에 멈췄다). 무거운 것은 조판이지 보고가 아니므로, MD 쪽 계약(5단계 라벨·
// 필수 H2·AC 증적)은 그대로 두고 `report_html`만 필수 → 선택으로 낮춘다.

test('report_html이 없으면 HTML 관련 검사를 건너뛴다 (영호 2026-07-26)', () => {
  const noHtml = STRICT_DONE.replace(
    'report_html: 00_Documents/02_Reports/00_Milestones/M13-hook-gate.html\n', '')
  assert.deepEqual(doneReportIssues(noHtml), [],
    'HTML을 안 만들기로 한 완료 보고가 그 이유만으로 막히면 안 된다')
})

test('report_html을 적었으면 HTML 실재와 5단계 라벨을 여전히 요구한다', () => {
  // 선택제가 "적어 놓고 안 지켜도 된다"가 되면 안 된다 — 명시한 순간 계약은 그대로다.
  assert.ok(doneReportIssues(STRICT_DONE).some((issue) => /HTML 보고서가 없습니다/.test(issue)),
    'report_html을 명시했는데 파일이 없으면 여전히 차단이다')
  assert.ok(doneReportIssues(STRICT_DONE, { htmlContent: '<html></html>' })
    .some((issue) => /HTML.*5단계/.test(issue)),
    'HTML이 있어도 5단계 라벨이 없으면 여전히 차단이다')
})

test('report_html: 신 경로는 통과하고 계약(HTML 실재·5단계)은 그대로다', () => {
  assert.equal(doneReportIssues(STRICT_DONE, { htmlContent: STRICT_HTML }).length, 0,
    '정상 경로가 형식 위반으로 잡히면 완료 보고가 통째로 막힌다')
  // 경계는 그대로 — 다른 폴더·상위 탈출(`..`)·상대 경로는 거부
  for (const bad of [
    '02_Reports/x.html',
    '00_Documents/x.html',
    '00_Documents/02_Reports/../01_Adr/x.html',
    '00_Documents/03_Reviews/x.html',
  ]) {
    assert.ok(
      doneReportIssues(
        STRICT_DONE.replace('00_Documents/02_Reports/00_Milestones/M13-hook-gate.html', bad),
        { htmlContent: STRICT_HTML },
      ).some((issue) => /report_html/.test(issue)),
      bad,
    )
  }
})

// ── NC P06: 수용 방향 일몰 — 전환 구간 병행 수용을 신형 단독으로 좁혔다 (ADR-039) ──
//
// P03~P05 구간에는 세 세대(`00.Documents/reports` · `00_Documents/reports` ·
// `00_Documents/02_Reports`)를 동시에 받았다. 개명 도중 어느 한 시점에도 완료 보고가
// 막히지 않게 하려면 그 관대함이 필요했지만, **수용 방향은 반감기가 짧다** — 통과 집합을
// 넓히는 쪽이라 존치하는 동안 실재하지 않는 경로도 계속 green 이다. 실제로 옛 점표기를
// 가리키는 유령 포인터 12건이 이 관대함을 통과해 왔고, P06 이 그것을 backfill 한 뒤
// 좁혔다.
//
// ⚠️ 이 테스트가 지키는 것은 "좁혔다"가 아니라 **"좁힌 상태가 유지된다"** 이다.
// 누군가 편의로 `(?:\d{2}_)?` 나 `00[._]` 를 되살리면 여기서 red 가 난다.
//
// ⚠️ 정규식은 한때 이 파일 안에 **두 번 정의**돼 있었다(형식 판정 · HTML 실재 검사).
// 지금은 상수 하나이지만, 아래 단언은 여전히 **두 소비처를 함께** 건다 — 다시 복제되면
// 한쪽만 고쳐도 green 이 되는 상태로 조용히 돌아가기 때문이다.

test('report_html: 일몰 — 구 세대 표기는 이제 거부된다 (NC P06)', () => {
  for (const sunset of [
    '00.Documents/reports/M13-hook-gate.html',            // 점표기 (HR2 이전)
    '00.Documents/reports/milestones/M13-hook-gate.html',
    '00_Documents/reports/M13-hook-gate.html',            // 언더스코어 + 구 폴더명 (HR2~NC)
    '00_Documents/99_Reports/M13-hook-gate.html',         // 번호만 다른 형제 — 실재하지 않는다
  ]) {
    assert.ok(
      doneReportIssues(
        STRICT_DONE.replace('00_Documents/02_Reports/00_Milestones/M13-hook-gate.html', sunset),
        { htmlContent: STRICT_HTML },
      ).some((issue) => /report_html/.test(issue)),
      `${sunset} — 일몰된 표기가 다시 통과하면 유령 포인터가 또 쌓인다`,
    )
  }
})

test('report_html: 신 경로에서 두 소비처(형식 판정 · HTML 실재)가 함께 걸린다', () => {
  const renamed = STRICT_DONE.replace(
    'report_html: 00_Documents/02_Reports/00_Milestones/M13-hook-gate.html',
    'report_html: 00_Documents/02_Reports/00_Milestones/NC-naming.html',
  )
  // ① 형식 판정 — 정상 경로가 형식 위반으로 잡히면 완료 보고가 통째로 막힌다
  assert.equal(doneReportIssues(renamed, { htmlContent: STRICT_HTML }).length, 0,
    '정상 경로가 형식 위반이 되면 안 된다(fail-closed 과차단)')
  // ② HTML 실재·5단계 검사 — 형식이 통과해도 계약은 그대로다
  assert.ok(doneReportIssues(renamed).some((issue) => /HTML 보고서가 없습니다/.test(issue)),
    '명시한 HTML이 없으면 차단이다')
  assert.ok(doneReportIssues(renamed, { htmlContent: '<html></html>' })
    .some((issue) => /HTML.*5단계/.test(issue)),
    '5단계 라벨은 여전히 필수다')
})
