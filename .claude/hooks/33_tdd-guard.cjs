#!/usr/bin/env node
// TDD 가드 — 한 파일이 세 임무를 이벤트로 나눈다.
//   ① 검증형 (PreToolUse 편집): source 태그 Phase의 검증 기록에 PASS를 더하려면 vitest 전체 Green 증거가 먼저 있어야 한다.
//      사후 감지는 이미 적힌 PASS를 되돌려야 하지만 사전 차단은 무효 기록 자체를 만들지 않아 PreToolUse에 둔다.
//   ② 휴리스틱 (PreToolUse 차단 + PostToolUse 카운터): 시험 손질 없는 소스 편집이 연속 3회째에 이르려 하면 그 편집을 deny한다.
//      시험 파일 편집이나 시험 실행의 초록만 카운터를 푼다.
//   ③ Green 채집 (PostToolUse Bash): vitest 전체 실행의 초록은 증거를 남기고 카운터를 푼다. 좁힌 실행과 현황판 `node --test`는 카운터만 푼다.
//      판정 불능이면 무기록이다 — 증거 없음 방향이 안전하다 (fail-closed).
// 상태는 세션 스코프(session_id, 무식별이면 global)에 두고, streak는 하위 에이전트마다 agents[agent_id]에 따로 센다.
// Green 실효 판정의 「마지막 소스 편집」은 전 스코프 최신과 비교한다. 훅 크래시는 로그 시도 후 exit 0.
'use strict';
const fs = require('fs');
const path = require('path');
const { repoRel, toAbs } = require('./_lib/repo-path.cjs');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const STATE_FILE = path.join(GATE_DIR, 'tdd-guard.state.json');
const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write'];
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']; // CSS는 시험이 이끄는 편집이 아니라 세지 않는다
const TEST_PREFIX = '02_project/01_testcode/'; // 저장소 상대 — vitest include와 동일
const WORKTREE_PREFIX = /^\.claude\/worktrees\/[^/]+\//; // 작업 폴더 아래 경로는 그 안의 저장소 상대 경로로 판독한다
const STREAK_LIMIT = 3;
const SESSION_CAP = 8;                    // 넘으면 at 오래된 스코프부터 지운다
const AGENT_CAP = 8;
const PERSISTED_CAP = 64 * 1024 * 1024;   // 저장 파일 출력을 읽는 상한
const RESUME_HINT = '재개 경로: 이 변경을 덮는 시험을 먼저 손대거나(02_Project/01_TestCode/, .claude/hooks/*.test.mjs, 99_Others/Dashboard/test/*.test.mjs), 시험을 돌려 초록으로 카운터를 푼다. 채집되는 꼴은 파이프·`&&`·리다이렉트 없는 단독 명령이다 — 전체 `npm test -- --no-color --reporter=dot`, 경로를 좁힌 `npx vitest run <경로>`·`npm test -- <경로>`, 현황판 `node --test <경로>`. 전체 실행이 오래 걸려 뒤로 돌면 출력이 훅에 닿지 않으니 좁힌 실행을 쓴다';
const FULL_HINT = '전체 `npm test -- --no-color --reporter=dot`(파이프·`&&` 없는 단독 꼴)로 Green을 만든 뒤 다시 시도하라 — 좁힌 실행은 이 증거가 아니다';

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'tdd-guard', ...entry }) + '\n');
}
function normalizeV2(raw) {
  if (raw && typeof raw === 'object') {
    if (raw.schema === 2) return { schema: 2, global: raw.global || null, sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {} };
    if (!('schema' in raw) && ['streak', 'lastGreen', 'lastSourceEdit', 'lastTestEdit'].some(k => k in raw)) {
      return { schema: 2, global: raw, sessions: {} }; // v1 이행 — 전체를 global로 읽는다
    }
  }
  return { schema: 2, global: null, sessions: {} };
}
function loadState() {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (e) { /* 부재·파손 = 빈 상태 — lastGreen 없음이므로 검증형은 자연히 fail-closed */ }
  return normalizeV2(raw);
}
function ownScope(st) {
  const o = SID ? st.sessions[SID] : st.global;
  return o && typeof o === 'object' ? o : {};
}
function capByAt(map, cap) {
  const keys = Object.keys(map);
  if (keys.length <= cap) return;
  keys.sort((a, b) => ((map[a] && map[a].at) || 0) - ((map[b] && map[b].at) || 0));
  for (let i = 0; keys.length - i > cap; i++) delete map[keys[i]];
}
function getStreak(own) {
  const holder = AID ? (own.agents && own.agents[AID]) : own;
  return holder && typeof holder.streak === 'number' ? holder.streak : 0;
}
function setStreak(own, n) {
  if (!AID) { own.streak = n; return; }
  own.agents = own.agents && typeof own.agents === 'object' ? own.agents : {};
  own.agents[AID] = { streak: n, at: Date.now() };
  capByAt(own.agents, AGENT_CAP);
}
// 잠금을 잡은 뒤 디스크에서 다시 읽은 값에 자기 스코프만 얹는다 — 호출부가 들고 있던 사본은 쓰지 않는다.
function saveOwn(mutate) {
  const { updateState } = require('./_lib/state-store.cjs');
  const res = updateState(STATE_FILE, (raw) => {
    const fresh = normalizeV2(raw);
    const own = { ...ownScope(fresh) };
    mutate(own);
    if (SID) { own.at = Date.now(); fresh.sessions[SID] = own; capByAt(fresh.sessions, SESSION_CAP); }
    else fresh.global = own;
    return fresh;
  }, { session: SID, hook: 'tdd-guard' });
  if (!res.ok) log({ ...base, verdict: '오류', rule: '상태-저장-실패', reason: `tdd-guard 상태 저장 실패 — ${res.error}` });
  return res;
}
// 전 스코프 최신 lastSourceEdit — at이 없으면 ts를 파싱하고, 파싱 불능은 최신으로 본다 (fail-closed)
function latestSourceEditAcross(st) {
  const cands = [];
  if (st.global && st.global.lastSourceEdit && st.global.lastSourceEdit.ts) cands.push({ scope: 'global', e: st.global.lastSourceEdit });
  for (const sid of Object.keys(st.sessions)) {
    const s = st.sessions[sid];
    if (s && s.lastSourceEdit && s.lastSourceEdit.ts) cands.push({ scope: `session:${sid}`, e: s.lastSourceEdit });
  }
  let best = null;
  for (const c of cands) {
    const raw = typeof c.e.at === 'number' ? c.e.at : Date.parse(c.e.ts);
    const atMs = Number.isFinite(raw) ? raw : Infinity;
    if (!best || atMs >= best.atMs) best = { scope: c.scope, e: c.e, atMs };
  }
  return best;
}
// 경계 밖이면 null, 상대 경로는 훅 입력의 cwd 기준이다. 판독용 kindRel은 작업 폴더 접두를 벗긴 꼴이다.
const adRel = (p) => repoRel(ROOT, p, input.cwd);
const kindRel = (rel) => rel.replace(WORKTREE_PREFIX, '');
// 20_plan-gate·40_pass-watcher와 같은 집계다. 절 헤더는 제목 단독 줄만 인정한다.
const RECORD_HEADER = /^검증 기록\s*$/;
function countRecord(text) {
  let pass = 0, fail = 0, inRecord = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^##\s+/.test(l)) { inRecord = false; continue; }
    if (RECORD_HEADER.test(l)) { inRecord = true; continue; }
    if (!inRecord) continue;
    if (/^-\s*PASS\b/.test(l)) pass++;
    else if (/^-\s*FAIL\b/.test(l)) fail++;
  }
  return { pass, fail };
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { /* 입력 없음 = 아래 무대상 처리 */ }
const ti = input.tool_input || {};
const event = input.hook_event_name || null;
const tool = input.tool_name || null;
const SID = input.session_id || null;
const AID = typeof input.agent_id === 'string' && input.agent_id.trim() ? input.agent_id.slice(0, 80) : null;
const base = { event, session: SID, agent: AID, tool, scope: SID ? 'session' : 'global' };

try {
  if (event === 'PreToolUse' && EDIT_TOOLS.includes(tool)) { verifyGate(); heuristicGate(); }
  else if (event === 'PostToolUse' && EDIT_TOOLS.includes(tool)) heuristic();
  else if (event === 'PostToolUse' && tool === 'Bash') collectGreen();
} catch (e) {
  try { log({ ...base, verdict: '오류', rule: '훅-크래시', reason: String(e && e.message || e).slice(0, 200) }); } catch (e2) { /* 로그 실패도 무해 */ }
}
process.exit(0);

function verifyGate() {
  const target = ti.file_path || null;
  if (!target || !/\.md$/i.test(target)) return;
  const abs = toAbs(input.cwd || ROOT, target); // 범위 판정(adRel)과 같은 정규화
  let curText = '';
  try { curText = fs.readFileSync(abs, 'utf8'); } catch (e) { /* 신규 파일 — 사전 텍스트 빈 것 */ }

  // 도구 실행 전이라 사후 텍스트를 입력으로 계산한다. 계산할 수 없는 입력은 도구 자체도 실패하니 무동작이다.
  let newText = null;
  if (tool === 'Write' && typeof ti.content === 'string') newText = ti.content;
  else if (tool === 'Edit' && typeof ti.old_string === 'string' && typeof ti.new_string === 'string' && curText.includes(ti.old_string)) {
    newText = ti.replace_all ? curText.split(ti.old_string).join(ti.new_string) : curText.replace(ti.old_string, () => ti.new_string);
  } else if (tool === 'MultiEdit' && Array.isArray(ti.edits)) {
    let t = curText, ok = ti.edits.length > 0;
    for (const e of ti.edits) {
      if (!e || typeof e.old_string !== 'string' || typeof e.new_string !== 'string' || !t.includes(e.old_string)) { ok = false; break; }
      t = e.replace_all ? t.split(e.old_string).join(e.new_string) : t.replace(e.old_string, () => e.new_string);
    }
    if (ok) newText = t;
  }
  if (newText === null) return;

  const head = (curText || newText).match(/^##\s+Phase\s+\d+[^\n]*태그:\s*`([^`]+)`/m);
  if (!head) return; // Phase 머리줄 없는 일반 문서 — 관할 밖, 무로그
  const tag = head[1];
  const prev = countRecord(curText), next = countRecord(newText);
  if (next.pass <= prev.pass) return; // PASS 증가 없음 — 기록 자유 (FAIL·USER-INPUT·본문 수정), 무로그

  const evidence = { file: target, tag, pass: `${prev.pass}→${next.pass}` };
  if (tag !== 'source') {
    log({ ...base, duty: '검증형', verdict: 'allow', rule: '비대상-태그', reason: `태그 \`${tag}\` Phase의 PASS 추기 — vitest Green 게이트는 source 태그만 관할한다`, evidence });
    return;
  }
  const st = loadState();
  const own = ownScope(st);
  const green = own.lastGreen && own.lastGreen.ts ? own.lastGreen : null;
  if (!green) {
    deny('검증형', 'green-증거-부재', `source 태그 Phase의 검증 기록 PASS 추기에는 vitest 전체 Green 증거가 선행해야 한다 — 자기 스코프(${base.scope})의 증거가 없다 (다른 세션의 Green은 인정하지 않는다 — M04 스코핑). ${FULL_HINT} (증거 표면: tdd-guard.state.json)`, evidence);
  }
  // 순서는 밀리초 at으로 비교한다 — 초 단위 ts는 같은 초 안의 편집과 Green을 못 가른다. 순서 불명은 실효로 본다 (fail-closed).
  const lastSrc = latestSourceEditAcross(st);
  const srcAt = lastSrc ? lastSrc.atMs : null;
  const greenAt = typeof green.at === 'number' ? green.at : Date.parse(green.ts);
  if (srcAt !== null && !(srcAt < greenAt)) {
    deny('검증형', 'green-실효', `마지막 소스 편집(${lastSrc.e.ts} ${lastSrc.e.file} · 스코프 ${lastSrc.scope})이 vitest Green(${green.ts}) 이후거나 순서 불명이다 — 증거가 실효했다 (실효 비교는 전 스코프 최신 소스 편집과 한다). ${FULL_HINT}`, { ...evidence, green: green.ts, lastSourceEdit: lastSrc.e.ts, lastSourceEditFile: lastSrc.e.file, lastSourceEditScope: lastSrc.scope });
  }
  log({ ...base, duty: '검증형', verdict: 'allow', rule: 'green-유효', reason: `vitest Green 증거 유효(${green.ts}) — 전 스코프 마지막 소스 편집${lastSrc ? `(${lastSrc.e.ts} · ${lastSrc.scope})` : ' 기록 없음'} 이후의 Green이다`, evidence: { ...evidence, green: green.ts, greenEvidence: green.evidence || null } });
}
function deny(duty, rule, reason, evidence) {
  log({ ...base, duty, verdict: 'deny', rule, reason, evidence });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `[TDD 가드] ${reason}` },
  }));
  process.exit(0);
}

// 완료된 미동반 편집이 streak회면 이번 시도는 streak+1회째다 — 임계에 닿는 시도 자체를 막는다.
function heuristicGate() {
  const target = ti.file_path || null;
  if (!target) return;
  const rel = adRel(target);
  if (rel === null) return; // 저장소 밖 — 치유 경로이자 관할 밖, 무로그
  const streak = getStreak(ownScope(loadState()));
  const armed = streak + 1 >= STREAK_LIMIT;
  if (isTestPath(kindRel(rel))) {
    // 시험 편집은 치유 경로라 늘 통과한다. 장전 상태에서만 allow를 남겨 관측한다
    if (armed) log({ ...base, duty: '휴리스틱', verdict: 'allow', rule: '치유-경로-테스트', reason: `카운터 장전 상태(streak ${streak})의 테스트 파일 편집(${rel}) — 치유 경로는 차단하지 않는다`, evidence: { file: rel, streak, limit: STREAK_LIMIT } });
    return;
  }
  if (!SOURCE_EXTS.includes(path.extname(rel))) return; // 비소스(md·css 등) — 무로그
  if (!armed) return; // 임계 미달 — 카운터는 PostToolUse 몫
  deny('휴리스틱', '테스트-미동반-차단', `소스 편집이 테스트 동반 없이 ${STREAK_LIMIT}회째에 이르려 한다 (완료 ${streak}회 + 이번 시도, 임계 ${STREAK_LIMIT}회) — 이 편집을 차단한다 (2026-08-08 사용자 개정, 경고→차단 승격). ${RESUME_HINT}`, { file: rel, streak, limit: STREAK_LIMIT });
}

// 현황판의 시험 밖 .mjs·.js는 소스로 센다. 함수 선언인 이유는 호이스팅이다 (호출부가 모듈 상단에 있다).
function isTestPath(rel) {
  return rel.startsWith(TEST_PREFIX)
    || /^\.claude\/hooks\/(?:[^/]+\/)*[^/]+\.test\.(?:mjs|cjs|js)$/.test(rel)
    || /^99_others\/dashboard\/test\/(?:[^/]+\/)*[^/]+\.test\.(?:mjs|cjs|js)$/.test(rel);
}

function heuristic() {
  const target = ti.file_path || null;
  if (!target) return;
  const rel = adRel(target);
  if (rel === null) return; // 저장소 밖 — 매 편집마다 발화하는 훅이라 무로그로 소음을 막는다
  if (isTestPath(kindRel(rel))) {
    saveOwn(own => { own.lastTestEdit = { ts: ts(), at: Date.now(), file: rel }; setStreak(own, 0); });
    log({ ...base, duty: '휴리스틱', verdict: '리셋', rule: '테스트-편집', reason: `테스트 파일 손질(${rel}) — 미동반 연속 카운터를 0으로 되돌린다`, evidence: { file: rel, streak: 0 } });
    return;
  }
  if (path.extname(rel) === '.css') { // 카운터에는 들지 않지만 전체 Green 증거는 실효시킨다
    saveOwn(own => { own.lastSourceEdit = { ts: ts(), at: Date.now(), file: rel }; });
    return;
  }
  if (!SOURCE_EXTS.includes(path.extname(rel))) return; // 문서·설정 등 비소스 — 무로그
  let streak = 0;
  saveOwn(own => { own.lastSourceEdit = { ts: ts(), at: Date.now(), file: rel }; streak = getStreak(own) + 1; setStreak(own, streak); });
  const evidence = { file: rel, streak, limit: STREAK_LIMIT };
  if (streak >= STREAK_LIMIT) {
    // 정상 경로에선 닿지 않는다 — 사전 게이트가 이미 deny했다. 우회 대비 백스톱.
    const reason = `소스 편집이 테스트 동반 없이 ${streak}회 이어졌다 (임계 ${STREAK_LIMIT}회) — 사전 차단 게이트를 지나쳐 임계에 닿았다 (백스톱 발화). ${RESUME_HINT}`;
    log({ ...base, duty: '휴리스틱', verdict: '경고', rule: '테스트-미동반-백스톱', reason, evidence });
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `[TDD 가드] ${reason}` }));
    return;
  }
  log({ ...base, duty: '휴리스틱', verdict: '통과', rule: '연속-미달', reason: `소스 편집 ${streak}회째 — 임계 ${STREAK_LIMIT}회 미만, 경고 없음`, evidence });
}

// full은 출력 형태만 바꾸는 플래그의 npm test·vitest run(전체 Green 증거), narrow는 경로 인자만 더한 꼴과 `node --test`(카운터만 푼다)다.
// 파이프·리다이렉트·`&&`·명령 치환이 섞이면 출력이 잘렸을 수 있어 판정 불능이다. 상수를 함수 안에 두는 이유는 호이스팅이다.
function classifyRun(cmd) {
  const RUN_ALLOWED_FLAGS = ['--run', '--silent', '--no-color', '--color'];
  const SHELL_COMPOSE = /[|;<>`]|&&|\$\(/;
  if (SHELL_COMPOSE.test(cmd)) return { kind: 'unknown', runner: null, reason: '파이프·리다이렉트·명령 치환이 섞였다 — 출력이 잘렸을 수 있어 완전성을 보증할 수 없다' };
  const toks = cmd.trim().split(/\s+/).map(t => t.replace(/^["']+|["']+$/g, '')).filter(Boolean);
  let i = 0;
  if (toks[i] === 'npx') i++;
  const head = toks[i];
  if (head === 'node') {
    const args = toks.slice(i + 1);
    const opts = [];
    for (const t of args) { if (!t.startsWith('-')) break; opts.push(t); }
    const evals = args.some(t => /^--(?:eval|print)(?:=|$)/.test(t) || /^-[a-z]*[ep][a-z]*$/i.test(t));
    if (opts.includes('--test') && !evals) return { kind: 'narrow', runner: 'node-test', reason: '`node --test` 실행 — 현황판 시험 표면' };
    return { kind: 'unknown', runner: null, reason: '`--test`가 스크립트 앞의 node 옵션이 아니거나 -e·-p가 붙었다 — 시험 실행이 아니다' };
  }
  if (head === 'npm') {
    i++;
    if (toks[i] === 'run') i++;
    if (toks[i] !== 'test') return { kind: 'partial', runner: null, reason: `npm 스크립트 \`${toks[i] || '(없음)'}\`는 vitest 스위트가 아니다` };
    i++;
  } else if (head === 'vitest') {
    i++;
    if (toks[i] === 'run') i++;
    else if (!toks.includes('--run')) return { kind: 'partial', runner: null, reason: 'vitest가 run(단발) 모드가 아니다 — watch 실행은 통과 증거가 아니다' };
  } else {
    return { kind: 'unknown', runner: null, reason: `실행기 머리 토큰 \`${head || '(없음)'}\`를 실행 형태로 판별하지 못했다` };
  }
  let narrowed = false;
  for (const t of toks.slice(i)) {
    if (t === '--') continue; // npm의 인자 구분자 자체는 필터가 아니다 — 뒤 토큰을 계속 본다
    if (RUN_ALLOWED_FLAGS.includes(t) || t.startsWith('--reporter')) continue;
    if (!t.startsWith('-')) { narrowed = true; continue; }
    return { kind: 'partial', runner: null, reason: `인자 \`${t}\`가 붙었다 — 이름 필터·옵션이 걸린 실행은 증거로 인정하지 않는다` };
  }
  return narrowed
    ? { kind: 'narrow', runner: 'vitest', reason: '경로를 좁힌 vitest 실행' }
    : { kind: 'full', runner: 'vitest', reason: '전체 스위트 실행 형태' };
}
// 색상 제어 문자를 벗겨 증거 줄을 사람이 읽을 수 있게 남긴다
function stripAnsi(s) {
  return String(s).replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*[A-Za-z]', 'g'), '');
}
// 출력이 크면 응답에는 머리만 남고 전문은 persistedOutputPath 파일로 간다 (hook-log io.responseKeys 실측)
function responseText(tr) {
  if (typeof tr === 'string') return tr;
  if (!tr || typeof tr !== 'object') return '';
  const parts = [tr.stdout, tr.stderr, tr.output].filter(v => typeof v === 'string');
  if (typeof tr.persistedOutputPath === 'string' && tr.persistedOutputPath) {
    try {
      if (fs.statSync(tr.persistedOutputPath).size <= PERSISTED_CAP) parts.push(fs.readFileSync(tr.persistedOutputPath, 'utf8'));
    } catch (e) { /* 못 읽으면 응답 본문만 — 요약 줄이 없으면 판정 불능이다 */ }
  }
  return parts.join('\n');
}

function collectGreen() {
  const cmd = String(ti.command || '');
  const low = cmd.toLowerCase();
  if (!/(npm\s+(run\s+)?test\b|vitest\b|\bnode\b.*\s--test\b)/.test(low)) return; // 시험 실행 명령 아님 — 무로그
  // 맥락 판정은 cwd만 본다 — 남의 저장소 출력을 자기 Green으로 삼지 않는다.
  if (adRel(input.cwd || ROOT) === null) return;

  const cls = classifyRun(cmd);
  if (cls.kind === 'partial' || cls.kind === 'unknown') {
    log({ ...base, duty: 'green-채집', verdict: '무기록', rule: cls.kind === 'partial' ? '전체-실행-아님' : '판정-불능',
      reason: `${cls.reason} — 단독 실행 꼴만 채집한다 (fail-closed)`, evidence: { cmd: cmd.slice(0, 160), runKind: cls.kind } });
    return;
  }

  const tr = input.tool_response;
  const out = stripAnsi(responseText(tr)); // 판정도 증거도 제어 문자 제거본으로 한다
  const io = { responseKeys: tr && typeof tr === 'object' ? Object.keys(tr) : typeof tr, interrupted: !!(tr && tr.interrupted) }; // 실측·회귀 근거
  const evidence = { cmd: cmd.slice(0, 160), runKind: cls.kind, io };
  let greenLine, red;
  if (cls.runner === 'node-test') {
    greenLine = out.match(/^\S*\s*(?:ℹ|#)\s*pass\s+[1-9]\d*\s*$/m);
    red = !/^\S*\s*(?:ℹ|#)\s*fail\s+0\s*$/m.test(out) || /^\S*\s*(?:ℹ|#)\s*cancelled\s+[1-9]/m.test(out);
  } else {
    greenLine = out.match(/Test Files[^\n]*?\d+\s+passed[^\n]*/i);
    red = /Test Files[^\n]*\bfailed\b/i.test(out) || /\bTests\s+\d+\s+failed/i.test(out);
  }
  const prefix = cls.runner === 'node-test' ? 'node-test' : 'vitest';

  if (greenLine && !red && !io.interrupted) {
    const summary = greenLine[0].trim();
    if (cls.kind === 'full') {
      saveOwn(own => { own.lastGreen = { ts: ts(), at: Date.now(), cmd: cmd.slice(0, 160), evidence: summary }; setStreak(own, 0); });
      log({ ...base, duty: 'green-채집', verdict: 'green-기록', rule: 'vitest-green', reason: `vitest 전체 Green 실측 — 증거를 자기 스코프 lastGreen에 기록, 미동반 카운터 리셋`, evidence: { ...evidence, summary } });
    } else {
      saveOwn(own => setStreak(own, 0));
      log({ ...base, duty: 'green-채집', verdict: '리셋', rule: `${prefix}-green-좁힘`, reason: `좁힌 실행의 초록 — 미동반 카운터만 되돌린다 (전체 Green 증거는 아니다)`, evidence: { ...evidence, summary } });
    }
    return;
  }
  const rule = red ? `${prefix}-red` : '판정-불능';
  log({ ...base, duty: 'green-채집', verdict: '무기록', rule, reason: red ? `실패 표기 실측 — Red는 증거가 아니다` : `요약 줄을 출력에서 찾지 못했다 — 판정 불능은 무기록 (증거 없음 방향, fail-closed)`, evidence: { ...evidence, tail: out.slice(-200) } });
}
