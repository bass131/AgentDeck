#!/usr/bin/env node
// 세션 마감 요약 게이트 (Stop) — 장전(arm) 후에는 work-pin 「마감 요약」 3줄(바뀐 것/내린 결정/봐야 할 것)이
// 장전 시각보다 새 스탬프로 실측될 때만 정지를 허용한다. 미실측이면 decision:block으로 작성을 강제한다.
// 연속 차단 3회 초과 시 에스컬레이션(자동 해제 + 사람 개입 요구) — 값 3은 노션 02장 검증 4의 집행 사본.
// 재부착은 SessionStart(10_start-brief.cjs)가 다음 세션에서 work-pin 전문 주입으로 수행한다.
// CLI 모드: node 50_stop-gate.cjs arm|release [사유] — 마감 의사의 장전·해제는 사람(게이트 역할)이 실행한다.
// M04 Phase 1: 상태 파일이 세션 스코핑 v2({schema:2, global, sessions})다 — 자기 세션 스코프의 장전을
//   먼저 소비하고, 없으면 global(수기 CLI·무식별 입력)을 소비한다. allow·block·에스컬레이션은 소비 대상
//   스코프의 엔트리에만 기록한다 — 다른 세션의 장전은 건드리지 않는다. release는 전 스코프 해제다.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const STATE_FILE = path.join(GATE_DIR, 'stop-gate.state.json');
const CONFIG_FILE = path.join(GATE_DIR, 'gate-config.json');
const MAX_BLOCKS = 3;
const SESSION_CAP = 8; // 세션 스코프 보존 상한 — 넘으면 at 오래된 것부터 제거 (M04 Phase 1)

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'stop-gate', ...entry }) + '\n');
}

// ---- 상태 v2 정규화·저장 (M04 Phase 1 공통 스키마) ----
function normalizeV2(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.schema === 2) return { schema: 2, global: raw.global || null, sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {} };
    if (!('schema' in raw) && 'armed' in raw) return { schema: 2, global: raw, sessions: {} }; // v1 이행 — 전체를 global로 읽는다
  }
  return { schema: 2, global: null, sessions: {} };
}
function loadState() {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { /* 부재·파손 = 미장전 */ }
  return normalizeV2(raw);
}
function capSessions(sessions) {
  const keys = Object.keys(sessions);
  if (keys.length <= SESSION_CAP) return;
  keys.sort((a, b) => ((sessions[a] && sessions[a].at) || 0) - ((sessions[b] && sessions[b].at) || 0));
  for (let i = 0; keys.length - i > SESSION_CAP; i++) delete sessions[keys[i]];
}
function saveState(st) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2) + '\n');
  fs.renameSync(tmp, STATE_FILE); // 원자 교체 — 부분 기록 파일이 관측되지 않게
}

// ---- CLI 모드: 장전(arm) / 해제(release) — global 스코프 ----
const action = process.argv[2];
if (action === 'arm' || action === 'release') {
  const note = process.argv.slice(3).join(' ') || '';
  const st = loadState();
  st.global = { armed: action === 'arm', since: ts(), note, blocks: 0 };
  const entry = { event: 'cli', action, armed: st.global.armed, scope: 'global', note };
  if (action === 'release') { // 전 스코프 해제 — 게이트를 여는 조작자 의도의 이행
    entry.clearedSessions = Object.keys(st.sessions).length;
    st.sessions = {};
  }
  saveState(st);
  log(entry);
  console.log(`stop-gate ${action}: armed=${st.global.armed}`);
  process.exit(0);
}

// ---- 훅 모드 (Stop) ----
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음도 판정은 진행 */ }
const SID = input.session_id || null;
const st = loadState();
const scoped = SID && st.sessions[SID] ? st.sessions[SID] : null;
// 소비 대상 스코프 결정 — 자기 세션 장전 우선, 없으면 global 장전, 둘 다 아니면 무로그 통과
let entry = null, scope = null;
if (scoped && scoped.armed) { entry = scoped; scope = 'session'; }
else if (st.global && st.global.armed) { entry = st.global; scope = 'global'; }
if (!entry) process.exit(0); // 미장전 — 매 턴 발화하는 훅이라 무로그 통과

// 소비 대상 스코프에만 기록 — 다른 세션의 장전은 건드리지 않는다 (M04 Phase 1)
function putEntry(e) {
  if (scope === 'session') { st.sessions[SID] = { ...e, at: Date.now() }; capSessions(st.sessions); }
  else st.global = e;
  saveState(st);
}

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* 포인터 부재 = 미실측 */ }
const pinPath = cfg.workPinPath ? path.resolve(ROOT, cfg.workPinPath) : null;
let pinText = null;
try { pinText = pinPath ? fs.readFileSync(pinPath, 'utf8') : null; } catch (e) { /* 부재 = 미실측 */ }

// 마감 요약 절의 스탬프 실측 — 장전 시각 이후로 갱신됐는가
const m = pinText ? pinText.match(/^## 마감 요약[\s\S]*?스탬프:\s*(\S+)/m) : null;
const stampMs = m ? Date.parse(m[1]) : NaN;
const armedMs = Date.parse(entry.since);
const fresh = Number.isFinite(stampMs) && Number.isFinite(armedMs) && stampMs >= armedMs;
const base = { event: 'Stop', session: SID, pin: cfg.workPinPath || null, armedSince: entry.since, stamp: m ? m[1] : null, scope };

if (fresh) {
  putEntry({ armed: false, since: ts(), note: `자동 해제 — 마감 요약 실측 (장전: ${entry.since})`, blocks: 0 });
  log({ ...base, verdict: 'allow', rule: '마감-요약-실측', reason: `마감 요약 스탬프 ${m[1]} ≥ 장전 ${entry.since} — 정지 허용 + 자동 해제. 재부착은 다음 SessionStart가 수행.` });
  process.exit(0);
}

if ((entry.blocks || 0) >= MAX_BLOCKS) {
  putEntry({ armed: false, since: ts(), note: `에스컬레이션 해제 — 연속 차단 ${entry.blocks}회 (장전: ${entry.since})`, blocks: entry.blocks });
  log({ ...base, verdict: '에스컬레이션', rule: '연속-차단-상한', reason: `연속 차단 ${entry.blocks}회 > 허용 한도 — 자동 해제하고 사람 개입으로 분기 (값 ${MAX_BLOCKS}은 02장 검증 4 집행 사본).` });
  process.exit(0);
}

putEntry({ ...entry, blocks: (entry.blocks || 0) + 1 });
log({ ...base, verdict: 'block', rule: '마감-요약-미실측', reason: `마감 요약 스탬프(${m ? m[1] : '부재'})가 장전(${entry.since}) 이후가 아님 — 3줄 작성 지시 (${(entry.blocks || 0) + 1}/${MAX_BLOCKS})` });
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: `[마감 요약 게이트] 세션 마감이 장전됐다 (${entry.since}${entry.note ? ' · ' + entry.note : ''}). work-pin(${cfg.workPinPath || '(포인터 부재)'})의 「마감 요약」 절에 3줄(바뀐 것 / 내린 결정 / 봐야 할 것)을 이번 세션 내용으로 갱신하고 스탬프를 현재 시각으로 찍어라. 갱신 후 정지하면 통과된다.`,
}));
process.exit(0);
