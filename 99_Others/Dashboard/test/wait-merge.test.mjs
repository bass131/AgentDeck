// M07 G10 병합 완료 감지(lib/waitMerge.mjs) — PR을 만든 세션이 뒤에서 걸어 두는 읽기 전용 감시다.
// 병합되면 MERGED 한 줄과 0, 병합 없이 닫히면 CLOSED 한 줄과 3, 읽기 실패가 영구적이거나 일시 실패가 이어지면 ERROR 한 줄과 2로 끝난다.
// 출력은 세션을 깨우는 방아쇠일 뿐이고, 세션은 끝난 뒤 gh pr view로 다시 읽어 기록한다(헌법 11조).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WATCH_FIELDS, parsePrArg, viewArgs, waitForMerge, isPermanent, MAX_INTERVAL_MS } from '../lib/waitMerge.mjs';

const MERGE = 'fff022fd4cfaa224375ef72205b069bc207b1020', HEAD = '845bcce80442f70a292935d233b461aef39742fd';
const REPO = 'bass131/AgentDeck';
const view = over => ({ code: 0, stdout: JSON.stringify({ state: 'OPEN', mergedAt: null, mergeCommit: null, mergedBy: null, headRefOid: HEAD, ...over }), stderr: '' });
const merged = view({ state: 'MERGED', mergedAt: '2026-11-17T23:24:34Z', mergeCommit: { oid: MERGE }, mergedBy: { login: 'bass131' } });
const fail = (msg = 'gh: connection reset (HTTP 502)') => ({ code: 1, stdout: '', stderr: msg + '\n' });
function script(results) {
  const calls = [];
  const gh = async (args, cwd) => { calls.push({ args, cwd }); const r = results[Math.min(calls.length - 1, results.length - 1)]; return typeof r === 'function' ? r() : r; };
  gh.calls = calls;
  return gh;
}
function sleeper() { const s = async ms => { s.calls.push(ms); }; s.calls = []; return s; }
const run = (gh, over = {}) => waitForMerge({ pr: 76, repo: REPO, gh, cwd: 'C:/repo', sleep: sleeper(), ...over });

test('reads only: gh pr view pinned to the origin repo with a fixed field list', () => {
  assert.equal(WATCH_FIELDS, 'state,mergedAt,mergeCommit,mergedBy,headRefOid');
  assert.deepEqual(viewArgs(76, REPO), ['pr', 'view', '76', '--repo', REPO, '--json', WATCH_FIELDS]);
});

test('without a repo it ends at once with ERROR (never reads a PR of whatever repo gh would guess)', async () => {
  const gh = script([merged]);
  const r = await run(gh, { repo: null });
  assert.equal(r.kind, 'error'); assert.equal(r.code, 2); assert.equal(gh.calls.length, 0);
});

test('an already merged PR ends at once with a MERGED line and code 0', async () => {
  const gh = script([merged]);
  const r = await run(gh);
  assert.equal(r.code, 0); assert.equal(r.kind, 'merged');
  assert.equal(r.line, `MERGED pr=76 commit=${MERGE} at=2026-11-17T23:24:34Z by=bass131 head=${HEAD}`);
  assert.equal(gh.calls.length, 1); assert.deepEqual(gh.calls[0], { args: viewArgs(76, REPO), cwd: 'C:/repo' });
});

test('open PRs are polled at the interval until merged', async () => {
  const sleep = sleeper();
  const gh = script([view(), view(), merged]);
  const r = await run(gh, { intervalMs: 30000, sleep });
  assert.equal(r.kind, 'merged'); assert.equal(gh.calls.length, 3);
  assert.deepEqual(sleep.calls, [30000, 30000]);
});

test('closed without merge ends with CLOSED and code 3', async () => {
  const r = await run(script([view(), view({ state: 'CLOSED' })]));
  assert.equal(r.code, 3); assert.equal(r.kind, 'closed');
  assert.equal(r.line, `CLOSED pr=76 head=${HEAD}`);
});

test('transient failures back off (doubling, capped) and a success resets both the count and the interval', async () => {
  const sleep = sleeper();
  const gh = script([fail(), fail(), view(), fail(), merged]);
  const r = await run(gh, { maxErrors: 3, intervalMs: 30000, sleep });
  assert.equal(r.kind, 'merged'); assert.equal(gh.calls.length, 5);
  assert.deepEqual(sleep.calls, [60000, 120000, 30000, 60000]);
  const s2 = sleeper();
  await run(script([fail()]), { maxErrors: 8, intervalMs: 30000, sleep: s2 });
  assert.ok(s2.calls.every(ms => ms <= MAX_INTERVAL_MS)); assert.equal(s2.calls.at(-1), MAX_INTERVAL_MS);
});

test('maxErrors consecutive transient failures end with ERROR and code 2; bad JSON and unknown states count as failures', async () => {
  const r = await run(script([fail('gh: boom\u0007\u001b[31m (HTTP 500)')]), { maxErrors: 4 });
  assert.equal(r.code, 2); assert.equal(r.kind, 'error');
  assert.match(r.line, /^ERROR pr=76 transient reason=gh: boom/);
  assert.doesNotMatch(r.line, /[\u0000-\u001f]/, '제어문자는 출력에 남기지 않는다');
  const gh = script([{ code: 0, stdout: 'not json', stderr: '' }, view({ state: 'WEIRD' }), { code: 0, stdout: 'null', stderr: '' }]);
  const r2 = await run(gh, { maxErrors: 3 });
  assert.equal(r2.kind, 'error'); assert.equal(gh.calls.length, 3);
});

test('permanent failures end on the first read (measured gh messages, 2026-11-18)', async () => {
  for (const msg of [
    'GraphQL: Could not resolve to a PullRequest with the number of 999999. (repository.pullRequest)',
    'failed to run git: fatal: not a git repository (or any of the parent directories): .git',
    'HTTP 401: Bad credentials (https://api.github.com/graphql)',
    'To get started with GitHub CLI, please run:  gh auth login',
    'spawn gh ENOENT',
  ]) {
    assert.equal(isPermanent(fail(msg)), true, msg);
    const gh = script([fail(msg)]);
    const r = await run(gh);
    assert.equal(r.kind, 'error', msg); assert.equal(gh.calls.length, 1, msg);
    assert.match(r.line, /^ERROR pr=76 permanent reason=/);
  }
  assert.equal(isPermanent(fail('gh: connection reset (HTTP 502)')), false);
});

test('credentials in error text are masked', async () => {
  const r = await run(script([fail('fatal: unable to access https://user:ghp_secret@github.com/x/y.git (HTTP 401)')]));
  assert.doesNotMatch(r.line, /ghp_secret/); assert.match(r.line, /\*\*\*@github\.com/);
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

test('the CLI pins the repo root and origin, exits 64 on a bad argument, and neither file holds a write call', async () => {
  const cli = await readFile(new URL('../wait-merge.mjs', import.meta.url), 'utf8');
  assert.match(cli, /parsePrArg\(process\.argv\.slice\(2\)\)/);
  assert.match(cli, /gitOriginUrl\(ROOT\)/); assert.match(cli, /parseGithubRepo/);
  assert.match(cli, /new URL\('\.\.\/\.\.\/', import\.meta\.url\)/, '저장소 루트는 실행 파일 위치에서 구한다');
  const lib = await readFile(new URL('../lib/waitMerge.mjs', import.meta.url), 'utf8');
  for (const [name, src] of [['wait-merge.mjs', cli], ['lib/waitMerge.mjs', lib]])
    assert.doesNotMatch(src, /merge-async|-X\s*PUT|--method|sendMerge|mergePr|prepareMerge|createPrService|writeFile|appendFile/, `${name}에 쓰기 호출이 없다`);
  const code = await new Promise(resolve => execFile(process.execPath, [fileURLToPath(new URL('../wait-merge.mjs', import.meta.url))], { windowsHide: true, shell: false }, err => resolve(err?.code ?? 0)));
  assert.equal(code, 64);
});
