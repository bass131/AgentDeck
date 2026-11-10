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
//   ③ 같은 헤더 계약이 plan-gate에만 반영됐다 (M02 Backlog 5 · M03 Phase 2 Step 4). `33_tdd-guard.cjs`와
//      `40_pass-watcher.cjs`의 countRecord는 접두사 판독을 그대로 써서, 위장 헤더 아래의 PASS 서술이
//      두 훅에서는 여전히 절 안으로 집계됐다 — tdd-guard는 Green 증거 게이트를, pass-watcher는 마감
//      게이트 자동 장전을 엉뚱한 줄에 걸었다. 세 훅의 헤더 판독을 한 정규식으로 맞춘다.
//
// 판정 근거는 미러 hook-log 줄과 stdout의 deny JSON뿐이다 (실저장소는 건드리지 않는다).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness, REPO_ROOT } from './_lib/gate-harness.mjs'

const r = createRunner('검증 기록 절 판독 계약 (plan-gate · tdd-guard · pass-watcher)')
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

  // ---- ③ 헤더 계약 정합 — tdd-guard·pass-watcher (M02 Backlog 5) --------------
  // 픽스처는 미러 안에서만 산다. 같은 본문을 위장 헤더판과 진짜 헤더판으로 둘 두고, 두 훅이 전자에는
  // 발화하지 않고 후자에는 종전대로 발화하는 것을 쌍으로 고정한다 — 침묵만 보면 계약이 비어 버린다.
  const PASS_LINE = '- PASS 2026-11-11T06:00:00+09:00 — 절 안으로 집계되면 안 되는 PASS 서술\n'
  const phaseBody = (header) => [
    '## Phase 3 — 헤더 계약 픽스처 · 태그: `source` · 의존: 없음',
    '',
    '**목표**: 위장 헤더 아래의 PASS 서술이 검증 기록 절로 집계되는지 겨눈다.',
    '',
    header,
    '',
  ].join('\n')
  const FAKE_HEADER = '검증 기록은 아직 없음 — 이 줄은 절 헤더가 아니다.'
  const REAL_HEADER = '검증 기록'

  // tdd-guard ① 검증형 — source 태그 Phase의 PASS 추기에 vitest Green 증거를 요구한다.
  // Green 증거가 없는 상태에서 PASS 집계가 늘면 deny다. 집계가 늘지 않으면 무발화다.
  const TDD_STATE = join(H.gateDir, 'tdd-guard.state.json')
  function tddVerdict(header) {
    const abs = H.path('.claude', 'hooks', 'fixtures', 'record-header-phase.md')
    const body = phaseBody(header)
    H.write(abs, body)
    H.writeJson(TDD_STATE, { schema: 2, global: null, sessions: {} }) // Green 증거 없음
    const res = H.run('33_tdd-guard.cjs', {
      session_id: 'record-header-tdd', hook_event_name: 'PreToolUse', tool_name: 'Write',
      tool_input: { file_path: abs, content: body + PASS_LINE },
    })
    return res.of('tdd-guard').map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화'
  }
  r.judge('RH-01 tdd-guard · 위장 헤더 아래 PASS 추기', tddVerdict(FAKE_HEADER), '무발화',
    { note: '절 밖의 PASS 서술이다 — Green 증거 게이트의 관할이 아니다' })
  r.judge('RH-02 tdd-guard · 진짜 헤더 아래 PASS 추기', tddVerdict(REAL_HEADER), 'deny/green-증거-부재',
    { note: '회귀 불변식 — 헤더 계약을 좁혀도 본래 게이트는 그대로 발화한다' })

  // pass-watcher ② 자동 장전 — 세션 첫 Write는 사전 텍스트가 없어 PASS 실존만 보고 기운다.
  // 대상은 계획 구획 멤버여야 하므로 partition-auto-arm 폴더의 Phase 파일로 둔다.
  const PW_STATE = join(H.gateDir, 'pass-watcher.state.json')
  const STOP_STATE = join(H.gateDir, 'stop-gate.state.json')
  function pwVerdict(header, phaseFile) {
    const abs = H.path('.claude', 'hooks', 'fixtures', 'partition-auto-arm', phaseFile)
    const text = phaseBody(header) + PASS_LINE
    H.write(abs, text)
    H.setConfig({ planPath: '.claude/hooks/fixtures/partition-auto-arm/_MilestonePreview.md', workPinPath: PIN })
    H.writeJson(PW_STATE, { schema: 2, global: null, sessions: {} }) // 기준선 부재
    H.writeJson(STOP_STATE, { schema: 2, global: null, sessions: {} })
    const res = H.run('40_pass-watcher.cjs', {
      session_id: 'record-header-pw', hook_event_name: 'PostToolUse', tool_name: 'Write',
      tool_input: { file_path: abs, content: text },
    })
    return res.of('pass-watcher').map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화'
  }
  r.judge('RH-03 pass-watcher · 위장 헤더 아래 PASS 실존', pwVerdict(FAKE_HEADER, '03_Phase_3.md'),
    '무장전/기준선-부재', { note: '절 밖의 PASS 서술로는 마감 게이트를 장전하지 않는다' })
  r.judge('RH-04 pass-watcher · 진짜 헤더 아래 PASS 실존', pwVerdict(REAL_HEADER, '04_Phase_4.md'),
    '장전/기준선-부재-보수적-장전', { note: '회귀 불변식 — 보수적 장전은 그대로 유지한다' })

  // 세 훅의 헤더 판독 정규식이 같은 원문인지 정적으로 단정한다 (주석 줄은 세지 않는다).
  // plan-gate의 판독은 M03 Phase 2 Step 5에서 `_lib/plan-verdict.cjs`로 추출됐다 — 그래서 단정 대상은
  // 그 모듈이고, plan-gate 쪽은 그 모듈에서 판정을 받아 온다는 사실을 함께 본다.
  const HEADER_RE_SRC = String.raw`/^검증 기록\s*$/`
  const codeOf = (rel) => readFileSync(join(REPO_ROOT, '.claude', 'hooks', ...rel.split('/')), 'utf8')
    .split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n')
  for (const hook of ['_lib/plan-verdict.cjs', '33_tdd-guard.cjs', '40_pass-watcher.cjs']) {
    r.check(`RH-05 ${hook}의 헤더 판독 정규식이 ${HEADER_RE_SRC}다`, codeOf(hook).includes(HEADER_RE_SRC),
      `실측 — 코드 줄에 해당 정규식 원문 없음`)
  }
  for (const hook of ['20_plan-gate.cjs', '31_edit-plan-gate.cjs']) {
    r.check(`RH-06 ${hook}이 판정을 _lib/plan-verdict.cjs에서 받는다`,
      codeOf(hook).includes("require('./_lib/plan-verdict.cjs')"), '실측 — require 줄 없음')
  }
} finally {
  H.cleanup()
}

process.exit(r.summary())
