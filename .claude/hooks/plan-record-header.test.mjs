#!/usr/bin/env node
// plan-gate 「검증 기록」 절 판독 계약 (M02 Phase 3 Step 4 · M01 Backlog 12번 셋째 항목 + 2번).
//
// 겨누는 결함 두 가지 —
//   ① 절 헤더 판독이 접두사 검사(`/^검증 기록/`)뿐이라 「검증 기록은 아직 없음」 같은 산문 줄도 절
//      헤더로 인정된다. 그 위장 헤더 하나면 검증 기록 절 실존 검사가 통째로 우회되고, 실패 카운터의
//      집계 시작점도 엉뚱한 자리로 옮겨 간다. 허용 헤더를 제목 단독 줄 `^검증 기록\s*$`로 고정한다.
//   ② partition 픽스처 3종(preview-only·no-tag·no-record)이 원래 겨눈 검사에 닿지 못한다. 세 픽스처의
//      Preview에 「사람용 개요」 절이 없어 그 앞 단계에서 먼저 반려되기 때문이다 (커버리지 축소).
//      도달 검증은 반려 사유 문자열 스모크로 한다.
//
// 판정 근거는 미러 hook-log 줄과 stdout의 deny JSON뿐이다 (실저장소는 건드리지 않는다).
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness, REPO_ROOT } from './_lib/gate-harness.mjs'

const r = createRunner('plan-gate 검증 기록 절 판독 계약')
const H = createGateHarness()
const HOOK = '20_plan-gate.cjs'
const PIN = '.claude/hooks/fixtures/work-pin-fresh.md'
const spawnInput = { session_id: 'plan-record-header', hook_event_name: 'PreToolUse', tool_name: 'Task', tool_input: {} }

function judgePlan(planPath) {
  H.setConfig({ planPath, workPinPath: PIN })
  const res = H.run(HOOK, spawnInput)
  const mine = res.of('plan-gate')
  let reason = null
  try { reason = JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason } catch { /* allow는 무출력 */ }
  return {
    verdict: mine.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화',
    reason: reason || '',
    line: mine[0] || null,
  }
}

try {
  // ---- ① 위장 헤더 반려 ----------------------------------------------------
  {
    const c = judgePlan('.claude/hooks/fixtures/partition-fake-record/_MilestonePreview.md')
    r.judge('PR-01 위장 헤더(「검증 기록은 아직 없음」) 판정', c.verdict, 'deny/검증-미통과',
      { note: '제목 단독 줄만 절 헤더다' })
    r.check('PR-01b 반려 사유가 검증 기록 절 부재를 지목한다', /검증 기록 절 부재/.test(c.reason),
      `실측 ${JSON.stringify(c.reason.slice(0, 90))}`)
  }

  // ---- ② partition 픽스처 3종의 도달 스모크 --------------------------------
  for (const [id, dir, needle, aim] of [
    ['PR-02', 'partition-preview-only', 'Phase 구획이 없다', 'Phase 구획 부재 검사'],
    ['PR-03', 'partition-no-tag', '도메인 태그·의존성 표기 부재', '태그 표기 부재 검사'],
    ['PR-04', 'partition-no-record', '검증 기록 절 부재', '검증 기록 절 부재 검사'],
  ]) {
    const c = judgePlan(`.claude/hooks/fixtures/${dir}/_MilestonePreview.md`)
    r.judge(`${id} ${dir} 판정`, c.verdict, 'deny/검증-미통과', { note: aim })
    r.check(`${id}b ${dir} 반려 사유가 ${aim}에 도달한다`, c.reason.includes(needle),
      `기대 「${needle}」 포함 · 실측 ${JSON.stringify(c.reason.slice(0, 90))}`)
  }

  // ---- 회귀 불변식 — 사람용 개요 부재는 여전히 그 사유로 반려된다 ----------
  {
    const c = judgePlan('.claude/hooks/fixtures/partition-no-human-overview/_MilestonePreview.md')
    r.judge('PR-05 사람용 개요 부재 판정', c.verdict, 'deny/검증-미통과', { note: '회귀 불변식' })
    r.check('PR-05b 반려 사유가 사람용 개요를 지목한다', /사람용 개요/.test(c.reason),
      `실측 ${JSON.stringify(c.reason.slice(0, 90))}`)
  }

  // ---- 회귀 불변식 — 실계획(M02 파일 구획)은 통과한다 ----------------------
  // planPath를 실저장소 절대 경로로 준다 — 훅은 계획을 읽기만 하고, 로그·상태는 미러에만 쌓인다.
  {
    const c = judgePlan(join(REPO_ROOT, '01_Milestones', 'M02_Hardening', '_MilestonePreview.md'))
    r.judge('PR-06 실계획 M02 파일 구획', c.verdict, 'allow/통과', { note: '회귀 불변식 — 위장 헤더 수리가 실계획을 깨지 않는다' })
  }
} finally {
  H.cleanup()
}

process.exit(r.summary())
