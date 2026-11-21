#!/usr/bin/env node
// 33·40·50 훅이 상태 파일을 갱신하는 유일한 길 — 잠금 파일을 `wx`(O_EXCL)로 원자 생성해 잡고, read→변형→원자 교체를 그 안에서 돈다.
// 잠금이 없으면 두 프로세스가 같은 구상태를 읽고 각자 써서 나중 쓰기가 앞선 세션 엔트리를 지운다(마지막-쓰기-승).
// 시험 전용 seam(AGENTDECK_STATE_SEAM=<post-read|pre-lock>:<장벽 디렉터리>, 계약은 state-seam.test.mjs)은 미설정이면 통째로 무동작이다.
// post-read는 잠금 없는 옛 경로를 재현하고 pre-lock은 잠금 앞에서 만난다 — 잠금 아래에 장벽을 두면 첫 프로세스가 잠금을 쥔 채 교착된다.
'use strict';
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// timeOrigin 기준이라 프로세스 사이에서도 같은 축으로 비교된다 (ms, 소수부 유지)
function nowHr() { return performance.timeOrigin + performance.now(); }
function num(env, dflt) { const v = Number(process.env[env]); return Number.isFinite(v) && v > 0 ? v : dflt; }
function sleepSync(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function parseSeam() {
  const raw = process.env.AGENTDECK_STATE_SEAM;
  if (!raw) return null;
  const i = raw.indexOf(':'); // 윈도 드라이브 문자를 살리려 첫 콜론에서만 자른다
  if (i < 0) return null;
  const mode = raw.slice(0, i), dir = raw.slice(i + 1);
  if ((mode !== 'post-read' && mode !== 'pre-lock') || !dir) return null;
  return { mode, dir, timeout: num('AGENTDECK_STATE_SEAM_TIMEOUT', 10000) };
}
function writeTimeline(seam, tl) {
  try {
    fs.mkdirSync(seam.dir, { recursive: true });
    fs.writeFileSync(path.join(seam.dir, `timeline.${process.pid}.json`), JSON.stringify(tl, null, 2) + '\n');
  } catch (e) { /* 장벽 산출물 기록 실패는 판정 표면 밖 */ }
}
function barrierWait(seam, tl) {
  fs.mkdirSync(seam.dir, { recursive: true });
  tl.readyAt = nowHr();
  fs.writeFileSync(path.join(seam.dir, `ready.${process.pid}`), JSON.stringify({ pid: process.pid, at: tl.readyAt }));
  const goFile = path.join(seam.dir, 'go');
  const deadline = Date.now() + seam.timeout;
  while (!fs.existsSync(goFile)) {
    if (Date.now() >= deadline) {
      tl.timeoutAt = nowHr();
      tl.exit = 97;
      try { fs.writeFileSync(path.join(seam.dir, `timeout.${process.pid}`), JSON.stringify(tl)); } catch (e) { /* 무해 */ }
      writeTimeline(seam, tl);
      process.exit(97); // 비정상 종료 — 러너가 대본 실패를 즉시 안다
    }
    sleepSync(5);
  }
  tl.goAt = nowHr();
}

function lockPathOf(file) { return file + '.lock'; }
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e && e.code === 'EPERM'; } // EPERM = 살아 있으나 권한 없음
}
function isStale(lockFile, staleMs) {
  let st = null;
  try { st = fs.statSync(lockFile); } catch (e) { return false; } // 이미 사라졌다 — 회수 대상 아님
  if (Date.now() - st.mtimeMs > staleMs) return true;
  let owner = null;
  try { owner = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch (e) { return false; } // 판독 불능은 회수하지 않는다
  return typeof owner.pid === 'number' && !pidAlive(owner.pid);
}
function acquireLock(file) {
  const lockFile = lockPathOf(file);
  const timeout = num('AGENTDECK_STATE_LOCK_TIMEOUT', 5000);
  const staleMs = num('AGENTDECK_STATE_LOCK_STALE', 15000);
  const deadline = Date.now() + timeout;
  let recovered = 0;
  for (;;) {
    try {
      fs.mkdirSync(path.dirname(lockFile), { recursive: true });
      const fd = fs.openSync(lockFile, 'wx'); // O_EXCL — 생성 자체가 원자 획득이다
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      fs.closeSync(fd);
      return { lockFile, recovered };
    } catch (e) {
      if (!e || e.code !== 'EEXIST') throw e;
      if (isStale(lockFile, staleMs)) {
        try { fs.unlinkSync(lockFile); recovered++; continue; } catch (e2) { /* 경합 — 다음 회차에서 다시 본다 */ }
      }
      if (Date.now() >= deadline) {
        const err = new Error(`상태 잠금 획득 timeout (${timeout}ms) — ${path.basename(lockFile)}`);
        err.code = 'ELOCKTIMEOUT';
        throw err;
      }
      sleepSync(5);
    }
  }
}
function releaseLock(lock) { try { fs.unlinkSync(lock.lockFile); } catch (e) { /* 이미 회수됐을 수 있다 */ } }

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function atomicWrite(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, file); // 원자 교체 — 부분 기록 파일이 관측되지 않게
}

// mutate(raw)는 잠금 안에서 디스크로부터 방금 읽은 값을 받는다 — 잠금 밖의 재읽기-병합은 다시 마지막-쓰기-승이다.
// 실패해도 예외를 던지지 않고 { ok: false, error }를 돌려준다 — 훅은 로그만 남긴다.
function updateState(file, mutate, meta) {
  const seam = parseSeam();
  const tl = Object.assign({ pid: process.pid, mode: seam ? seam.mode : null, file: path.basename(file), startAt: nowHr() }, meta || {});
  try {
    if (seam && seam.mode === 'post-read') {
      const raw = readJson(file); tl.readAt = nowHr();
      const next = mutate(raw);
      barrierWait(seam, tl);
      tl.writeAt = nowHr();
      atomicWrite(file, next);
      tl.renameAt = nowHr(); tl.exit = 0;
      writeTimeline(seam, tl);
      return { ok: true, state: next, error: null, timeline: tl };
    }
    if (seam && seam.mode === 'pre-lock') barrierWait(seam, tl);
    let lock = null;
    try {
      lock = acquireLock(file);
      tl.lockAt = nowHr(); tl.lockRecovered = lock.recovered;
      const raw = readJson(file); tl.readAt = nowHr();
      const next = mutate(raw);
      tl.writeAt = nowHr();
      atomicWrite(file, next);
      tl.renameAt = nowHr(); tl.exit = 0;
      return { ok: true, state: next, error: null, timeline: tl };
    } finally {
      if (lock) { releaseLock(lock); tl.unlockAt = nowHr(); }
      if (seam) writeTimeline(seam, tl);
    }
  } catch (e) {
    tl.error = String((e && e.message) || e).slice(0, 200);
    if (seam) writeTimeline(seam, tl);
    return { ok: false, state: null, error: tl.error, timeline: tl };
  }
}

module.exports = { updateState, acquireLock, releaseLock, isStale, lockPathOf, parseSeam, nowHr };
