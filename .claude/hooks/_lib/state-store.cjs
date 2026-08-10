#!/usr/bin/env node
// 게이트 상태 파일 공용 쓰기 헬퍼 (M02 Phase 3 Step 7·9) — 33·40·50이 이 모듈로만 상태를 갱신한다.
//
// 두 가지를 소유한다.
//   ① 배타 잠금 (안 A) — 잠금 파일을 `wx`(O_EXCL)로 원자 생성해 획득하고, read→변형→원자 교체 전체를
//      잠금 안에서 돈다. 획득 실패는 재시도하며 획득 timeout과 stale-lock 복구(잠금 파일의 나이와
//      기록된 pid의 생존 여부로 고아 판정 후 회수)를 갖는다. 종전에는 잠금이 없어 두 프로세스가 같은
//      구상태를 읽고 각자 쓰면 나중 쓰기가 앞선 세션 엔트리를 지웠다 (마지막-쓰기-승).
//   ② 테스트 전용 seam — 두 프로세스를 임계구간 문턱에서 만나게 하는 장벽이다. 환경변수로만 발동하고
//      미설정이면 이 파일의 seam 경로는 통째로 무동작이다 (장벽 파일도 타임라인도 만들지 않는다).
//
// 계약 (state-seam.test.mjs가 소유):
//   AGENTDECK_STATE_SEAM=<mode>:<장벽 디렉터리>   mode ∈ post-read | pre-lock
//   AGENTDECK_STATE_SEAM_TIMEOUT=<ms>            기본 10000 — 초과 시 timeout.<pid> 남기고 exit 97
//   AGENTDECK_STATE_LOCK_TIMEOUT=<ms>            잠금 획득 상한, 기본 5000
//   AGENTDECK_STATE_LOCK_STALE=<ms>              고아 잠금 판정 나이, 기본 15000
//
// 두 모드로 나누는 이유는 교착 회피다 — 배타 잠금 아래에서 post-read 장벽을 쓰면 첫 프로세스가 잠금을
// 쥔 채 go를 기다리고 둘째는 잠금에 막혀 ready를 못 내 러너가 영원히 대기한다. 그래서 post-read는
// **보호 없는** read→write 경로를 재현하는 모드이고(이 Phase의 수리 이전 의미론 그대로), pre-lock은
// 잠금 획득 시도 전에서 만나 수리 후 경로를 겨눈다.
'use strict';
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// 단조 고해상도 시각 — timeOrigin 기준이라 프로세스 사이에서도 같은 축으로 비교된다 (ms, 소수부 유지)
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
// 장벽 — ready.<pid>를 내고 go가 생길 때까지 멈춘다. timeout이면 표식을 남기고 비정상 종료한다.
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

// ---- 배타 잠금 (안 A) -------------------------------------------------------
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
      if (isStale(lockFile, staleMs)) { // 고아 잠금 회수 — 나이 초과 또는 기록된 pid 사망
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

// 상태 파일 갱신 — mutate(raw)가 「디스크에서 방금 읽은 값」을 받아 저장할 값을 돌려준다.
// 단순 재읽기-병합이 아니라 잠금 보유 구간 안에서 읽고 쓰는 것이 핵심이다: 두 프로세스가 같은
// 구상태를 재읽으면 병합을 해도 다시 마지막-쓰기-승이다.
// 돌려주는 값은 { ok, state, error, timeline }이며 실패해도 예외를 던지지 않는다 — 훅은 로그만 남긴다.
function updateState(file, mutate, meta) {
  const seam = parseSeam();
  const tl = Object.assign({ pid: process.pid, mode: seam ? seam.mode : null, file: path.basename(file), startAt: nowHr() }, meta || {});
  try {
    if (seam && seam.mode === 'post-read') {
      // 무보호 경로 — 잠금 없이 read → 장벽 → write. 이 Phase의 수리 이전 33·40·50 쓰기 의미론 그대로다.
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
