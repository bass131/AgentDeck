#!/usr/bin/env node
// 자동 장전 훅 (PostToolUse: Edit|MultiEdit|Write) — M02 Phase 3 「게이트 자동 장전」 실물.
// 계획 구획 파일의 「검증 기록」 절에 PASS 줄이 추기되면 마감 요약 게이트(stop-gate)를
// 사람 arm 0회로 자동 장전한다 (노션 02장 순서 5의 무인화).
// 감지 범위는 「검증 기록」 절 내부만이다 — 실패 카운터의 범위 한정(결정 대장 [USER]
// 2026-08-01, "검증 결과는 기록 줄로만 유효")과 동일 경계다.
// 오장전 방어: FAIL·USER-INPUT 추기, 일반 문서 수정, DoD·본문의 PASS 서술에는 장전하지
// 않는다. 판정 불능(대상 판독 실패, 사전 텍스트 재구성 불능 + 기준선 부재)은 무장전이다 (fail-safe).
// 수기 arm·release CLI는 50_stop-gate.cjs에 보존된다 — 도그푸딩·수기 모드 하위 호환.
// M04 Phase 1: 상태 파일이 세션 스코핑 v2({schema:2, global, sessions})다 — 기준선은 자기
//   스코프(session_id, 무식별이면 global)에서만 읽고 쓰며, 장전도 자기 스코프에만 쓴다 (다른 스코프 보존).
// AgentDeck 이식 (M01 Phase 4): 리셋 게이트(31_reset-gate)는 코어 일곱 종에 없다 — 리셋 상태
//   장전 경로를 통째로 소거했다. 장전 대상은 마감 요약 게이트 하나다.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const CONFIG_FILE = path.join(GATE_DIR, 'gate-config.json');
const STATE_FILE = path.join(GATE_DIR, 'pass-watcher.state.json');   // 기준선 — 파일별 직전 pass 수 (Write 폴백의 사전값)
const CLOSE_STATE = path.join(GATE_DIR, 'stop-gate.state.json');     // 장전 대상 — 엔트리 스키마는 50_stop-gate.cjs 소유
const SESSION_CAP = 8; // 세션 스코프 보존 상한 — 넘으면 at 오래된 것부터 제거 (M04 Phase 1)

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'pass-watcher', ...entry }) + '\n');
}

// ---- 상태 v2 정규화·저장 (M04 Phase 1 공통 스키마) — legacyKeys: v1 판별 키 (해당 파일 소유 훅의 구형 키) ----
function normalizeV2(raw, legacyKeys) {
  if (raw && typeof raw === 'object') {
    if (raw.schema === 2) return { schema: 2, global: raw.global || null, sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {} };
    if (!('schema' in raw) && legacyKeys.some(k => k in raw)) return { schema: 2, global: raw, sessions: {} }; // v1 이행 — 전체를 global로 읽는다
  }
  return { schema: 2, global: null, sessions: {} };
}
function loadV2(file, legacyKeys) {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* 부재·파손 = 빈 v2 */ }
  return normalizeV2(raw, legacyKeys);
}
function capSessions(sessions) {
  const keys = Object.keys(sessions);
  if (keys.length <= SESSION_CAP) return;
  keys.sort((a, b) => ((sessions[a] && sessions[a].at) || 0) - ((sessions[b] && sessions[b].at) || 0));
  for (let i = 0; keys.length - i > SESSION_CAP; i++) delete sessions[keys[i]];
}
// 자기 스코프에 엔트리를 쓴다 — 다른 스코프는 보존, 세션 스코프는 CAP 정리
function putScoped(st, sid, entry) {
  if (sid) { st.sessions[sid] = entry; capSessions(st.sessions); }
  else st.global = entry;
}
// 자기 스코프 저장 — 배타 잠금 아래에서 디스크를 다시 읽고 그 값에 자기 엔트리만 얹는다
// (M02 Phase 3 Step 9). 종전에는 잠금 없이 호출부의 낡은 사본을 통째로 덮어써서, 두 세션이 겹치면
// 나중 쓰기가 앞선 세션 엔트리를 지웠다 (마지막-쓰기-승). 잠금 구간은 _lib/state-store.cjs가 소유한다.
function saveScoped(file, legacyKeys, sid, entry) {
  const { updateState } = require('./_lib/state-store.cjs');
  const res = updateState(file, (raw) => {
    const fresh = normalizeV2(raw, legacyKeys);
    putScoped(fresh, sid, entry);
    return fresh;
  }, { session: sid, hook: 'pass-watcher' });
  if (!res.ok) log({ event: 'PostToolUse', session: sid, verdict: '오류', rule: '상태-저장-실패', reason: `${path.basename(file)} 저장 실패 — ${res.error}` });
  return res;
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음 = 아래 무대상 처리 */ }
const ti = input.tool_input || {};
const target = ti.file_path || null;
if (!target) process.exit(0); // 대상 경로 없음 — 판정할 것이 없다, 무로그
const SID = input.session_id || null; // 스코프 키 — 무식별 입력은 global (기존 경로 하위 호환)

// ---- 역할 판독 — role-gate와 동일 기제 (Phase 2 실측으로 확정) ----
// SubAgent(Worker)의 도구 호출에만 훅 입력에 agent_id·agent_type이 실린다.
// env:MOODIE_SESSION_ROLE=worker는 드라이버가 별도 프로세스 Worker를 띄울 때의 예약 신호다 (Phase 4).
let role = 'main', roleSignal = '신호-부재=메인';
if (process.env.MOODIE_SESSION_ROLE === 'worker') {
  role = 'worker'; roleSignal = 'env:MOODIE_SESSION_ROLE=worker';
} else if (input.agent_id || input.agent_type) {
  role = 'worker';
  roleSignal = `input:agent_id=${String(input.agent_id || '?').slice(0, 40)} · agent_type=${String(input.agent_type || '?').slice(0, 40)}`;
}

// ---- 계획 구획 멤버십 — plan-gate의 planPath 병합 규칙과 동일 (정합) ----
// planPath가 _MilestonePreview.md면 멤버 = 그 파일 + 같은 폴더의 NN_Phase_N.md 전부.
// 단일 파일 planPath면 멤버 = 그 파일 하나 (하위 호환).
let planRel = '01_Milestones/M01_Bootstrap/_MilestonePreview.md';
let pinRel = null;
try {
  const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (c.planPath) planRel = c.planPath;
  if (c.workPinPath) pinRel = c.workPinPath;
} catch (e) { /* 포인터 부재 시 기본값 — plan-gate와 동일 */ }
const planAbs = path.isAbsolute(planRel) ? planRel : path.join(ROOT, planRel);
let members = [planAbs];
if (path.basename(planAbs) === '_MilestonePreview.md') {
  const dir = path.dirname(planAbs);
  try {
    members = members.concat(fs.readdirSync(dir).filter(n => /^\d+_Phase_\d+\.md$/.test(n)).map(n => path.join(dir, n)));
  } catch (e) { /* 목록 실패 = Phase 파일 0개 취급 */ }
}
const targetAbs = path.resolve(String(target));

// ---- pin 갱신 증인 (M02 Phase 3 Step 5, Backlog 6번) ------------------------
// 공용 work-pin을 「누가 언제」 갱신했는지 남긴다. 50_stop-gate가 이 증인으로 마감 요약의 세션 귀속을
// 판정한다 — 코디네이터의 pin 갱신이 실행 중 워커의 장전을 대신 풀어 주던 간섭을 막는 유일한 신호다.
// 편집 도구를 지나지 않은 갱신(픽스처의 fs 직접 기록 등)은 증인이 없고, 그 경우 stop-gate는 종전
// 스탬프 판정을 그대로 쓴다 — 귀속 불능을 차단으로 승격하지 않는다 (하위 호환).
if (pinRel) {
  const pinAbs = path.isAbsolute(pinRel) ? pinRel : path.join(ROOT, pinRel);
  if (path.resolve(pinAbs).toLowerCase() === targetAbs.toLowerCase()) {
    const prev = loadV2(STATE_FILE, ['files']);
    const own = (SID ? prev.sessions[SID] : prev.global) || {};
    own.files = own.files && typeof own.files === 'object' ? own.files : {};
    own.pinWriteAt = Date.now();
    own.pinWriteTs = ts();
    own.at = own.pinWriteAt;
    saveScoped(STATE_FILE, ['files'], SID, own);
    log({ event: 'PostToolUse', session: SID, tool: input.tool_name || null, target, role, roleSignal, scope: SID ? 'session' : 'global',
      verdict: '증인', rule: 'pin-갱신-기록', reason: `work-pin(${pinRel}) 갱신을 이 세션에 귀속시켰다 — stop-gate의 세션 스코프 판정 근거`, evidence: { pin: pinRel } });
    process.exit(0);
  }
}

if (!members.some(m => path.resolve(m).toLowerCase() === targetAbs.toLowerCase())) {
  process.exit(0); // 비계획 파일 — 관할 밖. 매 Edit·Write마다 발화하는 훅이라 무로그로 소음을 막는다
}

const relKey = path.relative(ROOT, targetAbs).split(path.sep).join('/').toLowerCase(); // 기준선 키 — repo 상대 소문자 슬래시
const base = { event: 'PostToolUse', session: SID, tool: input.tool_name || null, target, role, roleSignal, scope: SID ? 'session' : 'global' };

// ---- 절 판독 — 「검증 기록」 절 내부의 PASS·FAIL 줄만 센다 (plan-gate 판정 ②와 동일 정규식 계열 — 정합) ----
function countRecord(text) {
  let pass = 0, fail = 0, inRecord = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^##\s+/.test(l)) { inRecord = false; continue; }    // ## 절 헤더 = 절 밖 (「## 검증 기록 운용」 포함)
    if (/^검증 기록/.test(l)) { inRecord = true; continue; } // 평문 「검증 기록」 줄 = 절 안
    if (!inRecord) continue;
    if (/^-\s*PASS\b/.test(l)) pass++;
    else if (/^-\s*FAIL\b/.test(l)) fail++;
    // USER-INPUT 줄은 두 정규식 모두 불일치 — 집계 무관 (기준점 이동은 스폰 게이트의 몫)
  }
  return { pass, fail };
}

// ---- 사후 텍스트 = 디스크 실측 ----
let curText = null;
try { curText = fs.readFileSync(targetAbs, 'utf8'); } catch (e) { /* 아래 무장전 */ }
if (curText === null) {
  log({ ...base, verdict: '무장전', rule: '판독-불능', reason: '대상 파일을 읽을 수 없다 — 판정 불능은 무장전 (fail-safe)', evidence: { plan: planRel, file: relKey } });
  process.exit(0);
}
const curr = countRecord(curText);

// ---- 사전 텍스트 재구성 — Edit·MultiEdit는 역적용, Write는 기준선 폴백 ----
let prevText = null, method = '기준선';
if (base.tool === 'Edit' && typeof ti.old_string === 'string' && typeof ti.new_string === 'string'
    && ti.new_string !== '' && curText.includes(ti.new_string)) {
  prevText = ti.replace_all
    ? curText.split(ti.new_string).join(ti.old_string)
    : curText.replace(ti.new_string, () => ti.old_string); // 함수 치환 — old_string의 $ 패턴 오해석 방지
  method = 'edit-재구성';
} else if (base.tool === 'MultiEdit' && Array.isArray(ti.edits) && ti.edits.length > 0) {
  let t = curText, ok = true;
  for (const e of [...ti.edits].reverse()) { // 마지막 edit부터 역순 역적용
    if (!e || typeof e.old_string !== 'string' || typeof e.new_string !== 'string'
        || e.new_string === '' || !t.includes(e.new_string)) { ok = false; break; }
    t = e.replace_all ? t.split(e.new_string).join(e.old_string) : t.replace(e.new_string, () => e.old_string);
  }
  if (ok) { prevText = t; method = 'multiedit-재구성'; }
}

// ---- 기준선 적재 + 갱신 — 자기 스코프에서만 읽고 쓴다 (M04 Phase 1). 매 판정 후 현재 pass 수를 항상 저장 ----
const pwState = loadV2(STATE_FILE, ['files']);
const ownPrev = SID ? pwState.sessions[SID] : pwState.global;
const baselinePass = ownPrev && ownPrev.files && typeof ownPrev.files === 'object' ? ownPrev.files[relKey] : undefined;
const ownNext = { files: ownPrev && ownPrev.files && typeof ownPrev.files === 'object' ? ownPrev.files : {}, at: Date.now() };
ownNext.files[relKey] = curr.pass;
if (ownPrev && typeof ownPrev.pinWriteAt === 'number') { ownNext.pinWriteAt = ownPrev.pinWriteAt; ownNext.pinWriteTs = ownPrev.pinWriteTs; } // pin 갱신 증인 보존
saveScoped(STATE_FILE, ['files'], SID, ownNext);

let prevPass = null, prevFail = null; // null = 미상(?)
if (prevText !== null) {
  const p = countRecord(prevText);
  prevPass = p.pass; prevFail = p.fail;
} else if (typeof baselinePass === 'number') {
  prevPass = baselinePass; // 기준선은 pass 수만 보유 — fail 사전값은 미상
}

const evidence = {
  plan: planRel, file: relKey,
  pass: `${prevPass === null ? '?' : prevPass}→${curr.pass}`,
  fail: `${prevFail === null ? '?' : prevFail}→${curr.fail}`,
  method,
};

// 장전 실행 — 마감 요약 게이트 상태 파일을 읽고-정규화(v2)-자기 스코프 수정-원자 저장한다 (다른 스코프
// 보존). 엔트리는 게이트의 기존 스키마 + at이며, armedBy로 장전 주체(자동/수기)를 구분한다.
function arm(rule, note, reason) {
  const now = ts(), atNow = Date.now();
  saveScoped(CLOSE_STATE, ['armed'], SID, { armed: true, since: now, note, blocks: 0, armedBy: 'auto', at: atNow });
  log({ ...base, verdict: '장전', armedBy: 'auto', rule, reason, evidence });
  process.exit(0);
}

if (prevPass === null) {
  // 세션 첫 Write (M02 Phase 3 Step 3, Backlog 12번) — Write는 사전 텍스트를 재구성할 수 없고 그 세션의
  // 기준선도 아직 없다. 종전에는 여기서 무장전으로 빠져 마감 요약 강제를 통째로 놓쳤다 (fail-open).
  // 두 오판의 값이 다르다: 과장전은 마감 요약을 한 번 더 쓰게 할 뿐이고, 무장전은 마감을 무검증으로
  // 통과시킨다. 그래서 PASS 줄이 실존하면 장전으로 기울이고, PASS 0건이면 종전대로 무장전이다.
  if (curr.pass > 0) {
    arm('기준선-부재-보수적-장전', `자동 장전 — ${relKey} 검증 기록 PASS ${curr.pass}건 실존 (기준선 부재, 사전값 미상)`,
      `사전 텍스트 재구성 불능 + 기준선 부재인데 검증 기록에 PASS ${curr.pass}건이 있다 — 무장전(fail-open) 대신 장전으로 기운다. 이번 pass 수를 기준선으로 저장했다`);
  }
  log({ ...base, verdict: '무장전', rule: '기준선-부재', reason: '사전 텍스트 재구성 불능 + 기준선 부재 + PASS 0건 — 장전 근거 없음 (오장전 방어). 이번 pass 수를 기준선으로 저장했다', evidence });
  process.exit(0);
}

if (curr.pass > prevPass) {
  arm('PASS-추기-감지', `자동 장전 — ${relKey} 검증 기록 PASS 추기 (${prevPass}→${curr.pass})`,
    `검증 기록 PASS ${prevPass}→${curr.pass} — 마감 게이트 자동 장전 (사람 arm 0회)`);
}

if (prevFail !== null && curr.fail > prevFail) {
  log({ ...base, verdict: '무장전', rule: 'FAIL-추기', reason: `검증 기록 FAIL ${prevFail}→${curr.fail} · PASS ${prevPass}→${curr.pass} — FAIL 추기에는 장전하지 않는다 (오장전 방어)`, evidence });
  process.exit(0);
}
log({ ...base, verdict: '무장전', rule: 'PASS-증가-없음', reason: `검증 기록 PASS ${prevPass}→${curr.pass} · FAIL ${prevFail === null ? '?' : prevFail}→${curr.fail} 증가 없음 — 일반 수정·본문 PASS 서술에는 장전하지 않는다 (오장전 방어)`, evidence });
process.exit(0);
