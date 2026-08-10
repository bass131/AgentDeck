#!/usr/bin/env node
// 실행 게이트 (PreToolUse: Edit|MultiEdit|Write|NotebookEdit) — 분업 1의 게이트 실물.
// 메인 세션(오케스트레이터)의 구현 도구 호출을 상시 차단한다 — 구현은 스폰된 Worker의 몫이다
// (노션 03장 분업 1: S+P → G). 리셋 게이트와 달리 장전 여부에 매이지 않는 상시 차단이 기본이다.
// 허용 표면: 01_Milestones/ 아래 계획·work-pin·결정 대장·검증 기록 문서. 저장소 경계 밖
// (세션 메모리·스크래치패드)은 이 게이트의 관할이 아니다. 근거: M02 결정 대장 [USER] 2026-08-01.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const ALLOW_DIRS = ['01_milestones']; // 허용 표면의 최상위 구획 (소문자 비교)

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'role-gate', ...entry }) + '\n');
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음도 판정은 진행 */ }
const ti = input.tool_input || {};
const target = ti.file_path || ti.notebook_path || null;

// ---- 역할 판독 — 메인/워커 구분 기제 (Phase 2 실측으로 확정) ----
// 실측(2026-08-01, H1·H2·H3 헤드리스 프로브): SubAgent(Worker)의 도구 호출에만 훅 입력에
// agent_id·agent_type 필드가 실리고, 메인 루프 호출에는 두 필드가 부재한다 — 이 필드를 정본 신호로 쓴다.
// env:MOODIE_SESSION_ROLE=worker는 드라이버가 별도 프로세스 Worker를 띄울 때를 위한 예약 신호다 (Phase 4).
// io는 실측·회귀 근거다 — 입력 최상위 키 전량과 후보 필드 값을 매 판정 로그에 싣는다.
const candidateKeys = Object.keys(input).filter(k => /agent|parent|subagent|sidechain/i.test(k));
const candidates = {};
for (const k of candidateKeys) candidates[k] = input[k];
let role = 'main', roleSignal = '신호-부재=메인';
if (process.env.MOODIE_SESSION_ROLE === 'worker') {
  role = 'worker'; roleSignal = 'env:MOODIE_SESSION_ROLE=worker';
} else if (input.agent_id || input.agent_type) {
  role = 'worker';
  roleSignal = `input:agent_id=${String(input.agent_id || '?').slice(0, 40)} · agent_type=${String(input.agent_type || '?').slice(0, 40)}`;
}
const io = {
  keys: Object.keys(input),
  candidates,
  permissionMode: input.permission_mode || null,
  transcript: input.transcript_path ? path.basename(String(input.transcript_path)) : null,
};
const base = { event: 'PreToolUse', session: input.session_id || null, tool: input.tool_name || null, target, role, roleSignal };

function deny(rule, reason) {
  log({ ...base, verdict: 'deny', rule, reason, io });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[실행 게이트] ${reason}`,
    },
  }));
  process.exit(0);
}
function allow(rule, reason) {
  log({ ...base, verdict: 'allow', rule, reason, io });
  process.exit(0);
}

// Worker는 구현 도구가 본업이다 — 통과 (판정 근거는 roleSignal·io에 있다)
if (role === 'worker') allow('워커-허용', `Worker 역할 — 구현 도구 허용 (신호: ${roleSignal})`);

// 이하 메인 세션 — fail-closed
if (!target) deny('대상-불명', '대상 경로 없는 구현 도구 호출 — 판정 불능은 차단 (fail-closed)');
const rel = path.relative(ROOT.toLowerCase(), path.resolve(String(target)).toLowerCase());
if (rel.startsWith('..') || path.isAbsolute(rel)) {
  allow('경계-밖', '저장소 경계 밖(세션 메모리·스크래치패드 등) — 이 게이트의 관할 아님');
}
if (ALLOW_DIRS.includes(rel.split(path.sep)[0])) {
  allow('허용-표면', '계획·work-pin·결정 대장·검증 기록의 거처(01_Milestones) — 메인 세션 허용 표면');
}
deny('분업-1-구현-차단', `분업 1 — 메인 세션은 구현 도구를 쓰지 않는다. 구현은 Worker 스폰으로 위임하라 (허용 표면: 01_Milestones의 계획·work-pin·결정 대장·검증 기록). 대상: ${rel}`);
