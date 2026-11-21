#!/usr/bin/env node
// 자동 장전 훅 (PostToolUse: Edit|MultiEdit|Write) — 계획 구획 파일의 「검증 기록」 절에 PASS 줄이 추기되면 마감 요약 게이트를 사람 없이 장전한다.
// 감지 범위는 실패 카운터와 같은 「검증 기록」 절 안이다. FAIL·USER-INPUT 추기, 일반 문서 수정, 본문의 PASS 서술에는 장전하지 않는다.
// 기준선과 장전은 자기 스코프(session_id, 무식별이면 global)에만 쓴다. 수기 arm·release CLI는 50_stop-gate.cjs에 있다.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const CONFIG_FILE = path.join(GATE_DIR, 'gate-config.json');
const STATE_FILE = path.join(GATE_DIR, 'pass-watcher.state.json');   // 기준선 — 파일별 직전 pass 수 (Write 폴백의 사전값)
const CLOSE_STATE = path.join(GATE_DIR, 'stop-gate.state.json');     // 장전 대상 — 엔트리 스키마는 50_stop-gate.cjs 소유
const SESSION_CAP = 8; // 넘으면 at 오래된 스코프부터 지운다

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'pass-watcher', ...entry }) + '\n');
}

// legacyKeys는 그 파일을 소유한 훅의 v1 판별 키다
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
function putScoped(st, sid, entry) {
  if (sid) { st.sessions[sid] = entry; capSessions(st.sessions); }
  else st.global = entry;
}
// 잠금 아래에서 디스크를 다시 읽은 값에 자기 엔트리만 얹는다 — 낡은 사본을 덮어쓰면 겹친 세션의 엔트리가 지워진다.
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
const SID = input.session_id || null;

// 역할은 로그 필드 전용이다 — 하위 에이전트의 도구 호출에만 agent_id가 실리고, 판정에는 쓰지 않는다.
let role = 'main', roleSignal = '신호-부재=메인';
if (input.agent_id) {
  role = 'worker';
  roleSignal = `input:agent_id=${String(input.agent_id || '?').slice(0, 40)} · agent_type=${String(input.agent_type || '?').slice(0, 40)}`;
}

// 계획 구획 멤버는 plan-gate의 planPath 병합 규칙과 같다. 포인터가 없으면 감시할 계획이 없다 — 기본값은 두지 않는다 (fail-closed).
// pin 증인은 workPinPath만 있으면 남긴다.
let planRel = null;
let pinRel = null;
try {
  const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8').trim());
  if (typeof c.planPath === 'string' && c.planPath.trim()) planRel = c.planPath;
  if (c.workPinPath) pinRel = c.workPinPath;
} catch (e) { /* 포인터 부재·파손 — 계획 감시 없음 */ }
const planAbs = planRel === null ? null : (path.isAbsolute(planRel) ? planRel : path.join(ROOT, planRel));
let members = planAbs === null ? [] : [planAbs];
if (planAbs !== null && path.basename(planAbs) === '_MilestonePreview.md') {
  const dir = path.dirname(planAbs);
  try {
    members = members.concat(fs.readdirSync(dir).filter(n => /^\d+_Phase_\d+\.md$/.test(n)).map(n => path.join(dir, n)));
  } catch (e) { /* 목록 실패 = Phase 파일 0개 취급 */ }
}
const targetAbs = path.resolve(String(target));

// pin 갱신 증인 — 50_stop-gate가 이것으로 마감 요약의 세션 귀속을 판정한다. 코디네이터의 pin 갱신이 워커의 장전을 대신 풀지 못하게 하는 유일한 신호다.
// 편집 도구를 지나지 않은 갱신은 증인이 없고, 그때 stop-gate는 스탬프 판정을 그대로 쓴다 — 귀속 불능을 차단으로 올리지 않는다.
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

// plan-gate 판정 ②와 같은 판독이다. 절 헤더는 제목 단독 줄만 인정한다 — 접두사 판독은 산문 줄을 헤더로 읽어 그 아래 PASS 서술로 장전됐다.
const RECORD_HEADER = /^검증 기록\s*$/;
function countRecord(text) {
  let pass = 0, fail = 0, inRecord = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^##\s+/.test(l)) { inRecord = false; continue; }    // 「## 검증 기록 운용」 같은 ## 절 헤더도 절 밖이다
    if (RECORD_HEADER.test(l)) { inRecord = true; continue; }
    if (!inRecord) continue;
    if (/^-\s*PASS\b/.test(l)) pass++;
    else if (/^-\s*FAIL\b/.test(l)) fail++;
  }
  return { pass, fail };
}

let curText = null;
try { curText = fs.readFileSync(targetAbs, 'utf8'); } catch (e) { /* 아래 무장전 */ }
if (curText === null) {
  log({ ...base, verdict: '무장전', rule: '판독-불능', reason: '대상 파일을 읽을 수 없다 — 판정 불능은 무장전 (fail-safe)', evidence: { plan: planRel, file: relKey } });
  process.exit(0);
}
const curr = countRecord(curText);

// 사전 텍스트 — Edit·MultiEdit는 역적용으로 재구성하고, Write는 기준선으로 폴백한다
let prevText = null, method = '기준선';
if (base.tool === 'Edit' && typeof ti.old_string === 'string' && typeof ti.new_string === 'string'
    && ti.new_string !== '' && curText.includes(ti.new_string)) {
  prevText = ti.replace_all
    ? curText.split(ti.new_string).join(ti.old_string)
    : curText.replace(ti.new_string, () => ti.old_string); // 함수 치환 — old_string의 $ 패턴 오해석 방지
  method = 'edit-재구성';
} else if (base.tool === 'MultiEdit' && Array.isArray(ti.edits) && ti.edits.length > 0) {
  let t = curText, ok = true;
  for (const e of [...ti.edits].reverse()) {
    if (!e || typeof e.old_string !== 'string' || typeof e.new_string !== 'string'
        || e.new_string === '' || !t.includes(e.new_string)) { ok = false; break; }
    t = e.replace_all ? t.split(e.new_string).join(e.old_string) : t.replace(e.new_string, () => e.old_string);
  }
  if (ok) { prevText = t; method = 'multiedit-재구성'; }
}

// 기준선은 매 판정 뒤 현재 pass 수로 늘 저장한다
const pwState = loadV2(STATE_FILE, ['files']);
const ownPrev = SID ? pwState.sessions[SID] : pwState.global;
const baselinePass = ownPrev && ownPrev.files && typeof ownPrev.files === 'object' ? ownPrev.files[relKey] : undefined;
const ownNext = { files: ownPrev && ownPrev.files && typeof ownPrev.files === 'object' ? ownPrev.files : {}, at: Date.now() };
ownNext.files[relKey] = curr.pass;
if (ownPrev && typeof ownPrev.pinWriteAt === 'number') { ownNext.pinWriteAt = ownPrev.pinWriteAt; ownNext.pinWriteTs = ownPrev.pinWriteTs; } // pin 갱신 증인 보존
saveScoped(STATE_FILE, ['files'], SID, ownNext);

let prevPass = null, prevFail = null; // null = 미상
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

// 엔트리는 게이트 스키마 + at이며, armedBy로 장전 주체(자동/수기)를 가른다.
function arm(rule, note, reason) {
  const now = ts(), atNow = Date.now();
  saveScoped(CLOSE_STATE, ['armed'], SID, { armed: true, since: now, note, blocks: 0, armedBy: 'auto', at: atNow });
  log({ ...base, verdict: '장전', armedBy: 'auto', rule, reason, evidence });
  process.exit(0);
}

if (prevPass === null) {
  // 세션 첫 Write는 사전 텍스트도 기준선도 없다. 과장전은 마감 요약을 한 번 더 쓰게 할 뿐이고 무장전은 마감을 무검증으로 통과시키므로,
  // PASS 줄이 있으면 장전으로 기운다.
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
