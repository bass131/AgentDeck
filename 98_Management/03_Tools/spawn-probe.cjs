#!/usr/bin/env node
/**
 * spawn-probe.cjs — 함정 5(Enter 미제출) 자동 프로브 (유지 대장 MA-02)
 *
 * worker-start 직후 프롬프트가 터미널에 타이핑만 되고 제출되지 않는 결함(M04 실측 7/17회)을
 * 판정·수복한다. 코디네이터 전용 — 워커에게 orca CLI 직접 호출은 금지다(분업 라우팅 규격).
 *
 * 사용: node spawn-probe.cjs --dispatch <dispatch_id> [--first-wait 90] [--recheck-wait 45] [--max-retries 2]
 *
 * 절차: first-wait초 대기 → worker-read --json의 source 판정
 *   - "transcript" → 정상 제출. verdict=submitted
 *   - "terminal"   → 함정 5. worker-show에서 터미널 핸들 추출 → terminal send --enter →
 *                    recheck-wait초 후 재판정. 수복되면 verdict=recovered, max-retries 소진 시 verdict=stuck
 *
 * 출력: 마지막 줄에 JSON 한 줄 {verdict, dispatch, rounds, sourceHistory}. exit 0 = 제출 확인, 1 = 수동 개입 필요.
 */
'use strict';

const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const opts = { firstWait: 90, recheckWait: 45, maxRetries: 2, dispatch: null };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--dispatch') { opts.dispatch = val; i++; }
    else if (key === '--first-wait') { opts.firstWait = Number(val); i++; }
    else if (key === '--recheck-wait') { opts.recheckWait = Number(val); i++; }
    else if (key === '--max-retries') { opts.maxRetries = Number(val); i++; }
  }
  if (!opts.dispatch || !/^[A-Za-z0-9_-]+$/.test(opts.dispatch)) {
    console.error('사용법: node spawn-probe.cjs --dispatch <dispatch_id> [--first-wait s] [--recheck-wait s] [--max-retries n]');
    process.exit(2);
  }
  return opts;
}

function sleepSec(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function orcaJson(args) {
  // 핸들·dispatch id는 영숫자 검증을 거치므로 shell 경유가 안전하다 (Windows .cmd 셔임 대응).
  // 단일 문자열 형태는 DEP0190(shell:true + args 배열) 회피 — M04에서 driver를 폐기시킨 그 deprecation이다.
  const res = spawnSync(['orca', ...args, '--json'].join(' '), { shell: true, encoding: 'utf8', timeout: 60000 });
  if (res.error) throw new Error(`orca 실행 실패: ${res.error.message}`);
  const raw = `${res.stdout || ''}`;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`orca ${args.join(' ')} — JSON 출력 없음 (exit ${res.status}): ${raw.slice(0, 200)} ${res.stderr ? res.stderr.slice(0, 200) : ''}`);
  }
  return JSON.parse(raw.slice(start, end + 1));
}

/** 객체 트리에서 술어를 만족하는 첫 (키, 값) 쌍을 찾는다 — 필드 위치가 버전에 따라 움직여도 견디게 */
function deepFind(node, predicate, path = []) {
  if (node === null || typeof node !== 'object') return null;
  for (const [key, value] of Object.entries(node)) {
    if (predicate(key, value)) return { key, value, path: [...path, key] };
    const nested = deepFind(value, predicate, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

function readSource(dispatch) {
  const data = orcaJson(['orchestration', 'worker-read', '--dispatch', dispatch]);
  const hit = deepFind(data, (k, v) => k === 'source' && typeof v === 'string');
  if (!hit) throw new Error('worker-read 출력에서 source 필드를 찾지 못했다');
  return hit.value;
}

function findTerminalHandle(dispatch) {
  const data = orcaJson(['orchestration', 'worker-show', '--dispatch', dispatch]);
  const hit = deepFind(data, (k, v) =>
    /terminal/i.test(k) && !/count|status|title/i.test(k) && typeof v === 'string' && /^[A-Za-z0-9:_-]+$/.test(v));
  if (!hit) throw new Error(`worker-show 출력에서 터미널 핸들을 찾지 못했다: ${JSON.stringify(data).slice(0, 300)}`);
  return hit.value;
}

function main() {
  const opts = parseArgs(process.argv);
  const sourceHistory = [];
  let rounds = 0;

  console.error(`[probe] dispatch=${opts.dispatch} — 첫 판정까지 ${opts.firstWait}초 대기`);
  sleepSec(opts.firstWait);

  let source = readSource(opts.dispatch);
  sourceHistory.push(source);

  while (source !== 'transcript' && rounds < opts.maxRetries) {
    rounds++;
    console.error(`[probe] source=${source} → 함정 5 판정. Enter 재제출 (${rounds}/${opts.maxRetries})`);
    const handle = findTerminalHandle(opts.dispatch);
    orcaJson(['terminal', 'send', '--terminal', handle, '--enter']);
    sleepSec(opts.recheckWait);
    source = readSource(opts.dispatch);
    sourceHistory.push(source);
  }

  const verdict = source === 'transcript' ? (rounds === 0 ? 'submitted' : 'recovered') : 'stuck';
  console.log(JSON.stringify({ verdict, dispatch: opts.dispatch, rounds, sourceHistory }));
  process.exit(verdict === 'stuck' ? 1 : 0);
}

main();
