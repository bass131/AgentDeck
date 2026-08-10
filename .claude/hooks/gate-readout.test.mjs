#!/usr/bin/env node
// 게이트 판독 계약 (M02 Phase 3 Step 3·5 · M01 Backlog 12번 앞 두 항목 + 6번).
//
// 겨누는 결함 세 가지 —
//   ① stop-gate가 마감 요약 「3줄」을 검사하지 않는다: 공용 pin의 스탬프 하나만 보므로, 라벨이 빠지거나
//      값이 비어 있거나 라벨 어휘가 달라도 스탬프만 새로우면 정지가 허용된다.
//   ② pass-watcher가 세션 첫 Write에서 무장전이다: Write는 사전 텍스트를 재구성할 수 없고 그 세션의
//      기준선도 아직 없어 「판정 불능 = 무장전」으로 빠진다 — 마감 요약 강제를 통째로 놓치는 fail-open이다.
//   ③ pin 스탬프 비교가 세션 스코프가 아니다: 코디네이터가 자기 마감으로 pin을 갱신하면 실행 중인
//      워커의 장전이 남의 스탬프로 충족돼 차단이 무력화된다 (M01 Phase 5 실관찰).
//
// 판정 근거는 미러 hook-log 줄과 미러 상태 파일뿐이다 (실저장소는 건드리지 않는다).
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness } from './_lib/gate-harness.mjs'

const r = createRunner('게이트 판독 계약 (stop-gate · pass-watcher)')
const H = createGateHarness()
const STOP = '50_stop-gate.cjs'
const PW = '40_pass-watcher.cjs'
const STOP_STATE = join(H.gateDir, 'stop-gate.state.json')
const PW_STATE = join(H.gateDir, 'pass-watcher.state.json')

// 픽스처 4종의 고정 스탬프. 값이 「지난 시각」인 것이 계약이다 — 장전 시각(entry.at)과 pin 갱신 증인은
// 실제 벽시계 ms로 비교되므로, 고정 스탬프가 미래면 증인이 장전보다 앞서 보여 귀속 판정이 성립하지 않는다.
const PIN_STAMP = '2026-08-10T09:00:00+09:00'
const A = 'readout-worker-a'
const B = 'readout-coordinator-b'
const PLAN = '.claude/hooks/fixtures/partition-auto-arm/_MilestonePreview.md'
const pin = (name) => `.claude/hooks/fixtures/pin-labels-${name}.md`

function armSession(sid, since) {
  H.writeJson(STOP_STATE, {
    schema: 2, global: null,
    sessions: { [sid]: { armed: true, since, note: '판정 계약 테스트 장전', blocks: 0, armedBy: 'auto', at: Date.parse(since) } },
  })
}
function stop(sid) {
  const res = H.run(STOP, { session_id: sid, hook_event_name: 'Stop' })
  const mine = res.of('stop-gate')
  return { res, verdict: mine.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화', line: mine[0] || null }
}
// pin을 편집 도구 경유로 갱신한다 — 갱신 주체(세션)를 하네스가 관측할 수 있는 유일한 경로다
function writePinVia(sid, pinRel, stamp) {
  const abs = H.path(...pinRel.split('/'))
  const before = readFileSync(abs, 'utf8')
  const after = before.replace(/- 스탬프: \S+/, `- 스탬프: ${stamp}`)
  writeFileSync(abs, after)
  return H.run(PW, {
    session_id: sid, hook_event_name: 'PostToolUse', tool_name: 'Write',
    tool_input: { file_path: abs, content: after },
  })
}

try {
  // ============ Step 3 ① stop-gate 마감 요약 3줄 판정 계약 ==================
  H.setConfig({ planPath: PLAN, workPinPath: pin('full') })
  {
    armSession(A, '2026-08-10T08:59:00+09:00')
    r.judge('SG-01 라벨 3종 완전본 + 새 스탬프', stop(A).verdict, 'allow/마감-요약-실측', { note: '회귀 불변식' })
  }
  for (const [id, name, why] of [
    ['SG-02', 'missing', '「봐야 할 것」 줄 부재'],
    ['SG-03', 'empty', '「내린 결정」 값이 빈 값'],
    ['SG-04', 'wrong', '「바뀐 것」 대신 「변경 사항」'],
  ]) {
    H.setConfig({ planPath: PLAN, workPinPath: pin(name) })
    armSession(A, '2026-08-10T08:59:00+09:00')
    r.judge(`${id} ${why}`, stop(A).verdict, 'block/마감-요약-라벨-불충족', { note: '스탬프는 새것이다 — 라벨만이 반려 사유' })
  }
  {
    // 동일 초 경계 — 스탬프와 장전 시각이 같은 초면 통과가 기대값이다 (계약 `stampMs >= armedMs`)
    H.setConfig({ planPath: PLAN, workPinPath: pin('full') })
    armSession(A, PIN_STAMP)
    r.judge('SG-05 동일 초 경계 (스탬프 == 장전)', stop(A).verdict, 'allow/마감-요약-실측', { note: '통과가 기대값' })
  }
  {
    H.setConfig({ planPath: PLAN, workPinPath: pin('full') })
    armSession(A, '2026-08-10T09:00:01+09:00')
    r.judge('SG-06 장전보다 1초 낡은 스탬프', stop(A).verdict, 'block/마감-요약-미실측', { note: '회귀 불변식' })
  }

  // ============ Step 5 pin 스탬프 비교의 세션 스코프화 ======================
  {
    // 워커 A가 장전한 뒤, 코디네이터 B가 자기 마감으로 pin을 갱신한다 — A의 마감 요약은 없다
    H.setConfig({ planPath: PLAN, workPinPath: pin('full') })
    armSession(A, '2026-08-10T08:59:00+09:00')
    writePinVia(B, pin('full'), '2026-08-10T09:05:00+09:00')
    r.judge('PS-01 타세션(코디네이터) pin 갱신', stop(A).verdict, 'block/pin-타세션-갱신',
      { note: '남의 마감 요약으로 내 장전이 풀리면 안 된다' })
  }
  {
    H.setConfig({ planPath: PLAN, workPinPath: pin('full') })
    armSession(A, '2026-08-10T08:59:00+09:00')
    const w = writePinVia(A, pin('full'), '2026-08-10T09:06:00+09:00')
    r.judge('PS-02 자기 세션 pin 갱신', stop(A).verdict, 'allow/마감-요약-실측', { note: '정상 마감 경로' })
    r.judge('PS-02b pin 갱신이 증인 줄로 남는다',
      w.of('pass-watcher').map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화', '증인/pin-갱신-기록',
      { note: '귀속 판정의 유일한 신호' })
  }
  {
    // 증인이 아예 없는 갱신(픽스처가 fs로 직접 쓴 경우)은 종전 스탬프 판정을 그대로 쓴다
    H.writeJson(PW_STATE, { schema: 2, global: null, sessions: {} })
    H.setConfig({ planPath: PLAN, workPinPath: pin('full') })
    const abs = H.path(...pin('full').split('/'))
    writeFileSync(abs, readFileSync(abs, 'utf8').replace(/- 스탬프: \S+/, `- 스탬프: 2026-08-10T09:07:00+09:00`))
    armSession(A, '2026-08-10T08:59:00+09:00')
    r.judge('PS-03 증인 부재 갱신 (하위 호환)', stop(A).verdict, 'allow/마감-요약-실측',
      { note: '귀속 불능은 종전 판정 유지 — 기존 픽스처 회귀 보호' })
  }

  // ============ Step 3 ② pass-watcher 세션 첫 Write 기준선 부재 ============
  {
    const phase = H.path('.claude', 'hooks', 'fixtures', 'partition-auto-arm', '01_Phase_1.md')
    const base = readFileSync(phase, 'utf8')
    const next = base.replace('- (기록 없음)', '- (기록 없음)\n- PASS 2026-08-10T21:10:00+09:00 — 첫 Write 모의 추기')
    writeFileSync(phase, next)
    H.writeJson(PW_STATE, { schema: 2, global: null, sessions: {} }) // 세션 첫 Write = 기준선 없음
    H.writeJson(STOP_STATE, { schema: 2, global: null, sessions: {} })
    H.setConfig({ planPath: PLAN, workPinPath: pin('full') })
    const res = H.run(PW, {
      session_id: 'readout-first-write', hook_event_name: 'PostToolUse', tool_name: 'Write',
      tool_input: { file_path: phase, content: next },
    })
    const verdict = res.of('pass-watcher').map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화'
    r.judge('PW-01 세션 첫 Write + PASS 실존', verdict, '장전/기준선-부재-보수적-장전',
      { note: '무장전은 마감 요약 강제를 통째로 놓친다' })
    const armed = (() => { try { return H.readJson(STOP_STATE).sessions?.['readout-first-write']?.armed } catch { return null } })()
    r.check('PW-01b 마감 게이트가 자기 세션 스코프에 장전된다', armed === true, `실측 armed=${armed}`)
  }
  {
    const phase2 = H.path('.claude', 'hooks', 'fixtures', 'partition-auto-arm', '02_Phase_2.md')
    const text = '## Phase 2 — 기준선 부재 픽스처 · 태그: `hooks` · 의존: 없음\n\n목표: PASS 0건 상태의 첫 Write 판정을 겨눈다.\n\n검증 기록\n\n- FAIL 2026-08-10T21:11:00+09:00 — 모의 실패 줄\n'
    writeFileSync(phase2, text)
    H.writeJson(PW_STATE, { schema: 2, global: null, sessions: {} })
    H.writeJson(STOP_STATE, { schema: 2, global: null, sessions: {} })
    const res = H.run(PW, {
      session_id: 'readout-first-write-2', hook_event_name: 'PostToolUse', tool_name: 'Write',
      tool_input: { file_path: phase2, content: text },
    })
    const verdict = res.of('pass-watcher').map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화'
    r.judge('PW-02 세션 첫 Write + PASS 0건', verdict, '무장전/기준선-부재',
      { note: '장전 근거가 없다 — 오장전 방어 유지' })
  }
} finally {
  H.cleanup()
}

process.exit(r.summary())
