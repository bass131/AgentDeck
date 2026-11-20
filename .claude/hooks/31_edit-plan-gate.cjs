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
// 예외 하나 — 지금 계획이 「상태: 종결」로만 걸렸을 때 gate-config.json의 편집은 바뀐 뒤의 planPath로 판정한다
//   (포인터 전환, M11 G7). 막으면 goal을 닫은 뒤 다음 goal로 넘어가는 길이 잠긴다. 대상은 01_Milestones 안의 계획만이다.
// 역할 신호(agent_id·agent_type)는 읽지 않는다 — fork도 메인도 같은 판정이다.
'use strict';
const fs = require('fs');
const path = require('path');
const { evaluatePlan, stripBom } = require('./_lib/plan-verdict.cjs');
const { repoRel } = require('./_lib/repo-path.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const PLAN_SURFACE = '01_milestones/'; // 저장소 상대 소문자 슬래시 — 계획·기록 표면
const CONFIG_REL = '98_management/01_gatestate/gate-config.json';

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
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음 = 아래 대상 없음 → 거부 */ }
if (!input || typeof input !== 'object') input = {};
const ti = (input.tool_input && typeof input.tool_input === 'object') ? input.tool_input : {};
// 대상 필드 — Edit·Write·MultiEdit는 `file_path`, NotebookEdit는 `notebook_path`다
// (Agent SDK sdk-tools.d.ts의 FileEditInput·FileWriteInput·NotebookEditInput 실측. MultiEdit는 현행 SDK 정의에
// 없어 종전 Claude Code의 `file_path` 형태를 따른다). 비어 있지 않은 문자열만 대상으로 인정한다.
const pickTarget = (...vals) => vals.find(v => typeof v === 'string' && v.trim() !== '') || null;
const target = pickTarget(ti.file_path, ti.notebook_path);
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

// 편집이 적용된 뒤 gate-config.json의 planPath — 계산할 수 없으면 null
function proposedPlanPath() {
  let text = null;
  if (typeof ti.content === 'string') text = ti.content;
  else {
    let cur;
    try { cur = fs.readFileSync(path.join(GATE_DIR, 'gate-config.json'), 'utf8'); } catch (e) { return null; }
    const edits = Array.isArray(ti.edits) ? ti.edits : [ti];
    for (const e of edits) {
      if (!e || typeof e.old_string !== 'string' || typeof e.new_string !== 'string' || !cur.includes(e.old_string)) return null;
      cur = e.replace_all ? cur.split(e.old_string).join(e.new_string) : cur.replace(e.old_string, () => e.new_string);
    }
    text = cur;
  }
  try {
    const c = JSON.parse(stripBom(text));
    return c && typeof c.planPath === 'string' && c.planPath.trim() ? c.planPath : null;
  } catch (e) { return null; }
}

try {
  // 대상 경로가 없는 편집 입력은 판정할 수 없다 — 허용이 아니라 거부다 (M03 Phase 4 Step 11 · Backlog 20).
  // 내려간 역할 게이트도 대상 없음을 거부했다. 정상 입력은 위 대상 필드를 반드시 갖는다.
  if (!target) deny('대상-없음', '편집 대상 경로가 없다 — 판정할 수 없는 편집 입력은 열지 않고 거부한다 (fail-closed)');
  const rel = repoRel(ROOT, target);
  if (!rel) allow('저장소-밖', '편집 대상이 저장소 밖이다 — 계획 게이트의 관할이 아니다');
  if (rel.startsWith(PLAN_SURFACE)) {
    allow('계획-표면', `계획·기록 표면(${rel})의 편집 — 계획 상태와 무관하게 연다 (계획을 쓰는 편집을 막으면 교착)`, { file: rel });
  }

  const v = evaluatePlan({ root: ROOT });
  const common = { file: rel, planPath: v.planRel, ...(v.planFiles ? { planFiles: v.planFiles } : {}) };

  if (v.verdict === 'deny' && v.rule === '계획-종결' && rel === CONFIG_REL) {
    const next = proposedPlanPath();
    const nextRel = next ? repoRel(ROOT, next) : null;
    if (next && !(nextRel && nextRel.startsWith(PLAN_SURFACE))) {
      deny('포인터-전환-범위', `종결한 계획에서의 포인터 전환은 저장소 01_Milestones 안의 다음 계획으로만 연다 — 대상 ${next}`, { ...common, nextPlan: next });
    }
    const nv = next ? evaluatePlan({ root: ROOT, planRel: next }) : null;
    if (nv && (nv.verdict === 'allow' || nv.judgment === 4)) {
      allow('포인터-전환', `종결한 계획(${v.planRel})에서 다음 계획(${next})으로의 포인터 전환 — 바뀐 뒤의 계획이 판정 ①②③을 통과한다`, { ...common, nextPlan: next });
    }
    if (nv) deny(nv.rule, `포인터 전환 대상(${next})이 판정을 통과하지 못한다 — ${nv.reason}`, { ...common, nextPlan: next, judgment: nv.judgment });
  }
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
