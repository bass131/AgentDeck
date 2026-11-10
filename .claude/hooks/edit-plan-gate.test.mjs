#!/usr/bin/env node
// 편집 경로 계획 게이트 판정 계약 (M03 Phase 2 Step 5 · 계획 승인 문답 안건 5 채택).
//
// 겨누는 것 — 3조를 완화하면 「스폰하지 않고 직접 고치는 경로」에 7조의 기계 집행 자리가 없다.
// 그래서 스폰 게이트의 판정 ①(계획 규격)·②(실패 카운터)·③(결정 대장 주도권)을 편집 경로로 옮긴다.
// 강도는 스폰 자리와 같고 자리만 늘어난다 — 판정부는 한 모듈(_lib/plan-verdict.cjs)을 공유한다.
//
// 계약 네 줄 —
//   ① 저장소 안이고 `01_Milestones` 밖인 대상은 계획 ①②③을 통과해야 편집이 열린다.
//   ② `01_Milestones` 안의 대상은 계획 상태와 무관하게 열린다 — 계획을 쓰는 편집을 막으면 교착이다.
//   ③ 저장소 밖의 대상은 관할이 아니다.
//   ④ 판정 ④(라우팅)는 분업 규격이라 거부 사유에서 빼고 로그 필드로만 남긴다.
// 역할 신호(agent_id·agent_type)는 읽지 않는다 — fork도 메인도 같은 판정이다.
//
// 판정 근거는 미러 hook-log 줄과 stdout의 deny JSON뿐이다 (실저장소는 건드리지 않는다).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRunner } from './_lib/runner.mjs'
import { createGateHarness, REPO_ROOT } from './_lib/gate-harness.mjs'

const r = createRunner('편집 경로 계획 게이트 (31_edit-plan-gate)')
const H = createGateHarness()
const HOOK = '31_edit-plan-gate.cjs'
const PIN = '.claude/hooks/fixtures/work-pin-fresh.md'
const SESSION = 'edit-plan-gate-probe'
const SOURCE_TARGET = ['02_Project', '00_Source', 'main', 'index.ts']

// 한 케이스 = planPath 설정 + 편집 PreToolUse 1건. 판정은 추가된 edit-plan-gate 줄과 stdout뿐이다.
function judge(planPath, targetAbs, payloadExtra = {}) {
  H.setConfig({ planPath, workPinPath: PIN })
  const res = H.run(HOOK, {
    session_id: SESSION, hook_event_name: 'PreToolUse', tool_name: 'Edit',
    tool_input: { file_path: targetAbs, old_string: 'a', new_string: 'b' },
    ...payloadExtra,
  })
  const mine = res.of('edit-plan-gate')
  let reason = null
  try { reason = JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason } catch { /* allow는 무출력 */ }
  return {
    verdict: mine.map((l) => `${l.verdict}/${l.rule}`).join(', ') || '무발화',
    lines: mine.length,
    reason: reason || '',
    evidence: mine[0]?.evidence ?? null,
  }
}

// 9 Phase 단일 파일 계획 — 판정 ①②③은 통과하고 ④(Phase 수 상한 8)만 걸리는 픽스처다.
function writeOverflowPlan() {
  const rel = '.claude/hooks/fixtures/plan-phase-overflow.md'
  const phases = []
  for (let n = 1; n <= 9; n++) {
    phases.push([
      `## Phase ${n} — 넘침 픽스처 ${n} · 태그: \`hooks\` · 의존: 없음`, '',
      '**목표**: Phase 수 상한 초과만을 겨눈다.', '',
      '검증 기록', '',
      `- PASS 2026-11-11T06:00:00+09:00 — 픽스처 자체 점검 ${n}`, '',
    ].join('\n'))
  }
  const text = [
    '# M99 — 프로브 픽스처: Phase 9개 (라우팅 상한 초과)', '',
    '- 마일스톤: M99 (라우팅 판정 프로브) · 작성: 2026-11-11 · 상태: 실행 중', '',
    '## 개요', '',
    '- **목표**: 판정 ④만 걸리는 계획에서 편집 경로 게이트가 거부하지 않는지 실측한다.', '',
    phases.join('\n'),
    '## 결정 대장', '',
    '- [USER] 프로브: 이 픽스처는 Phase 9개 케이스다 (2026-11-11)', '',
  ].join('\n')
  writeFileSync(H.path(...rel.split('/')), text)
  return rel
}

try {
  // 편집 대상 파일은 실존할 필요가 없다 — 이 게이트는 경로의 소속만 보고 대상 내용은 읽지 않는다.
  const src = H.path(...SOURCE_TARGET)

  // ---- ① 거부 — 저장소 안 · 01_Milestones 밖 · 계획이 유효하지 않다 --------
  for (const [id, planPath, expect, needle, aim] of [
    ['EP-01', '.claude/hooks/fixtures/plan-fail3.md', 'deny/실패-카운터', 'FAIL 3회', '판정 ② 실패 카운터'],
    ['EP-02', '.claude/hooks/fixtures/plan-ai-majority.md', 'deny/주도권-문답분기', '주도권 게이트 발동', '판정 ③ 결정 대장 주도권'],
    ['EP-03', '.claude/hooks/fixtures/plan-no-ledger.md', 'deny/대장-부재', '결정 대장 절이 없다', '판정 ③ 대장 부재'],
    ['EP-04', '.claude/hooks/fixtures/partition-preview-only/_MilestonePreview.md', 'deny/검증-미통과', 'Phase 구획이 없다', '판정 ① 계획 규격'],
    ['EP-05', '.claude/hooks/fixtures/plan-그런-파일-없음.md', 'deny/계획-문서-부재', '계획 문서를 읽을 수 없다', '판정 ① 계획 문서 부재'],
  ]) {
    const c = judge(planPath, src)
    r.judge(`${id} ${aim}`, c.verdict, expect, { note: '저장소 안 · 01_Milestones 밖 대상' })
    r.check(`${id}b ${aim}의 거부 사유가 판정을 지목한다`, c.reason.includes(needle),
      `기대 「${needle}」 포함 · 실측 ${JSON.stringify(c.reason.slice(0, 90))}`)
    r.check(`${id}c 판정 줄이 hook-log에 1건 남는다`, c.lines === 1, `실측 ${c.lines}건`)
  }

  // ---- ② 허용 — 유효한 계획 ------------------------------------------------
  {
    const c = judge(join(REPO_ROOT, '01_Milestones', 'M03_Harness_Refresh', '_MilestonePreview.md'), src)
    r.judge('EP-06 유효한 실계획(M03 파일 구획)', c.verdict, 'allow/통과', { note: '판정 ①②③ 통과 — 편집을 연다' })
    r.check('EP-06b 통과 줄의 evidence에 라우팅 필드가 실린다', !!c.evidence?.routing?.route,
      `실측 ${JSON.stringify(c.evidence?.routing ?? null)}`)
  }

  // ---- ② 허용 — 01_Milestones 안의 대상은 계획 상태와 무관하다 -------------
  {
    const plan = H.path('01_Milestones', 'M03_Harness_Refresh', '02_Phase_2.md')
    const c = judge('.claude/hooks/fixtures/plan-fail3.md', plan)
    r.judge('EP-07 01_Milestones 안의 대상 (FAIL 3회 계획)', c.verdict, 'allow/계획-표면',
      { note: '계획을 쓰는 편집을 계획 게이트가 막으면 교착이다' })
  }

  // ---- ③ 허용 — 저장소 밖의 대상은 관할이 아니다 ---------------------------
  {
    const outside = join(tmpdir(), 'edit-plan-gate-outside.txt')
    const c = judge('.claude/hooks/fixtures/plan-fail3.md', outside)
    r.judge('EP-08 저장소 밖의 대상 (FAIL 3회 계획)', c.verdict, 'allow/저장소-밖', { note: '관할 밖' })
  }

  // ---- ④ 라우팅은 거부 사유가 아니다 ---------------------------------------
  {
    const c = judge(writeOverflowPlan(), src)
    r.judge('EP-09 Phase 9개 (판정 ④만 걸리는 계획)', c.verdict, 'allow/라우팅-로그전용',
      { note: '라우팅은 분업 규격 — 거부 사유에서 빼고 로그로만 남긴다' })
    r.check('EP-09b 라우팅 권고가 evidence에 실린다', (c.evidence?.routingAdvisory ?? '').includes('Phase 수'),
      `실측 ${JSON.stringify(c.evidence?.routingAdvisory ?? null)}`)
  }

  // ---- 역할 신호는 읽지 않는다 ---------------------------------------------
  {
    const asWorker = judge('.claude/hooks/fixtures/plan-fail3.md', src,
      { agent_id: 'edit-plan-gate-agent', agent_type: 'worker' })
    r.judge('EP-10 역할 신호(agent_id·agent_type)가 실린 같은 입력', asWorker.verdict, 'deny/실패-카운터',
      { note: 'fork도 메인도 워커도 같은 판정이다 — 역할은 읽지 않는다' })
    r.check('EP-10b 판정 줄에 역할 필드가 없다',
      asWorker.evidence !== null && !('role' in (asWorker.evidence ?? {})),
      `실측 evidence 키 ${JSON.stringify(Object.keys(asWorker.evidence ?? {}))}`)
  }

  // ---- 격리 — 미러 밖으로 새지 않는다 --------------------------------------
  r.check('격리 — 미러가 실저장소 밖이다', !H.mirror.startsWith(REPO_ROOT), H.mirror)
  const liveLog = join(REPO_ROOT, '98_Management', '01_GateState', 'hook-log.jsonl')
  const liveHits = existsSync(liveLog)
    ? readFileSync(liveLog, 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter((l) => l && l.session === SESSION).length
    : 0
  r.check('격리 — live hook-log에 합성 세션 줄이 0건이다', liveHits === 0, `${liveHits}건`)
} finally {
  H.cleanup()
}

process.exit(r.summary())
