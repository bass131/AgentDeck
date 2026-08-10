#!/usr/bin/env node
// TDD 가드 훅 (M03 Phase 0 신설) — 사용자 확정 방식 「검증형+휴리스틱」의 실물 (M03 결정 대장 [USER] 2026-08-08).
// 한 파일이 세 임무를 이벤트로 분기한다 (세부 기제는 [AI] 재량 확정 — M03 결정 대장 참조):
//   ① 검증형 (PreToolUse: Edit|MultiEdit|Write) — source 태그 Phase 파일의 「검증 기록」에 PASS 줄을
//      추기하려면 이 저장소 vitest Green 증거가 선행해야 한다. 없으면 deny (fail-closed).
//      감지 지점을 PostToolUse(40_pass-watcher 선례)가 아니라 PreToolUse로 둔 이유: 사후 감지는 이미
//      적힌 PASS를 되돌려야 하지만, 사전 차단은 무효 기록 자체를 만들지 않는다.
//   ② 휴리스틱 (PreToolUse 차단 + PostToolUse 카운터) — 소스 편집이 테스트(02_Project/01_TestCode/)
//      손질 없이 연속 3회째에 이르려는 시점부터 그 편집 자체를 deny한다 (2026-08-08 사용자 개정 —
//      경고에서 차단으로 승격). 재개는 원인 해소로만: 테스트 파일을 손대거나 vitest Green으로 카운터가
//      리셋된 뒤에만 소스 편집이 다시 열린다. 카운터 증가·리셋은 PostToolUse가 유지한다.
//   ③ Green 채집 (PostToolUse: Bash) — 이 저장소에서 vitest 전체 실행이 Green이면 증거를 상태 파일에
//      남긴다. 판정 불능이면 무기록 — 증거 없음 방향이 안전하다 (fail-closed).
// 상태 표면: tdd-guard.state.json — M04 Phase 1부터 세션 스코핑 v2({schema:2, global, sessions}).
//   streak·lastSourceEdit·lastTestEdit·lastGreen은 자기 스코프(session_id, 무식별이면 global)에서만
//   읽고 쓴다. 단 하나의 예외 — Green 실효 판정의 「마지막 소스 편집」은 전 스코프(global+sessions)
//   최신과 비교한다: 다른 세션의 더 새로운 소스 편집도 Green을 실효시킨다 — 스코핑이 fail-closed를
//   약화시키지 않게 하는 보강 (M04 결정 대장 [AI]). 훅 크래시는 로그 시도 후 exit 0 (cmd-guard 선례).
// AgentDeck 이식 (M01 Phase 4): 원본의 AGENTDECK 상수(옆 저장소 뿌리)를 ROOT로 접었다 — 감독 대상이
//   이 저장소 자신이므로 판정 뿌리가 하나다. 테스트 경로 접두사도 이 저장소의 vitest include와 맞춘다.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const STATE_FILE = path.join(GATE_DIR, 'tdd-guard.state.json');
const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write'];
const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'];
const TEST_PREFIX = '02_project/01_testcode/'; // 저장소 상대 — 테스트 배치의 정본 (vitest include와 동일)
const STREAK_LIMIT = 3;                   // 테스트 미동반 연속 임계 — [AI] 재량 확정 (M03 결정 대장)
const SESSION_CAP = 8;                    // 세션 스코프 보존 상한 — 넘으면 at 오래된 것부터 제거 (M04 Phase 1)

function ts() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
function log(entry) {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: ts(), hook: 'tdd-guard', ...entry }) + '\n');
}
// ---- 상태 v2 정규화·저장 (M04 Phase 1 공통 스키마) ----
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
// 자기 스코프 — SID 있으면 sessions[SID], 없으면 global. 부재면 빈 객체 (읽기 전용 사용도 안전)
function ownScope(st) {
  const o = SID ? st.sessions[SID] : st.global;
  return o && typeof o === 'object' ? o : {};
}
function capSessions(sessions) {
  const keys = Object.keys(sessions);
  if (keys.length <= SESSION_CAP) return;
  keys.sort((a, b) => ((sessions[a] && sessions[a].at) || 0) - ((sessions[b] && sessions[b].at) || 0));
  for (let i = 0; keys.length - i > SESSION_CAP; i++) delete sessions[keys[i]];
}
// 자기 스코프 저장 — 다른 스코프 보존 + 원자 교체(tmp+rename)
function saveOwn(st, own) {
  if (SID) { own.at = Date.now(); st.sessions[SID] = own; capSessions(st.sessions); }
  else st.global = own;
  fs.mkdirSync(GATE_DIR, { recursive: true });
  const tmp = STATE_FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(st, null, 2) + '\n');
  fs.renameSync(tmp, STATE_FILE);
}
// 전 스코프(global+sessions) 최신 lastSourceEdit — at 우선, 없으면 ts 파싱. 파싱 불능은 최신 취급(실효 방향, fail-closed)
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
// 저장소 상대 경로 (소문자 슬래시) — 경계 밖이면 null
function adRel(p) {
  const rel = path.relative(path.resolve(ROOT), path.resolve(String(p)));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/').toLowerCase();
}
// 「검증 기록」 절 내부의 PASS·FAIL 줄 집계 — 40_pass-watcher의 countRecord와 동일 로직 (정합)
function countRecord(text) {
  let pass = 0, fail = 0, inRecord = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^##\s+/.test(l)) { inRecord = false; continue; }
    if (/^검증 기록/.test(l)) { inRecord = true; continue; }
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
const SID = input.session_id || null; // 스코프 키 — 무식별 입력은 global (기존 경로 하위 호환)
const base = { event, session: SID, tool, scope: SID ? 'session' : 'global' };

try {
  if (event === 'PreToolUse' && EDIT_TOOLS.includes(tool)) { verifyGate(); heuristicGate(); }
  else if (event === 'PostToolUse' && EDIT_TOOLS.includes(tool)) heuristic();
  else if (event === 'PostToolUse' && tool === 'Bash') collectGreen();
} catch (e) {
  try { log({ ...base, verdict: '오류', rule: '훅-크래시', reason: String(e && e.message || e).slice(0, 200) }); } catch (e2) { /* 로그 실패도 무해 */ }
}
process.exit(0);

// ---- ① 검증형 — source 태그 Phase의 PASS 추기 전 Green 증거 요구 ----
function verifyGate() {
  const target = ti.file_path || null;
  if (!target || !/\.md$/i.test(target)) return;
  const abs = path.isAbsolute(target) ? target : path.join(ROOT, target);
  let curText = '';
  try { curText = fs.readFileSync(abs, 'utf8'); } catch (e) { /* 신규 파일 — 사전 텍스트 빈 것 */ }

  // 사후 텍스트 시뮬레이션 — 도구가 실행되기 전이므로 입력으로 계산한다. 계산 불능이면 무동작
  // (그 입력은 도구 자체도 실패한다 — 검증할 실변경이 없다).
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
    deny('검증형', 'green-증거-부재', `source 태그 Phase의 검증 기록 PASS 추기에는 vitest Green 증거가 선행해야 한다 — 자기 스코프(${base.scope})의 증거가 없다 (다른 세션의 Green은 인정하지 않는다 — M04 스코핑). \`npm run test\`를 돌려 전체 Green을 만든 뒤 다시 시도하라 (증거 표면: tdd-guard.state.json)`, evidence);
  }
  // 순서 비교는 밀리초(at)로 한다 — 초 단위 ts는 같은 초 안의 편집↔Green 순서를 못 가른다 (파이프 실측).
  // at 부재(구 상태)면 ts를 파싱해 폴백하고, 동률·파싱 불능 등 순서 불명은 실효로 본다 (fail-closed).
  // 실효 비교의 「마지막 소스 편집」은 전 스코프 최신이다 — 다른 세션의 편집도 Green을 실효시킨다 (M04 [AI]).
  const lastSrc = latestSourceEditAcross(st);
  const srcAt = lastSrc ? lastSrc.atMs : null;
  const greenAt = typeof green.at === 'number' ? green.at : Date.parse(green.ts);
  if (srcAt !== null && !(srcAt < greenAt)) {
    deny('검증형', 'green-실효', `마지막 소스 편집(${lastSrc.e.ts} ${lastSrc.e.file} · 스코프 ${lastSrc.scope})이 vitest Green(${green.ts}) 이후거나 순서 불명이다 — 증거가 실효했다 (실효 비교는 전 스코프 최신 소스 편집과 한다). \`npm run test\`를 다시 돌려 Green을 갱신한 뒤 시도하라`, { ...evidence, green: green.ts, lastSourceEdit: lastSrc.e.ts, lastSourceEditFile: lastSrc.e.file, lastSourceEditScope: lastSrc.scope });
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

// ---- ② 휴리스틱 (사전 차단) — 임계에 이르려는 테스트 미동반 소스 편집을 deny한다 (2026-08-08 사용자 개정) ----
// 경계 ([AI] 재량 확정, M03 결정 대장): 완료된 미동반 편집이 streak회일 때 이번 시도는 (streak+1)회째다.
// streak+1이 임계(STREAK_LIMIT=3)에 닿으면 그 시도 자체를 차단한다 — 「3회째 시도가 차단된다」.
// 카운터는 자기 스코프의 것만 본다 — 다른 세션의 미동반 이력이 이 세션의 편집을 막지 않는다 (M04 스코핑).
function heuristicGate() {
  const target = ti.file_path || null;
  if (!target) return;
  const rel = adRel(target);
  if (rel === null) return; // 저장소 밖 — 치유 경로이자 관할 밖, 무로그
  const own = ownScope(loadState());
  const streak = typeof own.streak === 'number' ? own.streak : 0;
  const armed = streak + 1 >= STREAK_LIMIT;
  if (isTestPath(rel)) {
    // 테스트 편집은 언제나 통과 — 차단 대상이 아니라 치유 경로다. 장전 상태에서만 allow를 남겨 관측한다
    if (armed) log({ ...base, duty: '휴리스틱', verdict: 'allow', rule: '치유-경로-테스트', reason: `카운터 장전 상태(streak ${streak})의 테스트 파일 편집(${rel}) — 치유 경로는 차단하지 않는다`, evidence: { file: rel, streak, limit: STREAK_LIMIT } });
    return;
  }
  if (!SOURCE_EXTS.includes(path.extname(rel))) return; // 비소스(md 등) — 치유 경로, 무로그
  if (!armed) return; // 이번 편집이 완료돼도 임계 미달 — 통과, 카운터는 PostToolUse 몫 (무로그)
  deny('휴리스틱', '테스트-미동반-차단', `소스 편집이 테스트 동반 없이 ${STREAK_LIMIT}회째에 이르려 한다 (완료 ${streak}회 + 이번 시도, 임계 ${STREAK_LIMIT}회) — 이 편집을 차단한다 (2026-08-08 사용자 개정, 경고→차단 승격). 재개 경로: 이 변경을 커버하는 테스트를 02_Project/01_TestCode/에 먼저 두거나, \`npm run test\`로 Green을 만들어 카운터를 리셋한 뒤 재시도하라`, { file: rel, streak, limit: STREAK_LIMIT });
}

// 테스트 인정 경로 — 두 표면이다 (M02 Phase 1 Step 7, Backlog 11번 전반부).
//   ① 앱 테스트: 02_Project/01_TestCode/ 아래 (vitest include와 동일 — 종전 유일 표면)
//   ② 훅 테스트: .claude/hooks/ 아래의 *.test.mjs·cjs·js (훅 자체를 고칠 때의 동반 테스트 거처)
// ②가 빠져 있던 동안은 하네스 수리가 자충수였다 — 훅 테스트를 손질해도 카운터가 리셋되지 않아
// 훅 소스 편집 3회째가 차단됐다. 함수 선언인 이유는 호이스팅이다 (호출부가 모듈 상단에 있다).
function isTestPath(rel) {
  return rel.startsWith(TEST_PREFIX) || /^\.claude\/hooks\/(?:[^/]+\/)*[^/]+\.test\.(?:mjs|cjs|js)$/.test(rel);
}

// ---- ② 휴리스틱 (사후 카운터) — 미동반 연속 카운터의 증가·리셋을 자기 스코프에 유지한다 (차단 판정은 사전 게이트 몫) ----
function heuristic() {
  const target = ti.file_path || null;
  if (!target) return;
  const rel = adRel(target);
  if (rel === null) return; // 저장소 밖 — 관할 밖. 매 편집마다 발화하는 훅이라 무로그로 소음을 막는다
  const st = loadState();
  const own = ownScope(st);
  if (isTestPath(rel)) {
    own.lastTestEdit = { ts: ts(), at: Date.now(), file: rel };
    own.streak = 0;
    saveOwn(st, own);
    log({ ...base, duty: '휴리스틱', verdict: '리셋', rule: '테스트-편집', reason: `테스트 파일 손질(${rel}) — 미동반 연속 카운터를 0으로 되돌린다`, evidence: { file: rel, streak: 0 } });
    return;
  }
  if (!SOURCE_EXTS.includes(path.extname(rel))) return; // 문서·설정 등 비소스 — 무로그
  own.lastSourceEdit = { ts: ts(), at: Date.now(), file: rel };
  own.streak = (typeof own.streak === 'number' ? own.streak : 0) + 1;
  saveOwn(st, own);
  const evidence = { file: rel, streak: own.streak, limit: STREAK_LIMIT };
  if (own.streak >= STREAK_LIMIT) {
    // 정상 경로에선 닿지 않는다 — 임계에 이르는 시도는 사전 게이트(heuristicGate)가 이미 deny했다. 우회 대비 백스톱.
    const reason = `소스 편집이 테스트 동반 없이 ${own.streak}회 이어졌다 (임계 ${STREAK_LIMIT}회) — 사전 차단 게이트를 지나쳐 임계에 닿았다 (백스톱 발화). 이 변경을 커버하는 테스트를 02_Project/01_TestCode/에 먼저 두거나 \`npm run test\` Green으로 카운터를 리셋하라 (2026-08-08 사용자 개정 — 차단 승격)`;
    log({ ...base, duty: '휴리스틱', verdict: '경고', rule: '테스트-미동반-백스톱', reason, evidence });
    process.stdout.write(JSON.stringify({ decision: 'block', reason: `[TDD 가드] ${reason}` }));
    return;
  }
  log({ ...base, duty: '휴리스틱', verdict: '통과', rule: '연속-미달', reason: `소스 편집 ${own.streak}회째 — 임계 ${STREAK_LIMIT}회 미만, 경고 없음`, evidence });
}

// ---- ③ Green 채집 — 이 저장소 vitest 전체 실행의 Green 증거를 자기 스코프에 남긴다 ----
function collectGreen() {
  const cmd = String(ti.command || '');
  const low = cmd.toLowerCase();
  if (!/(npm\s+(run\s+)?test\b|vitest\b)/.test(low)) return; // 테스트 실행 명령 아님 — 무로그
  // 맥락 판정은 cwd만 본다 — 원본의 「명령 문자열에 agentdeck이 들어가면」 절은 두 저장소 배치의
  // 산물이라 이식하지 않았다. 뿌리가 하나가 된 지금은 남의 저장소 출력을 자기 Green으로 삼는 fail-open이다.
  if (adRel(input.cwd || '') === null && path.resolve(String(input.cwd || '')) !== path.resolve(ROOT)) return;

  const tr = input.tool_response;
  let out = '';
  if (typeof tr === 'string') out = tr;
  else if (tr && typeof tr === 'object') out = [tr.stdout, tr.stderr, tr.output].filter(v => typeof v === 'string').join('\n');
  const io = { responseKeys: tr && typeof tr === 'object' ? Object.keys(tr) : typeof tr, interrupted: !!(tr && tr.interrupted) }; // 실측·회귀 근거 (role-gate io 선례)
  const greenLine = out.match(/Test Files[^\n]*?\d+\s+passed[^\n]*/i);
  const red = /Test Files[^\n]*\bfailed\b/i.test(out) || /\bTests\s+\d+\s+failed/i.test(out);
  const evidence = { cmd: cmd.slice(0, 160), io };

  if (greenLine && !red && !io.interrupted) {
    const st = loadState();
    const own = ownScope(st);
    own.lastGreen = { ts: ts(), at: Date.now(), cmd: cmd.slice(0, 160), evidence: greenLine[0].trim() };
    own.streak = 0; // Green도 카운터를 되돌린다 — 테스트를 실제로 돌려 통과시킨 것은 테스트 동행의 증거다
    saveOwn(st, own);
    log({ ...base, duty: 'green-채집', verdict: 'green-기록', rule: 'vitest-green', reason: `vitest 전체 Green 실측 — 증거를 자기 스코프 lastGreen에 기록, 미동반 카운터 리셋`, evidence: { ...evidence, summary: greenLine[0].trim() } });
    return;
  }
  const rule = red ? 'vitest-red' : '판정-불능';
  log({ ...base, duty: 'green-채집', verdict: '무기록', rule, reason: red ? `vitest 실패 표기 실측 — Red는 증거가 아니다` : `vitest 요약 줄을 출력에서 찾지 못했다 — 판정 불능은 무기록 (증거 없음 방향, fail-closed)`, evidence: { ...evidence, tail: out.slice(-200) } });
}
