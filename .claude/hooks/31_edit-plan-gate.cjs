#!/usr/bin/env node
// 편집 경로 계획 게이트 (PreToolUse: Edit|MultiEdit|Write|NotebookEdit) — M03 Phase 2 Step 5.
// 근거: 계획 승인 문답 안건 5 채택 ([USER] 2026-11-11) · 유지 대장 AD-02 안 B의 일반화.
//
// 왜 이 자리인가: 헌법 3조를 완화하면 메인이 스폰 없이 직접 고치는 경로가 열린다. 스폰 자리에만
// 게이트가 있으면 위임은 계획이 있어야 열리고 직접 구현은 그냥 열려서, 게이트가 위임에만 비용을
// 지운다. 그래서 「유효한 계획과 결정 대장이 있고 FAIL 세 번 상태가 아닌가」를 편집마다 묻는다.
// 강도는 스폰 자리와 같다 — 판정부는 같은 모듈(_lib/plan-verdict.cjs)이다.
//
// 발화 조건은 대상 경로의 소속뿐이다 (대상 내용은 읽지 않는다) —
//   `01_Milestones` 안: 항상 연다. 계획과 기록을 쓰는 자리라 여기를 막으면 교착이다.
//   저장소 밖: 관할이 아니다 (스크래치패드·외부 사본).
//   그 밖의 저장소 안 경로: 판정 ①②③을 묻는다. ④(라우팅)는 분업 규격이라 거부 사유에서 빼고
//     로그 필드로만 남긴다 — 편집 한 건의 자격이 아니다.
// 역할 신호(agent_id·agent_type·MOODIE_SESSION_ROLE)는 읽지 않는다 — fork도 메인도 같은 판정이다.
'use strict';
const fs = require('fs');
const path = require('path');
const { evaluatePlan } = require('./_lib/plan-verdict.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const PLAN_SURFACE = '01_milestones/'; // 저장소 상대 소문자 슬래시 — 계획·기록 표면

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  try {
    fs.mkdirSync(GATE_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'edit-plan-gate', ...entry }) + '\n');
  } catch (e) { /* 로그 기록 실패도 판정을 막지 않는다 */ }
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음 = 아래 무대상 */ }
const ti = input.tool_input || {};
const target = ti.file_path || ti.notebook_path || null;
const base = {
  event: input.hook_event_name || 'PreToolUse', session: input.session_id || null,
  tool: input.tool_name || null, target,
};

function allow(rule, reason, evidence) {
  log({ ...base, verdict: 'allow', rule, reason, evidence: evidence || {} });
  process.exit(0);
}
function deny(rule, reason, evidence) {
  log({ ...base, verdict: 'deny', rule, reason, evidence: evidence || {} });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[편집 계획 게이트] ${reason}`,
    },
  }));
  process.exit(0);
}

// 저장소 상대 경로 (소문자 슬래시) — 경계 밖이면 null (tdd-guard의 adRel과 같은 규약)
function relOf(p) {
  const rel = path.relative(path.resolve(ROOT), path.resolve(String(p)));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/').toLowerCase();
}

try {
  if (!target) allow('무대상', '편집 대상 경로가 없다 — 판정할 것이 없다');
  const rel = relOf(target);
  if (rel === null) allow('저장소-밖', '편집 대상이 저장소 밖이다 — 계획 게이트의 관할이 아니다');
  if (rel.startsWith(PLAN_SURFACE)) {
    allow('계획-표면', `계획·기록 표면(${rel})의 편집 — 계획 상태와 무관하게 연다 (계획을 쓰는 편집을 막으면 교착)`, { file: rel });
  }

  const v = evaluatePlan({ root: ROOT });
  const common = { file: rel, planPath: v.planRel, ...(v.planFiles ? { planFiles: v.planFiles } : {}) };

  if (v.verdict === 'deny' && v.judgment <= 3) {
    deny(v.rule, v.reason, { ...common, judgment: v.judgment, ...v.evidence });
  }
  if (v.verdict === 'deny') {
    // 판정 ④만 걸린 계획 — 편집은 연다. 권고는 로그로만 남긴다 (안건 5의 「④는 로그 전용」).
    allow('라우팅-로그전용', `판정 ①②③ 통과 — 편집 자격 확인. 라우팅 판정은 거부 사유가 아니다`, {
      ...common, routingAdvisory: v.reason, failCounts: v.failCounts, tally: v.tally, routing: v.routing,
    });
  }
  allow('통과', '판정 ①②③ 통과 — 편집 자격 확인', {
    ...common, failCounts: v.failCounts, tally: v.tally, routing: v.routing,
  });
} catch (e) {
  // 판정부의 예기치 못한 오류는 편집을 막지 않는다 — 이 게이트는 계획 상태의 판정기이고,
  // 훅 크래시로 편집 전체가 멈추면 복구 경로(계획 수정)까지 함께 닫힌다. 오류는 줄로 남는다.
  log({ ...base, verdict: 'allow', rule: '훅-내부오류', reason: String((e && e.message) || e).slice(0, 200), evidence: {} });
  process.exit(0);
}
