#!/usr/bin/env node
// 동시 세션 레이스 재현 픽스처 러너 (M04 Phase 1 · AgentDeck M01 Phase 4 이식) — 세션 2개(A·B)를
// 합성 stdin으로 모의해 게이트 상태 파일의 세션 무구분 전역성이 만드는 레이스를 재현(red)/부재(green)
// 판정한다. 판정 근거는 hook-log.jsonl의 추가 줄과 상태 파일 실측뿐이다. 훅 본체는 손대지 않는다.
//
// 사용: CLAUDE_PROJECT_DIR=<미러 뿌리> node run.cjs red|green|solo
//   red   — 스코핑 적용 전 훅에서 레이스 3종이 재현되면(3/3) exit 0
//   green — 스코핑 적용 후 같은 대본에서 레이스가 부재하면(0/3) exit 0
//   solo  — 단독 세션 회귀 대본 (스코핑 적용 후 기대 기준)
//
// AgentDeck 이식 수정 세 가지:
//   ① 뿌리는 CLAUDE_PROJECT_DIR로만 받는다 — 환경변수가 없으면 실행을 거부한다. 실저장소의
//      98_Management/01_GateState/를 픽스처 실행이 오염시키지 않게 하는 안전장치다.
//   ② 리셋 게이트(31_reset-gate) 시나리오를 통째로 제거했다 — 코어 일곱 종에 없는 훅이다.
//      33·40·50의 세션 격리 회귀는 그대로 유지한다.
//   ③ 박힌 절대 경로(소스 프로브 파일·Bash cwd)를 ROOT 기준 경로로 바꿨다.
//
// 보호 규율: 시작 시 gate-config.json + 상태 파일 3종을 스냅샷하고 finally에서 원복한다.
// hook-log.jsonl은 append-only 증거 표면 — 절대 원복·삭제하지 않는다.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.env.CLAUDE_PROJECT_DIR || null;
if (!ROOT) {
  console.error('CLAUDE_PROJECT_DIR가 없다 — 이 러너는 미러 뿌리를 명시해야 돈다 (실저장소 상태 오염 방지).');
  process.exit(2);
}
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const FIX_DIR = path.join(HOOKS, 'fixtures', 'race-scoping');
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const LOG_FILE = path.join(GATE_DIR, 'hook-log.jsonl');
const CONFIG_FILE = path.join(GATE_DIR, 'gate-config.json');
const STOP_STATE = path.join(GATE_DIR, 'stop-gate.state.json');
const TDD_STATE = path.join(GATE_DIR, 'tdd-guard.state.json');
const PW_STATE = path.join(GATE_DIR, 'pass-watcher.state.json');

const TDD_HOOK = path.join(HOOKS, '33_tdd-guard.cjs');
const PW_HOOK = path.join(HOOKS, '40_pass-watcher.cjs');
const STOP_HOOK = path.join(HOOKS, '50_stop-gate.cjs');

const PREVIEW = path.join(FIX_DIR, '_MilestonePreview.md');
const PHASE1 = path.join(FIX_DIR, '01_Phase_1.md');
const PHASE2 = path.join(FIX_DIR, '02_Phase_2.md');
const WORKPIN = path.join(FIX_DIR, 'work-pin.md');
// 실존 불요 — 훅은 경로 산술만 한다. 저장소 소스 트리 안쪽이어야 관할 판정이 성립한다.
const PROBE_SRC = path.join(ROOT, '02_Project', '00_Source', 'renderer', 'src', '__race_fixture_probe__.ts');

const A = 'pipe-test-race-a';
const B = 'pipe-test-race-b';
const S = 'pipe-test-solo';

const PAST_STAMP = '2026-01-01T00:00:00+09:00';
const PASS_OLD = '- (기록 없음)';
const PASS_NEW = '- (기록 없음)\n- PASS 2026-08-08T12:00 — 모의 통과 (픽스처)';

const FIXTURE_CONFIG = {
  planPath: '.claude/hooks/fixtures/race-scoping/_MilestonePreview.md',
  workPinPath: '.claude/hooks/fixtures/race-scoping/work-pin.md',
};

// ---- 내장 템플릿 — 픽스처 md 원복은 runner가 fs로 직접 쓴다 (훅 안 걸림) ----
const TPL_PREVIEW = `# _MilestonePreview — race-scoping 픽스처

이 파일은 동시 세션 레이스 재현 픽스처의 pass-watcher 멤버십용 최소 Preview다.
실계획이 아니다 — 판정 근거는 hook-log.jsonl 줄과 상태 파일 실측이다.
`;
const TPL_PHASE1 = `## Phase 1 — 레이스 모의 · 태그: \`hooks\` · 의존: 없음

목표: 동시 세션 레이스 재현 픽스처의 장전 표적 — pass-watcher의 PASS 추기 감지를 실측한다 (실계획 아님).

검증 기록

- (기록 없음)
`;
const TPL_PHASE2 = `## Phase 2 — 레이스 모의 (source) · 태그: \`source\` · 의존: 없음

목표: 동시 세션 레이스 재현 픽스처의 tdd-guard 검증형 표적 — Green 증거 소비를 실측한다 (실계획 아님).

검증 기록

- (기록 없음)
`;
const TPL_WORKPIN = `# work-pin — race-scoping 픽스처

## 마감 요약

- 스탬프: ${PAST_STAMP}
- 바뀐 것: (모의)
- 내린 결정: (모의)
- 봐야 할 것: (모의)
`;

function ts() { // 훅과 동일 형식 — 로컬 오프셋 ISO (초 단위)
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

// ---- 보호 규율: 스냅샷 / 원복 ----
const PROTECTED = [CONFIG_FILE, STOP_STATE, TDD_STATE, PW_STATE];
function snapshot() {
  return PROTECTED.map(p => {
    let data = null;
    try { data = fs.readFileSync(p, 'utf8'); } catch (e) { /* 부재 = null */ }
    return { p, data };
  });
}
function restore(snap) {
  for (const { p, data } of snap) {
    try {
      if (data === null) { if (fs.existsSync(p)) fs.unlinkSync(p); }
      else fs.writeFileSync(p, data);
    } catch (e) { console.error(`원복 실패: ${p} — ${e.message}`); }
  }
}

function del(p) { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* 무해 */ } }
function restoreFixtures() {
  fs.writeFileSync(PREVIEW, TPL_PREVIEW);
  fs.writeFileSync(PHASE1, TPL_PHASE1);
  fs.writeFileSync(PHASE2, TPL_PHASE2);
  fs.writeFileSync(WORKPIN, TPL_WORKPIN);
}
function applyPass(file) { // PASS 줄 fs 실기록 — 40 PostToolUse 재구성과 일치해야 한다
  const t = fs.readFileSync(file, 'utf8');
  if (!t.includes(PASS_OLD)) throw new Error(`applyPass: ${file}에 「${PASS_OLD}」 부재`);
  fs.writeFileSync(file, t.replace(PASS_OLD, PASS_NEW));
}
function setStamp(stamp) {
  const t = fs.readFileSync(WORKPIN, 'utf8');
  fs.writeFileSync(WORKPIN, t.replace(/- 스탬프: \S+/, `- 스탬프: ${stamp}`));
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }

// ---- 훅 호출 ----
function runHook(script, payload, cliArgs) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: ROOT };
  delete env.MOODIE_SESSION_ROLE; // 역할 신호 오염 방지 — 합성 입력은 main 역할이어야 한다
  return spawnSync(process.execPath, [script, ...(cliArgs || [])], {
    input: payload === null ? '' : JSON.stringify(payload),
    cwd: ROOT, env, encoding: 'utf8',
  });
}

// ---- hook-log 단정 — 스텝 전 줄 수를 기록하고 추가된 줄만 파싱 ----
function logLines() {
  try { return fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.trim() !== ''); }
  catch (e) { return []; }
}
function parseLine(l) { try { return JSON.parse(l); } catch (e) { return null; } }

// ---- 합성 입력 빌더 ----
function bashGreen(session) {
  return {
    session_id: session, hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd: ROOT,
    tool_input: { command: 'npm run test' },
    tool_response: { stdout: ' RUN  vitest\n\n Test Files  405 passed | 6 skipped (411)\n      Tests  5454 passed | 6 skipped (5460)\n   Duration  30s\n' },
  };
}
function editPassInput(session, event, file) {
  return {
    session_id: session, hook_event_name: event, tool_name: 'Edit',
    tool_input: { file_path: file, old_string: PASS_OLD, new_string: PASS_NEW },
  };
}
function editSrcInput(session, event) {
  return {
    session_id: session, hook_event_name: event, tool_name: 'Edit',
    tool_input: { file_path: PROBE_SRC, old_string: 'const probe = 0;', new_string: 'const probe = 1;' },
  };
}
function stopInput(session) {
  const p = { hook_event_name: 'Stop' };
  if (session !== null) p.session_id = session;
  return p;
}

// ---- 스텝 엔진 ----
const results = [];
const repro = {}; // 재현 계수 표적 3종 — 기대와 무관하게 실측으로 채운다

function summarize(lines) {
  return lines.map(l => `${l.verdict || l.event || '?'}/${l.rule || '?'}/${l.session === undefined ? '(필드없음)' : (l.session === null ? '(무식별)' : l.session)}`).join(', ');
}
function matchLine(lines, e) {
  return lines.find(l => l.verdict === e.verdict && l.rule === e.rule
    && (l.session === undefined ? null : l.session) === (e.session === undefined ? null : e.session)
    && (!e.check || e.check(l)));
}
// expect: null = 무발화 기대, {verdict, rule, session, check?} = 해당 훅 줄 정확히 1개 기대
function step(name, script, hookName, payload, expect, opts) {
  opts = opts || {};
  const before = logLines().length;
  const res = runHook(script, payload, opts.cliArgs);
  const added = logLines().slice(before).map(parseLine).filter(Boolean);
  const mine = added.filter(l => l.hook === hookName);
  let ok, detail;
  if (expect === null) {
    ok = mine.length === 0;
    detail = `기대 무발화 vs 실측 ${mine.length === 0 ? '무발화' : summarize(mine)}`;
    if (mine.length > 0) detail += ` (ts ${mine[0].ts})`;
  } else {
    const m = matchLine(mine, expect);
    ok = !!m && mine.length === 1;
    detail = `기대 ${expect.verdict}/${expect.rule}/${expect.session === undefined || expect.session === null ? '(무식별)' : expect.session}`
      + ` vs 실측 ${mine.length ? summarize(mine) : '무발화'}`;
    if (mine.length) detail += ` (ts ${mine[mine.length - 1].ts})`;
  }
  if (res.status !== 0) { ok = false; detail += ` [exit ${res.status}${res.stderr ? ' · stderr: ' + res.stderr.trim().slice(0, 120) : ''}]`; }
  if (opts.reproKey) repro[opts.reproKey] = !!matchLine(mine, opts.reproMatch);
  results.push({ name, ok, detail });
  return { res, mine };
}
function assertState(name, fn) {
  let ok = false, detail = '';
  try { const r = fn(); ok = r.ok; detail = r.detail; }
  catch (e) { detail = `단정 실패 — ${String(e && e.message || e).slice(0, 120)}`; }
  results.push({ name, ok, detail });
}
function cliStep(name, script, cliArgs, checkFn) {
  const res = runHook(script, null, cliArgs);
  let ok = res.status === 0, detail = `exit ${res.status}`;
  if (ok && checkFn) {
    try { const r = checkFn(); ok = r.ok; detail += ` · ${r.detail}`; }
    catch (e) { ok = false; detail += ` · 단정 실패 — ${String(e && e.message || e).slice(0, 120)}`; }
  }
  results.push({ name, ok, detail });
}

// ==== 시나리오 T1 — Green 증거 교차 소비 ====
function scenarioT1(mode) {
  del(TDD_STATE);
  restoreFixtures();
  step('t1-green-a', TDD_HOOK, 'tdd-guard', bashGreen(A),
    { verdict: 'green-기록', rule: 'vitest-green', session: A });
  step('t1-b-pass', TDD_HOOK, 'tdd-guard', editPassInput(B, 'PreToolUse', PHASE2),
    mode === 'red'
      ? { verdict: 'allow', rule: 'green-유효', session: B }        // 재현① — B가 A의 Green을 소비
      : { verdict: 'deny', rule: 'green-증거-부재', session: B },
    { reproKey: 't1-b-pass', reproMatch: { verdict: 'allow', rule: 'green-유효', session: B } });
  step('t1-a-pass', TDD_HOOK, 'tdd-guard', editPassInput(A, 'PreToolUse', PHASE2),
    { verdict: 'allow', rule: 'green-유효', session: A });           // 자기 Green — 양쪽 allow
  step('t1-b-src', TDD_HOOK, 'tdd-guard', editSrcInput(B, 'PostToolUse'),
    { verdict: '통과', rule: '연속-미달', session: B });
  step('t1-a-pass2', TDD_HOOK, 'tdd-guard', editPassInput(A, 'PreToolUse', PHASE2),
    { verdict: 'deny', rule: 'green-실효', session: A });            // red: 전역 lastSourceEdit · green: 교차 스코프 실효 보강
}

// ==== 시나리오 T2 — 미동반 카운터 교차 차단 ====
function scenarioT2(mode) {
  del(TDD_STATE);
  restoreFixtures();
  step('t2-a-src1', TDD_HOOK, 'tdd-guard', editSrcInput(A, 'PostToolUse'),
    { verdict: '통과', rule: '연속-미달', session: A });
  step('t2-a-src2', TDD_HOOK, 'tdd-guard', editSrcInput(A, 'PostToolUse'),
    { verdict: '통과', rule: '연속-미달', session: A });
  const pre = step('t2-b-pre', TDD_HOOK, 'tdd-guard', editSrcInput(B, 'PreToolUse'),
    mode === 'red'
      ? { verdict: 'deny', rule: '테스트-미동반-차단', session: B } // 재현② — B가 A의 카운터에 차단
      : null,
    { reproKey: 't2-b-pre', reproMatch: { verdict: 'deny', rule: '테스트-미동반-차단', session: B } });
  const preDenied = !!matchLine(pre.mine, { verdict: 'deny', rule: '테스트-미동반-차단', session: B });
  if (!preDenied) { // 직전 스텝이 deny가 아니었을 때만 — B의 실편집 완료를 모의
    step('t2-b-post', TDD_HOOK, 'tdd-guard', editSrcInput(B, 'PostToolUse'),
      { verdict: '통과', rule: '연속-미달', session: B });
  }
  step('t2-a-pre3', TDD_HOOK, 'tdd-guard', editSrcInput(A, 'PreToolUse'),
    { verdict: 'deny', rule: '테스트-미동반-차단', session: A });     // 자기 카운터 규율은 양쪽 유지
}

// ==== 시나리오 S1 — 마감 장전 소비 (레이스 본체) ====
function scenarioS1(mode) {
  del(STOP_STATE); del(PW_STATE);
  restoreFixtures(); // work-pin 스탬프 = 과거값
  applyPass(PHASE1); // PASS 줄 fs 실기록 — PostToolUse 재구성 성립 조건
  step('s1-arm', PW_HOOK, 'pass-watcher', editPassInput(A, 'PostToolUse', PHASE1),
    { verdict: '장전', rule: 'PASS-추기-감지', session: A, check: l => l.armedBy === 'auto' });
  assertState('s1-arm-state', () => {
    const ss = readJson(STOP_STATE);
    if (mode === 'red') {
      const ok = ss.armed === true && ss.armedBy === 'auto';
      return { ok, detail: `기대 전역 장전 vs 실측 stop.armed=${ss.armed} (armedBy ${ss.armedBy})` };
    }
    const se = ss.sessions && ss.sessions[A];
    const ok = !!se && se.armed === true;
    return { ok, detail: `기대 sessions[${A}] 장전 vs 실측 stop=${JSON.stringify(se || null).slice(0, 80)}` };
  });
  assertState('s1-no-reset-state', () => {
    // 이식 회귀 — 리셋 장전 경로를 소거했으므로 reset-gate.state.json은 생기지 않아야 한다
    const p = path.join(GATE_DIR, 'reset-gate.state.json');
    const exists = fs.existsSync(p);
    return { ok: !exists, detail: `기대 reset-gate.state.json 부재 vs 실측 ${exists ? '생성됨' : '부재'}` };
  });
  setStamp(ts()); // 마감 요약 스탬프를 현재 시각으로 fs 갱신
  step('s1-b-stop', STOP_HOOK, 'stop-gate', stopInput(B),
    mode === 'red'
      ? { verdict: 'allow', rule: '마감-요약-실측', session: B }     // 재현③ — B가 A 몫의 마감 장전을 소비
      : null,
    { reproKey: 's1-b-stop', reproMatch: { verdict: 'allow', rule: '마감-요약-실측', session: B } });
  assertState('s1-b-stop-state', () => {
    const ss = readJson(STOP_STATE);
    if (mode === 'red') {
      return { ok: ss.armed === false, detail: `기대 armed=false(B가 소비) vs 실측 armed=${ss.armed}` };
    }
    const se = ss.sessions && ss.sessions[A];
    const ok = !!se && se.armed === true;
    return { ok, detail: `기대 sessions[${A}] 장전 유지 vs 실측 ${JSON.stringify(se || null).slice(0, 80)}` };
  });
  step('s1-a-stop', STOP_HOOK, 'stop-gate', stopInput(A),
    mode === 'red'
      ? null                                                          // 피해 실증 — 장전이 소비돼 A가 마감 요약 강제 없이 통과
      : { verdict: 'allow', rule: '마감-요약-실측', session: A });
  step('s1-a-stop2', STOP_HOOK, 'stop-gate', stopInput(A), null);
}

// ==== 시나리오 solo — 단독 세션 회귀 (스코핑 적용 후 기대 기준) ====
function scenarioSolo() {
  // -- 자동 장전 + 마감 사이클 --
  del(STOP_STATE); del(PW_STATE);
  restoreFixtures(); // work-pin 스탬프 = 과거값
  applyPass(PHASE1);
  step('solo-arm', PW_HOOK, 'pass-watcher', editPassInput(S, 'PostToolUse', PHASE1),
    { verdict: '장전', rule: 'PASS-추기-감지', session: S, check: l => l.armedBy === 'auto' });
  step('solo-stop-block', STOP_HOOK, 'stop-gate', stopInput(S),
    { verdict: 'block', rule: '마감-요약-미실측', session: S });
  setStamp(ts());
  step('solo-stop-allow', STOP_HOOK, 'stop-gate', stopInput(S),
    { verdict: 'allow', rule: '마감-요약-실측', session: S });        // 자기 스코프 자동 해제
  step('solo-stop-silent', STOP_HOOK, 'stop-gate', stopInput(S), null);
  // -- 수기 arm 회귀 (global 소비) --
  cliStep('solo-50-arm', STOP_HOOK, ['arm', 'race-fixture solo'], () => {
    // 수기 CLI는 v2 global 스코프에 쓴다
    const ss = readJson(STOP_STATE);
    const g = ss.global || {};
    return { ok: ss.schema === 2 && g.armed === true, detail: `schema=${ss.schema} global.armed=${g.armed}` };
  });
  setStamp(ts());
  step('solo-stop-manual', STOP_HOOK, 'stop-gate', stopInput(S),
    { verdict: 'allow', rule: '마감-요약-실측', session: S });        // 수기 장전은 global — 누구든 소비 가능해야 한다
  cliStep('solo-50-release', STOP_HOOK, ['release', 'race-fixture solo'], () => {
    const ss = readJson(STOP_STATE);
    const g = ss.global || {};
    const emptied = !ss.sessions || Object.keys(ss.sessions).length === 0;
    return { ok: g.armed === false && emptied, detail: `global.armed=${g.armed} sessions=${ss.sessions ? Object.keys(ss.sessions).length : '(부재)'}` };
  });
  // -- tdd 사이클 --
  del(TDD_STATE);
  restoreFixtures();
  step('solo-green', TDD_HOOK, 'tdd-guard', bashGreen(S),
    { verdict: 'green-기록', rule: 'vitest-green', session: S });
  step('solo-pass-allow', TDD_HOOK, 'tdd-guard', editPassInput(S, 'PreToolUse', PHASE2),
    { verdict: 'allow', rule: 'green-유효', session: S });
  step('solo-src1', TDD_HOOK, 'tdd-guard', editSrcInput(S, 'PostToolUse'),
    { verdict: '통과', rule: '연속-미달', session: S });
  step('solo-src2', TDD_HOOK, 'tdd-guard', editSrcInput(S, 'PostToolUse'),
    { verdict: '통과', rule: '연속-미달', session: S });
  step('solo-src3-pre', TDD_HOOK, 'tdd-guard', editSrcInput(S, 'PreToolUse'),
    { verdict: 'deny', rule: '테스트-미동반-차단', session: S });
  // -- v1 이행 검증 3종 --
  writeJson(STOP_STATE, { armed: true, since: PAST_STAMP, note: 'legacy', blocks: 0 }); // (a) v1 형식 직접 기록
  setStamp(ts());
  step('solo-v1-stop', STOP_HOOK, 'stop-gate', stopInput(S),
    { verdict: 'allow', rule: '마감-요약-실측', session: S });        // v1=global 이행
  writeJson(STOP_STATE, { armed: true, since: PAST_STAMP, note: 'legacy', blocks: 0 }); // (b) 같은 세팅
  setStamp(ts());
  step('solo-v1-stop-nosession', STOP_HOOK, 'stop-gate', stopInput(null),
    { verdict: 'allow', rule: '마감-요약-실측', session: null });     // 무식별=기존 경로
  writeJson(TDD_STATE, { lastGreen: { ts: PAST_STAMP, at: Date.parse(PAST_STAMP), cmd: 'npm run test', evidence: 'Test Files 1 passed' } }); // (c) tdd v1
  step('solo-v1-pass-deny', TDD_HOOK, 'tdd-guard', editPassInput(S, 'PreToolUse', PHASE2),
    { verdict: 'deny', rule: 'green-증거-부재', session: S });        // 새 세션은 자기 Green 필요 — 의도된 결과
}

// ==== 메인 ====
const mode = process.argv[2];
if (!['red', 'green', 'solo'].includes(mode)) {
  console.error('사용: CLAUDE_PROJECT_DIR=<미러 뿌리> node run.cjs red|green|solo');
  process.exit(2);
}

const REPRO_KEYS = ['t1-b-pass', 't2-b-pre', 's1-b-stop'];
const snap = snapshot();
let exitCode = 1;
try {
  writeJson(CONFIG_FILE, FIXTURE_CONFIG); // gate-config를 픽스처로 스왑 (finally에서 원복)
  if (mode === 'solo') {
    scenarioSolo();
  } else {
    scenarioT1(mode);
    scenarioT2(mode);
    scenarioS1(mode);
  }
  const fails = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'ok' : 'FAIL'} — ${r.name}: ${r.detail}`);
  if (mode === 'solo') {
    console.log(`\nsolo: ${results.length - fails.length}/${results.length} 충족`);
    exitCode = fails.length === 0 ? 0 : 1;
  } else {
    const n = REPRO_KEYS.filter(k => repro[k]).length;
    console.log(`\n재현 ${n}/${REPRO_KEYS.length} [${REPRO_KEYS.map(k => `${k}:${repro[k] ? '성립' : '불성립'}`).join(', ')}] · 스텝 ${results.length - fails.length}/${results.length} 충족`);
    exitCode = (fails.length === 0 && n === (mode === 'red' ? REPRO_KEYS.length : 0)) ? 0 : 1;
  }
} finally {
  restore(snap);
  restoreFixtures(); // 픽스처 md도 템플릿 상태로 되돌린다 — 다음 실행의 초기 조건 보장
}
process.exit(exitCode);
