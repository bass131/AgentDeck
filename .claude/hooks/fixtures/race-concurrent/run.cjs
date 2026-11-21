#!/usr/bin/env node
// 두 33_tdd-guard 프로세스를 seam 장벽에서 함께 들여보내 겹침 자체를 만든다 — race-scoping/run.cjs의 순차 대본과 달리 비동기 spawn 2건이다.
// 사용: CLAUDE_PROJECT_DIR=<미러 뿌리> node run.cjs post-read|pre-lock. post-read는 임계구간 겹침과 엔트리 손실이 함께 보이면,
// pre-lock은 임계구간이 겹치지 않고 전 스코프가 무손실이면 exit 0이다. CLAUDE_PROJECT_DIR가 없으면 실저장소를 지키려고 실행을 거부한다.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

const ROOT = process.env.CLAUDE_PROJECT_DIR || null;
if (!ROOT) {
  console.error('CLAUDE_PROJECT_DIR가 없다 — 이 러너는 미러 뿌리를 명시해야 돈다 (실저장소 상태 오염 방지).');
  process.exit(2);
}
const MODE = process.argv[2];
if (!['post-read', 'pre-lock'].includes(MODE)) {
  console.error('사용: CLAUDE_PROJECT_DIR=<미러 뿌리> node run.cjs post-read|pre-lock');
  process.exit(2);
}

const HOOK = path.join(ROOT, '.claude', 'hooks', '33_tdd-guard.cjs');
const GATE_DIR = path.join(ROOT, '98_Management', '01_GateState');
const STATE = path.join(GATE_DIR, 'tdd-guard.state.json');
const A = 'race-concurrent-a';
const B = 'race-concurrent-b';
const SEED = 'race-concurrent-seed';
const GREEN = ' RUN  vitest\n\n Test Files  411 passed | 6 skipped (417)\n      Tests  5465 passed (5477)\n';

const nowHr = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seedState() {
  fs.mkdirSync(GATE_DIR, { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify({
    schema: 2,
    global: { streak: 0, note: '전역 스코프 씨앗 — 무손실 판정 대상' },
    sessions: { [SEED]: { streak: 0, at: Date.now(), note: '다른 세션 씨앗 — 무손실 판정 대상' } },
  }, null, 2) + '\n');
}
function launch(session, barrierDir) {
  const payload = {
    session_id: session, hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd: ROOT,
    tool_input: { command: 'npm run test' }, tool_response: { stdout: GREEN },
  };
  const env = Object.assign({}, process.env, {
    CLAUDE_PROJECT_DIR: ROOT,
    AGENTDECK_STATE_SEAM: `${MODE}:${barrierDir}`,
    AGENTDECK_STATE_SEAM_TIMEOUT: '15000',
  });
  const startAt = nowHr();
  const child = spawn(process.execPath, [HOOK], { env, cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(JSON.stringify(payload));
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += String(d); });
  const done = new Promise((res) => child.on('close', (code) => res({ session, code, startAt, exitAt: nowHr(), stderr })));
  return { child, done };
}
function overlap(a, b) { // [start, end] 두 구간의 겹침 길이 (ms) — 0 이하면 비겹침
  if (!a || !b) return null;
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]);
}

(async () => {
  const barrierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-race-'));
  const out = { mode: MODE, barrier: barrierDir };
  let exitCode = 1;
  try {
    seedState();
    const procs = [launch(A, barrierDir), launch(B, barrierDir)];

    // 두 프로세스가 모두 장벽에 도착할 때까지 기다린 뒤에만 go를 만든다 — 함께 들여보내는 순간이다
    const deadline = Date.now() + 20000;
    let readyCount = 0;
    while (Date.now() < deadline) {
      readyCount = fs.readdirSync(barrierDir).filter((n) => n.startsWith('ready.')).length;
      if (readyCount >= 2) break;
      await sleep(10);
    }
    out.readyObserved = readyCount;
    if (readyCount >= 2) {
      out.goAt = nowHr();
      fs.writeFileSync(path.join(barrierDir, 'go'), '');
    }
    const results = await Promise.all(procs.map((p) => p.done));
    out.procs = results.map((r) => ({ session: r.session, code: r.code, live: [r.startAt, r.exitAt] }));

    const timelines = fs.readdirSync(barrierDir).filter((n) => n.startsWith('timeline.'))
      .map((n) => { try { return JSON.parse(fs.readFileSync(path.join(barrierDir, n), 'utf8')) } catch (e) { return null } })
      .filter(Boolean);
    out.timelines = timelines.map((t) => ({ pid: t.pid, session: t.session, readAt: t.readAt, readyAt: t.readyAt, goAt: t.goAt, lockAt: t.lockAt, writeAt: t.writeAt, renameAt: t.renameAt, unlockAt: t.unlockAt, error: t.error }));

    // 임계구간은 post-read에서 보호 없는 read→rename 전체, pre-lock에서 잠금 보유 구간이다.
    // Windows는 같은 대상으로의 동시 rename을 EPERM으로 거부해 renameAt이 없을 수 있다 — 그 쪽은 끝을 writeAt으로 잡는다(겹침의 보수적 하한).
    // rename 밖의 쓰기 실패는 동시성과 무관하니 끝점 없이 판정불능으로 두고 오류 원문을 otherWriteErrors로 드러낸다.
    const renameRefused = (t) => typeof t.error === 'string' && /\brename\b/.test(t.error);
    const critEnd = (t) => (t.renameAt !== undefined ? t.renameAt : (renameRefused(t) ? t.writeAt : undefined));
    const crit = timelines.map((t) => (MODE === 'post-read'
      ? [t.readAt, critEnd(t)]
      : [t.lockAt, t.unlockAt !== undefined ? t.unlockAt : t.renameAt]))
      .filter((c) => c.every((v) => typeof v === 'number'));
    out.renameRefused = timelines.filter(renameRefused).length;
    out.otherWriteErrors = timelines.filter((t) => t.error && !renameRefused(t)).map((t) => t.error);
    out.criticalOverlapMs = crit.length === 2 ? overlap(crit[0], crit[1]) : null;
    out.criticalOverlap = out.criticalOverlapMs !== null && out.criticalOverlapMs > 0;
    const live = out.procs.map((p) => p.live);
    out.liveOverlapMs = overlap(live[0], live[1]);
    out.liveOverlap = out.liveOverlapMs !== null && out.liveOverlapMs > 0;

    let final = null;
    try { final = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { /* 아래 판정에서 손실로 잡힌다 */ }
    const sessions = (final && final.sessions) || {};
    const expected = [SEED, A, B];
    out.survivors = expected.filter((k) => !!sessions[k]);
    out.lost = expected.filter((k) => !sessions[k]);
    out.globalSurvived = !!(final && final.global);
    if (!out.globalSurvived) out.lost = out.lost.concat(['global']);

    out.timedOut = results.some((r) => r.code === 97);
    const allExited0 = results.every((r) => r.code === 0);
    if (MODE === 'post-read') {
      out.expectation = '보호 없는 임계구간 겹침 + 엔트리 손실 ≥ 1';
      out.pass = allExited0 && out.criticalOverlap === true && out.lost.length >= 1;
    } else {
      out.expectation = '생존 구간 겹침 + 보호 임계구간 비겹침 + 전 스코프 무손실';
      out.pass = allExited0 && out.liveOverlap === true && out.criticalOverlap === false && out.lost.length === 0;
    }
    exitCode = out.pass ? 0 : 1;
  } catch (e) {
    out.error = String((e && e.stack) || e).slice(0, 400);
  } finally {
    try { fs.rmSync(barrierDir, { recursive: true, force: true }); } catch (e) { /* 무해 */ }
  }
  console.log(JSON.stringify(out, null, 2));
  process.exit(exitCode);
})();
