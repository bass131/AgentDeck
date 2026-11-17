// M07 G10 병합 완료 감지(lib/waitMerge.mjs) — PR을 만든 세션이 뒤에서 걸어 두는 읽기 전용 감시다.
// 병합되면 MERGED 한 줄과 0, 병합 없이 닫히면 CLOSED 한 줄과 3, 읽기가 연달아 실패하면 ERROR 한 줄과 2로 끝난다.
// 출력은 세션을 깨우는 방아쇠일 뿐이고, 세션은 끝난 뒤 gh pr view로 다시 읽어 기록한다(헌법 11조).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WATCH_FIELDS, parsePrArg, viewArgs, waitForMerge } from '../lib/waitMerge.mjs';

const MERGE = 'fff022fd4cfaa224375ef72205b069bc207b1020', HEAD = '845bcce80442f70a292935d233b461aef39742fd';
const view = over => ({ code: 0, stdout: JSON.stringify({ state: 'OPEN', mergedAt: null, mergeCommit: null, mergedBy: null, headRefOid: HEAD, ...over }), stderr: '' });
const merged = view({ state: 'MERGED', mergedAt: '2026-11-17T23:24:34Z', mergeCommit: { oid: MERGE }, mergedBy: { login: 'bass131' } });
const fail = (msg = 'gh: Could not resolve to a PullRequest (HTTP 502)') => ({ code: 1, stdout: '', stderr: msg + '\n' });
function script(results) {
  const calls = [];
  const gh = async (args, cwd) => { calls.push({ args, cwd }); const r = results[Math.min(calls.length - 1, results.length - 1)]; return typeof r === 'function' ? r() : r; };
  gh.calls = calls;
  return gh;
}
const sleeps = [];
const sleep = async ms => { sleeps.push(ms); };
const run = (gh, over = {}) => waitForMerge({ pr: 76, gh, cwd: 'C:/repo', sleep, ...over });

test('reads only: gh pr view with a fixed field list, never a write call', () => {
  assert.equal(WATCH_FIELDS, 'state,mergedAt,mergeCommit,mergedBy,headRefOid');
  assert.deepEqual(viewArgs(76), ['pr', 'view', '76', '--json', WATCH_FIELDS]);
});

test('an already merged PR ends at once with a MERGED line and code 0', async () => {
  const gh = script([merged]);
  const r = await run(gh);
  assert.equal(r.code, 0); assert.equal(r.kind, 'merged');
  assert.equal(r.line, `MERGED pr=76 commit=${MERGE} at=2026-11-17T23:24:34Z by=bass131 head=${HEAD}`);
  assert.equal(gh.calls.length, 1); assert.deepEqual(gh.calls[0], { args: viewArgs(76), cwd: 'C:/repo' });
});

test('open PRs are polled at the interval until merged', async () => {
  sleeps.length = 0;
  const gh = script([view(), view(), merged]);
  const r = await run(gh, { intervalMs: 30000 });
  assert.equal(r.kind, 'merged'); assert.equal(gh.calls.length, 3);
  assert.deepEqual(sleeps, [30000, 30000]);
});

test('closed without merge ends with CLOSED and code 3', async () => {
  const r = await run(script([view(), view({ state: 'CLOSED' })]));
  assert.equal(r.code, 3); assert.equal(r.kind, 'closed');
  assert.equal(r.line, `CLOSED pr=76 head=${HEAD}`);
});

test('transient read failures are retried; a success resets the count', async () => {
  const gh = script([fail(), fail(), view(), fail(), merged]);
  const r = await run(gh, { maxErrors: 3 });
  assert.equal(r.kind, 'merged'); assert.equal(gh.calls.length, 5);
});

test('maxErrors consecutive failures end with ERROR and code 2; bad JSON and unknown states count as failures', async () => {
  const r = await run(script([fail('gh: boom\u0007\u001b[31m (HTTP 500)')]), { maxErrors: 4 });
  assert.equal(r.code, 2); assert.equal(r.kind, 'error');
  assert.match(r.line, /^ERROR pr=76 reason=gh: boom/);
  assert.doesNotMatch(r.line, /[\u0000-\u001f]/, '제어문자는 출력에 남기지 않는다');
  const gh = script([{ code: 0, stdout: 'not json', stderr: '' }, view({ state: 'WEIRD' }), { code: 0, stdout: 'null', stderr: '' }]);
  const r2 = await run(gh, { maxErrors: 3 });
  assert.equal(r2.kind, 'error'); assert.equal(gh.calls.length, 3);
  const r3 = await run(script([{ code: 0, stdout: '', stderr: '' }]), { maxErrors: 1 });
  assert.equal(r3.kind, 'error');
});

test('merged values are sanitized: non-hex SHAs, odd logins and dates become unknown', async () => {
  const r = await run(script([view({ state: 'MERGED', mergedAt: 'yesterday; rm -rf', mergeCommit: { oid: 'xyz' }, mergedBy: { login: 'a b\nc' }, headRefOid: '$(id)' })]));
  assert.equal(r.kind, 'merged');
  assert.equal(r.line, 'MERGED pr=76 commit=unknown at=unknown by=unknown head=unknown');
});

test('the PR argument must be a positive integer', () => {
  assert.equal(parsePrArg(['76']), 76);
  for (const bad of [[], ['0'], ['-1'], ['7.5'], ['76abc'], ['abc'], ['1234567890'], ['76', 'extra']]) assert.equal(parsePrArg(bad), null, JSON.stringify(bad));
});

test('the CLI entry runs from the repo with the real gh runner and exits with the result code', async () => {
  const src = await readFile(new URL('../wait-merge.mjs', import.meta.url), 'utf8');
  assert.match(src, /parsePrArg\(process\.argv\.slice\(2\)\)/);
  assert.match(src, /ghRunner/);
  assert.match(src, /process\.exitCode = /);
  const lib = await readFile(new URL('../lib/waitMerge.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(lib, /merge-async|-X\s*PUT|--method|pr', 'merge|writeFile|appendFile/, '감시 모듈에 쓰기 호출이 없다');
});
