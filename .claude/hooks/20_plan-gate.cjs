#!/usr/bin/env node
// 스폰 게이트 (PreToolUse: Task|Agent) — 구현 SubAgent 스폰 전 판정 4종. 파일 구획일 때는 판정 ①이
// Preview 원문의 「사람용 개요」 절 실존까지 검사한다 (근거: 결정 대장 [USER] 2026-08-08 블랙박스 금지).
// 설계 원 기록: AgentDeck 00_Documents/05_Design_Notes/ 아래 06_실패-카운터 · 07_주도권-게이트 · 10_분업-라우팅-규격.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const CONFIG_FILE = path.join(GATE_DIR, 'gate-config.json');
const FAIL_LIMIT = 3;  // 집행 사본 — 값의 소유자는 노션 02. Project Rules 검증 4
const PHASE_LIMIT = 8; // 집행 사본 — 값의 소유자는 노션 01장 「각 구역의 역할」 01_Milestones 해설

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

function deny(rule, reason, evidence) {
  log({ ...base, verdict: 'deny', rule, reason, evidence: planFiles ? { planFiles, ...evidence } : evidence });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[스폰 게이트] ${reason}`,
    },
  }));
  process.exit(0);
}

// 판정 대상 계획 문서 — gate-config.json의 planPath 포인터 (프로브는 포인터만 바꾼다)
let planRel = '01_Milestones/M01_Bootstrap/_MilestonePreview.md';
try {
  const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (c.planPath) planRel = c.planPath;
} catch (e) { /* 포인터 부재 시 기본값 */ }
const planAbs = path.isAbsolute(planRel) ? planRel : path.join(ROOT, planRel);

// ---- 계획 텍스트 적재 — 단일 파일 또는 파일 구획(다중 파일) ---------------
// planPath가 _MilestonePreview.md를 가리키면 같은 폴더의 NN_Phase_N.md를 번호순으로
// 병합해 단일 텍스트로 만들고, 아래 판정 4종은 그 병합 텍스트에 적용한다. 예외 하나 —
// 판정 ①의 사람용 개요 검사는 병합 텍스트가 아니라 Preview 원문(preview)만 본다.
// 단일 파일 planPath는 기존 경로 그대로다 (하위 호환). Phase 파일이 0개면 병합 결과에
// Phase 구획이 없으므로 기존 반려가 그대로 나간다 (fail-closed).
let text = null;
let planFiles = null; // 파일 구획일 때 병합된 파일 목록 — 판정 evidence에 실린다
let preview = null;   // 파일 구획일 때 Preview 원문 — 판정 ①의 사람용 개요 검사가 이것만 본다
if (path.basename(planAbs) === '_MilestonePreview.md') {
  try { preview = fs.readFileSync(planAbs, 'utf8'); } catch (e) { /* 아래에서 반려 */ }
  if (preview === null) deny('계획-문서-부재', `계획 문서를 읽을 수 없다: ${planRel} — 계획 없는 스폰은 반려 (fail-closed)`, { planPath: planRel });
  const dir = path.dirname(planAbs);
  const phaseNum = n => Number(n.match(/_Phase_(\d+)\.md$/)[1]);
  let phaseNames = [];
  try {
    phaseNames = fs.readdirSync(dir).filter(n => /^\d+_Phase_\d+\.md$/.test(n)).sort((a, b) => phaseNum(a) - phaseNum(b));
  } catch (e) { /* 목록 실패 = Phase 파일 0개 — 아래 규격 판정이 반려 */ }
  const parts = [preview];
  for (const n of phaseNames) {
    try { parts.push(fs.readFileSync(path.join(dir, n), 'utf8')); }
    catch (e) { deny('계획-문서-부재', `Phase 파일을 읽을 수 없다: ${n} — 결손 계획은 반려 (fail-closed)`, { planPath: planRel, file: n }); }
  }
  text = parts.join('\n');
  planFiles = [path.basename(planAbs), ...phaseNames];
} else {
  try { text = fs.readFileSync(planAbs, 'utf8'); } catch (e) { /* 아래에서 반려 */ }
  if (text === null) deny('계획-문서-부재', `계획 문서를 읽을 수 없다: ${planRel} — 계획 없는 스폰은 반려 (fail-closed)`, { planPath: planRel });
}

// ---- 절 분해 ------------------------------------------------------------
const lines = text.split(/\r?\n/);
const sections = []; // { header, body:[] }
let cur = null;
for (const line of lines) {
  if (/^##\s+/.test(line)) { cur = { header: line, body: [] }; sections.push(cur); }
  else if (cur) cur.body.push(line);
}
const phaseFullRe = /^##\s+Phase\s+(\d+)\s*[—-]\s*(.+?)\s*·\s*태그:\s*(.+?)\s*·\s*의존:\s*(.+?)\s*$/;
const phaseAnyRe = /^##\s+Phase\s+(\d+)/;
const phases = [];
let malformedPhase = null;
for (const s of sections) {
  const m = s.header.match(phaseFullRe);
  if (m) {
    const tags = [...m[3].matchAll(/`([^`]+)`/g)].map(x => x[1]);
    const deps = /없음/.test(m[4]) ? [] : (m[4].match(/\d+/g) || []).map(Number);
    phases.push({ num: Number(m[1]), name: m[2], tags, deps, body: s.body });
    if (tags.length === 0) malformedPhase = malformedPhase || `Phase ${m[1]} 태그 표기 부재`;
  } else if (phaseAnyRe.test(s.header)) {
    malformedPhase = malformedPhase || `${s.header.slice(0, 40)} — 태그·의존 표기 부재`;
  }
}

// ---- 판정 ① 계획 문서 검증 통과 — 기계 집행 범위 = 계획 템플릿 규격 실측 ----
// (00_Documents/02_Rules 템플릿: 필수 절 부재·태그 표기 부재 = 검증 불통과. 사람 검증은 M01에서 게이트 밖.)
const hasOverview = sections.some(s => /^##\s+(개요|목표)(\s|$)/.test(s.header)); // \b는 한글 뒤에서 불성립 — 사용 금지
if (!hasOverview) deny('검증-미통과', '필수 절 부재: 개요(목표) 절이 없다 — 템플릿 규격 불충족 (fail-closed)', { planPath: planRel });
// 파일 구획 전용 — Preview 원문에 「사람용 개요」 절이 있는가. Phase 파일의 동명 절이 결손을 못 가리게
// 병합 텍스트가 아니라 preview만 본다. 단일 파일(M01 하위 호환)은 검사하지 않는다 (preview === null).
// 근거: [USER] 2026-08-08 블랙박스 금지 — 계획의 사용자 판정 표면 필수. \b는 한글 뒤에서 불성립 — 사용 금지
const humanOverview = preview === null ? null : /^##\s+사람용 개요(\s|$)/m.test(preview);
if (humanOverview === false) deny('검증-미통과', '필수 절 부재: 사람용 개요 절이 없다 — 사용자 판정 표면 결손, 블랙박스 방지 (fail-closed)', { planPath: planRel });
if (phases.length === 0) deny('검증-미통과', 'Phase 구획이 없다 — 템플릿 규격 불충족 (fail-closed)', { planPath: planRel });
if (malformedPhase) deny('검증-미통과', `도메인 태그·의존성 표기 부재: ${malformedPhase} — 표기 없는 계획은 반려 (노션 02장 분업 2)`, { planPath: planRel });
// 「검증 기록」 절 헤더의 허용 형태 (M02 Phase 3 Step 4, Backlog 12번) — 제목 단독 줄만이다.
// 종전 접두사 판독(`/^검증 기록/`)은 「검증 기록은 아직 없음」 같은 산문 줄도 절 헤더로 인정해,
// 위장 헤더 한 줄이면 절 실존 검사가 우회되고 판정 ②의 집계 시작점도 엉뚱한 자리로 옮겨 갔다.
const RECORD_HEADER = /^검증 기록\s*$/;
const noRecord = phases.filter(p => !p.body.some(l => RECORD_HEADER.test(l)));
if (noRecord.length > 0) deny('검증-미통과', `검증 기록 절 부재: Phase ${noRecord.map(p => p.num).join(', ')} — 기록 줄 없는 검증은 무효 (fail-closed)`, { planPath: planRel });

// ---- 판정 ② 실패 카운터 — 「검증 기록」 절 내부에서, 마지막 USER-INPUT 줄 이후의 FAIL만 센다 ----
// 집계 범위는 Phase 본문 전체가 아니라 검증 기록 절만이다 — 02장 검증 4 원문("검증 결과는
// 기록 줄로만 유효")의 집행 사본 정합. DoD·Steps의 FAIL 서술은 세지 않는다 (결정 대장 [USER] 2026-08-01).
const failCounts = {};
for (const p of phases) {
  let count = 0, inRecord = false;
  for (const l of p.body) {
    if (RECORD_HEADER.test(l)) { inRecord = true; continue; } // 절 헤더 계약은 위와 같다 (제목 단독 줄)
    if (!inRecord) continue;
    if (/^-\s*USER-INPUT\b/.test(l)) count = 0; // 기준점 이동 — 이력은 지우지 않는다
    else if (/^-\s*FAIL\b/.test(l)) count++;
  }
  failCounts[`Phase ${p.num}`] = count;
  if (count >= FAIL_LIMIT) {
    deny('실패-카운터', `Phase ${p.num} FAIL ${count}회(마지막 USER-INPUT 이후) ≥ ${FAIL_LIMIT} — 스폰 거부, 에스컬레이션으로 분기하라`, { planPath: planRel, failCounts });
  }
}

// ---- 판정 ③ 결정 대장 — 출처 태그 계산 (대장 부재 = 반려) ----
const ledgerSec = sections.find(s => /^##\s+결정 대장/.test(s.header));
if (!ledgerSec) deny('대장-부재', '결정 대장 절이 없다 — 대장 부재 = 계획 반려 (노션 02장 순서 4, fail-closed)', { planPath: planRel });
const tally = { USER: 0, 'USER·위임': 0, AI: 0, 'AI·비가역': 0 };
const aiLines = [];
for (const l of ledgerSec.body) {
  const m = l.match(/^-\s*\[(USER·위임|USER|AI·비가역|AI)\]/);
  if (!m) continue;
  tally[m[1]]++;
  if (m[1] === 'AI' || m[1] === 'AI·비가역') aiLines.push(l.slice(0, 80));
}
const userSide = tally.USER + tally['USER·위임']; // 위임 자체가 사용자의 결정 — USER 쪽으로 센다
if (tally['AI·비가역'] >= 1) {
  deny('주도권-즉시발동', `[AI·비가역] ${tally['AI·비가역']}건 — 개수 무관 즉시 발동. 비가역은 위임으로 못 덮는다. 선택지형 문답으로 분기하라`, { planPath: planRel, tally, aiLines });
}
if (tally.AI > userSide) {
  deny('주도권-문답분기', `[AI] ${tally.AI} > [USER] ${userSide} — 주도권 게이트 발동. 선택지형 문답으로 분기해 [AI] 줄의 답을 받고, 태그를 [USER]로 전환(기준점 이동 문법)한 뒤 재시도하라`, { planPath: planRel, tally, aiLines });
}

// ---- 판정 ④ 라우팅 표 적용 — 계획 문서의 구조 신호를 세는 기계 연산 ----
if (phases.length > PHASE_LIMIT) {
  deny('라우팅-분할', `Phase 수 ${phases.length} > 스킴 상한 ${PHASE_LIMIT} — 계획이 넘침: Milestone 분할, 재계획으로 회귀하라`, { planPath: planRel, phaseCount: phases.length });
}
const tagKinds = [...new Set(phases.flatMap(p => p.tags))];
const anc = {}; // 의존 그래프의 조상 집합 (추이 폐쇄)
for (const p of [...phases].sort((a, b) => a.num - b.num)) {
  anc[p.num] = new Set(p.deps);
  for (const d of p.deps) for (const g of (anc[d] || [])) anc[p.num].add(g);
}
let independentPair = null;
for (const a of phases) for (const b of phases) {
  if (a.num < b.num && !anc[b.num].has(a.num) && !(anc[a.num] || new Set()).has(b.num)) {
    independentPair = independentPair || `Phase ${a.num} ∥ Phase ${b.num}`;
  }
}
const cross = tagKinds.length >= 2 || independentPair !== null;
const routing = {
  tagKinds, phaseCount: phases.length, independentPair,
  route: cross ? '크로스 도메인 Worker 병렬' : '도메인 Worker 단독',
  review: cross ? '리뷰어 1차 + codex 교차 모델 2차' : '리뷰어 1차',
};

// 통과 — 무출력으로 일반 권한 흐름을 유지하고, 판정 근거는 로그로만 남긴다
log({ ...base, verdict: 'allow', rule: '통과', reason: planFiles ? '판정 4종 통과(사람용 개요 검사 포함) — 스폰 자격 확인' : '판정 4종 통과 — 스폰 자격 확인', evidence: { planPath: planRel, ...(planFiles ? { planFiles, humanOverview } : {}), failCounts, tally, routing } });
process.exit(0);
