#!/usr/bin/env node
// 스폰 게이트 (PreToolUse: Task|Agent) — 구현 SubAgent 스폰 전 판정 4종. 파일 구획일 때는 판정 ①이
// Preview 원문의 「사람용 개요」 절 실존까지 검사한다 (근거: 결정 대장 [USER] 2026-08-08 블랙박스 금지).
// 설계 원 기록: AgentDeck 00_Documents/05_Design_Notes/ 아래 06_실패-카운터 · 07_주도권-게이트 · 10_분업-라우팅-규격.
//
// 판정부는 M03 Phase 2 Step 5에서 `_lib/plan-verdict.cjs`로 추출됐다 — 같은 판정이 편집 경로
// (`31_edit-plan-gate.cjs`)에서도 발화하기 때문이다. 이 파일은 그 판정을 스폰 자리의 출력 계약
// (deny JSON · hook-log 줄 모양)으로 옮기는 껍데기다. 스폰 자리는 판정 넷 전부를 거부로 쓴다.
'use strict';
const fs = require('fs');
const path = require('path');
const { evaluatePlan } = require('./_lib/plan-verdict.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'plan-gate', ...entry }) + '\n');
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음도 판정은 진행 */ }
const base = { event: 'PreToolUse', session: input.session_id || null, tool: input.tool_name || null };

const v = evaluatePlan({ root: ROOT });

if (v.verdict === 'deny') {
  log({ ...base, verdict: 'deny', rule: v.rule, reason: v.reason, evidence: v.planFiles ? { planFiles: v.planFiles, ...v.evidence } : v.evidence });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[스폰 게이트] ${v.reason}`,
    },
  }));
  process.exit(0);
}

// 통과 — 무출력으로 일반 권한 흐름을 유지하고, 판정 근거는 로그로만 남긴다
log({
  ...base, verdict: 'allow', rule: '통과',
  reason: v.planFiles ? '판정 4종 통과(사람용 개요 검사 포함) — 스폰 자격 확인' : '판정 4종 통과 — 스폰 자격 확인',
  evidence: {
    planPath: v.planRel,
    ...(v.planFiles ? { planFiles: v.planFiles, humanOverview: v.humanOverview } : {}),
    failCounts: v.failCounts, tally: v.tally, routing: v.routing,
  },
});
process.exit(0);
